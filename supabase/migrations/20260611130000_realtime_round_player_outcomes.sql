-- Add round_player_outcomes to the supabase_realtime publication so authenticated
-- party members receive live INSERT/UPDATE row changes — the Phase 9 Round Results
-- sync (plan.md Phase 9, useRoundOutcomes). RLS on round_player_outcomes
-- (rls-rules.md §5) governs which changes each subscriber actually receives:
-- realtime evaluates the table's SELECT policy per client, so non-members get
-- nothing. The results screen re-fetches get_round_outcomes on each event rather
-- than splicing the raw payload, for the same reason as the party_players sync
-- (D027) — the authoritative read already applies the membership rules.
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
      and tablename = 'round_player_outcomes'
  ) then
    alter publication supabase_realtime add table public.round_player_outcomes;
  end if;
end
$$;
