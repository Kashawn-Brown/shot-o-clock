-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 12 — Surface auto-end-on-inactivity to the client
-- ─────────────────────────────────────────────────────────────────────────────
-- The inactivity auto-end (20260613140000) ends a party the same way a host
-- End Party does, so the Final Summary can't tell the two apart. This adds a
-- boolean flag on party_sessions that the auto-end sets, so the summary screen
-- can show a "Game ended due to inactivity" note only when it applies.
--
-- Why a session column (not the admin_action_logs reason): get_party_state
-- returns the whole party_sessions row via to_jsonb(v_session), so a new column
-- reaches the client for free — no get_party_state change, no extra query, no
-- admin-log RLS to widen. The summary already reads session.* (name, ended_at).
--
-- Additive + idempotent. Only the auto-end branch of finalize_round_outcomes
-- changes (it now also sets auto_ended_inactive = true); the rest of the function
-- is byte-for-byte 20260613140000. host_only is exempt from auto-end, so this
-- flag is only ever true for a multi-device party.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; finalize's REVOKE EXECUTE re-asserted below.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. The flag ──────────────────────────────────────────────────────────────
-- False for every party the host (or anything else) ended; set true only by the
-- inactivity auto-end below.
alter table party_sessions
  add column if not exists auto_ended_inactive boolean not null default false;


-- ─── 2. finalize_round_outcomes — set the flag on auto-end ────────────────────
-- Rebuilt from 20260613140000. The ONLY change: the auto-end's party_sessions
-- UPDATE also sets auto_ended_inactive = true. Every other statement (the
-- per-player finalize loop, the streak counter, the threshold check, the
-- round-completed update + event, the advance delegation) is unchanged.
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
  -- A late joiner is fully in the round they joined (joined_round_number is a
  -- recorded data point only, no effect here): they tapped Done / I'm Out, or
  -- they miss — same ladder as anyone else. Host reinstates if they joined too
  -- late to act.
  for v_player in
    select id, used_grace
    from party_players
    where party_session_id = p_party_session_id
      and status = 'active'
  loop
    select player_action into v_action
    from round_player_outcomes
    where round_id = v_round_id
      and party_player_id = v_player.id;

    -- No row, a pre-created 'none', or an existing 'missed' all count as a miss
    -- (game-rules §3.3). 'done' / 'self_out' carry through.
    if v_action is null or v_action = 'none' or v_action = 'missed' then
      v_final_action := 'missed';
    else
      v_final_action := v_action;
    end if;

    -- Reset per-iteration accumulators.
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
      -- ─── Self-out: grace-aware SKIP (D034 / game-rules §3.2, §7) ─────────
      v_final_outcome := 'self_out';
      if not v_elimination then
        null;                                   -- 1. skip, no consequence
      elsif v_grace = 'disabled' then
        v_new_status := 'out';                  -- 2. out
        v_out_reason := 'self_opted_out';
      elsif v_grace = 'enabled' and not v_player.used_grace then
        v_set_used_grace := true;               -- 3. skip, consume grace
        v_grace_applied := true;
        v_grace_applied_at := v_now;
      elsif v_grace = 'enabled' then
        v_new_status := 'out';                  -- 4. out (grace exhausted)
        v_out_reason := 'self_opted_out';
      else
        null;                                   -- 5. unlimited → skip
      end if;

    else
      -- ─── Missed: grace ladder (STRICT ORDER — see D034 migration) ────────
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
      round_id,
      party_session_id,
      party_player_id,
      round_number,
      player_action,
      final_outcome,
      finalized_at,
      finalized_by_player_id,
      grace_applied,
      grace_applied_at,
      status_before_round,
      status_after_round,
      eliminated_this_round
    )
    values (
      v_round_id,
      p_party_session_id,
      v_player.id,
      v_round_number,
      v_final_action,
      v_final_outcome,
      v_now,
      null,
      v_grace_applied,
      v_grace_applied_at,
      'active',
      v_new_status,
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

  -- ─── Inactivity safety net (Phase 12) ─────────────────────────────────────
  -- "Activity" this round = at least one Done / I'm Out outcome. Status-
  -- independent: a tap counts even if the host later marked that player out.
  select count(*) into v_activity_count
  from round_player_outcomes
  where round_id = v_round_id
    and player_action in ('done', 'self_out');

  -- Reset the streak on any activity; otherwise extend it. v_session was read
  -- before any mutation this call, so its counter is the prior value.
  if v_activity_count > 0 then
    v_new_inactive := 0;
  else
    v_new_inactive := v_session.consecutive_inactive_rounds + 1;
  end if;

  update party_sessions
  set consecutive_inactive_rounds = v_new_inactive
  where id = p_party_session_id;

  -- Players that would carry into round N+1.
  select count(*) into v_active_after
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  -- Auto-end an unattended party that crosses the threshold. Skipped entirely
  -- for host_only (the lone host never taps — every round is 'silent' by design,
  -- D050), when disabled (threshold 0), and when the round already left zero
  -- active players (the host-driven halt, mvp-state-machine §8.1, owns that case).
  if not coalesce(v_host_only, false)
     and v_threshold > 0
     and v_active_after >= 1
     and v_new_inactive >= v_threshold then
    -- Same terminal state as end_party (no in-flight round to cancel — round N is
    -- already completed), plus auto_ended_inactive = true so the Final Summary
    -- can show the "ended due to inactivity" note. The status/phase = 'ended'
    -- change drives the existing Phase 11 realtime routing to the summary.
    update party_sessions
    set status               = 'ended',
        current_phase        = 'ended',
        ended_at             = v_now,
        phase_ends_at        = null,
        auto_ended_inactive  = true
    where id = p_party_session_id;

    -- Logged as end_party with an explanatory reason — no 'auto_end' enum value;
    -- the reason carries the distinction. Actor = host (the log's actor_player_id
    -- is NOT NULL; host_player_id is guaranteed set once a party has rounds).
    insert into admin_action_logs (
      party_session_id, actor_player_id, actor_permission_role,
      round_id, round_number, action_type, reason
    )
    values (
      p_party_session_id, v_session.host_player_id, 'host',
      v_round_id, v_round_number, 'end_party',
      format('auto-ended after %s consecutive rounds with no player activity', v_new_inactive)
    );

    return;  -- ended — do NOT auto-advance into round N+1
  end if;

  perform public.advance_to_next_round(p_party_session_id);
end;
$$;

comment on function public.finalize_round_outcomes(uuid, triggered_by, uuid) is
  'Internal helper: finalizes a shot window per game-rules.md §7 (self_out is a '
  'grace-aware skip per D034; late joiners participate like anyone else). Tracks '
  'consecutive zero-activity rounds and auto-ends an unattended party at the '
  'party_settings.auto_end_after_inactive_rounds threshold (host_only exempt), '
  'flagging party_sessions.auto_ended_inactive for the summary. Otherwise '
  'delegates to advance_to_next_round for the D014 auto-advance. EXECUTE revoked '
  'from anon/authenticated; only advance_phase_if_due and host_end_shot_window call it.';

revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;
