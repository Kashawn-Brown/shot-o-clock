-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch B2: party-exit RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The two state-mutating RPCs from docs/specs/rpc-contracts.md §4 and §12:
--   - leave_party(party_session_id)  — player exits the lobby (§4)
--   - end_party(party_session_id)    — host terminates the session (§12)
--
-- Both follow the locked conventions from docs/KNOWN_ISSUES.md #D010:
--   (1) SECURITY DEFINER with SET search_path = public, pg_temp
--   (2) In-function auth.uid() check before any write
--   (4) Standard {ok, error_code, error_msg, data} return shape via the
--       _rpc_success / _rpc_error helpers from the rpc_infrastructure
--       migration (20260513150000_rpc_infrastructure.sql)
--
-- Batch B2 conventions are locked in docs/KNOWN_ISSUES.md #D012:
--   (a) leave_party sets both left_at and removed_at — the schema's
--       removed_fields_consistent CHECK mandates removed_at NOT NULL.
--   (b) leave_party returns data = {} on success.
--   (c) end_party emits triggered_by = 'host' on the timer_events row.
--   (d) end_party leaves paused_at / paused_remaining_seconds untouched
--       (historical record).
--   (e) end_party sets phase_ends_at = null on end (matches state-machine
--       §3.5).
--   (f) end_party admin_action_logs defaults: previous_value=null,
--       new_value=null. round_id and round_number populated only when an
--       in-flight round was cancelled.
--   (g) end_party uses event_type = 'round_cancelled' (added in the prior
--       migration 20260514110000_add_round_cancelled_to_timer_event_type.sql)
--       for the cancelled in-flight round.
--
-- leave_party also handles the orthogonal decision from #D013: distinguishes
-- self-left (idempotent ok) from kicked-by-host (PLAYER_REMOVED).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── leave_party ────────────────────────────────────────────────────────────
-- See rpc-contracts.md §4.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock
--   4. caller's party_players row lookup
--   5. host check → HOST_CANNOT_LEAVE
--   6. already-removed branch (§4.6 / #D013)
--   7. phase check → ILLEGAL_TRANSITION if not lobby
--   8. UPDATE
--
-- Non-distinction: "session doesn't exist" and "caller is not in party"
-- both return NOT_IN_PARTY. The §4.5 errors list doesn't include
-- SESSION_NOT_FOUND; consistent with the §13 security-non-distinction
-- principle (don't leak session existence to non-members).

create or replace function public.leave_party(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id         uuid := auth.uid();
  v_session_phase   party_phase;
  v_existing_id     uuid;
  v_existing_role   player_permission_role;
  v_existing_status player_status;
  v_existing_reason text;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  -- Lock the session row; serializes against concurrent start_game / end_party
  -- that could move the phase out of lobby between our read and our UPDATE.
  select current_phase
    into v_session_phase
  from party_sessions
  where id = p_party_session_id
  for update;

  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, permission_role, status, removed_reason
    into v_existing_id, v_existing_role, v_existing_status, v_existing_reason
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_existing_id is null then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  -- §4.2 — host cannot leave; must call end_party instead.
  if v_existing_role = 'host' then
    return public._rpc_error('HOST_CANNOT_LEAVE',
      'The host cannot leave the party — end it instead.');
  end if;

  -- §4.6 / #D013 — distinguish self-left (idempotent ok) from kicked
  -- (PLAYER_REMOVED). Different downstream UX justifies the split.
  if v_existing_status = 'removed' then
    if v_existing_reason = 'self_left_lobby' then
      return public._rpc_success('{}'::jsonb);
    else
      return public._rpc_error('PLAYER_REMOVED',
        'You were removed from this party.');
    end if;
  end if;

  -- §4.3 — lobby-only. ILLEGAL_TRANSITION once the game has started; the
  -- player must use mark_self_out instead.
  if v_session_phase != 'lobby' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'You cannot leave a started game. Use I''m Out instead.');
  end if;

  -- §4.4 effects — both left_at and removed_at set per #D012 (a)
  -- (removed_fields_consistent CHECK requires removed_at NOT NULL when
  -- status = 'removed').
  update party_players
  set status         = 'removed',
      left_at        = now(),
      removed_at     = now(),
      removed_reason = 'self_left_lobby'
  where id = v_existing_id;

  return public._rpc_success('{}'::jsonb);
end;
$$;

comment on function public.leave_party(uuid) is
  'Player exits a party while it is still in the lobby phase. '
  'See docs/specs/rpc-contracts.md §4 and docs/KNOWN_ISSUES.md #D012, #D013.';


-- ─── end_party ──────────────────────────────────────────────────────────────
-- See rpc-contracts.md §12.
--
-- Locks the session row to serialize against advance_phase_if_due,
-- start_next_round, host_*_timer, mark_done, mark_self_out, etc. This is the
-- strongest race in the codebase: end_party touches party_sessions +
-- admin_action_logs + rounds + timer_events in a single transaction.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → SESSION_NOT_FOUND if not found
--   4. caller's party_players row → SESSION_NOT_FOUND if non-member
--      (non-distinction per §13 security principle)
--   5. host role check → NOT_HOST
--   6. already-ended idempotency → return ok + existing ended_at
--   7. find in-flight round (if any)
--   8. update session
--   9. cancel in-flight round + insert timer_events row (only if any)
--  10. insert admin_action_logs row

create or replace function public.end_party(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id              uuid := auth.uid();
  v_session              party_sessions%rowtype;
  v_existing_player_id   uuid;
  v_existing_role        player_permission_role;
  v_in_flight_round_id   uuid;
  v_in_flight_round_num  int;
  v_now                  timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  select * into v_session
  from party_sessions
  where id = p_party_session_id
  for update;

  if not found then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;

  select id, permission_role
    into v_existing_player_id, v_existing_role
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  -- Non-distinction per §13 security principle: non-member collapses with
  -- not-found. Don't leak session existence to non-members.
  if v_existing_player_id is null then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;
  if v_existing_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  -- §12.6 — idempotent ok if already ended. Return the existing ended_at.
  if v_session.status = 'ended' then
    return public._rpc_success(jsonb_build_object(
      'ended_at', v_session.ended_at
    ));
  end if;

  -- §12.4 step 2 — find in-flight round: a rounds row matching the session's
  -- current_round_number whose status is not already completed/cancelled.
  -- Null in lobby (current_round_number = 0, no rounds row matches) or when
  -- the session is in round_complete (current round is already 'completed').
  if v_session.current_round_number >= 1 then
    select id, round_number
      into v_in_flight_round_id, v_in_flight_round_num
    from rounds
    where party_session_id = p_party_session_id
      and round_number = v_session.current_round_number
      and status not in ('completed', 'cancelled');
  end if;

  -- §12.4 step 1 — end the session. phase_ends_at nulled per #D012 (e);
  -- paused_at / paused_remaining_seconds left intact per #D012 (d);
  -- current_round_number kept as historical record.
  update party_sessions
  set status        = 'ended',
      current_phase = 'ended',
      ended_at      = v_now,
      phase_ends_at = null
  where id = p_party_session_id;

  -- §12.4 steps 3 + 4 — cancel in-flight round and log the event.
  -- triggered_by = 'host' per #D012 (c); event_type = 'round_cancelled'
  -- per #D012 (g) (added to the timer_event_type enum in the prior
  -- migration).
  if v_in_flight_round_id is not null then
    update rounds
    set status = 'cancelled'
    where id = v_in_flight_round_id;

    insert into timer_events (
      party_session_id,
      round_id,
      round_number,
      event_type,
      triggered_by,
      triggered_by_player_id
    )
    values (
      p_party_session_id,
      v_in_flight_round_id,
      v_in_flight_round_num,
      'round_cancelled',
      'host',
      v_existing_player_id
    );
  end if;

  -- §12.4 step 5 — admin_action_logs entry. previous_value / new_value
  -- default to null per #D012 (f); round_id and round_number populated
  -- only when an in-flight round was cancelled (mirroring the timer_events
  -- row's targets).
  insert into admin_action_logs (
    party_session_id,
    actor_player_id,
    actor_permission_role,
    round_id,
    round_number,
    action_type
  )
  values (
    p_party_session_id,
    v_existing_player_id,
    'host',
    v_in_flight_round_id,
    v_in_flight_round_num,
    'end_party'
  );

  return public._rpc_success(jsonb_build_object('ended_at', v_now));
end;
$$;

comment on function public.end_party(uuid) is
  'Host terminates the session. Cancels in-flight round if any. '
  'See docs/specs/rpc-contracts.md §12 and docs/KNOWN_ISSUES.md #D012.';
