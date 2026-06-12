-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 10 — reinstate a rejoined Out player regardless of round age
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: a player who left mid-game (out in round N) and later rejoined as Out
-- couldn't be reinstated — host_mark_player_active's REINSTATE_TOO_OLD limit
-- (§6.1: out_round_number must be the current or previous round) blocked them,
-- because their out is from whenever they left, while they rejoin rounds later. A
-- host-marked-out player is reinstated promptly, so they never hit it.
--
-- Fix: a player who rejoined AFTER going out (rejoined_at > out_at) is physically
-- present again, so the host can bring them back regardless of which round they
-- originally went out — the most-recent-round limit only applies to players who
-- have NOT returned. Everything else in the function is byte-for-byte the prior
-- (Batch E3, 20260604150000) behavior; this changes ONLY the REINSTATE_TOO_OLD
-- guard. Additive migration (CLAUDE.md §10): create-or-replace, no edit of the
-- prior file.

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

  -- Convention B — overrides are mid-game only.
  if v_session.current_round_number < 1 then
    return public._rpc_error('ILLEGAL_TRANSITION',
      'Players can only be reinstated after the game has started.');
  end if;

  select status, out_round_number, out_reason, out_at, rejoined_at
    into v_target_status, v_target_out_round, v_target_out_reason, v_target_out_at, v_target_rejoined_at
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

  -- §6.1 — reinstatement is limited to the most recent round, EXCEPT for a player
  -- who rejoined after going out: they left and came back, so they're present
  -- again and the host can reinstate them whatever round they originally went out.
  if (v_target_rejoined_at is null or v_target_out_at is null or v_target_rejoined_at <= v_target_out_at)
     and v_target_out_round < v_session.current_round_number - 1 then
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
  'Host reinstates an out player. Most-recent-round only, EXCEPT a player who '
  'rejoined after going out (left and came back) can be reinstated from any round. '
  'Re-grants grace if out by missed_after_grace; re-triggers the auto-advance out '
  'of the zero-active halt. See rpc-contracts.md §11.1 and game-rules.md §6.1.';
