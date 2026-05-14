-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch B1: party-entry RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The two state-mutating RPCs from docs/specs/rpc-contracts.md §2 and §3:
--   - create_party(...)              — host creates a new party (§2)
--   - join_party(join_code, name)    — guest joins or reconnects (§3, §3.6)
--
-- Both follow the locked conventions from docs/KNOWN_ISSUES.md #D010:
--   (1) SECURITY DEFINER with SET search_path = public, pg_temp
--   (2) In-function auth.uid() check before any write
--   (4) Standard {ok, error_code, error_msg, data} return shape via the
--       _rpc_success / _rpc_error helpers from the rpc_infrastructure
--       migration (20260513150000_rpc_infrastructure.sql)
--
-- Batch B1 conventions are locked in docs/KNOWN_ISSUES.md #D011:
--   - Join code: plpgsql loop, floor(random() * 32) + 1 against a 32-char
--     alphabet array; retry on unique_violation up to 5 times (§2.5).
--   - ALREADY_HOSTING scope: status in ('lobby', 'active', 'paused') —
--     amended §2.2 includes `paused`.
--   - phase_started_at: set to now() at create (matches state-machine §3.1).
--   - Join code uniqueness: column-level unique on party_sessions.join_code
--     across all statuses; spec §2.5 amended to match the stricter schema.
--   - §3.4 reconnect ordering: reconnect (§3.6) short-circuits §3.4
--     preconditions when an existing party_players row is found.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── create_party ───────────────────────────────────────────────────────────
-- See rpc-contracts.md §2.
--
-- Effects (§2.4, single transaction):
--   1. insert party_sessions (host_player_id null at this point)
--   2. insert party_settings keyed to the session
--   3. insert host party_players row
--   4. update party_sessions.host_player_id to the host row's id
--
-- No FOR UPDATE — there's no existing row to lock during the insert phase.
-- The ALREADY_HOSTING query is read-only; same-caller race is guarded by the
-- client-side button-disable per §2.7.
--
-- Join code collisions are caught by `EXCEPTION WHEN unique_violation` around
-- the party_sessions INSERT, which lets us retry with a fresh code. The
-- column-level unique(join_code) constraint is the definitive safety net.

