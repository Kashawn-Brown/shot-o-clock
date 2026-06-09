-- Add party_players to the supabase_realtime publication so authenticated party
-- members receive live INSERT/UPDATE row changes — the Phase 6 lobby roster sync
-- (plan.md Phase 6). RLS on party_players (rls-rules.md §4) governs which changes
-- each subscriber actually receives: realtime evaluates the table's SELECT policy
-- per client, so non-members get nothing.
--
-- Idempotent: guards both the publication's existence and the table's membership,
-- so it is safe on a fresh CI database and safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'party_players'
  ) then
    alter publication supabase_realtime add table public.party_players;
  end if;
end
$$;
