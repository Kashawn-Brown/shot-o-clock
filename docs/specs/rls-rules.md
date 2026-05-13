# RLS Rules

> The complete Row Level Security policy spec for all MVP tables.
> When this doc and code disagree, the doc wins until the doc is amended.
> Cross-references: `schema.md` for table shapes; `rpc-contracts.md` for the write-path (which bypasses RLS via `SECURITY DEFINER`).

---

## 1. Scope and Approach

This spec covers RLS policies for every MVP table. The post-MVP tables (referee_assignments, referee_verdicts, party_albums, party_media_items, media_reports) are not included — they will be added when those features are built.

### 1.1. Read vs write boundary

In Shot O'Clock, the read/write security model is asymmetric:

- **Reads** go through RLS directly. Clients select from tables; RLS filters rows.
- **Writes** go through `SECURITY DEFINER` RPCs (see `rpc-contracts.md` §1.1). The function bypasses RLS and enforces its own access checks. **No direct INSERT/UPDATE/DELETE from clients on game-state tables.**

This means RLS is mainly about controlling **what each user can see**, not what they can change. Write enforcement lives in the RPC functions.

### 1.2. Deny by default

Every table has RLS enabled. The default is deny. Policies are additive — they grant access. If no policy matches, the row is invisible.

### 1.3. Anonymous Auth users

MVP guests use Supabase Anonymous Auth. They have an `auth.uid()` just like full-account users. RLS policies treat both identically; they only check `auth.uid()`, never the auth method.

### 1.4. Helper functions

Several policies reference repeated checks (e.g. "is this caller in this party"). Define these as SQL functions in the public schema and reference them from policies. This keeps individual policies readable and gives us a single place to update logic.

Helpers used throughout this spec:

```sql
-- Is the calling user a party_players row in this session?
public.is_party_member(session_id uuid) returns boolean

-- Is the calling user a non-removed party_players row in this session?
public.is_active_party_member(session_id uuid) returns boolean

-- Is the calling user the host of this session?
public.is_party_host(session_id uuid) returns boolean

-- The calling user's party_player_id for this session, or null
public.my_party_player_id(session_id uuid) returns uuid
```

All helpers are `STABLE`, `SECURITY INVOKER`, and check `auth.uid()` against `party_players.user_id` (or `guest_identity_id` joined through to the user via the identity link).

---

## 2. `party_sessions`

The main session table. Visible to party members; not to outsiders.

### 2.1. RLS enabled

```sql
alter table party_sessions enable row level security;
```

### 2.2. Policies

**select (read):**

A user can read a `party_sessions` row if any of the following holds:

- They are a `party_players` row for this session with `status ∈ {active, out}`. (Removed players cannot read further session data, intentionally.)
- They are about to join — but this isn't a read of the session, it's the `join_party` RPC which bypasses RLS.

```sql
create policy "members can read their party session"
on party_sessions for select
using (
  exists (
    select 1 from party_players pp
    where pp.party_session_id = party_sessions.id
      and pp.user_id = auth.uid()
      and pp.status in ('active', 'out')
  )
);
```

**insert/update/delete:** No client policy. All writes go through RPCs (`create_party`, `start_game`, `host_*`, etc.).

### 2.3. Notes

A `removed` player can no longer read session state — this is intentional. They will see "session ended" or similar in the client (handled by checking the lack of a session row, not by special logic).

The join_party flow needs to look up a session by `joinCode` *before* the player is a member. This is done inside the `join_party` RPC, which runs as `SECURITY DEFINER` and bypasses RLS. There is no public-facing way to query sessions by join code.

---

## 3. `party_settings`

Per-party settings. Visible to party members. Read-only via RLS — host modifications go through `host_update_settings` (post-MVP RPC; in MVP, settings are immutable after `create_party`).

### 3.1. Policies

**select (read):**

```sql
create policy "members can read party settings"
on party_settings for select
using (
  public.is_party_member(party_settings.party_session_id)
);
```

