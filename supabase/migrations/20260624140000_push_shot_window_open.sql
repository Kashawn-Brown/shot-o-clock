-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Push: Shot O'Clock-open notification (replaces local scheduling)
-- ─────────────────────────────────────────────────────────────────────────────
-- Moves the shot-window-open alert from device-local scheduling to server push
-- (D063 / #009). The push fires from inside the real server transition that opens
-- the window, reading the live active roster at that instant — so it's correct
-- across host pause / add-time and any number of backgrounded rounds, which the
-- local pre-schedule could not be. The client's local 'open' scheduling and the
-- per-device "Shot O'Clock notification" master toggle are deleted; the open alert
-- is now unconditional (always sent to active players).
--
-- Two transitions open the window, so both fire the push (via one helper), each only
-- when the window genuinely stayed open (an all-opted-out countdown self-closes on
-- open and sends nothing):
--   1. _advance_due_session  — the timer path (client poll + cron sweep)
--   2. host_skip_to_shot_window — the host opening the window early
--
-- Both functions are reproduced VERBATIM from their source migrations
-- (_advance_due_session ← 20260616120000; host_skip_to_shot_window ← 20260613130000)
-- with only the marked PUSH block added. Locked conventions (#D010): SECURITY
-- DEFINER, search_path pin, EXECUTE revoked from API roles; REVOKEs re-asserted.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Helper: the open push ────────────────────────────────────────────────────
create or replace function public.send_shot_oclock_open_push(p_party_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_number int;
  v_user_ids     uuid[];
begin
  select current_round_number into v_round_number
  from party_sessions
  where id = p_party_session_id;

  select array_agg(user_id) into v_user_ids
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_user_ids is null then
    return;
  end if;

  perform public.send_push_to_users(
    v_user_ids,
    'It''s Shot O''Clock! 🥃',
    'Time to take your shot!',
    jsonb_build_object(
      'type', 'shot_window_open',
      'partySessionId', p_party_session_id,
      'roundNumber', v_round_number
    )
  );
end;
$$;

comment on function public.send_shot_oclock_open_push(uuid) is
  'Sends the Shot O''Clock-open push to the currently-active players. Called from the '
  'two window-open transitions; internal, EXECUTE revoked. Phase 16; #009, D063.';

revoke execute on function public.send_shot_oclock_open_push(uuid) from public;
revoke execute on function public.send_shot_oclock_open_push(uuid) from anon, authenticated;


-- ─── _advance_due_session (verbatim from 20260616120000 + PUSH block) ─────────
create or replace function public._advance_due_session(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session           party_sessions%rowtype;
  v_round_id          uuid;
  v_round_shot_window int;
  v_active_count      int;
  v_new_phase         party_phase;
  v_shot_ends_at      timestamptz;
  v_now               timestamptz := now();
begin
  select * into v_session
  from party_sessions
  where id = p_party_session_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_due', 'new_phase', null);
  end if;

  if v_session.status != 'active'
     or v_session.current_phase not in ('countdown', 'shot_window')
     or v_session.phase_ends_at is null
     or v_now < v_session.phase_ends_at then
    return jsonb_build_object('outcome', 'not_due', 'new_phase', null);
  end if;

  select id, shot_window_seconds
    into v_round_id, v_round_shot_window
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  if v_session.current_phase = 'countdown' then
    select count(*) into v_active_count
    from party_players
    where party_session_id = p_party_session_id
      and status = 'active';

    if v_active_count = 0 then
      return jsonb_build_object('outcome', 'no_active_players', 'new_phase', null);
    end if;

    v_shot_ends_at := v_now + make_interval(secs => v_round_shot_window);

    update rounds
    set status = 'shot_window',
        shot_window_started_at = v_now,
        shot_window_ends_at = v_shot_ends_at
    where id = v_round_id;

    update party_sessions
    set current_phase = 'shot_window',
        phase_started_at = v_now,
        phase_ends_at = v_shot_ends_at
    where id = p_party_session_id;

    insert into timer_events (
      party_session_id, round_id, round_number, event_type,
      previous_phase, new_phase, new_ends_at, triggered_by, triggered_by_player_id
    )
    values (
      p_party_session_id, v_round_id, v_session.current_round_number, 'shot_window_started',
      'countdown', 'shot_window', v_shot_ends_at, 'system', null
    );

    -- Window-open all-answered check (Phase 12): if everyone opted out during the
    -- countdown, close the just-opened window on the spot.
    perform public.finalize_if_all_submitted(p_party_session_id);

    select current_phase into v_new_phase
    from party_sessions
    where id = p_party_session_id;

    -- PUSH (Phase 16): the window genuinely opened (didn't instantly self-close on an
    -- all-opted-out countdown) → notify the active players. #009 / D063.
    if v_new_phase = 'shot_window' then
      perform public.send_shot_oclock_open_push(p_party_session_id);
    end if;

    return jsonb_build_object('outcome', 'transitioned', 'new_phase', v_new_phase);
  else
    perform public.finalize_round_outcomes(p_party_session_id, 'system'::triggered_by, null);

    select current_phase into v_new_phase
    from party_sessions
    where id = p_party_session_id;

    return jsonb_build_object('outcome', 'transitioned', 'new_phase', v_new_phase);
  end if;
end;
$$;

comment on function public._advance_due_session(uuid) is
  'Internal: locks one session and runs the due countdown→shot_window or '
  'shot_window→finalize transition (rpc-contracts.md §8.4). Shared by '
  'advance_phase_if_due (client poll) and cron_advance_due_phases (server sweep). '
  'Fires the Shot O''Clock-open push on a real window open (Phase 16). '
  'EXECUTE revoked; callers are the owner-role SECURITY DEFINER functions.';

revoke execute on function public._advance_due_session(uuid) from public;
revoke execute on function public._advance_due_session(uuid) from anon, authenticated;


-- ─── host_skip_to_shot_window (verbatim from 20260613130000 + PUSH block) ─────
create or replace function public.host_skip_to_shot_window(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_session       party_sessions%rowtype;
  v_player_id     uuid;
  v_role          player_permission_role;
  v_round_id      uuid;
  v_shot_window   int;
  v_active_count  int;
  v_shot_ends_at  timestamptz;
  v_new_phase     party_phase;
  v_now           timestamptz := now();
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
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  select id, permission_role
    into v_player_id, v_role
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_player_id is null or v_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  -- Idempotency — the shot window is already open (timer or a prior skip beat us
  -- to it). No-op ok. (A countdown for a *later* round is a genuine new skip, not
  -- idempotent, and falls through to the transition below.)
  if v_session.status = 'active' and v_session.current_phase = 'shot_window' then
    return public._rpc_success(jsonb_build_object('new_phase', 'shot_window'));
  end if;

  -- §10.5 + convention B — skip is only legal from an unpaused countdown.
  if v_session.status != 'active' or v_session.current_phase != 'countdown' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'The countdown can only be skipped while it is running.');
  end if;

  -- §8.1 — cannot open a shot window with nobody active.
  select count(*) into v_active_count
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_active_count = 0 then
    return public._rpc_error('NO_ACTIVE_PLAYERS',
      'No active players remain; the shot window cannot open.');
  end if;

  select id, shot_window_seconds
    into v_round_id, v_shot_window
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  v_shot_ends_at := v_now + make_interval(secs => v_shot_window);

  -- Same effect as the advance_phase_if_due countdown→shot_window branch.
  update rounds
  set status = 'shot_window',
      shot_window_started_at = v_now,
      shot_window_ends_at = v_shot_ends_at
  where id = v_round_id;

  update party_sessions
  set current_phase = 'shot_window',
      phase_started_at = v_now,
      phase_ends_at = v_shot_ends_at
  where id = p_party_session_id;

  -- Convention C — shot_window_started, but triggered_by = host (not system).
  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, new_ends_at, triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_round_id, v_session.current_round_number, 'shot_window_started',
    'countdown', 'shot_window', v_shot_ends_at, 'host', v_player_id
  );

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_session.current_round_number, 'skip_to_shot_window'
  );

  -- Window-open all-answered check (same as the timer path): if the skipped
  -- countdown's players had all opted out, the window the host just opened
  -- closes immediately. No-op when anyone still hasn't answered.
  perform public.finalize_if_all_submitted(p_party_session_id);

  -- Re-read where we landed: 'shot_window' (normal), or already advanced if the
  -- helper closed it on the spot.
  select current_phase into v_new_phase
  from party_sessions
  where id = p_party_session_id;

  -- PUSH (Phase 16): notify the active players when the host's skip genuinely opened
  -- the window (not when it instantly self-closed on an all-opted-out countdown).
  if v_new_phase = 'shot_window' then
    perform public.send_shot_oclock_open_push(p_party_session_id);
  end if;

  return public._rpc_success(jsonb_build_object('new_phase', v_new_phase));
end;
$$;

comment on function public.host_skip_to_shot_window(uuid) is
  'Host opens the shot window early from a running countdown. Fires the Shot '
  'O''Clock-open push on a real open (Phase 16). SECURITY DEFINER; NOT_HOST for '
  'non-hosts. See rpc-contracts.md §10.5, #009, D063.';
