-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch E1: host timer-control RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The three pure timer controls from docs/specs/rpc-contracts.md §10.1–§10.3:
--   - host_pause_timer(session)            — freeze the timer (§10.1)
--   - host_resume_timer(session)           — unfreeze, rebuild phase_ends_at (§10.2)
--   - host_add_time(session, seconds)      — extend the current phase (§10.3)
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; in-function auth.uid() check; standard {ok,...} envelope.
--
-- Batch E1 conventions (approved this session):
--   (A) NOT_HOST collapse: §10's error lists omit SESSION_NOT_FOUND, so a
--       foreign / nonexistent session id, a non-member, and a non-host all
--       collapse into NOT_HOST (start_game convention A).
--   (B) Pause uses option (a) of §10.2: phase_ends_at is NEVER mutated on pause;
--       the remaining seconds are stored in paused_remaining_seconds on pause
--       and consumed on resume. A phase with no timer (round_complete halt,
--       §8.6) pauses with paused_remaining_seconds = null.
--   (C) timer_events emission (fork resolved this session): pause/resume/add_time
--       each emit a timer_paused / timer_resumed / time_added event in addition
--       to the admin_action_logs row §10 names. The enum values exist for exactly
--       these actions and keep the timer timeline reconstructable (matches the
--       start_game timeline-event convention). Additive amendment to §10.
--   (D) Return payloads (spec §10 defines none): pause → {status,
--       paused_remaining_seconds}; resume → {status, phase_ends_at}; add_time →
--       {status, phase_ends_at, paused_remaining_seconds} (the field not
--       authoritative for the current status reflects its unchanged value).
--
-- The FOR UPDATE on party_sessions serializes these against advance_phase_if_due,
-- the finalize path, end_party, and a second host tab.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── host_pause_timer ─────────────────────────────────────────────────────────
-- See rpc-contracts.md §10.1 and mvp-state-machine.md §4 / §8.6.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_HOST if not found (convention A)
--   4. caller's party_players row + host check → NOT_HOST
--   5. idempotent: already paused → ok no-op (§6 mvp-state-machine)
--   6. status must be active, else ILLEGAL_TRANSITION
--   7. effect: store remaining, freeze; emit timer_paused; log pause_timer

create or replace function public.host_pause_timer(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_session   party_sessions%rowtype;
  v_player_id uuid;
  v_role      player_permission_role;
  v_round_id  uuid;
  v_remaining int;
  v_now       timestamptz := now();
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

  -- §6 idempotency — already paused: return the frozen state unchanged.
  if v_session.status = 'paused' then
    return public._rpc_success(jsonb_build_object(
      'status',                   'paused',
      'paused_remaining_seconds', v_session.paused_remaining_seconds
    ));
  end if;

  -- §10.1 — only an active session can be paused.
  if v_session.status != 'active' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Only a running game can be paused.');
  end if;

  -- Remaining time at the pause instant, clamped at 0. Null when the phase has
  -- no timer (round_complete halt, §8.6) — paused_remaining_seconds stays null
  -- and resume leaves phase_ends_at null.
  v_remaining := case
    when v_session.phase_ends_at is null then null
    else greatest(0, round(extract(epoch from (v_session.phase_ends_at - v_now))))::int
  end;

  -- §10.1 / option (a) — freeze: phase_ends_at is NOT mutated; remaining is
  -- stashed for resume.
  update party_sessions
  set status                   = 'paused',
      paused_at                = v_now,
      paused_remaining_seconds = v_remaining
  where id = p_party_session_id;

  -- Current round for event/log context (current_round_number ≥ 1 here: a
  -- session can only be active mid-game).
  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Convention C — timer_paused event. Phase is unchanged; new_ends_at is null
  -- (the timer is frozen).
  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, previous_ends_at, new_ends_at,
    triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_round_id, v_session.current_round_number, 'timer_paused',
    v_session.current_phase, v_session.current_phase, v_session.phase_ends_at, null,
    'host', v_player_id
  );

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_session.current_round_number, 'pause_timer'
  );

  return public._rpc_success(jsonb_build_object(
    'status',                   'paused',
    'paused_remaining_seconds', v_remaining
  ));
end;
$$;

comment on function public.host_pause_timer(uuid) is
  'Host freezes the timer (option (a): stores paused_remaining_seconds, leaves '
  'phase_ends_at intact). See rpc-contracts.md §10.1 and mvp-state-machine.md §4.';


-- ─── host_resume_timer ────────────────────────────────────────────────────────
-- See rpc-contracts.md §10.2 and mvp-state-machine.md §4.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_HOST if not found
--   4. caller's party_players row + host check → NOT_HOST
--   5. idempotent: already active → ok no-op; lobby/ended → ILLEGAL_TRANSITION
--   6. effect: rebuild phase_ends_at from remaining; accrue paused time; unfreeze;
--      emit timer_resumed; log resume_timer