Note: `is_party_member` returns true for `active`, `out`, AND `removed` players. We use the stricter `is_active_party_member` only where removed players must be hidden — for settings, removed players can still see settings (they may still have the screen open as the removal happens). This is a deliberately permissive choice; flip if it causes issues.

Actually — **locked: use `is_active_party_member`** for consistency with `party_sessions`. Removed players cannot read settings either.

```sql
create policy "active members can read party settings"
on party_settings for select
using (
  public.is_active_party_member(party_settings.party_session_id)
);
```

**insert/update/delete:** No client policy. Through RPCs only.

---

## 4. `party_players`

Player roster. The trickiest table for RLS because what a player sees depends on their own status.

### 4.1. Policies

**select (read):**

A user can read a `party_players` row if:

- They are an active or out member of the same `party_session_id`, AND
- The target row's `status` is NOT `removed` — UNLESS the caller is the host (host can see removed players for admin purposes).

```sql
create policy "members see non-removed peers; host sees all"
on party_players for select
using (
  public.is_active_party_member(party_players.party_session_id)
  and (
    party_players.status != 'removed'
    or public.is_party_host(party_players.party_session_id)
  )
);
```

Reasoning:

- Regular players should not see removed peers in the roster.
- Host needs to see removed players for moderation history.
- Removed players themselves cannot read this table at all (the outer `is_active_party_member` filter handles that — `is_active_party_member` returns false for removed callers).

A small subtle case: when a player has just been removed but their client hasn't reloaded yet, their next query against `party_players` will return zero rows for the session (because the outer filter rejects them). The client will treat this as "session ended" or "you were removed" and route accordingly. This is intentional.

**insert/update/delete:** No client policy. Through RPCs only (`join_party`, `host_remove_player`, `host_mark_player_*`).

### 4.2. Reading your own row

A user must always be able to read their own `party_players` row, even if they are `removed`. Otherwise the client has no way to display the "you were removed" state.

Add a second permissive policy:

```sql
create policy "always read your own party_players row"
on party_players for select
using (
  party_players.user_id = auth.uid()
);
```

This permissive policy combines with the previous one — RLS uses OR across multiple policies for the same role. So a removed player can read their own row but no one else's in that session. Good.

---

## 5. `rounds`

Per-round records. Visible to active and out party members.

### 5.1. Policies

**select (read):**

```sql
create policy "active members can read rounds"
on rounds for select
using (
  public.is_active_party_member(rounds.party_session_id)
);
```

**insert/update/delete:** Through RPCs only.

---

## 6. `round_player_outcomes`

Per-player, per-round outcomes. Trickier than `rounds` because of the "regular players see Active/Out only" UX rule from the blueprint.

### 6.1. Policies

**select (read):**

The blueprint says regular players should see simple statuses (Active/Out/Completed/Used Grace) but hosts can see detailed `outReason` and similar. RLS handles row-level visibility; column-level filtering happens client-side (the client just renders less for non-hosts).

For row-level: every active member of the party can read every outcome row in their party.

```sql
create policy "active members can read all outcomes in their party"
on round_player_outcomes for select
using (
  public.is_active_party_member(round_player_outcomes.party_session_id)
);
```

**Column-level filtering note:** Postgres RLS does not natively do column-level filtering. We rely on the *client* to display only the appropriate fields based on whether the caller is the host. This is acceptable because the data is visible to all party members anyway; the difference is presentation, not security.

If we later need true column-level filtering (e.g. some fields are host-only), we can use a `get_round_outcomes_for_host` RPC vs a `get_round_outcomes_for_player` RPC with different `select` lists. For MVP: not needed.

**insert/update/delete:** Through RPCs only.

---

## 7. `admin_action_logs`

Audit log of host actions. Visible to the host only. Other players don't need to see who did what — they see the result via session state.

### 7.1. Policies

**select (read):**

```sql
create policy "only host reads admin action logs"
on admin_action_logs for select
using (
  public.is_party_host(admin_action_logs.party_session_id)
);
```

