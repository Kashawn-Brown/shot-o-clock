-- ============================================================================
-- RLS performance: wrap bare auth.uid() in (select auth.uid()) so it evaluates
-- once per query (an InitPlan) instead of once per row.
--
-- Addresses Supabase linter "auth_rls_initplan" on the three policies that
-- reference auth.uid() directly in their USING expression:
--   - party_sessions: "members can read their party session"
--   - party_players:  "always read your own party_players row"  (Policy B)
--   - party_player_notification_settings: "read your own notification settings"
--
-- Logic is unchanged — only auth.uid() -> (select auth.uid()). The helper-based
-- policies (is_active_party_member / is_party_host) are untouched: they carry no
-- bare auth.uid() in the policy expression. party_players Policy A is likewise
-- unchanged (it reads through the helpers).
--
-- Recreate-in-place (drop if exists; create) — idempotent against a fresh DB,
-- no prior migration edited. References: docs/specs/rls-rules.md §2.2, §4.2, §9.1.
-- ============================================================================

-- party_sessions (rls-rules.md §2.2) — inline EXISTS kept verbatim (matches spec).
drop policy if exists "members can read their party session" on party_sessions;
create policy "members can read their party session"
on party_sessions for select
to authenticated
using (
  exists (
    select 1 from party_players pp
    where pp.party_session_id = party_sessions.id
      and pp.user_id = (select auth.uid())
      and pp.status in ('active', 'out')
  )
);

-- party_players Policy B (rls-rules.md §4.2) — the "read your own row" escape
-- hatch a removed caller relies on. Policy A is unchanged (helper-based).
drop policy if exists "always read your own party_players row" on party_players;
create policy "always read your own party_players row"
on party_players for select
to authenticated
using (
  party_players.user_id = (select auth.uid())
);

-- party_player_notification_settings (rls-rules.md §9.1) — own settings only.
drop policy if exists "read your own notification settings" on party_player_notification_settings;
create policy "read your own notification settings"
on party_player_notification_settings for select
to authenticated
using (
  party_player_notification_settings.party_player_id in (
    select id from party_players
    where party_session_id = party_player_notification_settings.party_session_id
      and user_id = (select auth.uid())
  )
);
