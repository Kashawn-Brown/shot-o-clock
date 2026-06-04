-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch E2: host phase-control RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The two host-triggered phase transitions from docs/specs/rpc-contracts.md
-- §10.4–§10.5:
--   - host_skip_to_shot_window(session)  — end the countdown now (§10.5)
--   - host_end_shot_window(session)      — end the shot window now (§10.4)
--
-- Each replays an existing transition: host_skip_to_shot_window mirrors the
-- advance_phase_if_due countdown→shot_window branch (but triggered_by = host),
-- and host_end_shot_window delegates to the shared finalize_round_outcomes helper
-- (with triggered_by = host) — the same finalize + D014 auto-advance the timer
-- path runs.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; in-function auth.uid() check; standard {ok,...} envelope.
--
-- Batch E2 conventions (approved this session):
--   (A) NOT_HOST collapse for foreign / non-member / non-host (convention A).
--   (B) Both require status = 'active' (NOT paused). State-machine §4 lists
--       neither host_skip_to_shot_window nor host_end_shot_window among the
--       paused-allowed actions — the host must resume first. A paused session
--       therefore gets ILLEGAL_TRANSITION (effective addition to §10.4/§10.5,
--       which name only the phase precondition).
--   (C) host_skip emits a shot_window_started event with triggered_by = host
--       ("same as the advance branch but triggered by host", §10.5) rather than a
--       phase_skipped event — the skip semantics are carried by the
--       skip_to_shot_window admin_action_logs row, so no timeline information is
--       lost.
--   (D) Return payload (spec §10 defines none): host_skip → {new_phase:
--       'shot_window'}; host_end → {new_phase} (the phase finalize landed in —
--       'countdown' on auto-advance, 'round_complete' on the zero-active halt).
--
-- The FOR UPDATE on party_sessions serializes against advance_phase_if_due, the
-- player actions, end_party, and a second host tab. host_end_shot_window relies
-- on finalize_round_outcomes' completed_at idempotency gate as the deeper safety
-- net behind the phase guard.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── host_skip_to_shot_window ─────────────────────────────────────────────────
-- See rpc-contracts.md §10.5 and mvp-state-machine.md §3.2 / §5.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_HOST if not found
--   4. caller's party_players row + host check → NOT_HOST
--   5. idempotent: already in shot_window (active) → ok no-op
--   6. status='active' AND phase='countdown' → else ILLEGAL_TRANSITION
--   7. active-player count → NO_ACTIVE_PLAYERS if zero
--   8. effect: open the shot window; emit shot_window_started (host); log skip

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

  return public._rpc_success(jsonb_build_object('new_phase', 'shot_window'));
end;
$$;

comment on function public.host_skip_to_shot_window(uuid) is
  'Host ends the countdown immediately, opening the shot window (same effect as '
  'the timer-expiry branch, triggered_by = host). See rpc-contracts.md §10.5.';


-- ─── host_end_shot_window ─────────────────────────────────────────────────────
-- See rpc-contracts.md §10.4 and game-rules.md §7.
--
-- Delegates to finalize_round_outcomes (the shared helper, §8.8) with
-- triggered_by = host — identical finalize + D014 auto-advance to the timer path.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_HOST if not found
--   4. caller's party_players row + host check → NOT_HOST
--   5. status='active' AND phase='shot_window' → else ILLEGAL_TRANSITION
--      (convention B; the completed_at gate inside finalize is the deeper net
--      against a true simultaneous double-call — the loser sees the phase moved)
--   6. effect: capture round N, finalize, log end_shot_window, return new_phase

create or replace function public.host_end_shot_window(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     party_sessions%rowtype;
  v_player_id   uuid;
  v_role        player_permission_role;
  v_round_id    uuid;
  v_round_num   int;
  v_new_phase   party_phase;
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

  -- §10.4 + convention B — only an unpaused shot window can be ended early.
  if v_session.status != 'active' or v_session.current_phase != 'shot_window' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'There is no open shot window to end.');
  end if;

  -- Capture round N (the shot-window round) BEFORE finalize, which may advance
  -- current_round_number to N+1 via the auto-advance.
  select id, round_number
    into v_round_id, v_round_num
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- §10.4 / §8.8 — same finalize + auto-advance the timer path runs, but
  -- triggered_by = host (carried onto the round_completed event). We hold the
  -- FOR UPDATE lock finalize_round_outcomes assumes.
  perform public.finalize_round_outcomes(p_party_session_id, 'host'::triggered_by, v_player_id);

  -- Where did finalization land? countdown (auto-advanced to N+1) or
  -- round_complete (zero-active halt).
  select current_phase into v_new_phase
  from party_sessions
  where id = p_party_session_id;

  -- §10.4 — log against round N (the window we ended), not the new round.
  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_round_num, 'end_shot_window'
  );

  return public._rpc_success(jsonb_build_object('new_phase', v_new_phase));
end;
$$;

comment on function public.host_end_shot_window(uuid) is
  'Host ends the shot window early: delegates to finalize_round_outcomes '
  '(triggered_by = host) for finalize + D014 auto-advance. See rpc-contracts.md §10.4.';