create or replace function public.host_resume_timer(p_party_session_id uuid)
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
  v_new_ends_at timestamptz;
  v_paused_secs int;
  v_now         timestamptz := now();
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

  -- §6 idempotency — already running: no-op, return current end time.
  if v_session.status = 'active' then
    return public._rpc_success(jsonb_build_object(
      'status',        'active',
      'phase_ends_at', v_session.phase_ends_at
    ));
  end if;

  -- Resume only makes sense from paused. A lobby/ended session has nothing to
  -- resume.
  if v_session.status != 'paused' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'There is no paused timer to resume.');
  end if;

  -- §10.2 — rebuild the deadline from the stored remaining. Null remaining
  -- (paused during the round_complete halt) → phase_ends_at stays null.
  v_new_ends_at := case
    when v_session.paused_remaining_seconds is null then null
    else v_now + make_interval(secs => v_session.paused_remaining_seconds)
  end;

  -- Wall-clock pause duration accrues into total_paused_seconds.
  v_paused_secs := greatest(0, round(extract(epoch from (v_now - v_session.paused_at))))::int;

  update party_sessions
  set status                   = 'active',
      phase_ends_at            = v_new_ends_at,
      total_paused_seconds     = total_paused_seconds + v_paused_secs,
      paused_at                = null,
      paused_remaining_seconds = null
  where id = p_party_session_id;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Convention C — timer_resumed event. previous_ends_at is the stale pre-resume
  -- value (option (a) left it intact); new_ends_at is the rebuilt deadline.
  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, previous_ends_at, new_ends_at,
    triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_round_id, v_session.current_round_number, 'timer_resumed',
    v_session.current_phase, v_session.current_phase, v_session.phase_ends_at, v_new_ends_at,
    'host', v_player_id
  );

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_session.current_round_number, 'resume_timer'
  );

  return public._rpc_success(jsonb_build_object(
    'status',        'active',
    'phase_ends_at', v_new_ends_at
  ));
end;
$$;

comment on function public.host_resume_timer(uuid) is
  'Host unfreezes the timer: rebuilds phase_ends_at from paused_remaining_seconds '
  'and accrues total_paused_seconds. See rpc-contracts.md §10.2.';


-- ─── host_add_time ────────────────────────────────────────────────────────────
-- See rpc-contracts.md §10.3 and mvp-state-machine.md §3.2/§3.3, §4.
--
-- NOT idempotent — each call adds more time; clients debounce. Active sessions
-- push phase_ends_at out; paused sessions extend the stored remaining (phase_ends
-- _at is frozen under option (a)).
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation (session id; p_seconds 1–600)
--   3. session lookup + lock → NOT_HOST if not found
--   4. caller's party_players row + host check → NOT_HOST
--   5. status ∈ {active, paused} AND phase ∈ {countdown, shot_window} → else
--      ILLEGAL_TRANSITION
--   6. effect: extend; emit time_added; log add_time (new_value = seconds)

create or replace function public.host_add_time(p_party_session_id uuid, p_seconds int)
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
  v_new_ends_at   timestamptz;
  v_new_remaining int;
  v_now           timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;
  -- §10.3 — bounded addition.
  if p_seconds is null or p_seconds < 1 or p_seconds > 600 then
    return public._rpc_error('INVALID_PARAM', 'p_seconds must be between 1 and 600.');
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

  -- §10.3 — time can only be added to a live or frozen countdown / shot window.
  if v_session.status not in ('active', 'paused')
     or v_session.current_phase not in ('countdown', 'shot_window') then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Time can only be added during a countdown or shot window.');
  end if;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  if v_session.status = 'active' then
    -- Active: push the live deadline out.
    v_new_ends_at := v_session.phase_ends_at + make_interval(secs => p_seconds);
    v_new_remaining := null;

    update party_sessions
    set phase_ends_at = v_new_ends_at
    where id = p_party_session_id;
  else
    -- Paused (option (a)): extend the stored remaining; phase_ends_at stays
    -- frozen. paused_remaining_seconds is non-null here (the phase is a
    -- countdown / shot window, both of which had a timer when paused).
    v_new_remaining := coalesce(v_session.paused_remaining_seconds, 0) + p_seconds;
    v_new_ends_at := v_session.phase_ends_at;  -- unchanged (frozen)

    update party_sessions
    set paused_remaining_seconds = v_new_remaining
    where id = p_party_session_id;
  end if;

  -- Convention C — time_added event. seconds_added is the authoritative signal;
  -- new_ends_at reflects the live deadline (null/unchanged while paused).
  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, previous_ends_at, new_ends_at, seconds_added,
    triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_round_id, v_session.current_round_number, 'time_added',
    v_session.current_phase, v_session.current_phase,
    v_session.phase_ends_at,
    case when v_session.status = 'active' then v_new_ends_at else null end,
    p_seconds,
    'host', v_player_id
  );

  -- §10.3 — log with new_value = seconds added (jsonb number).
  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type, new_value
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_session.current_round_number, 'add_time', to_jsonb(p_seconds)
  );

  return public._rpc_success(jsonb_build_object(
    'status',                   v_session.status,
    'phase_ends_at',            v_new_ends_at,
    'paused_remaining_seconds', v_new_remaining
  ));
end;
$$;

comment on function public.host_add_time(uuid, int) is
  'Host extends the current phase: active → phase_ends_at += seconds; paused → '
  'paused_remaining_seconds += seconds. Not idempotent. See rpc-contracts.md §10.3.';
