-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 12 — Auto-advance the shot window when every active player has answered
-- ─────────────────────────────────────────────────────────────────────────────
-- End the shot window early instead of waiting out the full timer once every
-- active player has submitted (Done or I'm Out). This is the rpc-contracts.md
-- §8.7(3) "inline before a phase-sensitive RPC" trigger, deferred until now
-- (Batch D convention 2 skipped it because timer expiry + client polling already
-- covered the common case). The finalize path is unchanged — the same
-- finalize_round_outcomes + D014 auto-advance the timer expiry and
-- host_end_shot_window already run, with triggered_by = 'system'.
--
-- Two trigger points:
--   (a) a Done / I'm Out tap during the window makes the active roster fully
--       answered  → mark_done / mark_self_out call the helper after their upsert;
--   (b) the window OPENS already fully answered (every active player opted out
--       during the countdown) → advance_phase_if_due (countdown→shot_window) and
--       host_skip_to_shot_window call the helper right after opening it.
--
-- Additive (CLAUDE.md §10): a new internal helper + create-or-replace of the
-- four functions to call it. No old migration is edited; this applies cleanly
-- after them on a fresh DB. No enum / schema / client changes.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; internal helper → REVOKE EXECUTE (only the SECURITY DEFINER RPCs,
-- which run as owner, invoke it, holding the FOR UPDATE lock it assumes).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── finalize_if_all_submitted (internal helper — not a client RPC) ───────────
-- Preconditions the CALLER must have established:
--   (1) holds the FOR UPDATE lock on the party_sessions row;
--   (2) has just upserted/opened the relevant state for the current round.
-- Effect: if the session is in an active (unpaused) shot window and every active
-- player has a 'done'/'self_out' outcome for the current round, run the shared
-- finalize + D014 auto-advance (triggered_by = 'system') and return true;
-- otherwise no-op and return false. Self-guards on phase, so callers that are
-- also legal outside a shot window (mark_self_out in countdown) can call it
-- unconditionally.

create or replace function public.finalize_if_all_submitted(p_party_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session       party_sessions%rowtype;
  v_round_id      uuid;
  v_active_count  int;
  v_submitted_cnt int;
begin
  -- Caller holds the FOR UPDATE lock on this row; a plain re-select is fine.
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

  -- Only an unpaused shot window can auto-close. Paused (the host owns the
  -- freeze), countdown (no window to end), or any other phase: never.
  if v_session.status != 'active' or v_session.current_phase != 'shot_window' then
    return false;
  end if;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  select count(*) into v_active_count
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  -- Vacuous-zero guard: never auto-finalize a window with no active players
  -- (e.g. the host marked the last active player out mid-window). The window
  -- only opened with >=1 active; let the timer / host settle this case.
  if v_active_count < 1 then
    return false;
  end if;

  -- Active players who have already answered this round. A 'none'/'missed' row,
  -- or no row at all, is NOT a submission.
  select count(*) into v_submitted_cnt
  from party_players pp
  join round_player_outcomes rpo
    on rpo.party_player_id = pp.id
   and rpo.round_id = v_round_id
  where pp.party_session_id = p_party_session_id
    and pp.status = 'active'
    and rpo.player_action in ('done', 'self_out');

  if v_submitted_cnt < v_active_count then
    return false;
  end if;

  -- Everyone active has answered — end the window now. Same finalize + D014
  -- auto-advance the timer expiry runs; triggered_by = 'system' (an automatic
  -- game rule, not a host control, and the triggered_by enum has no 'player').
  -- finalize_round_outcomes' own completed_at gate is the idempotency backstop.
  perform public.finalize_round_outcomes(p_party_session_id, 'system'::triggered_by, null);
  return true;
end;
$$;

comment on function public.finalize_if_all_submitted(uuid) is
  'Internal helper: ends the shot window early when every active player has a '
  'done/self_out outcome for the current round (rpc-contracts.md §8.7(3)). '
  'EXECUTE revoked; only the player-action / phase RPCs call it under their lock.';

-- Lock down execution (same pattern as the other internal helpers, #D010):
-- never a client RPC. Owner-role callers (the SECURITY DEFINER RPCs) unaffected.
revoke execute on function public.finalize_if_all_submitted(uuid) from public;
revoke execute on function public.finalize_if_all_submitted(uuid) from anon, authenticated;


-- ─── mark_done (re-pointed to call the helper) ────────────────────────────────
-- Identical to 20260603140000_rpc_player_actions.sql EXCEPT for the single
-- finalize_if_all_submitted call added after the outcome upsert. Every other
-- statement is byte-for-byte the prior behavior.

create or replace function public.mark_done(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_session        party_sessions%rowtype;
  v_player_id      uuid;
  v_player_status  player_status;
  v_round_id       uuid;
  v_existing_action player_action;
  v_outcome_id     uuid;
  v_tapped_at      timestamptz;
  v_now            timestamptz := now();
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

  -- Convention 1: a foreign / nonexistent session collapses into NOT_IN_PARTY.
  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, status
    into v_player_id, v_player_status
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  -- Missing row or a removed caller → NOT_IN_PARTY (convention 1). An out caller
  -- is a member but cannot tap Done → PLAYER_NOT_ACTIVE (§6.2, game-rules §2.2).
  if v_player_id is null or v_player_status = 'removed' then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;
  if v_player_status != 'active' then
    return public._rpc_error('PLAYER_NOT_ACTIVE', 'Only active players can tap Done.');
  end if;

  -- §6.3 — Done is only legal in an unpaused shot window.
  if v_session.status != 'active' or v_session.current_phase != 'shot_window' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Done can only be tapped during an open shot window.');
  end if;

  -- §6.3 — the window must still be open. Checked under the FOR UPDATE lock so a
  -- concurrent finalize cannot close it between this check and the write.
  if v_session.phase_ends_at is null or v_now >= v_session.phase_ends_at then
    return public._rpc_error('SHOT_WINDOW_CLOSED', 'The shot window has closed.');
  end if;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- §3.3 / §6.3 — self-out is sticky. This guard returns BEFORE the upsert; the
  -- write below is unreachable when an existing self_out is present.
  select player_action into v_existing_action
  from round_player_outcomes
  where round_id = v_round_id
    and party_player_id = v_player_id;

  if v_existing_action = 'self_out' then
    return public._rpc_error('SELF_OUT_IS_STICKY',
      'You already opted out this round; Done cannot override it.');
  end if;

  -- §6.4 effect — upsert the outcome. On a re-tap (existing row already 'done')
  -- coalesce preserves the original tap time, making repeat calls a true no-op on
  -- the timestamp (§6.6 / game-rules §3.1 "no-op, return existing row").
  insert into round_player_outcomes (
    round_id,
    party_session_id,
    party_player_id,
    round_number,
    player_action,
    player_tapped_done_at
  )
  values (
    v_round_id,
    p_party_session_id,
    v_player_id,
    v_session.current_round_number,
    'done',
    v_now
  )
  on conflict (round_id, party_player_id) do update set
    player_action         = 'done',
    player_tapped_done_at  = coalesce(round_player_outcomes.player_tapped_done_at, excluded.player_tapped_done_at)
  returning id, player_tapped_done_at into v_outcome_id, v_tapped_at;

  -- §8.7(3) inline trigger: if this Done was the last active player to answer,
  -- end the window now rather than waiting out the timer. We hold the FOR UPDATE
  -- lock the helper + finalize assume. The return payload below is unaffected —
  -- this player's outcome persists through finalize as done/completed.
  perform public.finalize_if_all_submitted(p_party_session_id);

  return public._rpc_success(jsonb_build_object(
    'outcome_id',    v_outcome_id,
    'player_action', 'done',
    'tapped_at',     v_tapped_at
  ));
end;
$$;

comment on function public.mark_done(uuid) is
  'Player marks themselves Done during the shot window. Idempotent; rejects a '
  'sticky self-out; ends the window early when it was the last active answer '
  '(rpc-contracts.md §6 / §8.7(3), game-rules.md §3.1).';


-- ─── mark_self_out (re-pointed to call the helper) ────────────────────────────
-- Identical to 20260603140000_rpc_player_actions.sql EXCEPT for the single
-- finalize_if_all_submitted call added after the outcome upsert / override log.
-- The helper self-guards on phase, so a self-out during the COUNTDOWN (also
-- legal, §7.3) calls it as a harmless no-op.

create or replace function public.mark_self_out(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id         uuid := auth.uid();
  v_session         party_sessions%rowtype;
  v_player_id       uuid;
  v_player_status   player_status;
  v_player_role     player_permission_role;
  v_round_id        uuid;
  v_existing_action player_action;
  v_outcome_id      uuid;
  v_now             timestamptz := now();
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

  -- Convention 1: a foreign / nonexistent session collapses into NOT_IN_PARTY.
  if not found then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;

  select id, status, permission_role
    into v_player_id, v_player_status, v_player_role
  from party_players
  where party_session_id = p_party_session_id
    and user_id = v_user_id;

  if v_player_id is null or v_player_status = 'removed' then
    return public._rpc_error('NOT_IN_PARTY', 'You are not a member of this party.');
  end if;
  if v_player_status != 'active' then
    return public._rpc_error('PLAYER_NOT_ACTIVE', 'Only active players can opt out.');
  end if;

  -- §7.3 — self-out is legal during countdown or shot_window, paused or not, so
  -- the gate is on phase only (session.status may be active or paused).
  if v_session.current_phase not in ('countdown', 'shot_window') then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'You can only opt out during a countdown or shot window.');
  end if;

  select id into v_round_id
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Read the prior action so we know whether this self-out overrides a Done.
  select player_action into v_existing_action
  from round_player_outcomes
  where round_id = v_round_id
    and party_player_id = v_player_id;

  -- §7.4 effect — upsert the outcome. self_out wins over a prior Done; the prior
  -- player_tapped_done_at is preserved as history, and player_marked_self_out_at
  -- is coalesce-preserved so repeat calls are a no-op on the timestamp (§7.6).
  insert into round_player_outcomes (
    round_id,
    party_session_id,
    party_player_id,
    round_number,
    player_action,
    player_marked_self_out_at
  )
  values (
    v_round_id,
    p_party_session_id,
    v_player_id,
    v_session.current_round_number,
    'self_out',
    v_now
  )
  on conflict (round_id, party_player_id) do update set
    player_action             = 'self_out',
    player_marked_self_out_at  = coalesce(round_player_outcomes.player_marked_self_out_at, excluded.player_marked_self_out_at)
  returning id into v_outcome_id;

  -- §7.4 step 2 / game-rules §3.2 — if this overrode a Done, log it for
  -- traceability. Only fires on the overriding call: a second self_out sees
  -- v_existing_action = 'self_out' and skips the log. Convention 3: null
  -- previous_value / new_value, meaning carried in reason.
  if v_existing_action = 'done' then
    insert into admin_action_logs (
      party_session_id,
      actor_player_id,
      actor_permission_role,
      affected_player_id,
      round_id,
      round_number,
      action_type,
      reason
    )
    values (
      p_party_session_id,
      v_player_id,
      v_player_role,
      v_player_id,
      v_round_id,
      v_session.current_round_number,
      'override_outcome',
      'player self-out overrode prior Done'
    );
  end if;

  -- §8.7(3) inline trigger: a self-out can also be the last active answer. The
  -- helper self-guards on phase, so this is a no-op for a countdown self-out;
  -- during a shot window it ends the window early when everyone has answered.
  perform public.finalize_if_all_submitted(p_party_session_id);

  return public._rpc_success(jsonb_build_object(
    'outcome_id', v_outcome_id
  ));
end;
$$;

comment on function public.mark_self_out(uuid) is
  'Player opts out of the current round (sticky until host reinstatement). '
  'self_out overrides a prior Done; ends the window early when it was the last '
  'active answer (rpc-contracts.md §7 / §8.7(3), game-rules.md §3.2).';


-- ─── advance_phase_if_due (re-pointed: window-open all-answered check) ─────────
-- Identical to 20260603130000_rpc_advance_phase.sql EXCEPT the countdown→
-- shot_window branch now calls finalize_if_all_submitted right after opening the
-- window, and returns the phase finalization actually landed in (still
-- 'shot_window' in the normal case). This closes the gap where every active
-- player opted out DURING the countdown, so the window would otherwise open
-- already fully answered and run its full length. The shot_window branch is
-- unchanged. Clients ignore new_phase and refetch on any ok result, so the
-- payload change is purely a more-honest value.

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

    -- Window-open all-answered check: if every active player already opted out
    -- during the countdown, end the window we just opened immediately rather
    -- than making them wait it out. No-op when anyone still hasn't answered.
    perform public.finalize_if_all_submitted(p_party_session_id);

    -- Re-read where we landed: still 'shot_window' (normal), or already
    -- 'countdown'(N+1) / 'round_complete' if the helper closed it on the spot.
    select current_phase into v_new_phase
    from party_sessions
    where id = p_party_session_id;

    return public._rpc_success(jsonb_build_object(
      'transitioned', true,
      'new_phase',    v_new_phase
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
  'countdown(N+1)/halt. The countdown branch also ends a window that opens already '
  'fully answered (§8.7(3)). See docs/specs/rpc-contracts.md §8 and decisions.md D014.';


-- ─── host_skip_to_shot_window (re-pointed: window-open all-answered check) ─────
-- Identical to 20260604140000_rpc_host_phase_controls.sql EXCEPT it calls
-- finalize_if_all_submitted right after opening the window (and logging the
-- skip), and returns the phase finalization actually landed in. Same window-open
-- gap closed as the timer path: a host who skips a countdown whose players have
-- all opted out gets the window closed on the spot.

create or replace function public.host_skip_to_shot_window(p_party_session_id uuid)
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
  v_shot_window   int;
  v_active_count  int;
  v_shot_ends_at  timestamptz;
  v_new_phase     party_phase;
  v_now           timestamptz := now();
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

  -- Idempotency — the shot window is already open (timer or a prior skip beat us
  -- to it). No-op ok. (A countdown for a *later* round is a genuine new skip, not
  -- idempotent, and falls through to the transition below.)
  if v_session.status = 'active' and v_session.current_phase = 'shot_window' then
    return public._rpc_success(jsonb_build_object('new_phase', 'shot_window'));
  end if;

  -- §10.5 + convention B — skip is only legal from an unpaused countdown.
  if v_session.status != 'active' or v_session.current_phase != 'countdown' then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'The countdown can only be skipped while it is running.');
  end if;

  -- §8.1 — cannot open a shot window with nobody active.
  select count(*) into v_active_count
  from party_players
  where party_session_id = p_party_session_id
    and status = 'active';

  if v_active_count = 0 then
    return public._rpc_error('NO_ACTIVE_PLAYERS',
      'No active players remain; the shot window cannot open.');
  end if;

  select id, shot_window_seconds
    into v_round_id, v_shot_window
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  v_shot_ends_at := v_now + make_interval(secs => v_shot_window);

  -- Same effect as the advance_phase_if_due countdown→shot_window branch.
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

  -- Convention C — shot_window_started, but triggered_by = host (not system).
  insert into timer_events (
    party_session_id, round_id, round_number, event_type,
    previous_phase, new_phase, new_ends_at, triggered_by, triggered_by_player_id
  )
  values (
    p_party_session_id, v_round_id, v_session.current_round_number, 'shot_window_started',
    'countdown', 'shot_window', v_shot_ends_at, 'host', v_player_id
  );

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_session.current_round_number, 'skip_to_shot_window'
  );

  -- Window-open all-answered check (same as the timer path): if the skipped
  -- countdown's players had all opted out, the window the host just opened
  -- closes immediately. No-op when anyone still hasn't answered.
  perform public.finalize_if_all_submitted(p_party_session_id);

  -- Re-read where we landed: 'shot_window' (normal), or already advanced if the
  -- helper closed it on the spot.
  select current_phase into v_new_phase
  from party_sessions
  where id = p_party_session_id;

  return public._rpc_success(jsonb_build_object('new_phase', v_new_phase));
end;
$$;

comment on function public.host_skip_to_shot_window(uuid) is
  'Host ends the countdown immediately, opening the shot window (same effect as '
  'the timer-expiry branch, triggered_by = host); ends it on the spot if every '
  'player already opted out (§8.7(3)). See rpc-contracts.md §10.5.';
