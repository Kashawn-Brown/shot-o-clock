-- ---------------------------------------------------------------------------
-- Phase 11B — Host-only single-phone mode
--
-- Adds party_settings.host_only and threads it through create_party.
-- When host_only is true the host runs the whole game on one device: no other
-- players join, the client skips the lobby and hides every player-action and
-- roster surface (see plan.md §11B, decisions.md D040). The server machinery is
-- unchanged — solo mode is a single-host party that rides the existing timer /
-- round RPCs. host_only is a recorded setting the client branches on; no RPC
-- behaviour depends on it.
--
-- Idempotent: add-column-if-not-exists + drop-if-exists/create for the function.
-- ---------------------------------------------------------------------------

-- ─── 1. host_only column ─────────────────────────────────────────────────────
-- Defaults false so every existing/multi-device party is unaffected.
alter table party_settings
  add column if not exists host_only boolean not null default false;


-- ─── 2. create_party gains p_host_only ──────────────────────────────────────
-- Adding a parameter changes the signature, so the old 7-arg overload is dropped
-- before recreating. p_host_only defaults false so a caller that omits it (the
-- multi-device path) is unchanged.
drop function if exists public.create_party(
  text, int, int, int, boolean, grace_mode, text
);

create or replace function public.create_party(
  p_party_name              text,
  p_starting_interval_secs  int,
  p_interval_increment_secs int,
  p_shot_window_secs        int,
  p_elimination_enabled     boolean,
  p_grace_mode              grace_mode,
  p_host_display_name       text,
  p_host_only               boolean default false
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
  if p_host_only is null then
    return public._rpc_error('INVALID_PARAM', 'p_host_only is required.');
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
  -- A host_only party never shares its code, but we still generate one so the
  -- not-null join_code column and the rest of the lifecycle stay uniform.
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
    grace_mode,
    host_only
  )
  values (
    v_session_id,
    p_starting_interval_secs,
    p_interval_increment_secs,
    p_shot_window_secs,
    p_elimination_enabled,
    p_grace_mode,
    p_host_only
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
  text, int, int, int, boolean, grace_mode, text, boolean
) is
  'Creates a new party in the lobby phase. Caller becomes the host. '
  'p_host_only selects single-phone mode (party_settings.host_only). '
  'See docs/specs/rpc-contracts.md §2 and docs/KNOWN_ISSUES.md #D011, D040.';