**insert/update/delete:** Through RPCs only (every state-mutating RPC inserts here).

---

## 8. `timer_events`

System and host transitions. Visible to all active party members (useful for client-side derivation of phase changes).

### 8.1. Policies

**select (read):**

```sql
create policy "active members can read timer events"
on timer_events for select
using (
  public.is_active_party_member(timer_events.party_session_id)
);
```

**insert/update/delete:** Through RPCs only.

---

## 9. `party_player_notification_settings`

Per-player notification preferences. Each player reads only their own; host can read all (for support / debugging — actually, not strictly needed in MVP; **locked: each player reads only their own, period**).

### 9.1. Policies

**select (read):**

```sql
create policy "read your own notification settings"
on party_player_notification_settings for select
using (
  party_player_notification_settings.party_player_id in (
    select id from party_players
    where party_session_id = party_player_notification_settings.party_session_id
      and user_id = auth.uid()
  )
);
```

**insert/update:** Players manage their own settings via a dedicated RPC (`update_my_notification_settings`). In MVP, this RPC may not exist yet (notifications are post-MVP). When it does, the RPC bypasses RLS for the write but checks ownership inside.

**delete:** Through RPCs only.

---

## 10. `devices`

Device records (for future push notification routing). Per-user visibility.

### 10.1. Policies

**select (read):**

```sql
create policy "read your own devices"
on devices for select
using (
  devices.user_id = auth.uid()
);
```

**insert/update/delete:** Through a `register_device` RPC (post-MVP). In MVP, this table may exist but be unused.

---

## 11. `user_notification_preferences`

Per-user global notification preferences. Visible only to that user.

### 11.1. Policies

**select (read):**

```sql
create policy "read your own notification preferences"
on user_notification_preferences for select
using (
  user_notification_preferences.user_id = auth.uid()
);
```

**insert/update/delete:** Through dedicated RPCs. Post-MVP.

---

## 12. Helper Functions (Reference Implementation)

These are the helpers referenced throughout this spec. They live in the `public` schema as `STABLE SECURITY INVOKER` functions. They return `boolean` or `uuid`. They MUST not have side effects.

```sql
-- Is the calling user a member of this party (any status including removed)?
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

-- Is the calling user an active or out (NOT removed) member?
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

-- Is the calling user the host of this session?
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
      and status in ('active', 'out')  -- host who is out still has host powers
  );
$$;

-- The caller's party_player_id for this session, or null
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
```

**Performance note:** these helpers run on every row evaluated by RLS. They MUST be indexable. `party_players` needs a composite index on `(party_session_id, user_id)` for these to be fast. See `schema.md` for index spec.

---

## 13. Identity Linkage Note

A `party_players` row links to identity via two columns: `user_id` and `guest_identity_id`. The active linkage in MVP is `user_id` (Supabase Anonymous Auth gives every user an auth.uid). `guest_identity_id` is reserved for a more elaborate guest model post-MVP.

All RLS helpers in §12 check `user_id = auth.uid()`. This works because Anonymous Auth users have stable uids for the lifetime of their session token.

When a guest becomes a registered user post-MVP (account conversion), the `user_id` linkage should be preserved (Supabase supports linking anonymous identities into permanent ones via `linkIdentity`). RLS continues to work without changes.

---

## 14. Testing RLS

For each table, the test matrix must include:

- A host can read their party's rows.
- A regular player can read their party's rows.
- An out player can read their party's rows (with exceptions per spec).
- A removed player CANNOT read their (former) party's rows (with the exception of their own `party_players` row).
- A user in a different party CANNOT read this party's rows.
- An unauthenticated user CANNOT read any rows.
- No client-side INSERT/UPDATE/DELETE succeeds on any game-state table. (All writes return permission errors.)

These tests live in `supabase/tests/rls/` and run as part of CI when CI is wired up. Each phase that touches RLS must add or update its test cases.

---

## 15. Open Questions

(None currently. Add as they arise.)
