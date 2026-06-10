-- Add party_sessions to the supabase_realtime publication so authenticated party
-- members receive live UPDATE row changes — the Phase 7 lobby "host started the
-- game" navigation (plan.md Phase 7). start_game mutates only party_sessions, so
-- the party_players subscription never fires; the lobby watches the session row
-- to move every device out of the lobby when status goes lobby → active.
-- RLS on party_sessions (rls-rules.md §2) governs which changes each subscriber
-- receives: realtime evaluates the table's SELECT policy per client, so a
-- non-member gets nothing.
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
      and tablename = 'party_sessions'
  ) then
    alter publication supabase_realtime add table public.party_sessions;
  end if;
end
$$;
