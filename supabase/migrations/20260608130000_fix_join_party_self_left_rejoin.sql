-- ============================================================================
-- Fix: join_party wrongly blocks a self-left player from rejoining.
--
-- Bug: the reconnect branch returned PLAYER_REMOVED for ANY existing row with
--   status = 'removed', without inspecting removed_reason. A player who left
--   the lobby voluntarily (leave_party sets removed_reason = 'self_left_lobby')
--   was therefore treated identically to a host-kicked player and could never
--   rejoin with the same code.
--
-- Fix: branch on removed_reason. Only a voluntary lobby leave may rejoin —
--   host_remove_player sets removed_reason to a free-text value OR null (it
--   "still reads as kicked"), so the test is a whitelist: anything that is NOT
--   exactly 'self_left_lobby' stays PLAYER_REMOVED. `is distinct from` handles
--   the null case. A self-left rejoin is a fresh join (not a live reconnect),
--   so it is subject to the §3.4 new-join preconditions (lobby + not locked)
--   and restores the existing row to an active lobby player.
--
-- create-or-replace only — no signature change, fully idempotent.
-- References: docs/specs/rpc-contracts.md §3.6, decisions.md D013 + D024.
-- ============================================================================

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
  v_session_locked          boolean;
  v_existing_id             uuid;
  v_existing_status         player_status;
  v_existing_removed_reason text;
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
  select id, status, is_locked
    into v_session_id, v_session_status, v_session_locked
  from party_sessions
  where join_code = p_join_code
  for update;

  if not found then
    return public._rpc_error('JOIN_CODE_NOT_FOUND',
      'No party found with that join code.');
  end if;

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

      -- A self-left rejoin is a fresh join, not a live reconnect, so the §3.4
      -- new-join preconditions apply (late join is off in MVP).
      if v_session_status != 'lobby' then
        return public._rpc_error('PARTY_NOT_JOINABLE',
          'That party has already started and is not joinable.');
      end if;
      if v_session_locked then
        return public._rpc_error('PARTY_LOCKED',
          'That party is locked and not accepting new players.');
      end if;

      -- Restore the existing row to an active lobby player. Self-left only ever
      -- happens in lobby, so there is no in-game data to resurrect. The row
      -- adopts this join's display_name (new-join semantics, unlike reconnect).
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
        'is_reconnect',     false
      ));
    end if;

    -- ─── Reconnect path (§3.6) ────────────────────────────────────────────
    -- status in ('active', 'out'): bypasses §3.4 status/lock checks per the
    -- §3.4 amendment. Refresh timestamps; display_name is preserved (§3.6 —
    -- original wins on reconnect).
    update party_players
    set last_seen_at = now(),
        rejoined_at  = now()
    where id = v_existing_id;

    return public._rpc_success(jsonb_build_object(
      'party_session_id', v_session_id,
      'party_player_id',  v_existing_id,
      'is_reconnect',     true
    ));
  end if;

  -- ─── New-join path (§3.4 preconditions) ────────────────────────────────
  if v_session_status != 'lobby' then
    return public._rpc_error('PARTY_NOT_JOINABLE',
      'That party has already started and is not joinable.');
  end if;
  if v_session_locked then
    return public._rpc_error('PARTY_LOCKED',
      'That party is locked and not accepting new players.');
  end if;

  -- Insert new player row. The (party_session_id, user_id) unique constraint
  -- on party_players is the safety net; the FOR UPDATE on party_sessions plus
  -- the explicit existence check above make a same-caller race impossible.
  insert into party_players (
    party_session_id,
    user_id,
    display_name,
    permission_role,
    status,
    duty
  )
  values (
    v_session_id,
    v_user_id,
    p_display_name,
    'player',
    'active',
    'normal_player'
  )
  returning id into v_new_player_id;

  return public._rpc_success(jsonb_build_object(
    'party_session_id', v_session_id,
    'party_player_id',  v_new_player_id,
    'is_reconnect',     false
  ));
end;
$$;

comment on function public.join_party(text, text) is
  'Guest joins a party in lobby, reconnects if already an active/out member '
  '(§3.6), or rejoins if they self-left the lobby (D024). Host-kicked callers '
  'get PLAYER_REMOVED. See docs/specs/rpc-contracts.md §3.';
