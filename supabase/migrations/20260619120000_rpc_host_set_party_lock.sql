-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 15 — Party lock: host toggle RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- host_set_party_lock(session, locked) — host locks/unlocks the party (lobby or
-- mid-game) so no new players can join even with the code. Server enforcement
-- already exists: join_party returns PARTY_LOCKED when party_sessions.is_locked is
-- true and FOR UPDATE-locks the session row during a join. This is the paired host
-- control that flips that flag.
--
-- Single parameterized toggle (not separate fns): the two directions are symmetric —
-- set the flag, log lock_party or unlock_party (both admin_action_type values were
-- reserved in the initial schema).
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public, pg_temp;
-- in-function auth.uid() check; standard {ok,...} envelope. NOT_HOST collapse
-- (convention A): a missing/foreign session, a non-member, and a non-host all return
-- NOT_HOST. FOR UPDATE serializes against join_party (which also locks the row), so a
-- toggle can't race a join.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.host_set_party_lock(
  p_party_session_id uuid,
  p_locked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_session      party_sessions%rowtype;
  v_player_id    uuid;
  v_role         player_permission_role;
  v_round_id     uuid;
  v_round_number int;
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null or p_locked is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id and p_locked are required.');
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

  -- Lock/unlock only makes sense for a live party (lobby or in-game). Any terminal
  -- status (today only 'ended'; 'expired'/'cancelled' exist in the enum but are never
  -- set on a session) rejects joins regardless, so locking is meaningless. Allow-list
  -- the live states so a future terminal status is blocked by default, not silently
  -- let through.
  if v_session.status not in ('lobby', 'active', 'paused') then
    return public._rpc_error('ILLEGAL_TRANSITION', 'The party is no longer active.');
  end if;

  -- §6 idempotency — already in the requested state: no-op, no duplicate log.
  if v_session.is_locked = p_locked then
    return public._rpc_success(jsonb_build_object('is_locked', v_session.is_locked));
  end if;

  update party_sessions
  set is_locked = p_locked
  where id = p_party_session_id;

  -- Log context: the live round mid-game, else null (lobby has no round; the
  -- admin_action_logs CHECK requires round_number null or >= 1, never 0).
  if v_session.current_round_number >= 1 then
    v_round_number := v_session.current_round_number;
    select id into v_round_id
    from rounds
    where party_session_id = p_party_session_id
      and round_number = v_session.current_round_number;
  end if;

  insert into admin_action_logs (
    party_session_id, actor_player_id, actor_permission_role,
    round_id, round_number, action_type
  )
  values (
    p_party_session_id, v_player_id, 'host',
    v_round_id, v_round_number,
    case when p_locked then 'lock_party' else 'unlock_party' end::admin_action_type
  );

  return public._rpc_success(jsonb_build_object('is_locked', p_locked));
end;
$$;

comment on function public.host_set_party_lock(uuid, boolean) is
  'Host locks/unlocks the party so new players cannot join (join_party returns '
  'PARTY_LOCKED while locked). Logs lock_party/unlock_party. Phase 15.';
