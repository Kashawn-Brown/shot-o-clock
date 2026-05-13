-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Read RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The three read-only RPCs from docs/specs/rpc-contracts.md §13:
--   - get_server_time()              — clock-skew probe (§13.2)
--   - get_party_state(uuid)          — denormalized session snapshot (§13.1)
--   - get_round_outcomes(uuid)       — outcome rows for a round (§13.3)
--
-- All three follow the locked conventions from docs/KNOWN_ISSUES.md #D010:
--   (1) SECURITY DEFINER with SET search_path = public, pg_temp
--   (2) In-function auth.uid() check before any read (definer rights bypass
--       RLS, so each function enforces its own caller-identity + membership
--       gate)
--   (4) Standard {ok, error_code, error_msg, data} return shape via the
--       _rpc_success / _rpc_error helpers from the rpc_infrastructure
--       migration (20260513150000_rpc_infrastructure.sql)
--
-- Default function grants are intentionally LEFT IN PLACE on these three
-- (PostgREST exposes them to anon and authenticated). The in-function
-- auth.uid() check is the actual security gate.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── get_server_time ────────────────────────────────────────────────────────
-- See rpc-contracts.md §13.2.
-- Used by clients to estimate clock skew so countdown displays stay aligned
-- with party_sessions.phase_ends_at. No party scope — any authenticated
-- caller can invoke.

create or replace function public.get_server_time()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;

  return public._rpc_success(jsonb_build_object('server_time', now()));
end;
$$;


-- ─── get_party_state ────────────────────────────────────────────────────────
-- See rpc-contracts.md §13.1.
-- Returns denormalized session + settings + current_round + roster.
--
-- Roster filter implements the dual visibility rule from rls-rules.md §4.1
-- and §4.2:
--   - rows with status in ('active', 'out') are visible to every member
--   - rows with status = 'removed' are visible only to the host (moderation
--     history) AND to that removed player themselves (so a removed player
--     can render the "you were removed" state). We OR is_party_host with
--     `id = my_party_player_id` to cover both cases in a single WHERE clause.
--
-- SESSION_NOT_FOUND is returned for both "session does not exist" and
-- "session exists but caller is not a member" — deliberate, do not split
-- into separate codes (rpc-contracts.md §13.1, "Do not 'improve' error
-- specificity here").

create or replace function public.get_party_state(p_party_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session       party_sessions%rowtype;
  v_settings      party_settings%rowtype;
  v_round         rounds%rowtype;
  v_players       jsonb;
  v_is_host       boolean;
  v_my_player_id  uuid;
begin
  if auth.uid() is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;

  -- Membership gate. is_active_party_member returns false for non-existent
  -- sessions, non-member callers, and removed callers — all three "you can't
  -- see this party" cases collapse to SESSION_NOT_FOUND here.
  if not public.is_active_party_member(p_party_session_id) then
    return public._rpc_error('SESSION_NOT_FOUND', 'Party not found.');
  end if;

  -- Cache caller's host status and own player_id so the roster WHERE clause
  -- references locals instead of re-invoking the helpers per row.
  v_is_host      := public.is_party_host(p_party_session_id);
  v_my_player_id := public.my_party_player_id(p_party_session_id);

  -- Session.
  select * into v_session
  from party_sessions
  where id = p_party_session_id;

  -- Settings (one row per session, guaranteed by the party_session_id unique
  -- constraint in the initial schema migration).
  select * into v_settings
  from party_settings
  where party_session_id = p_party_session_id;

  -- Current round. Null in lobby because current_round_number = 0 and
  -- rounds.round_number is constrained >= 1, so no row matches. Also null
  -- in the unlikely case of stale state where current_round_number points
  -- past the last existing round.
  select * into v_round
  from rounds
  where party_session_id = p_party_session_id
    and round_number = v_session.current_round_number;

  -- Roster with dual visibility filter (see header comment).
  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.joined_at), '[]'::jsonb)
  into v_players
  from party_players p
  where p.party_session_id = p_party_session_id
    and (
      p.status in ('active', 'out')
      or (
        p.status = 'removed'
        and (v_is_host or p.id = v_my_player_id)
      )
    );

  return public._rpc_success(jsonb_build_object(
    'session',       to_jsonb(v_session),
    'settings',      to_jsonb(v_settings),
    'current_round', case when v_round.id is null then null else to_jsonb(v_round) end,
    'players',       v_players
  ));
end;
$$;


-- ─── get_round_outcomes ────────────────────────────────────────────────────
-- See rpc-contracts.md §13.3.
-- Returns outcome rows for a round; empty array if the round has no outcomes
-- yet (mid-countdown or pre-shot-window).
--
-- SESSION_NOT_FOUND collapses "round doesn't exist" and "round exists but
-- caller is not a member of its party" — same deliberate non-distinction as
-- §13.1. Do not split.

create or replace function public.get_round_outcomes(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_outcomes   jsonb;
begin
  if auth.uid() is null then
    return public._rpc_error('NOT_AUTHENTICATED', 'Caller is not authenticated.');
  end if;

  -- Look up the round's session.
  select party_session_id into v_session_id
  from rounds
  where id = p_round_id;

  if not found then
    return public._rpc_error('SESSION_NOT_FOUND', 'Round not found.');
  end if;

  -- Caller must be an active or out member of that session.
  if not public.is_active_party_member(v_session_id) then
    return public._rpc_error('SESSION_NOT_FOUND', 'Round not found.');
  end if;

  -- Outcomes for the round. Coalesce ensures an empty array, never null.
  select coalesce(jsonb_agg(to_jsonb(o.*) order by o.created_at), '[]'::jsonb)
  into v_outcomes
  from round_player_outcomes o
  where o.round_id = p_round_id;

  return public._rpc_success(jsonb_build_object('outcomes', v_outcomes));
end;
$$;
