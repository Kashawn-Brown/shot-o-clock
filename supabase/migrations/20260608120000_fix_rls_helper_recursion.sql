-- ============================================================================
-- Fix: RLS helper recursion — "stack depth limit exceeded" (SQLSTATE 54001)
--
-- Symptom: every authenticated client SELECT on a party table failed with
--   54001 "stack depth limit exceeded". First surfaced by getActiveParty's
--   launch read of party_sessions — the first authenticated client SELECT to
--   go through RLS, since all Phase 2 RPCs are SECURITY DEFINER and bypass it
--   (see decisions.md #006).
--
-- Cause: the four membership helpers (defined in 20260513142120_rls.sql) were
--   SECURITY INVOKER and query party_players. The party_players SELECT policy
--   "members see non-removed peers; host sees all" calls is_active_party_member
--   / is_party_host, whose internal `select ... from party_players` — being
--   INVOKER — is itself subject to party_players RLS, which calls the helper
--   again, without bound. Because the recursion crosses a function-call
--   boundary, Postgres's direct-policy recursion detector (which raises 42P17)
--   never fires; the call stack simply overflows (54001). Every party-table
--   read recurses this way: each table's policy ultimately calls
--   is_active_party_member, and party_sessions' inline EXISTS on party_players
--   trips party_players' own recursive policy. party_sessions was merely the
--   first read performed on launch.
--
-- Fix: switch all four helpers to SECURITY DEFINER so their internal
--   party_players query runs as the function owner and bypasses RLS,
--   terminating the recursion. Each helper only ever returns a boolean (or the
--   caller's own party_player_id) about auth.uid()'s own membership, so DEFINER
--   leaks nothing — this is the Supabase-recommended pattern for membership
--   checks invoked inside RLS policies. auth.uid() is unaffected by the DEFINER
--   switch (it reads the JWT, not current_user). Also pins search_path per the
--   D010 hardening convention for SECURITY DEFINER functions.
--
-- create-or-replace only — no policy changes, no signature changes, fully
-- idempotent against a fresh database.
--
-- References: docs/specs/rls-rules.md §1.4 + §12, decisions.md D020.
-- ============================================================================

-- Is the calling user a party_players row in this session (any status)?
create or replace function public.is_party_member(session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from party_players
    where party_session_id = session_id
      and user_id = auth.uid()
  );
$$;

-- Is the calling user an active or out (NOT removed) member of this session?
create or replace function public.is_active_party_member(session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from party_players
    where party_session_id = session_id
      and user_id = auth.uid()
      and status in ('active', 'out')
  );
$$;

-- Is the calling user the host of this session? A host who is `out` still has
-- host powers per rls-rules.md §12 — hence the `status in ('active', 'out')`.
create or replace function public.is_party_host(session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from party_players
    where party_session_id = session_id
      and user_id = auth.uid()
      and permission_role = 'host'
      and status in ('active', 'out')
  );
$$;

-- The calling user's party_player_id for this session, or null.
create or replace function public.my_party_player_id(session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from party_players
  where party_session_id = session_id
    and user_id = auth.uid()
  limit 1;
$$;
