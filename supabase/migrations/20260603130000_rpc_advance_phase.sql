-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch C2: advance_phase_if_due + finalize_round_outcomes
-- ─────────────────────────────────────────────────────────────────────────────
-- The timer-authority RPC and its shared finalization helper from
-- docs/specs/rpc-contracts.md §8 (§8.4 / §8.8), implementing the D014
-- auto-advance model (decisions.md D014):
--   - finalize_round_outcomes(...)   — internal helper: §7 grace finalization +
--                                      auto-advance into the next round (§8.8)
--   - advance_phase_if_due(...)      — countdown→shot_window, or shot_window→
--                                      finalize→countdown(N+1)/halt (§8.4)
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; in-function auth/membership checks; standard {ok,...} envelope via
-- _rpc_success / _rpc_error.
--
-- Batch C2 conventions (approved this session):
--   (D) finalized_by_player_id is null on every finalized outcome. game-rules
--       §7 step 4 says "system (sentinel or null)"; there is no system-sentinel
--       party_players row, so null. p_triggered_by_player_id flows only to the
--       timer_events row, not the outcome.
--   (E) eliminated_this_round = (status_after_round = 'out') — true for both
--       missed→out and self_out.
--   (G) advance_phase_if_due replicates the read-RPC membership rule (active/out
--       member); non-members collapse into SESSION_NOT_FOUND (§13 non-distinction).
--
-- rounds.referee_confirmation_window_seconds is left to its schema default (0)
-- when creating round N+1, for the same reason as start_game (post-MVP).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── finalize_round_outcomes (internal helper — not a client RPC) ─────────────
-- See rpc-contracts.md §8.8 and game-rules.md §7.
--
-- Assumes the CALLER has already locked the party_sessions row
-- (select … for update) and verified current_phase = 'shot_window'. Only
-- advance_phase_if_due (below) and host_end_shot_window (Batch E) call it; both
-- run as the owner (postgres) and so bypass the REVOKE EXECUTE at the bottom.
--
-- Idempotent: returns immediately if the current round's completed_at is set
-- (game-rules §7). The rounds (party_session_id, round_number) unique constraint
-- is the DB-level backstop for the round N+1 insert.

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
  v_interval_increment int;
  v_max_interval       int;
  v_shot_window        int;
  v_round_id           uuid;
  v_round_number       int;
  v_round_interval     int;
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

  v_active_after       int;
  v_next_interval      int;
  v_next_round_number  int;
  v_next_round_id      uuid;
  v_next_ends_at       timestamptz;
begin
  -- Caller holds the FOR UPDATE lock on this row; a plain re-select is fine.
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

  select elimination_enabled, grace_mode, interval_increment_seconds,
         max_interval_seconds, shot_window_seconds
    into v_elimination, v_grace, v_interval_increment, v_max_interval, v_shot_window
  from party_settings
  where party_session_id = p_party_session_id;

  select id, round_number, interval_seconds, completed_at
    into v_round_id, v_round_number, v_round_interval, v_completed
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

  -- ─── Auto-advance (D014): create round N+1 when players remain ────────────
  select count(*) into v_active_after
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_active_after >= 1 then
    -- Next interval = completed round's interval + increment, clamped at max.
    v_next_interval := v_round_interval + v_interval_increment;
    if v_max_interval is not null and v_next_interval > v_max_interval then
      v_next_interval := v_max_interval;
    end if;
    v_next_round_number := v_round_number + 1;
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
  end if;
  -- else: zero active players → session rests in round_complete (the halt,
  -- mvp-state-machine §8.1). Host reinstates (Batch E) or ends the party.
end;
$$;

comment on function public.finalize_round_outcomes(uuid, triggered_by, uuid) is
  'Internal helper: finalizes a shot window per game-rules.md §7 and auto-advances '
  'to the next round (rpc-contracts.md §8.8, decisions.md D014). EXECUTE revoked '
  'from anon/authenticated; only advance_phase_if_due and host_end_shot_window call it.';

-- Lock down execution (same pattern as the _rpc_* helpers, #D010): never a
-- client RPC. Owner-role callers (the two SECURITY DEFINER RPCs) are unaffected.
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;


-- ─── advance_phase_if_due ─────────────────────────────────────────────────────
-- See rpc-contracts.md §8 and mvp-state-machine.md §3.2/§3.3, §5.
--
-- The mechanism that makes the timer authoritative. Clients poll it; the first
-- caller past phase_ends_at transitions, the rest get transitioned=false. The
-- FOR UPDATE on party_sessions serializes concurrent callers and the finalize.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → SESSION_NOT_FOUND if not found
--   4. membership check (active/out) → SESSION_NOT_FOUND if non-member (call G)
--   5. no-op conditions (not active / wrong phase / not due) → transitioned=false
--   6. branch: countdown→shot_window, or shot_window→finalize+auto-advance

create or replace function public.advance_phase_if_due(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id           uuid := auth.uid();
  v_session           party_sessions%rowtype;
  v_is_member         boolean;
  v_round_id          uuid;
  v_round_shot_window int;
  v_shot_ends_at      timestamptz;
  v_active_count      int;
  v_new_phase         party_phase;
  v_now               timestamptz := now();
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

  -- Call G: DEFINER bypasses RLS, so replicate the read-RPC rule (active/out
  -- member). Non-members collapse into SESSION_NOT_FOUND (§13 non-distinction).
  select exists (
    select 1 from party_players
    where party_session_id = p_party_session_id
      and user_id = v_user_id
      and status in ('active', 'out')
  ) into v_is_member;

  if not v_is_member then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;

  -- §8.3 no-op conditions — all normal, not errors. Not active covers paused /
  -- lobby / ended; the phase filter restricts to the two due-able phases; the
  -- time check is the "is it actually due yet" gate.
  if v_session.status != 'active'
     or v_session.current_phase not in ('countdown', 'shot_window')
     or v_session.phase_ends_at is null
     or v_now < v_session.phase_ends_at then
    return public._rpc_success(jsonb_build_object(
      'transitioned', false,
      'new_phase',    null
    ));
  end if;

  select id, shot_window_seconds
    into v_round_id, v_round_shot_window
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  if v_session.current_phase = 'countdown' then
    -- §8.4 countdown → shot_window. Cannot open a shot window with nobody active.
    select count(*) into v_active_count
    from party_players
    where party_session_id = p_party_session_id
      and status = 'active';

    if v_active_count = 0 then
      return public._rpc_error('NO_ACTIVE_PLAYERS',
        'No active players remain; the shot window cannot open.');
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

    return public._rpc_success(jsonb_build_object(
      'transitioned', true,
      'new_phase',    'shot_window'
    ));
  else
    -- §8.4 shot_window → finalize + auto-advance, delegated to the shared helper
    -- with triggered_by = system (the timer fired, not the host).
    perform public.finalize_round_outcomes(p_party_session_id, 'system'::triggered_by, null);

    -- Where did finalization land? countdown (auto-advanced) or round_complete
    -- (zero-active halt).
    select current_phase into v_new_phase
    from party_sessions
    where id = p_party_session_id;

    return public._rpc_success(jsonb_build_object(
      'transitioned', true,
      'new_phase',    v_new_phase
    ));
  end if;
end;
$$;

comment on function public.advance_phase_if_due(uuid) is
  'Timer-authority RPC: advances countdown→shot_window, or shot_window→finalize→'
  'countdown(N+1)/halt. See docs/specs/rpc-contracts.md §8 and decisions.md D014.';
