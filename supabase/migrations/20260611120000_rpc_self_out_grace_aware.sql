-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 9 — D034: "I'm Out" is a grace-aware skip, not always a permanent out
-- ─────────────────────────────────────────────────────────────────────────────
-- decisions.md D034 (auto-return = yes, confirmed 2026-06-11). Tapping I'm Out
-- (mark_self_out) means "I'm sitting out THIS round." Until now,
-- finalize_round_outcomes turned ANY self_out into player status = 'out'
-- unconditionally — so a player who still held grace, or a no-elimination party
-- where misses carry no consequence, wrongly eliminated a voluntary skipper. It
-- also meant an all-skip round dropped the active count to zero and the game
-- halted in the zero-active round_complete state (mvp-state-machine §8.1) when it
-- should have rolled on.
--
-- This migration re-points the self_out branch of the per-player finalization
-- loop through the SAME elimination/grace ladder a miss runs, with one product
-- rule (D034): an ABSORBED skip returns the player to active next round.
--   1. elimination off            → skip, stays active (no consequence)
--   2. grace unlimited            → skip, stays active
--   3. grace enabled, !used_grace → skip, CONSUMES the one grace, stays active
--   4. grace disabled             → out (self_opted_out)
--   5. grace enabled,  used_grace → out (self_opted_out — grace exhausted)
--
-- final_outcome stays 'self_out' in every case (it names what the player did);
-- the CONSEQUENCE is carried by status_after_round / eliminated_this_round, and
-- grace_applied = true marks a grace-consuming skip. A skip is neither a
-- completed shot nor a missed round, so neither counter increments (unchanged).
--
-- The all-skip/no-elim halt is fixed implicitly: absorbed skips stay 'active', so
-- the post-loop advance_to_next_round() sees ≥1 active and creates round N+1
-- instead of resting in the halt. No change to advance_to_next_round is needed.
--
-- Additive migration (CLAUDE.md §10): does not edit prior migration files; it
-- create-or-replaces finalize_round_outcomes from its current (Batch E0,
-- 20260604120000) definition, changing ONLY the self_out branch. Every other
-- statement — the missed grace ladder, the upsert, the player-row update, the
-- round-completed update + event, and the advance_to_next_round() delegation —
-- is byte-for-byte the prior behavior.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; internal helper → REVOKE EXECUTE re-asserted at the bottom.
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

  -- shot_window_seconds is read by advance_to_next_round (round N+1 creation),
  -- not here; finalize only needs the grace/elimination settings.
  select elimination_enabled, grace_mode
    into v_elimination, v_grace
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
      -- ─── Self-out: grace-aware SKIP (D034 / game-rules §3.2, §7) ─────────
      -- "I'm Out" = "I'm sitting out THIS round," not always a permanent out.
      -- Runs the SAME ladder as a miss, in the SAME elimination-first order and
      -- for the same reason (gating on elimination_enabled first means an
      -- elimination-off skip never consumes a player's one grace). The ONLY
      -- difference from the missed branch: an absorbed skip is not scored as a
      -- miss — final_outcome stays 'self_out', neither counter moves, and the
      -- player returns to active next round (D034 auto-return = yes). Rungs:
      --   1. elimination off            → skip, stays active
      --   2. grace disabled             → out (self_opted_out)
      --   3. grace enabled, !used_grace → skip, consume the one grace
      --   4. grace enabled,  used_grace → out (self_opted_out)
      --   5. unlimited                  → skip, stays active
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

  -- ─── Auto-advance (D014): delegated to the shared helper. Absorbed skips now
  -- stay 'active', so an all-skip round advances here instead of halting.
  perform public.advance_to_next_round(p_party_session_id);
end;
$$;

comment on function public.finalize_round_outcomes(uuid, triggered_by, uuid) is
  'Internal helper: finalizes a shot window per game-rules.md §7 (self_out is a '
  'grace-aware skip per D034), then delegates to advance_to_next_round for the '
  'D014 auto-advance (rpc-contracts.md §8.8). EXECUTE revoked from '
  'anon/authenticated; only advance_phase_if_due and host_end_shot_window call it.';

-- Re-assert the lockdown after create-or-replace (defensive; the revokes from
-- the prior migration persist across replace, but stating them keeps this
-- migration self-contained and idempotent).
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;
