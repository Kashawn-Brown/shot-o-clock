-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch D: player-action RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The two in-game player actions from docs/specs/rpc-contracts.md §6 and §7:
--   - mark_done(party_session_id)      — player took the shot (§6, game-rules §3.1)
--   - mark_self_out(party_session_id)  — player opts out (§7, game-rules §3.2)
--
-- Both follow the locked conventions from docs/KNOWN_ISSUES.md #D010:
--   (1) SECURITY DEFINER with SET search_path = public, pg_temp
--   (2) In-function auth.uid() check before any write
--   (4) Standard {ok, error_code, error_msg, data} return shape via the
--       _rpc_success / _rpc_error helpers (20260513150000_rpc_infrastructure.sql)
--
-- Batch D conventions (approved this session):
--   (1) NOT_IN_PARTY collapse. §6.5 / §7.5 list no SESSION_NOT_FOUND, so a
--       foreign / nonexistent session id AND a `removed` caller both collapse
--       into NOT_IN_PARTY — the non-leaking "you are not a member here" answer
--       (mirrors start_game convention A → NOT_HOST). An `out` caller is a member
--       but not active → PLAYER_NOT_ACTIVE.
--   (2) mark_done does NOT inline-call advance_phase_if_due. The §8.7(3) inline-
--       advance is one of three optional timer triggers; client polling (§8.7(2))
--       covers it, and the FOR UPDATE + now() < phase_ends_at gate already rejects
--       late taps on its own. A late tap therefore returns SHOT_WINDOW_CLOSED when
--       no client has polled yet, or ILLEGAL_TRANSITION when a poller already
--       advanced the phase — both read as "round's over" to the client.
--   (3) The override_outcome admin log uses null previous_value / new_value
--       (matching the end_party precedent, #D012 (f)); the meaning lives in reason.
--
-- The FOR UPDATE on party_sessions is the serialization point against
-- finalize_round_outcomes (advance_phase_if_due locks the same row before it
-- finalizes). Holding it means a concurrent finalize cannot mark this player
-- `missed` while they are mid-tap, and vice versa.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── mark_done ────────────────────────────────────────────────────────────────
-- See rpc-contracts.md §6 and game-rules.md §3.1.
--
-- Precondition order (SELF_OUT_IS_STICKY MUST be checked before the upsert — a
-- sticky self-out returns early and the write is never reached):
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_IN_PARTY if not found (convention 1)
--   4. caller's party_players row → NOT_IN_PARTY (missing/removed) /
--      PLAYER_NOT_ACTIVE (out)
--   5. phase gate: active + shot_window → ILLEGAL_TRANSITION otherwise (paused
--      fails here; you cannot tap Done while paused)
--   6. time gate: now() < phase_ends_at → SHOT_WINDOW_CLOSED otherwise
--   7. sticky gate: existing outcome is self_out → SELF_OUT_IS_STICKY (§3.3)
--   8. effect: upsert the outcome row with player_action = done

create or replace function public.mark_done(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_session        party_sessions%rowtype;
  v_player_id      uuid;
  v_player_status  player_status;
  v_round_id       uuid;
  v_existing_action player_action;
  v_outcome_id     uuid;
  v_tapped_at      timestamptz;
  v_now            timestamptz := now();
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

  -- Convention 1: a foreign / nonexistent session collapses into NOT_IN_PARTY.
  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, status
    into v_player_id, v_player_status
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  -- Missing row or a removed caller → NOT_IN_PARTY (convention 1). An out caller
  -- is a member but cannot tap Done → PLAYER_NOT_ACTIVE (§6.2, game-rules §2.2).
  if v_player_id is null or v_player_status = 'removed' then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;
  if v_player_status != 'active' then
    return public._rpc_error('PLAYER_NOT_ACTIVE', 'Only active players can tap Done.');
  end if;

  -- §6.3 — Done is only legal in an unpaused shot window.
  if v_session.status != 'active' or v_session.current_phase != 'shot_window' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Done can only be tapped during an open shot window.');
  end if;

  -- §6.3 — the window must still be open. Checked under the FOR UPDATE lock so a
  -- concurrent finalize cannot close it between this check and the write.
  if v_session.phase_ends_at is null or v_now >= v_session.phase_ends_at then
    return public._rpc_error('SHOT_WINDOW_CLOSED', 'The shot window has closed.');
  end if;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- §3.3 / §6.3 — self-out is sticky. This guard returns BEFORE the upsert; the
  -- write below is unreachable when an existing self_out is present.
  select player_action into v_existing_action
  from round_player_outcomes
  where round_id = v_round_id
    and party_player_id = v_player_id;

  if v_existing_action = 'self_out' then
    return public._rpc_error('SELF_OUT_IS_STICKY',
      'You already opted out this round; Done cannot override it.');
  end if;

  -- §6.4 effect — upsert the outcome. On a re-tap (existing row already 'done')
  -- coalesce preserves the original tap time, making repeat calls a true no-op on
  -- the timestamp (§6.6 / game-rules §3.1 "no-op, return existing row").
  insert into round_player_outcomes (
    round_id,
    party_session_id,
    party_player_id,
    round_number,
    player_action,
    player_tapped_done_at
  )
  values (
    v_round_id,
    p_party_session_id,
    v_player_id,
    v_session.current_round_number,
    'done',
    v_now
  )
  on conflict (round_id, party_player_id) do update set
    player_action         = 'done',
    player_tapped_done_at  = coalesce(round_player_outcomes.player_tapped_done_at, excluded.player_tapped_done_at)
  returning id, player_tapped_done_at into v_outcome_id, v_tapped_at;

  return public._rpc_success(jsonb_build_object(
    'outcome_id',    v_outcome_id,
    'player_action', 'done',
    'tapped_at',     v_tapped_at
  ));
end;
$$;

comment on function public.mark_done(uuid) is
  'Player marks themselves Done during the shot window. Idempotent; rejects a '
  'sticky self-out. See docs/specs/rpc-contracts.md §6 and game-rules.md §3.1.';


-- ─── mark_self_out ────────────────────────────────────────────────────────────
-- See rpc-contracts.md §7 and game-rules.md §3.2.
--
-- Unlike mark_done: legal during countdown OR shot_window, paused or not (§7.3),
-- and has NO time gate (no SHOT_WINDOW_CLOSED). The player's status is NOT changed
-- here — finalization (game-rules §7) turns the self_out outcome into status=out.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_IN_PARTY if not found (convention 1)
--   4. caller's party_players row → NOT_IN_PARTY / PLAYER_NOT_ACTIVE
--   5. phase gate: countdown or shot_window → ILLEGAL_TRANSITION otherwise
--   6. effect: upsert outcome (self_out wins over a prior Done); if it overrode a
--      Done, log override_outcome (§7.4 step 2 / game-rules §3.2)

create or replace function public.mark_self_out(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id         uuid := auth.uid();
  v_session         party_sessions%rowtype;
  v_player_id       uuid;
  v_player_status   player_status;
  v_player_role     player_permission_role;
  v_round_id        uuid;
  v_existing_action player_action;
  v_outcome_id      uuid;
  v_now             timestamptz := now();
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

  -- Convention 1: a foreign / nonexistent session collapses into NOT_IN_PARTY.
  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, status, permission_role
    into v_player_id, v_player_status, v_player_role
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_player_id is null or v_player_status = 'removed' then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;
  if v_player_status != 'active' then
    return public._rpc_error('PLAYER_NOT_ACTIVE', 'Only active players can opt out.');
  end if;

  -- §7.3 — self-out is legal during countdown or shot_window, paused or not, so
  -- the gate is on phase only (session.status may be active or paused).
  if v_session.current_phase not in ('countdown', 'shot_window') then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'You can only opt out during a countdown or shot window.');
  end if;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Read the prior action so we know whether this self-out overrides a Done.
  select player_action into v_existing_action
  from round_player_outcomes
  where round_id = v_round_id
    and party_player_id = v_player_id;

  -- §7.4 effect — upsert the outcome. self_out wins over a prior Done; the prior
  -- player_tapped_done_at is preserved as history, and player_marked_self_out_at
  -- is coalesce-preserved so repeat calls are a no-op on the timestamp (§7.6).
  insert into round_player_outcomes (
    round_id,
    party_session_id,
    party_player_id,
    round_number,
    player_action,
    player_marked_self_out_at
  )
  values (
    v_round_id,
    p_party_session_id,
    v_player_id,
    v_session.current_round_number,
    'self_out',
    v_now
  )
  on conflict (round_id, party_player_id) do update set
    player_action             = 'self_out',
    player_marked_self_out_at  = coalesce(round_player_outcomes.player_marked_self_out_at, excluded.player_marked_self_out_at)
  returning id into v_outcome_id;

  -- §7.4 step 2 / game-rules §3.2 — if this overrode a Done, log it for
  -- traceability. Only fires on the overriding call: a second self_out sees
  -- v_existing_action = 'self_out' and skips the log. Convention 3: null
  -- previous_value / new_value, meaning carried in reason.
  if v_existing_action = 'done' then
    insert into admin_action_logs (
      party_session_id,
      actor_player_id,
      actor_permission_role,
      affected_player_id,
      round_id,
      round_number,
      action_type,
      reason
    )
    values (
      p_party_session_id,
      v_player_id,
      v_player_role,
      v_player_id,
      v_round_id,
      v_session.current_round_number,
      'override_outcome',
      'player self-out overrode prior Done'
    );
  end if;

  return public._rpc_success(jsonb_build_object(
    'outcome_id', v_outcome_id
  ));
end;
$$;

comment on function public.mark_self_out(uuid) is
  'Player opts out of the current round (sticky until host reinstatement). '
  'self_out overrides a prior Done. See rpc-contracts.md §7 and game-rules.md §3.2.';
