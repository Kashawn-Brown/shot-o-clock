-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch E0: extract advance_to_next_round helper (refactor, no behavior change)
-- ─────────────────────────────────────────────────────────────────────────────
-- D014's auto-advance tail (create round N+1, move the session into countdown,
-- emit next_round_started) was originally inlined at the bottom of
-- finalize_round_outcomes (20260603130000_rpc_advance_phase.sql). Batch E's
-- host_mark_player_active needs the SAME tail to resume the loop when a host
-- reinstates a player during the zero-active round_complete halt
-- (rpc-contracts.md §11.1, game-rules.md §9.5) — but it cannot call
-- finalize_round_outcomes for it, because finalize's completed_at idempotency
-- gate returns BEFORE the tail (round N is already finalized at that point).
--
-- Rather than duplicate the tail (drift risk on the interval-clamp / event
-- logic), we extract it into a single internal helper that BOTH callers share:
--   - advance_to_next_round(party_session_id)  — the round-N+1 creation tail (§8.8)
-- and create-or-replace finalize_round_outcomes to delegate to it. This is a
-- pure refactor: the helper performs the identical statements that were inlined,
-- so finalize_round_outcomes behaves exactly as before.
--
-- This is an additive migration (CLAUDE.md §10) — it does not edit the Batch C
-- migration file; it replaces the function body via create-or-replace, which
-- applies cleanly after the original on a fresh DB.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; internal helper → REVOKE EXECUTE from public/anon/authenticated
-- (only the two SECURITY DEFINER callers, which run as owner, invoke it).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── advance_to_next_round (internal helper — not a client RPC) ───────────────
-- See rpc-contracts.md §8.8 (the auto-advance half) and decisions.md D014.
--
-- Preconditions the CALLER must have established before calling:
--   (1) holds the FOR UPDATE lock on the party_sessions row;
--   (2) round N (= current_round_number) is finalized (status = completed) and
--       the session is in current_phase = round_complete.
--
-- Effect: count players still active.
--   - 0 active → no-op; the session rests in round_complete (the zero-active
--     halt, mvp-state-machine §8.1). The caller's round_completed event already
--     fired.
--   - ≥1 active → create round N+1 (countdown), move the session into countdown,
--     emit a next_round_started timer_event (always triggered_by = system).
--
-- Idempotent at the DB layer: the rounds (party_session_id, round_number) unique
-- constraint prevents a duplicate round N+1 if this somehow runs twice for the
-- same N.

create or replace function public.advance_to_next_round(p_party_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session            party_sessions%rowtype;
  v_active_after       int;
  v_completed_interval int;
  v_interval_increment int;
  v_max_interval       int;
  v_shot_window        int;
  v_next_interval      int;
  v_next_round_number  int;
  v_next_round_id      uuid;
  v_next_ends_at       timestamptz;
  v_now                timestamptz := now();
begin
  -- Caller holds the FOR UPDATE lock on this row; a plain re-select is fine.
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

  -- Zero-active halt (mvp-state-machine §8.1): do not create round N+1; rest in
  -- round_complete. Host reinstates (re-triggering this) or ends the party.
  select count(*) into v_active_after
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_active_after < 1 then
    return;
  end if;

  select interval_increment_seconds, max_interval_seconds, shot_window_seconds
    into v_interval_increment, v_max_interval, v_shot_window
  from party_settings
  where party_session_id = p_party_session_id;

  -- The just-completed round N's interval is the base for N+1 (interval_seconds
  -- is unchanged by completion, so reading it here matches the pre-completion
  -- value the inlined tail used).
  select interval_seconds into v_completed_interval
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Next interval = completed round's interval + increment, clamped at max.
  v_next_interval := v_completed_interval + v_interval_increment;
  if v_max_interval is not null and v_next_interval > v_max_interval then
    v_next_interval := v_max_interval;
  end if;
  v_next_round_number := v_session.current_round_number + 1;
  v_next_ends_at := v_now + make_interval(secs => v_next_interval);

  -- referee_confirmation_window_seconds takes the schema default (post-MVP).
  insert into rounds (
    party_session_id, round_number, interval_seconds, shot_window_seconds,
    status, countdown_started_at, countdown_ends_at
  )
  values (
    p_party_session_id, v_next_round_number, v_next_interval, v_shot_window,
    'countdown', v_now, v_next_ends_at
  )
  returning id into v_next_round_id;

  update party_sessions
  set current_phase = 'countdown',
      current_round_number = v_next_round_number,
      phase_started_at = v_now,
      phase_ends_at = v_next_ends_at
  where id = p_party_session_id;

  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, new_ends_at, triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_next_round_id, v_next_round_number, 'next_round_started',
    'round_complete', 'countdown', v_next_ends_at, 'system', null
  );
