-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 — Push: per-player MISSED outcome notifications from finalize
-- ─────────────────────────────────────────────────────────────────────────────
-- Wires the first three #009 player pushes into finalize_round_outcomes: a player
-- who DIDN'T respond (the missed branch) gets told what happened — no-consequence,
-- grace-used, or now-out. self_out players tapped (foreground; in-app UI covered it)
-- so they get nothing; host_only is excluded (the lone foreground host). Sends go
-- through send_push_to_users (D068); foreground recipients have them suppressed by
-- the client handler. See #009, D061.
--
-- Rebuilt from 20260613150000. Additions only (all marked "PUSH"): user_id in the
-- finalize loop, three recipient buckets filled per missed player, and up to three
-- send_push_to_users calls after the loop. Every other statement is unchanged.
--
-- Locked conventions (#D010): SECURITY DEFINER, search_path pin; REVOKE re-asserted.
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
  v_active_after       int;
  v_new_inactive       int;

  -- PUSH: recipient buckets for the missed-branch notifications (#009 / D061).
  v_missed_safe        uuid[] := '{}';   -- missed, no consequence (elim off / unlimited)
  v_missed_grace       uuid[] := '{}';   -- missed, grace absorbed it
  v_missed_out         uuid[] := '{}';   -- missed, now out
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

  -- ─── Finalize each active player (game-rules §7 step 3) ───────────────────
  for v_player in
    select id, user_id, used_grace          -- PUSH: + user_id for recipient resolution
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

    -- PUSH: bucket a non-responder for notification. Missed branch only (self_out
    -- tapped, so the UI covered it); host_only excluded (lone foreground host).
    -- The three cases are mutually exclusive.
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

  -- PUSH: notify the non-responders what happened to them (#009 / D061). Placed
  -- before the inactivity/auto-end block so it fires regardless of an auto-end.
  -- Up to three sends — one per non-empty bucket (each shares one title/body).
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

  if not coalesce(v_host_only, false)
     and v_threshold > 0
     and v_active_after >= 1
     and v_new_inactive >= v_threshold then
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

  perform public.advance_to_next_round(p_party_session_id);
end;
$$;

comment on function public.finalize_round_outcomes(uuid, triggered_by, uuid) is
  'Internal helper: finalizes a shot window per game-rules.md §7 (self_out is a '
  'grace-aware skip per D034; late joiners participate like anyone else). Sends the '
  'missed-branch player push notifications (#009/D061, host_only exempt). Tracks '
  'consecutive zero-activity rounds and auto-ends an unattended party at the '
  'party_settings.auto_end_after_inactive_rounds threshold (host_only exempt), '
  'flagging party_sessions.auto_ended_inactive for the summary. Otherwise '
  'delegates to advance_to_next_round for the D014 auto-advance. EXECUTE revoked '
  'from anon/authenticated; only advance_phase_if_due and host_end_shot_window call it.';

revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;
