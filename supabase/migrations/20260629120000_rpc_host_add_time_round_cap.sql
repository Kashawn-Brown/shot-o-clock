-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 17 — host_add_time: cumulative per-round cap
-- ─────────────────────────────────────────────────────────────────────────────
-- host_add_time already bounds each single call to 1–600s, but nothing caps the
-- TOTAL added across repeated taps, so a round could be stretched indefinitely.
-- This recreates the function with a cumulative cap of 5 minutes of ADDED time
-- per round (countdown + shot window combined — one rounds row spans both phases,
-- so the cap is naturally round-scoped). Pause remains the tool for open-ended
-- real-world delays; this caps the add-time mechanism specifically.
--
-- The running total is derived from the existing time_added timer_events for the
-- round (seconds_added is written on every add, active or paused) — no schema
-- change. A tap that would cross the cap is REJECTED in full (not clamped), with a
-- new ADD_TIME_LIMIT_REACHED code, so the host gets a clear, predictable result.
--
-- Everything below is byte-for-byte the prior function (20260604130000) except the
-- cap constant, the running-total read, and the cap check.
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Cumulative add-time budget per round (5 min). Pause covers anything longer.
  v_round_cap_seconds constant int := 300;
  v_already_added int;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;
  -- §10.3 — bounded single addition.
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

  -- Cumulative cap: sum the time already added this round (both phases share the
  -- round_id) and reject a tap that would cross the budget — in full, not clamped.
  select coalesce(sum(seconds_added), 0)::int into v_already_added
  from timer_events
  where round_id = v_round_id
    and event_type = 'time_added';

  if v_already_added + p_seconds > v_round_cap_seconds then
    return public._rpc_error('ADD_TIME_LIMIT_REACHED',
      'You have added the maximum extra time for this round.');
  end if;

  if v_session.status = 'active' then
    -- Active: push the live deadline out.
    v_new_ends_at := v_session.phase_ends_at + make_interval(secs => p_seconds);
    v_new_remaining := null;

    update party_sessions
    set phase_ends_at = v_new_ends_at
    where id = p_party_session_id;
  else
    -- Paused (option (a)): extend the stored remaining; phase_ends_at stays frozen.
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
  'paused_remaining_seconds += seconds. Capped at 300s cumulative ADDED time per '
  'round (ADD_TIME_LIMIT_REACHED past that). Not idempotent. See rpc-contracts.md §10.3.';