end;
$$;

comment on function public.advance_to_next_round(uuid) is
  'Internal helper: D014 auto-advance tail — creates round N+1 (or rests in the '
  'zero-active round_complete halt). Shared by finalize_round_outcomes and '
  'host_mark_player_active. See rpc-contracts.md §8.8 and decisions.md D014.';

-- Lock down execution (same pattern as the _rpc_* helpers, #D010): never a
-- client RPC. Owner-role callers (the SECURITY DEFINER RPCs) are unaffected.
revoke execute on function public.advance_to_next_round(uuid) from public;
revoke execute on function public.advance_to_next_round(uuid) from anon, authenticated;


-- ─── finalize_round_outcomes (re-pointed at the helper) ───────────────────────
-- Identical to 20260603130000_rpc_advance_phase.sql EXCEPT the inlined
-- auto-advance tail (count active → create round N+1) is replaced by a single
-- call to advance_to_next_round(). Every other statement — the per-player grace
-- finalization loop, the round-completed update, and the round_completed
-- timer_event — is byte-for-byte the prior behavior. No functional change.

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
  v_shot_window        int;
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
begin
  -- Caller holds the FOR UPDATE lock on this row; a plain re-select is fine.
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

  select elimination_enabled, grace_mode, shot_window_seconds
    into v_elimination, v_grace, v_shot_window
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
      v_final_outcome := 'self_out';
      v_new_status := 'out';
      v_out_reason := 'self_opted_out';

    else
      -- ─── Missed: grace ladder ───────────────────────────────────────────
      -- STRICT ORDER — each rung must be checked before the next, and the
      -- elimination_enabled gate must come first. Re-ordering breaks the rules:
      -- e.g. testing grace_mode before the elimination_enabled=false gate would
      -- consume a player's one grace on a round that should have had NO
      -- consequence — a double-grace bug where the real first miss later finds
      -- used_grace already true and eliminates them a round early. Order is:
      --   1. elimination off            → missed, no consequence
      --   2. grace disabled             → out (missed_round)
      --   3. grace enabled, !used_grace → grace_used (consume the one grace)
      --   4. grace enabled,  used_grace → out (missed_after_grace)
      --   5. unlimited                  → missed, stays active
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

    -- Intentional UPSERT (do NOT "fix" to a plain INSERT): a player who tapped
    -- Done or I'm Out already has a row keyed (round_id, party_player_id), so we
    -- update its final_outcome; a player who missed has no row yet and gets one
    -- inserted. The unique constraint makes this the single canonical row.
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
      null,                       -- convention D: system finalization, no actor
      v_grace_applied,
      v_grace_applied_at,
      'active',                   -- only active players are finalized
      v_new_status,
      (v_new_status = 'out')      -- convention E
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

    -- Player row. out_* set only when going out (out_fields_consistent CHECK
    -- needs all three non-null when status='out'); used_grace fields set only
    -- when grace was consumed this round; existing history preserved otherwise.
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

  -- ─── Auto-advance (D014): now delegated to the shared helper. Identical to
  -- the formerly-inlined tail — creates round N+1 when players remain, else
  -- rests in the zero-active round_complete halt.
  perform public.advance_to_next_round(p_party_session_id);
end;
$$;

comment on function public.finalize_round_outcomes(uuid, triggered_by, uuid) is
  'Internal helper: finalizes a shot window per game-rules.md §7, then delegates '
  'to advance_to_next_round for the D014 auto-advance (rpc-contracts.md §8.8). '
  'EXECUTE revoked from anon/authenticated; only advance_phase_if_due and '
  'host_end_shot_window call it.';

-- Re-assert the lockdown after create-or-replace (defensive; the revokes from
-- the Batch C migration persist across replace, but stating them keeps this
-- migration self-contained and idempotent).
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;