create or replace function public.create_party(
  p_party_name              text,
  p_starting_interval_secs  int,
  p_interval_increment_secs int,
  p_shot_window_secs        int,
  p_elimination_enabled     boolean,
  p_grace_mode              grace_mode,
  p_host_display_name       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_session_id     uuid;
  v_host_player_id uuid;
  v_join_code      text;
  v_attempt        int := 0;
  v_i              int;
  v_max_attempts   constant int := 5;
  -- 32-char alphabet: A-H, J-N, P-Z, 2-9 (no 0/O/I/1). See rpc-contracts.md §2.5.
  v_alphabet       constant text[] := array[
    'A','B','C','D','E','F','G','H','J','K','L','M','N',
    'P','Q','R','S','T','U','V','W','X','Y','Z',
    '2','3','4','5','6','7','8','9'
  ];
begin
  if v_user_id is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;

  -- Parameter validation (§2.3). INVALID_PARAM error_msg names the offending field.
  if p_party_name is null or length(p_party_name) < 1 or length(p_party_name) > 60 then
    return public._rpc_error('INVALID_PARAM', 'p_party_name must be 1-60 characters.');
  end if;
  if p_starting_interval_secs is null
     or p_starting_interval_secs < 10 or p_starting_interval_secs > 3600 then
    return public._rpc_error('INVALID_PARAM', 'p_starting_interval_secs must be 10-3600.');
  end if;
  if p_interval_increment_secs is null
     or p_interval_increment_secs < 0 or p_interval_increment_secs > 600 then
    return public._rpc_error('INVALID_PARAM', 'p_interval_increment_secs must be 0-600.');
  end if;
  if p_shot_window_secs is null
     or p_shot_window_secs < 5 or p_shot_window_secs > 300 then
    return public._rpc_error('INVALID_PARAM', 'p_shot_window_secs must be 5-300.');
  end if;
  if p_elimination_enabled is null then
    return public._rpc_error('INVALID_PARAM', 'p_elimination_enabled is required.');
  end if;
  if p_grace_mode is null then
    return public._rpc_error('INVALID_PARAM', 'p_grace_mode is required.');
  end if;
  if p_host_display_name is null
     or length(p_host_display_name) < 1 or length(p_host_display_name) > 40 then
    return public._rpc_error('INVALID_PARAM', 'p_host_display_name must be 1-40 characters.');
  end if;

  -- ALREADY_HOSTING (§2.2, amended to include 'paused' per #D011).
  -- "Active or out" on the host row covers a host who went `out` mid-game but
  -- still holds host powers (see rls-rules.md §12).
  if exists (
    select 1
    from party_players pp
    join party_sessions ps on ps.id = pp.party_session_id
    where pp.user_id = v_user_id
      and pp.permission_role = 'host'
      and pp.status in ('active', 'out')
      and ps.status in ('lobby', 'active', 'paused')
  ) then
    return public._rpc_error('ALREADY_HOSTING',
      'You are already hosting an open party.');
  end if;

  -- All four mutations below — party_sessions insert (inside the retry loop),
  -- party_settings insert, party_players insert, and the party_sessions
  -- host_player_id update — run inside this function's implicit transaction.
  -- If any of them raises, the entire create rolls back atomically. Do not
  -- refactor any of them outside the function body without preserving that
  -- atomicity.

  -- Generate join code with retry on collision (§2.5, #D011 option a).
  loop
    v_attempt := v_attempt + 1;
    v_join_code := '';
    for v_i in 1..6 loop
      v_join_code := v_join_code || v_alphabet[floor(random() * 32)::int + 1];
    end loop;

    begin
      insert into party_sessions (
        name,
        join_code,
        status,
        current_phase,
        current_round_number,
        phase_started_at
      )
      values (
        p_party_name,
        v_join_code,
        'lobby',
        'lobby',
        0,
        now()   -- phase_started_at per state-machine §3.1 (#D011 (3))
      )
      returning id into v_session_id;
      exit;  -- INSERT succeeded; leave the retry loop
    exception when unique_violation then
      -- Only party_sessions.join_code can produce a unique_violation here
      -- (id uses gen_random_uuid; no other unique constraints fire on insert).
      if v_attempt >= v_max_attempts then
        return public._rpc_error('JOIN_CODE_COLLISION',
          'Could not generate a unique join code. Please try again.');
      end if;
      -- else loop again with a fresh code
    end;
  end loop;

  -- party_settings: caller-supplied fields explicit; the rest take schema
  -- defaults defined in supabase/migrations/<initial_schema>.sql §3.
  insert into party_settings (
    party_session_id,
    starting_interval_seconds,
    interval_increment_seconds,
    shot_window_seconds,
    elimination_enabled,
    grace_mode
  )
  values (
    v_session_id,
    p_starting_interval_secs,
    p_interval_increment_secs,
    p_shot_window_secs,
    p_elimination_enabled,
    p_grace_mode
  );

  -- Host party_players row.
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
    p_host_display_name,
    'host',
    'active',
    'normal_player'
  )
  returning id into v_host_player_id;

  -- Wire the chicken-and-egg host_player_id FK (§2.4 step 4).
  update party_sessions
  set host_player_id = v_host_player_id
  where id = v_session_id;

  return public._rpc_success(jsonb_build_object(
    'party_session_id', v_session_id,
    'join_code',        v_join_code,
    'host_player_id',   v_host_player_id
  ));
end;
$$;

comment on function public.create_party(
  text, int, int, int, boolean, grace_mode, text
) is
  'Creates a new party in the lobby phase. Caller becomes the host. '
  'See docs/specs/rpc-contracts.md §2 and docs/KNOWN_ISSUES.md #D011.';


-- ─── join_party ─────────────────────────────────────────────────────────────
-- See rpc-contracts.md §3 and §3.6.
--
-- SELECT … FOR UPDATE on the party_sessions row serializes us against
-- concurrent end_party / start_game / future lock_party on the same session.
-- Without it, a guest could read status = 'lobby' while the host commits an
-- end_party, then INSERT into an already-ended party.
--
-- Reconnect (§3.6) is checked BEFORE §3.4 preconditions per #D011 (5). If the
-- caller has an existing party_players row in this session with status in
-- ('active', 'out'), only the reconnect branch runs and §3.4 status/lock
-- checks are bypassed — which is what makes mid-game reconnect work.

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
  v_user_id         uuid := auth.uid();
  v_session_id      uuid;
  v_session_status  party_status;
  v_session_locked  boolean;
  v_existing_id     uuid;
  v_existing_status player_status;
  v_new_player_id   uuid;
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
  -- Drives the reconnect-vs-new-join branch per §3.6 / §3.4 (#D011 (5)).
  select id, status into v_existing_id, v_existing_status
  from party_players
  where party_session_id = v_session_id
    and user_id = v_user_id;

  if v_existing_id is not null then
    -- ─── Reconnect path (§3.6) ────────────────────────────────────────────
    -- Bypasses §3.4 status/lock checks per the §3.4 amendment.

    if v_existing_status = 'removed' then
      return public._rpc_error('PLAYER_REMOVED',
        'You were removed from this party.');
    end if;

    -- status in ('active', 'out'): refresh timestamps; display_name is
    -- preserved (§3.6 — original wins on reconnect).
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
  'Guest joins a party in lobby, or reconnects if already a member (§3.6). '
  'See docs/specs/rpc-contracts.md §3 and docs/KNOWN_ISSUES.md #D011.';
