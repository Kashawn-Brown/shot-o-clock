-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch E3: host player-override RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The three host status overrides from docs/specs/rpc-contracts.md §11 and
-- game-rules.md §6:
--   - host_mark_player_out(party_player_id)            — active → out (§11.2/§6.2)
--   - host_mark_player_active(party_player_id)         — out → active (§11.1/§6.1)
--   - host_remove_player(party_player_id, reason)      — → removed (§11.3/§6.3)
--
-- These differ from every prior RPC in their SIGNATURE: the parameter is the
-- TARGET player's id, not a session id. The session is resolved FROM the target,
-- then the session row is locked and the CALLER's host membership is checked in
-- that session. Per the fork resolved this session, the error order is
-- PLAYER_NOT_FOUND (target resolution) THEN NOT_HOST (caller check) — §11 lists
-- both codes distinctly; player ids are random UUIDs, so the existence
-- distinction is not probeable.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public,
-- pg_temp; in-function auth.uid() check; standard {ok,...} envelope.
--
-- Batch E3 conventions (approved this session):
--   (A) Target re-read happens AFTER the session FOR UPDATE lock, so the status
--       branch operates on a serialized view (a concurrent finalize can't flip
--       the target's status mid-decision).
--   (B) Lobby guard (fork resolved this session): host_mark_player_out and
--       host_mark_player_active require current_round_number ≥ 1, else
--       ILLEGAL_TRANSITION. Marking out at round 0 would set out_round_number = 0
--       and trip the out_round_number ≥ 1 CHECK; both overlays are "mid-game"
--       actions (game-rules §6). Effective addition to §11.1/§11.2.
--   (C) No-change calls are logged (game-rules §8): mark_out on an already-out
--       player and mark_active on an already-active player are no-ops that still
--       write an admin_action_logs row with reason 'no-change: already <state>'.
--   (D) Reinstatement re-triggers the auto-advance (§11.1) ONLY from the
--       zero-active round_complete halt (status = active AND phase =
--       round_complete) via advance_to_next_round (Batch E0). A paused halt is
--       left for the host to resume first (documented limitation).
--   (E) Return payloads (spec §11 defines none): {party_player_id, status} for
--       all three; mark_active additionally returns {new_phase} so the client
--       can see the loop resume (countdown) out of the halt.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── host_mark_player_out ─────────────────────────────────────────────────────
-- See rpc-contracts.md §11.2 and game-rules.md §6.2.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. target lookup → PLAYER_NOT_FOUND
--   4. session lock + caller host check → NOT_HOST
--   5. lobby guard: current_round_number ≥ 1 → else ILLEGAL_TRANSITION (conv B)
--   6. target status branch: active → out; out → no-op + log; removed →
--      PLAYER_NOT_ACTIVE

create or replace function public.host_mark_player_out(p_party_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_session_id    uuid;
  v_session       party_sessions%rowtype;
  v_host_id       uuid;
  v_host_role     player_permission_role;
  v_target_status player_status;
  v_round_id      uuid;
  v_now           timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_player_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_player_id is required.');
  end if;

  -- §11 — resolve the session FROM the target. Missing target → PLAYER_NOT_FOUND.
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

  -- Caller must be the host of the target's session.
  select id, permission_role
    into v_host_id, v_host_role
  from party_players
  where party_session_id = v_session_id
    and user_id = v_user_id;

  if v_host_id is null or v_host_role != 'host' then
    return public._rpc_error('NOT_HOST', 'Only the party host can do that.');
  end if;

  -- Convention B — overrides are mid-game only.
  if v_session.current_round_number < 1 then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Players can only be marked out after the game has started.');
  end if;

  -- Target status, re-read under the lock (convention A).
  select status into v_target_status
  from party_players
  where id = p_party_player_id;

  select id into v_round_id
  from rounds
  where party_session_id = v_session_id
    and round_number = v_session.current_round_number;

  -- A removed player can't be marked out.
  if v_target_status = 'removed' then
    return public._rpc_error('PLAYER_NOT_ACTIVE',
      'That player has been removed from the party.');
  end if;

  -- §8 game-rules — already out: no-op, but logged for audit clarity.
  if v_target_status = 'out' then
    insert into admin_action_logs (
      party_session_id, actor_player_id, actor_permission_role,
      affected_player_id, round_id, round_number, action_type, reason
    )
    values (
      v_session_id, v_host_id, 'host',
      p_party_player_id, v_round_id, v_session.current_round_number,
      'mark_player_out', 'no-change: already out'
    );

    return public._rpc_success(jsonb_build_object(
      'party_player_id', p_party_player_id,
      'status',          'out'
    ));
  end if;

  -- §6.2 effect — active → out (host_marked_out at the current round).
  update party_players
  set status           = 'out',
      out_reason       = 'host_marked_out',
      out_round_number = v_session.current_round_number,
      out_at           = v_now
  where id = p_party_player_id;

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    affected_player_id, round_id, round_number, action_type
  )
  values (
    v_session_id, v_host_id, 'host',
    p_party_player_id, v_round_id, v_session.current_round_number, 'mark_player_out'
  );

  return public._rpc_success(jsonb_build_object(
    'party_player_id', p_party_player_id,
    'status',          'out'
  ));
end;
$$;

comment on function public.host_mark_player_out(uuid) is
  'Host marks an active player out (host_marked_out). Already-out is a logged '
  'no-op. See rpc-contracts.md §11.2 and game-rules.md §6.2.';


-- ─── host_mark_player_active ──────────────────────────────────────────────────
-- See rpc-contracts.md §11.1 and game-rules.md §6.1 / §9.5 / §9.6.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. target lookup → PLAYER_NOT_FOUND
--   4. session lock + caller host check → NOT_HOST
--   5. lobby guard: current_round_number ≥ 1 → else ILLEGAL_TRANSITION (conv B)
--   6. target status branch: active → no-op + log; removed → PLAYER_NOT_OUT;
--      out → REINSTATE_TOO_OLD gate, then reinstate (+ grace re-grant), then
--      re-trigger the auto-advance if resting in the zero-active halt

create or replace function public.host_mark_player_active(p_party_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id           uuid := auth.uid();
  v_session_id        uuid;
  v_session           party_sessions%rowtype;
  v_host_id           uuid;
  v_host_role         player_permission_role;
  v_target_status     player_status;
  v_target_out_round  int;
  v_target_out_reason out_reason;
  v_round_id          uuid;
  v_new_phase         party_phase;
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

  -- Convention B — overrides are mid-game only.
  if v_session.current_round_number < 1 then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Players can only be reinstated after the game has started.');
  end if;

  select status, out_round_number, out_reason
    into v_target_status, v_target_out_round, v_target_out_reason
  from party_players
  where id = p_party_player_id;

  select id into v_round_id
  from rounds
  where party_session_id = v_session_id
    and round_number = v_session.current_round_number;

  -- A removed player is gone for the session — cannot reinstate (§6.1).
  if v_target_status = 'removed' then
    return public._rpc_error('PLAYER_NOT_OUT',
      'That player has been removed and cannot be reinstated.');
  end if;

  -- §8 game-rules — already active: no-op, but logged.
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

  -- §6.1 — reinstatement is limited to the most recent round.
  if v_target_out_round < v_session.current_round_number - 1 then
    return public._rpc_error('REINSTATE_TOO_OLD',
      'That player went out too long ago to be reinstated.');
  end if;

  -- §6.1 effect — out → active; clear the out_* fields. If they were eliminated
  -- by missed_after_grace, re-grant their grace (§6.1 / §9.6). The
  -- out_fields_consistent CHECK permits null out_* once status != 'out'.
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

  -- §11.1 / §9.5 — if the session was resting in the zero-active round_complete
  -- halt, this reinstatement gives it an active player again: re-trigger the
  -- D014 auto-advance into round N+1 (convention D — active halt only; a paused
  -- halt waits for the host to resume).
  v_new_phase := v_session.current_phase;
  if v_session.status = 'active' and v_session.current_phase = 'round_complete' then
    perform public.advance_to_next_round(v_session_id);

    select current_phase into v_new_phase
    from party_sessions
    where id = v_session_id;
  end if;

  return public._rpc_success(jsonb_build_object(
    'party_player_id', p_party_player_id,
    'status',          'active',
    'new_phase',       v_new_phase
  ));
end;
$$;

comment on function public.host_mark_player_active(uuid) is
  'Host reinstates an out player (most-recent-round only); re-grants grace if '
  'they were out by missed_after_grace, and re-triggers the auto-advance out of '
  'the zero-active halt. See rpc-contracts.md §11.1 and game-rules.md §6.1.';


-- ─── host_remove_player ───────────────────────────────────────────────────────
-- See rpc-contracts.md §11.3 and game-rules.md §6.3.
--
-- Legal in lobby AND mid-game (no round guard). NOT idempotent — re-removing an
-- already-removed player returns ALREADY_REMOVED (game-rules §8).
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. target lookup → PLAYER_NOT_FOUND
--   4. session lock + caller host check → NOT_HOST
--   5. target is host → CANNOT_REMOVE_HOST
--   6. target already removed → ALREADY_REMOVED
--   7. effect: → removed; log remove_player (reason = p_reason)

create or replace function public.host_remove_player(
  p_party_player_id uuid,
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_session_id    uuid;
  v_session       party_sessions%rowtype;
  v_host_id       uuid;
  v_host_role     player_permission_role;
  v_target_status player_status;
  v_target_role   player_permission_role;
  v_round_id      uuid;
  v_round_number  int;
  v_now           timestamptz := now();
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

  select status, permission_role
    into v_target_status, v_target_role
  from party_players
  where id = p_party_player_id;

  -- §6.3 — the host cannot remove themselves (or any host) via this RPC; they
  -- end the party instead.
  if v_target_role = 'host' then
    return public._rpc_error('CANNOT_REMOVE_HOST',
      'The host cannot be removed — end the party instead.');
  end if;

  -- §8 game-rules — re-removing is flagged, not silently absorbed.
  if v_target_status = 'removed' then
    return public._rpc_error('ALREADY_REMOVED', 'That player is already removed.');
  end if;

  -- Round context for the log: the current round if the game is underway, else
  -- null (a lobby removal has no round).
  if v_session.current_round_number >= 1 then
    select id into v_round_id
    from rounds
    where party_session_id = v_session_id
      and round_number = v_session.current_round_number;
    v_round_number := v_session.current_round_number;
  end if;

  -- §6.3 effect — active/out → removed. removed_reason holds the free-text
  -- p_reason (null is fine; it still reads as "kicked" vs leave_party's
  -- 'self_left_lobby' marker, #D013). removed_at satisfies
  -- removed_fields_consistent.
  update party_players
  set status               = 'removed',
      removed_at           = v_now,
      removed_by_player_id  = v_host_id,
      removed_reason       = p_reason
  where id = p_party_player_id;

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    affected_player_id, round_id, round_number, action_type, reason
  )
  values (
    v_session_id, v_host_id, 'host',
    p_party_player_id, v_round_id, v_round_number, 'remove_player', p_reason
  );

  return public._rpc_success(jsonb_build_object(
    'party_player_id', p_party_player_id,
    'status',          'removed'
  ));
end;
$$;

comment on function public.host_remove_player(uuid, text) is
  'Host removes a non-host player (active/out → removed). Not idempotent: '
  'ALREADY_REMOVED on re-remove. See rpc-contracts.md §11.3 and game-rules.md §6.3.';
