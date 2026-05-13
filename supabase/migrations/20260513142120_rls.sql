-- ============================================================================
-- RLS migration for Shot O'Clock MVP.
--
-- References:
--   docs/specs/rls-rules.md §1.1   (asymmetric read/write — reads through RLS,
--                                   writes through SECURITY DEFINER RPCs)
--   docs/specs/rls-rules.md §1.5   (every SELECT policy is scoped to
--                                   `to authenticated` — see #D009)
--   docs/specs/rls-rules.md §12    (helper function bodies)
--   docs/specs/rls-rules.md §2-§9  (per-table policies)
--   docs/KNOWN_ISSUES.md     #D008 (this file combines helpers + policies)
--   docs/KNOWN_ISSUES.md     #D009 (policies scoped to authenticated)
--
-- Scope: four RLS helper functions, RLS enablement on the 8 MVP tables, and
-- 10 SELECT-only policies (party_players has two ORed policies; every other
-- table has one). No INSERT/UPDATE/DELETE policies — writes flow through
-- SECURITY DEFINER RPCs delivered in Phase 2.
--
-- Idempotency:
--   - helpers use `create or replace function`
--   - `alter table ... enable row level security` is natively idempotent
--   - every policy uses `drop policy if exists ...; create policy ...`
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Helper functions  (per rls-rules.md §12)
--    All four: language sql, stable, security invoker. They check
--    auth.uid() against party_players.user_id. The composite index on
--    party_players (party_session_id, user_id) created in the schema
--    migration is what keeps them fast at scale.
-- ---------------------------------------------------------------------------

-- Is the calling user a party_players row in this session (any status)?
create or replace function public.is_party_member(session_id uuid)
returns boolean
language sql
stable
security invoker
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
security invoker
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
security invoker
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
security invoker
as $$
  select id from party_players
  where party_session_id = session_id
    and user_id = auth.uid()
  limit 1;
$$;


-- ---------------------------------------------------------------------------
-- 2. Enable RLS on all 8 MVP tables
--    Deny by default — policies below grant SELECT access. Without a
--    matching policy, every row is invisible to client roles.
-- ---------------------------------------------------------------------------

alter table party_sessions                       enable row level security;
alter table party_settings                       enable row level security;
alter table party_players                        enable row level security;
alter table rounds                               enable row level security;
alter table round_player_outcomes                enable row level security;
alter table admin_action_logs                    enable row level security;
alter table timer_events                         enable row level security;
alter table party_player_notification_settings   enable row level security;


-- ---------------------------------------------------------------------------
-- 3. party_sessions  (rls-rules.md §2.2)
--    The USING clause is an inline EXISTS rather than is_active_party_member()
--    purely to match the spec verbatim — functionally identical.
-- ---------------------------------------------------------------------------

drop policy if exists "members can read their party session" on party_sessions;
create policy "members can read their party session"
on party_sessions for select
to authenticated
using (
  exists (
    select 1 from party_players pp
    where pp.party_session_id = party_sessions.id
      and pp.user_id = auth.uid()
      and pp.status in ('active', 'out')
  )
);


-- ---------------------------------------------------------------------------
-- 4. party_settings  (rls-rules.md §3.1, locked version)
--    Removed players cannot read settings — is_active_party_member excludes
--    them, matching the §3.1 locked decision ("Removed players cannot read
--    settings either").
-- ---------------------------------------------------------------------------

drop policy if exists "active members can read party settings" on party_settings;
create policy "active members can read party settings"
on party_settings for select
to authenticated
using (
  public.is_active_party_member(party_settings.party_session_id)
);


-- ---------------------------------------------------------------------------
-- 5. party_players  (rls-rules.md §4.1 + §4.2 — DUAL POLICY, READ CAREFULLY)
--
-- Postgres evaluates multiple PERMISSIVE policies for the same command (here,
-- SELECT) by ORing them together. We rely on that OR behavior. Two policies:
--
--   Policy A — "members see non-removed peers; host sees all"
--     Covers the normal roster view. The outer is_active_party_member call
--     already excludes removed *callers* from reading the table at all; the
--     inner OR then hides removed *peers* from non-host callers while still
--     showing them to the host (for moderation history).
--
--   Policy B — "always read your own party_players row"
--     The permissive escape hatch. A removed caller fails Policy A's outer
--     check and would otherwise see nothing in this table, including their
--     own row. Policy B lets them still read their own row so the client can
--     render the "you were removed" state instead of treating the session
--     as gone.
--
-- Removing or reordering either policy will silently break one of those two
-- cases. Do not consolidate them into one policy unless rls-rules.md changes.
-- ---------------------------------------------------------------------------

drop policy if exists "members see non-removed peers; host sees all" on party_players;
create policy "members see non-removed peers; host sees all"
on party_players for select
to authenticated
using (
  public.is_active_party_member(party_players.party_session_id)
  and (
    party_players.status != 'removed'
    or public.is_party_host(party_players.party_session_id)
  )
);

drop policy if exists "always read your own party_players row" on party_players;
create policy "always read your own party_players row"
on party_players for select
to authenticated
using (
  party_players.user_id = auth.uid()
);


-- ---------------------------------------------------------------------------
-- 6. rounds  (rls-rules.md §5.1)
-- ---------------------------------------------------------------------------

drop policy if exists "active members can read rounds" on rounds;
create policy "active members can read rounds"
on rounds for select
to authenticated
using (
  public.is_active_party_member(rounds.party_session_id)
);


-- ---------------------------------------------------------------------------
-- 7. round_player_outcomes  (rls-rules.md §6.1)
--
-- NOTE — column-level filtering is intentionally CLIENT-SIDE, not RLS:
--   The blueprint specifies that regular players see simple statuses
--   (Active / Out / Completed / Used Grace) while hosts can see detailed
--   out_reason and similar fields. Postgres RLS does not natively filter
--   columns — only rows. Every active member can read every column of every
--   outcome row in their party at the DB level; the client renders less for
--   non-hosts.
--
--   If column-level filtering becomes a real requirement later, the path is
--   two read RPCs (e.g. get_round_outcomes_for_host vs
--   get_round_outcomes_for_player) with different SELECT lists — not a more
--   elaborate policy. See rls-rules.md §6.1.
-- ---------------------------------------------------------------------------

drop policy if exists "active members can read all outcomes in their party" on round_player_outcomes;
create policy "active members can read all outcomes in their party"
on round_player_outcomes for select
to authenticated
using (
  public.is_active_party_member(round_player_outcomes.party_session_id)
);


-- ---------------------------------------------------------------------------
-- 8. admin_action_logs  (rls-rules.md §7.1)
--    Host-only read. Other players see action results via session state, not
--    via this log.
-- ---------------------------------------------------------------------------

drop policy if exists "only host reads admin action logs" on admin_action_logs;
create policy "only host reads admin action logs"
on admin_action_logs for select
to authenticated
using (
  public.is_party_host(admin_action_logs.party_session_id)
);


-- ---------------------------------------------------------------------------
-- 9. timer_events  (rls-rules.md §8.1)
-- ---------------------------------------------------------------------------

drop policy if exists "active members can read timer events" on timer_events;
create policy "active members can read timer events"
on timer_events for select
to authenticated
using (
  public.is_active_party_member(timer_events.party_session_id)
);


-- ---------------------------------------------------------------------------
-- 10. party_player_notification_settings  (rls-rules.md §9.1)
--     Each player reads only their own settings row. The subquery resolves
--     the caller's party_player_id within this session and matches against
--     the row's party_player_id.
-- ---------------------------------------------------------------------------

drop policy if exists "read your own notification settings" on party_player_notification_settings;
create policy "read your own notification settings"
on party_player_notification_settings for select
to authenticated
using (
  party_player_notification_settings.party_player_id in (
    select id from party_players
    where party_session_id = party_player_notification_settings.party_session_id
      and user_id = auth.uid()
  )
);
