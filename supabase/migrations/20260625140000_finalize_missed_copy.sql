-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — finalize missed-branch push copy revision
-- ─────────────────────────────────────────────────────────────────────────────
-- Copy-only revision of the three missed-branch player pushes. Reproduced VERBATIM
-- from 20260625120000; only the three body strings change (titles unchanged), and
-- nothing else in finalize_round_outcomes is touched.
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Missed-branch player pushes (#009 / D061). COPY REVISED (titles unchanged).
  if array_length(v_missed_safe, 1) is not null then
    perform public.send_push_to_users(
      v_missed_safe, 'You missed a shot',
      'You''re still in the game, no penalty.',
      jsonb_build_object('type', 'round_outcome', 'partySessionId', p_party_session_id,
                         'roundNumber', v_round_number, 'outcome', 'missed_no_consequence'));
  end if;
  if array_length(v_missed_grace, 1) is not null then
    perform public.send_push_to_users(
      v_missed_grace, 'Grace used',
      'You missed the shot but your grace was used. You''re still in the game.',
      jsonb_build_object('type', 'round_outcome', 'partySessionId', p_party_session_id,
                         'roundNumber', v_round_number, 'outcome', 'missed_grace_used'));
  end if;
  if array_length(v_missed_out, 1) is not null then
    perform public.send_push_to_users(
      v_missed_out, 'You''re out',
      'You missed the shot. You have been eliminated.',
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
