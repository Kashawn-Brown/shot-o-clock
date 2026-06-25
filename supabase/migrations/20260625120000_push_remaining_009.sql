-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Push: the remaining #009 notifications (player + host)
-- ─────────────────────────────────────────────────────────────────────────────
-- Wires the last seven #009 pushes, all unconditional (no settings control):
--   Player: reinstated (host_mark_player_active), game-ended (end_party + the
--           finalize inactivity auto-end), game-begun (start_game).
--   Host:   player-left (mark_self_left), one-active-remains / no-active-remains /
--           2-round-inactivity (finalize_round_outcomes). All host pushes are
--           host_only-exempt; the player pushes naturally no-op in host_only (the
--           "except host" recipient lists are empty).
--
-- New helper send_push_to_host. Five functions reproduced VERBATIM from their latest
-- migrations with only the marked PUSH blocks added:
--   finalize_round_outcomes  ← 20260624130000
--   end_party                ← 20260514110100
--   start_game               ← 20260603120000
--   host_mark_player_active  ← 20260612120000
--   mark_self_left           ← 20260616130000
-- Locked conventions (#D010) unchanged; REVOKEs re-asserted where they applied.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Helper: push to the party host ───────────────────────────────────────────
create or replace function public.send_push_to_host(
  p_party_session_id uuid,
  p_title            text,
  p_body             text,
  p_data             jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host_user uuid;
begin
  select user_id into v_host_user
  from party_players
  where party_session_id = p_party_session_id and permission_role = 'host';

  if v_host_user is null then
    return;
  end if;

  perform public.send_push_to_users(array[v_host_user], p_title, p_body, p_data);
end;
$$;

comment on function public.send_push_to_host(uuid, text, text, jsonb) is
  'Sends a push to the party host''s token. Internal; EXECUTE revoked. Phase 16.';
revoke execute on function public.send_push_to_host(uuid, text, text, jsonb) from public, anon, authenticated;


-- ─── finalize_round_outcomes (verbatim from 20260624130000 + host PUSH blocks) ─
create or replace function public.finalize_round_outcomes(
  p_party_session_id       uuid,
  p_triggered_by           triggered_by,
  p_triggered_by_player_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session            party_sessions%rowtype;
  v_elimination        boolean;
  v_grace              grace_mode;
  v_host_only          boolean;
  v_threshold          int;
  v_round_id           uuid;
  v_round_number       int;
  v_completed          timestamptz;
  v_now                timestamptz := now();

  v_player             record;
  v_action             player_action;
  v_final_action       player_action;
  v_final_outcome      final_outcome;
  v_new_status         player_status;
  v_out_reason         out_reason;
  v_set_used_grace     boolean;
  v_grace_applied      boolean;
  v_grace_applied_at   timestamptz;
  v_inc_shots          int;
  v_inc_missed         int;

  v_activity_count     int;
  v_active_before      int;   -- PUSH: active count entering finalize (one-active transition)
  v_active_after       int;
  v_new_inactive       int;
  v_will_auto_end      boolean;          -- PUSH
  v_game_ended_to      uuid[];           -- PUSH: game-ended recipients on auto-end

  v_missed_safe        uuid[] := '{}';
  v_missed_grace       uuid[] := '{}';
  v_missed_out         uuid[] := '{}';
begin
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

  select elimination_enabled, grace_mode, host_only, auto_end_after_inactive_rounds
    into v_elimination, v_grace, v_host_only, v_threshold
  from party_settings
  where party_session_id = p_party_session_id;

  select id, round_number, completed_at
    into v_round_id, v_round_number, v_completed
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Idempotency gate (game-rules §7): already finalized → no-op.
  if v_completed is not null then
    return;
  end if;

  -- PUSH: active count BEFORE finalizing, for the one-active transition check.
  select count(*) into v_active_before
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  -- ─── Finalize each active player (game-rules §7 step 3) ───────────────────
  for v_player in
    select id, user_id, used_grace
    from party_players
    where party_session_id = p_party_session_id
      and status = 'active'
  loop
    select player_action into v_action
    from round_player_outcomes
    where round_id = v_round_id
      and party_player_id = v_player.id;

    if v_action is null or v_action = 'none' or v_action = 'missed' then
      v_final_action := 'missed';
    else
      v_final_action := v_action;
    end if;

    v_new_status       := 'active';
    v_out_reason       := null;
    v_set_used_grace   := false;
    v_grace_applied    := false;
    v_grace_applied_at := null;
    v_inc_shots        := 0;
    v_inc_missed       := 0;

    if v_final_action = 'done' then
      v_final_outcome := 'completed';
      v_inc_shots := 1;

    elsif v_final_action = 'self_out' then
      v_final_outcome := 'self_out';
      if not v_elimination then
        null;
      elsif v_grace = 'disabled' then
        v_new_status := 'out';
        v_out_reason := 'self_opted_out';
      elsif v_grace = 'enabled' and not v_player.used_grace then
        v_set_used_grace := true;
        v_grace_applied := true;
        v_grace_applied_at := v_now;
      elsif v_grace = 'enabled' then
        v_new_status := 'out';
        v_out_reason := 'self_opted_out';
      else
        null;
      end if;

    else
      v_inc_missed := 1;
      if not v_elimination then
        v_final_outcome := 'missed';
      elsif v_grace = 'disabled' then
        v_final_outcome := 'out';
        v_new_status := 'out';
        v_out_reason := 'missed_round';
      elsif v_grace = 'enabled' and not v_player.used_grace then
        v_final_outcome := 'grace_used';
        v_set_used_grace := true;
        v_grace_applied := true;
        v_grace_applied_at := v_now;
      elsif v_grace = 'enabled' then
        v_final_outcome := 'out';
        v_new_status := 'out';
        v_out_reason := 'missed_after_grace';
      else
        v_final_outcome := 'missed';
      end if;
    end if;

    insert into round_player_outcomes (
      round_id, party_session_id, party_player_id, round_number,
      player_action, final_outcome, finalized_at, finalized_by_player_id,
      grace_applied, grace_applied_at, status_before_round, status_after_round,
      eliminated_this_round
    )
    values (
      v_round_id, p_party_session_id, v_player.id, v_round_number,
      v_final_action, v_final_outcome, v_now, null,
      v_grace_applied, v_grace_applied_at, 'active', v_new_status,
      (v_new_status = 'out')
    )
    on conflict (round_id, party_player_id) do update set
      player_action          = excluded.player_action,
      final_outcome          = excluded.final_outcome,
      finalized_at           = excluded.finalized_at,
      finalized_by_player_id = excluded.finalized_by_player_id,
      grace_applied          = excluded.grace_applied,
      grace_applied_at       = excluded.grace_applied_at,
      status_before_round    = excluded.status_before_round,
      status_after_round     = excluded.status_after_round,
      eliminated_this_round  = excluded.eliminated_this_round;

    update party_players
    set status                  = v_new_status,
        out_reason              = case when v_new_status = 'out' then v_out_reason   else out_reason end,
        out_round_number        = case when v_new_status = 'out' then v_round_number else out_round_number end,
        out_at                  = case when v_new_status = 'out' then v_now          else out_at end,
        used_grace              = case when v_set_used_grace then true           else used_grace end,
        used_grace_at           = case when v_set_used_grace then v_now           else used_grace_at end,
        used_grace_round_number = case when v_set_used_grace then v_round_number  else used_grace_round_number end,
        total_shots_completed   = total_shots_completed + v_inc_shots,
        total_missed_rounds     = total_missed_rounds + v_inc_missed
    where id = v_player.id;

    if not coalesce(v_host_only, false) and v_final_action = 'missed' then
      if v_grace_applied then
        v_missed_grace := v_missed_grace || v_player.user_id;
      elsif v_new_status = 'out' then
        v_missed_out := v_missed_out || v_player.user_id;
      else
        v_missed_safe := v_missed_safe || v_player.user_id;
      end if;
    end if;
  end loop;

  -- ─── Round N completed; session enters round_complete (transitional) ──────
  update rounds
  set status = 'completed', completed_at = v_now
  where id = v_round_id;

  update party_sessions
  set current_phase = 'round_complete',
      phase_started_at = v_now,
      phase_ends_at = null
  where id = p_party_session_id;

  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_round_id, v_round_number, 'round_completed',
    'shot_window', 'round_complete', p_triggered_by, p_triggered_by_player_id
  );

  -- Missed-branch player pushes (#009 / D061).
  if array_length(v_missed_safe, 1) is not null then
    perform public.send_push_to_users(
      v_missed_safe, 'You missed a shot',
      'No penalty this time — you''re still in. 🍻',
      jsonb_build_object('type', 'round_outcome', 'partySessionId', p_party_session_id,
                         'roundNumber', v_round_number, 'outcome', 'missed_no_consequence'));
  end if;
  if array_length(v_missed_grace, 1) is not null then
    perform public.send_push_to_users(
      v_missed_grace, 'Grace used',
      'You didn''t respond, so your grace was spent. You''re still in — that was your freebie.',
      jsonb_build_object('type', 'round_outcome', 'partySessionId', p_party_session_id,
                         'roundNumber', v_round_number, 'outcome', 'missed_grace_used'));
  end if;
  if array_length(v_missed_out, 1) is not null then
    perform public.send_push_to_users(
      v_missed_out, 'You''re out',
      'You missed the shot and you''re out of the game.',
      jsonb_build_object('type', 'round_outcome', 'partySessionId', p_party_session_id,
                         'roundNumber', v_round_number, 'outcome', 'missed_out'));
  end if;

  -- ─── Inactivity safety net (Phase 12) ─────────────────────────────────────
  select count(*) into v_activity_count
  from round_player_outcomes
  where round_id = v_round_id
    and player_action in ('done', 'self_out');

  if v_activity_count > 0 then
    v_new_inactive := 0;
  else
    v_new_inactive := v_session.consecutive_inactive_rounds + 1;
  end if;

  update party_sessions
  set consecutive_inactive_rounds = v_new_inactive
  where id = p_party_session_id;

  select count(*) into v_active_after
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  v_will_auto_end := not coalesce(v_host_only, false)
                 and v_threshold > 0
                 and v_active_after >= 1
                 and v_new_inactive >= v_threshold;

  if v_will_auto_end then
    -- PUSH: game-ended to all still-in players (incl. host — server-triggered, the
    -- host may be away). #009.
    select array_agg(user_id) into v_game_ended_to
    from party_players
    where party_session_id = p_party_session_id and status in ('active', 'out');
    if v_game_ended_to is not null then
      perform public.send_push_to_users(v_game_ended_to, 'Game over', 'The party has ended. Thanks for playing Shot O''Clock.',
        jsonb_build_object('type', 'game_ended', 'partySessionId', p_party_session_id));
    end if;

    update party_sessions
    set status               = 'ended',
        current_phase        = 'ended',
        ended_at             = v_now,
        phase_ends_at        = null,
        auto_ended_inactive  = true
    where id = p_party_session_id;

    insert into admin_action_logs (
      party_session_id, actor_player_id, actor_permission_role,
      round_id, round_number, action_type, reason
    )
    values (
      p_party_session_id, v_session.host_player_id, 'host',
      v_round_id, v_round_number, 'end_party',
      format('auto-ended after %s consecutive rounds with no player activity', v_new_inactive)
    );

    return;
  end if;

  -- PUSH: host alerts (#009), host_only-exempt, skipped when auto-ending (handled
  -- above). no-active is exclusive (the warning/one-active are moot at 0 active).
  if not coalesce(v_host_only, false) then
    if v_active_after = 0 then
      perform public.send_push_to_host(p_party_session_id, 'Everyone''s out',
        'No active players remain.',
        jsonb_build_object('type', 'host_no_active', 'partySessionId', p_party_session_id,
                           'roundNumber', v_round_number));
    else
      if v_new_inactive = 2 then
        perform public.send_push_to_host(p_party_session_id, 'It''s quiet out there',
          'No one has responded in 2 rounds. The party will end automatically if this continues.',
          jsonb_build_object('type', 'host_inactivity', 'partySessionId', p_party_session_id,
                             'rounds', 2));
      end if;
      if v_active_before > 1 and v_active_after = 1 then
        perform public.send_push_to_host(p_party_session_id, 'Down to one',
          'Only one player is still active.',
          jsonb_build_object('type', 'host_one_active', 'partySessionId', p_party_session_id,
                             'roundNumber', v_round_number));
      end if;
    end if;
  end if;

  perform public.advance_to_next_round(p_party_session_id);
end;
$$;

revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;


-- ─── end_party (verbatim from 20260514110100 + game-ended PUSH) ───────────────
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
  v_recipients           uuid[];   -- PUSH
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

  if v_existing_player_id is null then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;
  if v_existing_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  if v_session.status = 'ended' then
    return public._rpc_success(jsonb_build_object(
      'ended_at', v_session.ended_at
    ));
  end if;

  if v_session.current_round_number >= 1 then
    select id, round_number
      into v_in_flight_round_id, v_in_flight_round_num
    from rounds
    where party_session_id = p_party_session_id
      and round_number = v_session.current_round_number
      and status not in ('completed', 'cancelled');
  end if;

  update party_sessions
  set status        = 'ended',
      current_phase = 'ended',
      ended_at      = v_now,
      phase_ends_at = null
  where id = p_party_session_id;

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

  -- PUSH: tell the other players the party ended (#009). The host tapped End Party
  -- (foreground), so they're excluded; host_only has no other players → no-op.
  select array_agg(user_id) into v_recipients
  from party_players
  where party_session_id = p_party_session_id
    and status in ('active', 'out')
    and id <> v_existing_player_id;
  if v_recipients is not null then
    perform public.send_push_to_users(v_recipients, 'Game over', 'The party has ended. Thanks for playing Shot O''Clock.',
      jsonb_build_object('type', 'game_ended', 'partySessionId', p_party_session_id));
  end if;

  return public._rpc_success(jsonb_build_object('ended_at', v_now));
end;
$$;


-- ─── start_game (verbatim from 20260603120000 + game-begun PUSH) ──────────────
create or replace function public.start_game(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id          uuid := auth.uid();
  v_session          party_sessions%rowtype;
  v_player_id        uuid;
  v_role             player_permission_role;
  v_active_count     int;
  v_starting_interval int;
  v_shot_window      int;
  v_round_id         uuid;
  v_phase_ends_at    timestamptz;
  v_recipients       uuid[];   -- PUSH
  v_now              timestamptz := now();
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

  if v_session.status = 'active'
     and v_session.current_phase = 'countdown'
     and v_session.current_round_number = 1 then
    select id into v_round_id
    from rounds
    where party_session_id = p_party_session_id
      and round_number = 1;

    return public._rpc_success(jsonb_build_object(
      'round_id',      v_round_id,
      'round_number',  1,
      'phase_ends_at', v_session.phase_ends_at
    ));
  end if;

  if v_session.status != 'lobby' or v_session.current_phase != 'lobby' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'The game cannot be started from its current state.');
  end if;

  select count(*) into v_active_count
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_active_count = 0 then
    return public._rpc_error('NO_ACTIVE_PLAYERS',
      'The game needs at least one active player to start.');
  end if;

  select starting_interval_seconds, shot_window_seconds
    into v_starting_interval, v_shot_window
  from party_settings
  where party_session_id = p_party_session_id;

  v_phase_ends_at := v_now + make_interval(secs => v_starting_interval);

  insert into rounds (
    party_session_id,
    round_number,
    interval_seconds,
    shot_window_seconds,
    status,
    countdown_started_at,
    countdown_ends_at
  )
  values (
    p_party_session_id,
    1,
    v_starting_interval,
    v_shot_window,
    'countdown',
    v_now,
    v_phase_ends_at
  )
  returning id into v_round_id;

  update party_sessions
  set status               = 'active',
      current_phase        = 'countdown',
      current_round_number = 1,
      phase_started_at     = v_now,
      phase_ends_at        = v_phase_ends_at,
      started_at           = v_now
  where id = p_party_session_id;

  insert into timer_events (
    party_session_id,
    round_id,
    round_number,
    event_type,
    previous_phase,
    new_phase,
    new_ends_at,
    triggered_by,
    triggered_by_player_id
  )
  values (
    p_party_session_id,
    v_round_id,
    1,
    'countdown_started',
    'lobby',
    'countdown',
    v_phase_ends_at,
    'host',
    v_player_id
  );

  -- PUSH: tell the lobby players the game started (#009). The host tapped Start
  -- (foreground), so they're excluded; host_only has no other players → no-op.
  select array_agg(user_id) into v_recipients
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active'
    and id <> v_player_id;
  if v_recipients is not null then
    perform public.send_push_to_users(v_recipients, 'It''s go time 🍻',
      'The host started the party. Get ready for the first shot.',
      jsonb_build_object('type', 'game_begun', 'partySessionId', p_party_session_id));
  end if;

  return public._rpc_success(jsonb_build_object(
    'round_id',      v_round_id,
    'round_number',  1,
    'phase_ends_at', v_phase_ends_at
  ));
end;
$$;


-- ─── host_mark_player_active (verbatim from 20260612120000 + reinstated PUSH) ──
create or replace function public.host_mark_player_active(p_party_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id            uuid := auth.uid();
  v_session_id         uuid;
  v_session            party_sessions%rowtype;
  v_host_id            uuid;
  v_host_role          player_permission_role;
  v_target_status      player_status;
  v_target_out_round   int;
  v_target_out_reason  out_reason;
  v_target_out_at      timestamptz;
  v_target_rejoined_at timestamptz;
  v_target_user_id     uuid;   -- PUSH
  v_round_id           uuid;
  v_new_phase          party_phase;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_player_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_player_id is required.');
  end if;

  select party_session_id into v_session_id
  from party_players
  where id = p_party_player_id;

  if v_session_id is null then
    return public._rpc_error('PLAYER_NOT_FOUND', 'That player was not found.');
  end if;

  select * into v_session
  from party_sessions
  where id = v_session_id
  for update;

  if not found then
    return public._rpc_error('PLAYER_NOT_FOUND', 'That player was not found.');
  end if;

  select id, permission_role
    into v_host_id, v_host_role
  from party_players
  where party_session_id = v_session_id
    and user_id = v_user_id;

  if v_host_id is null or v_host_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  if v_session.current_round_number < 1 then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Players can only be reinstated after the game has started.');
  end if;

  select status, out_round_number, out_reason, out_at, rejoined_at, user_id
    into v_target_status, v_target_out_round, v_target_out_reason, v_target_out_at,
         v_target_rejoined_at, v_target_user_id
  from party_players
  where id = p_party_player_id;

  select id into v_round_id
  from rounds
  where party_session_id = v_session_id
    and round_number = v_session.current_round_number;

  if v_target_status = 'removed' then
    return public._rpc_error('PLAYER_NOT_OUT',
      'That player has been removed and cannot be reinstated.');
  end if;

  if v_target_status = 'active' then
    insert into admin_action_logs (
      party_session_id, actor_player_id, actor_permission_role,
      affected_player_id, round_id, round_number, action_type, reason
    )
    values (
      v_session_id, v_host_id, 'host',
      p_party_player_id, v_round_id, v_session.current_round_number,
      'mark_player_active', 'no-change: already active'
    );

    return public._rpc_success(jsonb_build_object(
      'party_player_id', p_party_player_id,
      'status',          'active',
      'new_phase',       v_session.current_phase
    ));
  end if;

  if (v_target_rejoined_at is null or v_target_out_at is null or v_target_rejoined_at <= v_target_out_at)
     and v_target_out_round < v_session.current_round_number - 1 then
    return public._rpc_error('REINSTATE_TOO_OLD',
      'That player went out too long ago to be reinstated.');
  end if;

  update party_players
  set status                  = 'active',
      out_reason              = null,
      out_round_number        = null,
      out_at                  = null,
      used_grace              = case when v_target_out_reason = 'missed_after_grace' then false else used_grace end,
      used_grace_at           = case when v_target_out_reason = 'missed_after_grace' then null  else used_grace_at end,
      used_grace_round_number = case when v_target_out_reason = 'missed_after_grace' then null  else used_grace_round_number end
  where id = p_party_player_id;

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    affected_player_id, round_id, round_number, action_type, reason
  )
  values (
    v_session_id, v_host_id, 'host',
    p_party_player_id, v_round_id, v_session.current_round_number, 'mark_player_active',
    case when v_target_out_reason = 'missed_after_grace' then 'reinstated; grace restored' else null end
  );

  v_new_phase := v_session.current_phase;
  if v_session.status = 'active' and v_session.current_phase = 'round_complete' then
    perform public.advance_to_next_round(v_session_id);

    select current_phase into v_new_phase
    from party_sessions
    where id = v_session_id;
  end if;

  -- PUSH: tell the reinstated player (#009). The host triggered it (foreground).
  perform public.send_push_to_users(array[v_target_user_id], 'You''re back in 🙌',
    'The host reinstated you. You''re active again starting next round.',
    jsonb_build_object('type', 'reinstated', 'partySessionId', v_session_id,
                       'roundNumber', v_session.current_round_number));

  return public._rpc_success(jsonb_build_object(
    'party_player_id', p_party_player_id,
    'status',          'active',
    'new_phase',       v_new_phase
  ));
end;
$$;


-- ─── mark_self_left (verbatim from 20260616130000 + player-left PUSH) ──────────
create or replace function public.mark_self_left(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_round_number   int;
  v_player_id      uuid;
  v_player_status  player_status;
  v_player_role    player_permission_role;
  v_player_name    text;          -- PUSH
  v_prior_left_at  timestamptz;   -- PUSH: only notify on the FIRST leave
  v_left_at        timestamptz;
  v_now            timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  select current_round_number into v_round_number
  from party_sessions
  where id = p_party_session_id
  for update;
  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, status, permission_role, display_name, left_at
    into v_player_id, v_player_status, v_player_role, v_player_name, v_prior_left_at
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_player_id is null or v_player_status = 'removed' then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  if v_player_role = 'host' then
    return public._rpc_error('HOST_CANNOT_LEAVE',
      'The host cannot leave the party — end it instead.');
  end if;

  update party_players
  set left_at          = coalesce(left_at, v_now),
      status           = case when v_player_status = 'active' and v_round_number >= 1
                              then 'out'::player_status else status end,
      out_reason       = case when v_player_status = 'active' and v_round_number >= 1
                              then 'self_opted_out'::out_reason else out_reason end,
      out_round_number = case when v_player_status = 'active' and v_round_number >= 1
                              then v_round_number else out_round_number end,
      out_at           = case when v_player_status = 'active' and v_round_number >= 1
                              then v_now else out_at end
  where id = v_player_id
  returning left_at into v_left_at;

  perform public.finalize_if_all_submitted(p_party_session_id);

  -- PUSH: tell the host a player left (#009), with their name. Only on the FIRST
  -- leave (left_at was null), so a repeat call doesn't re-notify. (Unreachable in
  -- host_only — the lone host can't leave.)
  if v_prior_left_at is null then
    perform public.send_push_to_host(p_party_session_id, 'A player left',
      format('%s left the party.', v_player_name),
      jsonb_build_object('type', 'host_player_left', 'partySessionId', p_party_session_id));
  end if;

  return public._rpc_success(jsonb_build_object(
    'party_player_id', v_player_id,
    'left_at',         v_left_at
  ));
end;
$$;
