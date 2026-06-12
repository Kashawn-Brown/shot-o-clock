-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 10 — mark_self_left: a player leaves the game (label, not removal)
-- ─────────────────────────────────────────────────────────────────────────────
-- Companion to the client's mid-game Leave Party flow. mark_self_out records the
-- round skip but sets no distinguishing field, so a voluntary leaver is identical
-- to an "I'm Out" on every other device. This stamps left_at on the caller's row
-- so the roster can show them as "Left" rather than "Out".
--
-- It does NOT remove the player (they stay a visible member — Option 2, no
-- removal) and does NOT change status; finalization still runs their self_out
-- through the grace ladder (D034). The client calls it alongside mark_self_out on
-- Leave Party.
--
-- Un-marking on return is automatic and needs no change to join_party: the roster
-- treats a player as "Left" only while left_at > last_seen_at, and join_party's
-- reconnect path already bumps last_seen_at = now(), so a rejoin clears the label.
--
-- Locked conventions (#D010): SECURITY DEFINER, SET search_path = public, pg_temp;
-- in-function auth.uid() check; standard {ok,...} envelope. NOT_IN_PARTY collapse
-- mirrors mark_self_out (Batch D convention 1): a foreign/nonexistent session and
-- a removed caller both read as "not a member". left_at participates in no CHECK
-- constraint (schema §4), so it can be set while status is active or out.
--
-- Precondition order:
--   1. auth.uid() gate
--   2. param validation
--   3. session lookup + lock → NOT_IN_PARTY if not found
--   4. caller's row → NOT_IN_PARTY (missing / removed)
--   5. host guard → HOST_CANNOT_LEAVE (a host ends the party instead)
--   6. effect: stamp left_at (idempotent via coalesce)

create or replace function public.mark_self_left(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid := auth.uid();
  v_player_id     uuid;
  v_player_status player_status;
  v_player_role   player_permission_role;
  v_left_at       timestamptz;
  v_now           timestamptz := now();
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;
  if p_party_session_id is null then
    return public._rpc_error('INVALID_PARAM', 'p_party_session_id is required.');
  end if;

  -- Lock the session to serialize against finalize / end_party (convention 1:
  -- a foreign / nonexistent session collapses into NOT_IN_PARTY).
  perform 1 from party_sessions where id = p_party_session_id for update;
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

  -- A host leaves by ending the party, not via this action.
  if v_player_role = 'host' then
    return public._rpc_error('HOST_CANNOT_LEAVE',
      'The host cannot leave the party — end it instead.');
  end if;

  -- Stamp the leave marker; coalesce keeps the first leave time on repeat calls.
  update party_players
  set left_at = coalesce(left_at, v_now)
  where id = v_player_id
  returning left_at into v_left_at;

  return public._rpc_success(jsonb_build_object(
    'party_player_id', v_player_id,
    'left_at',         v_left_at
  ));
end;
$$;

comment on function public.mark_self_left(uuid) is
  'Player marks themselves as having left the game (stamps left_at; no removal, no '
  'status change). Companion to mark_self_out for the Leave Party flow. Phase 10.';
