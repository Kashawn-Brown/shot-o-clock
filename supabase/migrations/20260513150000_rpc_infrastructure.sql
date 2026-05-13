-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — RPC Infrastructure (helpers)
-- ─────────────────────────────────────────────────────────────────────────────
-- Reusable helpers used by every Phase 2 RPC to build the standard return
-- shape defined in docs/specs/rpc-contracts.md §1.3:
--   { ok: boolean, error_code: text|null, error_msg: text|null, data: jsonb|null }
--
-- See docs/KNOWN_ISSUES.md #D010 for the locked conventions:
--   (1) search_path = public, pg_temp on every definer-rights function
--       (these helpers are LANGUAGE sql IMMUTABLE; the pinning is still good
--        hygiene and makes them safe to call from SECURITY DEFINER RPCs without
--        worrying about caller-controlled search_path).
--   (3) REVOKE EXECUTE on these helpers from public, anon, authenticated.
--       PostgREST auto-exposes every public function as POST /rest/v1/rpc/<name>;
--       the revoke prevents anon and authenticated callers from invoking them
--       directly. SECURITY DEFINER RPCs that call these helpers execute as the
--       `postgres` role and are not affected by the revoke.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── _rpc_error ─────────────────────────────────────────────────────────────

create or replace function public._rpc_error(code text, msg text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ok',         false,
    'error_code', code,
    'error_msg',  msg,
    'data',       null
  );
$$;

comment on function public._rpc_error(text, text) is
  'Internal helper: builds the standard {ok:false, error_code, error_msg, data:null} '
  'shape for handled RPC errors. Called only by other SECURITY DEFINER RPCs. '
  'EXECUTE is revoked from anon and authenticated; see docs/KNOWN_ISSUES.md #D010.';


-- ─── _rpc_success ───────────────────────────────────────────────────────────

create or replace function public._rpc_success(data jsonb default null)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ok',         true,
    'error_code', null,
    'error_msg',  null,
    'data',       data
  );
$$;

comment on function public._rpc_success(jsonb) is
  'Internal helper: builds the standard {ok:true, error_code:null, error_msg:null, data} '
  'shape for successful RPC returns. Called only by other SECURITY DEFINER RPCs. '
  'EXECUTE is revoked from anon and authenticated; see docs/KNOWN_ISSUES.md #D010.';


-- ─── Lock down execution ────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default when a function is created.
-- Strip that grant from the two roles PostgREST exposes to API callers
-- (anon = unauthenticated, authenticated = signed-in users including
--  Supabase Anonymous Auth guests). The `postgres` owner role retains
-- EXECUTE implicitly, so SECURITY DEFINER RPCs running as `postgres` can
-- still call these helpers.

revoke execute on function public._rpc_error(text, text) from public;
revoke execute on function public._rpc_error(text, text) from anon, authenticated;

revoke execute on function public._rpc_success(jsonb) from public;
revoke execute on function public._rpc_success(jsonb) from anon, authenticated;
