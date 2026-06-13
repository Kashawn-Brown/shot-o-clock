-- supabase/migrations/20260612140000_late_joiner_participates.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 10B — simplify the late-joiner model: a late joiner is FULLY IN the
-- round they join. No special-casing in finalization — they participate (tap
-- Done / I'm Out) or they miss, exactly like any other active player. If they
-- joined with no time left and missed, the host can reinstate them
-- (host_mark_player_active), the same recovery path as any other player.
--
-- This supersedes the "active next round" exclusion added in 20260612130000:
--   - finalize_round_outcomes: the per-player loop is back to `status = 'active'`
--     only (the joined_round_number exclusion is removed).
--   - party_players.joined_round_number STAYS as a recorded data point (when a
--     player joined a running party; NULL = joined pre-game) but no longer
--     affects any finalization logic.
--   - join_party is unchanged in behavior (still stamps joined_round_number and
--     returns is_late_join); only its now-stale inline/COMMENT text is corrected.
--
-- Additive, idempotent. Locked conventions (#D010): SECURITY DEFINER, SET
-- search_path = public, pg_temp; finalize's REVOKE EXECUTE re-asserted below.
-- References: docs/specs/game-rules.md §7, decisions.md D021/D041/D034.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── finalize_round_outcomes — late joiners participate like everyone else ────
-- Rebuilt from 20260612130000. The ONLY change: the per-player loop's WHERE
-- drops the `coalesce(joined_round_number, 0) < v_round_number` exclusion, so a
-- mid-round joiner is finalized this round like any other active player. Every
-- other statement (the grace/skip ladders, the upsert, the player-row update,
-- the round-completed update + event, the advance_to_next_round delegation) is
-- byte-for-byte the D034 behavior.
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
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

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

  perform public.advance_to_next_round(p_party_session_id);
end;
$$;

comment on function public.finalize_round_outcomes(uuid, triggered_by, uuid) is
  'Internal helper: finalizes a shot window per game-rules.md §7 (self_out is a '
  'grace-aware skip per D034). Late joiners participate in the round they join '
  'like any other active player (joined_round_number is a data point only). '
  'Delegates to advance_to_next_round for the D014 auto-advance. EXECUTE revoked '
  'from anon/authenticated; only advance_phase_if_due and host_end_shot_window call it.';

revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from public;
revoke execute on function public.finalize_round_outcomes(uuid, triggered_by, uuid) from anon, authenticated;


-- ─── join_party — comment-only correction (behavior unchanged) ────────────────
-- Identical to 20260612130000 EXCEPT the new-join path's inline comment and the
-- COMMENT ON FUNCTION text, which no longer claim "active next round / excluded
-- from finalization" (that exclusion is gone). The joiner still lands as active,
-- still stamps joined_round_number (now a data point only), still returns
-- is_late_join. No statement changes.
create or replace function public.join_party(
  p_join_code    text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id                 uuid := auth.uid();
  v_session_id              uuid;
  v_session_status          party_status;
  v_session_phase           party_phase;
  v_session_locked          boolean;
  v_round_number            int;
  v_allow_late_join         boolean;
  v_existing_id             uuid;
  v_existing_status         player_status;
  v_existing_removed_reason text;
  v_joined_round            int;
  v_new_player_id           uuid;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;

  -- Parameter validation (§3.3). The regex matches the schema-level CHECK on
  -- party_sessions.join_code, so we reject malformed codes before any DB read.
  if p_join_code is null or p_join_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return public._rpc_error('INVALID_PARAM',
      'p_join_code must be 6 uppercase alphanumeric chars (no 0/O/I/1).');
  end if;
  if p_display_name is null
     or length(p_display_name) < 1 or length(p_display_name) > 40 then
    return public._rpc_error('INVALID_PARAM',
      'p_display_name must be 1-40 characters.');
  end if;

  -- Look up session and lock the row. Both reconnect and new-join paths take
  -- this lock; the cost is negligible and it simplifies the control flow.
  select id, status, current_phase, is_locked, current_round_number
    into v_session_id, v_session_status, v_session_phase, v_session_locked, v_round_number
  from party_sessions
  where join_code = p_join_code
  for update;

  if not found then
    return public._rpc_error('JOIN_CODE_NOT_FOUND',
      'No party found with that join code.');
  end if;

  -- Phase 10B: whether this party accepts mid-game joiners.
  select allow_late_join into v_allow_late_join
  from party_settings
  where party_session_id = v_session_id;

  -- Check for existing party_players row for this caller in this session.
  -- Drives the reconnect / rejoin / new-join branch per §3.6 / §3.4 (#D011 (5)).
  select id, status, removed_reason
    into v_existing_id, v_existing_status, v_existing_removed_reason
  from party_players
  where party_session_id = v_session_id
    and user_id = v_user_id;

  if v_existing_id is not null then
    -- ─── Removed row: rejoin (self-left) vs blocked (host-kicked) ──────────
    -- See rpc-contracts.md §3.6 and decisions.md D024. host_remove_player sets
    -- removed_reason to a free-text value or null, so only an exact
    -- 'self_left_lobby' (set by leave_party) is allowed to rejoin.
    if v_existing_status = 'removed' then
      if v_existing_removed_reason is distinct from 'self_left_lobby' then
        return public._rpc_error('PLAYER_REMOVED',
          'You were removed from this party.');
      end if;

      -- A self-left rejoin is a fresh join, not a live reconnect. Self-left only
      -- ever happens in lobby (leave_party is lobby-only), so the §3.4 lobby
      -- precondition still applies here — a self-left player rejoining a RUNNING
      -- party via late join is a separate Phase 10B follow-up, not this chunk.
      if v_session_status != 'lobby' then
        return public._rpc_error('PARTY_NOT_JOINABLE',
          'That party has already started and is not joinable.');
      end if;
      if v_session_locked then
        return public._rpc_error('PARTY_LOCKED',
          'That party is locked and not accepting new players.');
      end if;

      update party_players
      set status         = 'active',
          display_name   = p_display_name,
          removed_at     = null,
          left_at        = null,
          removed_reason = null,
          joined_at      = now(),
          rejoined_at    = now(),
          last_seen_at   = now()
      where id = v_existing_id;

      return public._rpc_success(jsonb_build_object(
        'party_session_id', v_session_id,
        'party_player_id',  v_existing_id,
        'is_reconnect',     false,
        'is_late_join',     false
      ));
    end if;

    -- ─── Reconnect path (§3.6) ────────────────────────────────────────────
    -- status in ('active', 'out'): bypasses §3.4 status/lock checks per the
    -- §3.4 amendment. Refresh timestamps; display_name is preserved (§3.6).
    update party_players
    set last_seen_at = now(),
        rejoined_at  = now()
    where id = v_existing_id;

    return public._rpc_success(jsonb_build_object(
      'party_session_id', v_session_id,
      'party_player_id',  v_existing_id,
      'is_reconnect',     true,
      'is_late_join',     false
    ));
  end if;

  -- ─── New-join path (§3.4 + Phase 10B late join, D021/D041) ──────────────
  -- Lobby: ordinary pre-game join (joined_round_number stays NULL).
  -- A running party during a LIVE round (countdown/shot_window) with late join
  --   on: the joiner lands as a normal active player and is FULLY IN the current
  --   round — they participate (Done / I'm Out) or miss like anyone else. We
  --   stamp joined_round_number purely as a data point (when they joined); it has
  --   no effect on finalization. Host reinstates if they joined too late to act.
  -- Blocked: ended/expired/cancelled, late join disabled, and the zero-active
  --   round_complete HALT (a dead game with no live round to roll forward from —
  --   host reinstates or ends). Resume-on-join is a logged Phase 10B follow-up.
  if v_session_status = 'lobby' then
    v_joined_round := null;
  elsif v_session_status in ('active', 'paused')
        and v_session_phase in ('countdown', 'shot_window')
        and coalesce(v_allow_late_join, false) then
    v_joined_round := v_round_number;
  else
    return public._rpc_error('PARTY_NOT_JOINABLE',
      'That party is not accepting new players right now.');
  end if;

  if v_session_locked then
    return public._rpc_error('PARTY_LOCKED',
      'That party is locked and not accepting new players.');
  end if;

  -- Insert new player row. The (party_session_id, user_id) unique constraint on
  -- party_players is the safety net; the FOR UPDATE on party_sessions plus the
  -- explicit existence check above make a same-caller race impossible.
  insert into party_players (
    party_session_id,
    user_id,
    display_name,
    permission_role,
    status,
    duty,
    joined_round_number
  )
  values (
    v_session_id,
    v_user_id,
    p_display_name,
    'player',
    'active',
    'normal_player',
    v_joined_round
  )
  returning id into v_new_player_id;

  return public._rpc_success(jsonb_build_object(
    'party_session_id', v_session_id,
    'party_player_id',  v_new_player_id,
    'is_reconnect',     false,
    'is_late_join',     (v_joined_round is not null)
  ));
end;
$$;

comment on function public.join_party(text, text) is
  'Guest joins a party in lobby, reconnects if already an active/out member '
  '(§3.6), rejoins if they self-left the lobby (D024), or joins a live running '
  'party mid-game (Phase 10B late join — joiner is fully in the round they join; '
  'joined_round_number recorded as a data point only, D021/D041). Host-kicked '
  'callers get PLAYER_REMOVED. See docs/specs/rpc-contracts.md §3.';
