-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 (bug fix) — Expire stale never-started lobbies
-- ─────────────────────────────────────────────────────────────────────────────
-- A lobby that is created but never started has no end path: the Phase 12 inactivity
-- auto-end (D052) is ROUND-based and a never-started lobby has no rounds, so it never
-- accumulates inactivity. It therefore sits in status='lobby' forever, blocking the
-- host's ALREADY_HOSTING check (create_party) indefinitely. See decisions.md D069.
--
-- Fix: a pg_cron sweep marks never-started lobbies older than a threshold as
-- status='expired' — the reserved party_status value that has never been used, and is
-- excluded from BOTH the reconnect statuses (lobby/active/paused) and the
-- ALREADY_HOSTING check, so an expired lobby neither pulls the host back in nor blocks
-- a new party. Distinct from 'ended' (a host's deliberate wrap-up).
--
-- Conventions: SECURITY DEFINER + search_path pin; EXECUTE revoked from API roles
-- (only pg_cron / owner calls it), matching cron_advance_due_phases (D058).
-- ─────────────────────────────────────────────────────────────────────────────

-- Lobbies idle this long with no start are treated as abandoned. Generous so a real
-- party assembling slowly isn't killed mid-wait; a never-started lobby past it is
-- clearly abandoned.
create or replace function public.cron_expire_stale_lobbies()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update party_sessions
  set status        = 'expired',
      current_phase = 'ended',
      ended_at      = now(),
      phase_ends_at = null
  where status = 'lobby'                          -- never started (start_game → 'active')
    and current_round_number = 0                  -- invariant for a lobby; belt-and-suspenders
    and created_at < now() - interval '3 hours';
end;
$$;

comment on function public.cron_expire_stale_lobbies() is
  'Marks never-started lobbies older than 3h as status=expired so they stop blocking '
  'the host ALREADY_HOSTING check. Run by pg_cron; EXECUTE revoked from API roles. '
  'Phase 16 bug fix; see D069.';

revoke execute on function public.cron_expire_stale_lobbies() from public, anon, authenticated;

-- Every 15 minutes — lobbies aren't time-critical like the 5s phase sweep, so worst
-- case a stale lobby lives ~3h15m. cron.schedule upserts by job name (idempotent).
select cron.schedule(
  'expire-stale-lobbies',
  '*/15 * * * *',
  $$select public.cron_expire_stale_lobbies();$$
);
