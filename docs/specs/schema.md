# Schema

> The concrete schema for MVP — column types, constraints, foreign keys, indexes, defaults.
> When this doc and the migrations disagree, the doc wins until amended (and the next migration should sync).
> Cross-references: `enums.md` for enum values; `rls-rules.md` for RLS policies; `rpc-contracts.md` for which RPCs touch which tables.

---

## 1. Conventions

### 1.1. Naming

- Tables: `snake_case`, plural (`party_sessions`, not `party_session`).
- Columns: `snake_case`, singular (`party_session_id`, not `party_sessions_id`).
- Primary keys: always `id`, type `uuid`, default `gen_random_uuid()`.
- Foreign keys: `<referenced_table_singular>_id` (e.g. `party_session_id` → `party_sessions.id`).
- Timestamps: `<verb>_at` (e.g. `created_at`, `started_at`, `phase_ends_at`).
- Booleans: `<adjective>` or `is_<adjective>` (e.g. `is_locked`, `allow_guests`, `elimination_enabled`).

### 1.2. Common columns

Every table has:

- `id` — `uuid primary key default gen_random_uuid()`
- `created_at` — `timestamptz not null default now()`
- `updated_at` — `timestamptz not null default now()` (triggered to update on every change — see §13)

Soft-delete columns (`deleted_at`) are NOT used. We use status enums for life-cycle tracking instead.

### 1.3. Time

All timestamps are `timestamptz` (with timezone). Server stores UTC; clients format locally. Never use `timestamp without time zone`.

### 1.4. JSON columns

Use `jsonb` (never `json`) when storing structured-but-flexible data. Examples: `admin_action_logs.previous_value` and `new_value`, `session_events.event_data`. These are intentionally untyped at the SQL level; document the expected shape in this doc and in code comments.

### 1.5. Foreign key behavior

Default: `on delete restrict`. Forces explicit cleanup, prevents surprise cascade deletes. Exceptions are called out per table.

### 1.6. Migration file naming

`supabase/migrations/<14-digit-timestamp>_<descriptive_name>.sql`. One logical change per migration. Reference the spec section in a comment at the top.

---

## 2. `party_sessions`

The root table. One row per Shot O'Clock game.

```sql
create table party_sessions (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(name) between 1 and 60),
  join_code                text not null unique check (
    join_code ~ '^[A-HJ-NP-Z2-9]{6}$'  -- 6 chars, no 0/O/I/1
  ),
  join_code_expires_at     timestamptz,
  visibility               party_visibility not null default 'invite_code_only',
  is_locked                boolean not null default false,
  status                   party_status not null default 'lobby',
  current_phase            party_phase not null default 'lobby',
  current_round_number     int not null default 0 check (current_round_number >= 0),
  phase_started_at         timestamptz,
  phase_ends_at            timestamptz,
  paused_at                timestamptz,
  paused_remaining_seconds int check (paused_remaining_seconds >= 0),
  total_paused_seconds     int not null default 0 check (total_paused_seconds >= 0),
  host_player_id           uuid,  -- FK added after party_players exists (circular)
  started_at               timestamptz,
  ended_at                 timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
```

**FK additions (after `party_players` exists):**

```sql
alter table party_sessions
  add constraint party_sessions_host_player_id_fkey
  foreign key (host_player_id) references party_players(id) on delete restrict;
```

**Indexes:**

- `unique (join_code)` — already on the column constraint.
- `index on (status, current_phase)` — used by RLS helpers and admin queries.
- `index on (host_player_id)` — used to find a user's hosted parties.

**Notes:**

- `join_code` regex excludes visually ambiguous characters per `rpc-contracts.md` §2.5. Postgres regex syntax is POSIX; this pattern uses character class.
- `paused_remaining_seconds` is only non-null while `status = paused`. Per `rpc-contracts.md` §10.2 (locked option a), we don't mutate `phase_ends_at` on pause.
- `host_player_id` allows null at the row-create moment (chicken-and-egg with `party_players`); the `create_party` RPC fills it in the same transaction.

---

## 3. `party_settings`

One row per `party_sessions`. Stores the host's chosen rules.

```sql
create table party_settings (
  id                                    uuid primary key default gen_random_uuid(),
  party_session_id                      uuid not null unique references party_sessions(id) on delete cascade,

  -- Timer
  starting_interval_seconds             int not null check (starting_interval_seconds between 10 and 3600),
  interval_increment_seconds            int not null default 0 check (interval_increment_seconds between 0 and 600),
  max_interval_seconds                  int check (max_interval_seconds is null or max_interval_seconds between 10 and 7200),
  shot_window_seconds                   int not null check (shot_window_seconds between 5 and 300),
  referee_confirmation_window_seconds   int not null default 0 check (referee_confirmation_window_seconds between 0 and 300),
  auto_start_next_round                 boolean not null default false,
  auto_start_delay_seconds              int not null default 0 check (auto_start_delay_seconds between 0 and 60),

  -- Game rules
  elimination_enabled                   boolean not null default true,
  grace_mode                            grace_mode not null default 'enabled',
  manual_pardons_enabled                boolean not null default false,
  allow_player_opt_out                  boolean not null default true,
  allow_out_players_as_referees         boolean not null default false,
  allow_host_as_player                  boolean not null default true,

  -- Referee settings (post-MVP, defaults here)
  referee_mode                          referee_mode not null default 'none',
  require_referee_confirmation          boolean not null default false,
  allow_questionable_verdict            boolean not null default false,
  auto_approve_without_referee          boolean not null default true,
  auto_approve_if_all_players_done      boolean not null default true,
  host_review_required                  boolean not null default false,

  -- Admin settings (post-MVP)
  allow_assigned_admins                 boolean not null default false,
  admins_can_pause_timer                boolean not null default false,
  admins_can_add_time                   boolean not null default false,
  admins_can_finalize_rounds            boolean not null default false,
  admins_can_override_outcomes          boolean not null default false,
  admins_can_remove_players             boolean not null default false,

  -- Join settings
  allow_guests                          boolean not null default true,
  require_age_confirmation              boolean not null default true,
  require_terms_acceptance              boolean not null default true,
  allow_late_join                       boolean not null default false,
  lock_party_on_start                   boolean not null default false,
  allow_rejoin                          boolean not null default true,

  -- Alert settings (post-MVP defaults)
  session_sound_mode                    session_sound_mode not null default 'everyone',
  allow_player_sound_override           boolean not null default true,
  pre_shot_warning_enabled              boolean not null default false,
  pre_shot_warning_seconds              int not null default 30 check (pre_shot_warning_seconds between 10 and 300),
  persistent_timer_notification_enabled boolean not null default false,

  created_at                            timestamptz not null default now(),
  updated_at                            timestamptz not null default now()
);
```

**Indexes:**

- `unique (party_session_id)` — already enforced.

**Notes:**

- `on delete cascade` from `party_sessions` is the rare exception to the default `restrict` policy. Settings are tightly coupled to their session — if the session is hard-deleted (currently never happens — we only `end_party`), settings should go with it.
- The vast majority of these columns are defaults for post-MVP features. We keep them in the table because adding columns later is cheap, and the data model match makes future RPCs simpler.

---

## 4. `party_players`

One row per person in a specific party. Separate from any global User concept.

```sql
create table party_players (
  id                          uuid primary key default gen_random_uuid(),
  party_session_id            uuid not null references party_sessions(id) on delete restrict,
  user_id                     uuid not null references auth.users(id) on delete restrict,
  guest_identity_id           uuid,  -- post-MVP; null for MVP
  display_name                text not null check (length(display_name) between 1 and 40),
  avatar_url                  text,

  permission_role             player_permission_role not null default 'player',
  status                      player_status not null default 'active',
  duty                        player_duty not null default 'normal_player',

  out_reason                  out_reason,
  out_round_number            int check (out_round_number is null or out_round_number >= 1),
  out_at                      timestamptz,

  used_grace                  boolean not null default false,
  used_grace_at               timestamptz,
  used_grace_round_number     int check (used_grace_round_number is null or used_grace_round_number >= 1),
  total_missed_rounds         int not null default 0 check (total_missed_rounds >= 0),

  promoted_by_player_id       uuid references party_players(id) on delete set null,
  promoted_at                 timestamptz,
  demoted_at                  timestamptz,

  is_ready                    boolean not null default false,
  joined_at                   timestamptz not null default now(),
  left_at                     timestamptz,
  last_seen_at                timestamptz not null default now(),
  rejoined_at                 timestamptz,

  total_shots_completed       int not null default 0 check (total_shots_completed >= 0),
  total_pardons_received      int not null default 0 check (total_pardons_received >= 0),

  removed_at                  timestamptz,
  removed_by_player_id        uuid references party_players(id) on delete set null,
  removed_reason              text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- One identity per session
  unique (party_session_id, user_id),

  -- Cross-field consistency
  constraint out_fields_consistent check (
    (status = 'out' and out_reason is not null and out_round_number is not null and out_at is not null)
    or (status != 'out' and (out_reason is null or out_reason is not null))  -- allow stale data when not currently out
  ),
  constraint removed_fields_consistent check (
    (status = 'removed' and removed_at is not null)
    or (status != 'removed')
  )
);
```

**Indexes:**

- `unique (party_session_id, user_id)` — declared inline. Critical for RLS helper performance.
- `index on (party_session_id, status)` — fast filtering of "active players in this party."
- `index on (party_session_id, permission_role) where permission_role = 'host'` — partial index for fast host lookup.
- `index on (user_id)` — find all parties for a given user.

**Notes:**

- `user_id` references `auth.users(id)`. With Supabase Anonymous Auth, every device has a row in `auth.users`.
- `guest_identity_id` is reserved for the post-MVP elaborate guest model. In MVP, it's always null.
- `permission_role` + `status` + `duty` are intentionally three separate fields per the locked design (see `game-rules.md` §2 and the planning blueprint).
- The `out_fields_consistent` check is loose on purpose: when a player is reinstated (`status = active`), we leave their `out_reason`/`out_round_number`/`out_at` in place for history rather than clearing. The `host_mark_player_active` RPC clears them; reinstating outside the RPC wouldn't.
- `total_rounds_missed` from the blueprint is renamed to `total_missed_rounds` here for grammar consistency. (Same intent.)

---

## 5. `rounds`

One row per Shot O'Clock cycle in a session.

```sql
create table rounds (
  id                                    uuid primary key default gen_random_uuid(),
  party_session_id                      uuid not null references party_sessions(id) on delete restrict,
  round_number                          int not null check (round_number >= 1),
  interval_seconds                      int not null check (interval_seconds > 0),
  shot_window_seconds                   int not null check (shot_window_seconds > 0),
  referee_confirmation_window_seconds   int not null default 0 check (referee_confirmation_window_seconds >= 0),
  status                                round_status not null default 'scheduled',

  countdown_started_at                  timestamptz,
  countdown_ends_at                     timestamptz,
  shot_window_started_at                timestamptz,
  shot_window_ends_at                   timestamptz,
  referee_window_started_at             timestamptz,
  referee_window_ends_at                timestamptz,
  completed_at                          timestamptz,

  created_at                            timestamptz not null default now(),
  updated_at                            timestamptz not null default now(),

  unique (party_session_id, round_number)
);
```

**Indexes:**

- `unique (party_session_id, round_number)` — declared inline. Guards against duplicate round creation during auto-advance.
- `index on (party_session_id, status)` — fast lookup of current round.

**Notes:**

- The unique constraint on `(party_session_id, round_number)` guards against duplicate round creation during auto-advance (see `rpc-contracts.md` §8.4, §8.8).
- Both `shot_window_started_at` and `shot_window_ends_at` are populated when the round enters `shot_window` phase. `completed_at` is set at finalization.

---

## 6. `round_player_outcomes`

One row per (round, player). Records what each player did and the finalized result.

```sql
create table round_player_outcomes (
  id                          uuid primary key default gen_random_uuid(),
  round_id                    uuid not null references rounds(id) on delete restrict,
  party_session_id            uuid not null references party_sessions(id) on delete restrict,
  party_player_id             uuid not null references party_players(id) on delete restrict,
  round_number                int not null check (round_number >= 1),

  player_action               player_action not null default 'none',
  player_tapped_done_at       timestamptz,
  player_marked_self_out_at   timestamptz,

  referee_verdict             referee_verdict not null default 'not_required',
  referee_verdict_at          timestamptz,
  referee_player_id           uuid references party_players(id) on delete set null,

  final_outcome               final_outcome not null default 'pending',
  finalized_by_player_id      uuid references party_players(id) on delete set null,
  finalized_at                timestamptz,

  grace_applied               boolean not null default false,
  grace_applied_at            timestamptz,
  pardoned                    boolean not null default false,
  pardoned_by_player_id       uuid references party_players(id) on delete set null,
  pardoned_at                 timestamptz,

  status_before_round         player_status,
  status_after_round          player_status,
  eliminated_this_round       boolean not null default false,

  notes                       text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique (round_id, party_player_id)
);
```

**Indexes:**

- `unique (round_id, party_player_id)` — declared inline. Critical for `mark_done` and `mark_self_out` idempotency.
- `index on (party_session_id, round_number)` — fast per-round outcome listing.
- `index on (party_player_id, party_session_id)` — fast per-player history.

**Notes:**

- `referee_verdict` defaults to `not_required` since MVP doesn't use referees.
- `referee_player_id` is null in MVP.
- `party_session_id` is denormalized (also reachable via round → session) for RLS efficiency. Helper functions can check `party_session_id` directly without joining `rounds`.

---

## 7. `admin_action_logs`

Audit log of host/admin actions. Append-only.

```sql
create table admin_action_logs (
  id                       uuid primary key default gen_random_uuid(),
  party_session_id         uuid not null references party_sessions(id) on delete restrict,
  actor_player_id          uuid not null references party_players(id) on delete restrict,
  actor_permission_role    player_permission_role not null,
  affected_player_id       uuid references party_players(id) on delete set null,
  round_id                 uuid references rounds(id) on delete set null,
  round_number             int check (round_number is null or round_number >= 1),
  action_type              admin_action_type not null,
  previous_value           jsonb,
  new_value                jsonb,
  reason                   text,
  created_at               timestamptz not null default now()
);
```

**Indexes:**

- `index on (party_session_id, created_at desc)` — fast retrieval of recent actions for a session.
- `index on (actor_player_id, created_at desc)` — fast retrieval of a host's actions.

**Notes:**

- No `updated_at` — this table is append-only.
- `previous_value` and `new_value` are `jsonb` with shape varying by `action_type`. Document expected shapes in `rpc-contracts.md` per RPC.

---

## 8. `timer_events`

Append-only log of timer-related transitions.

```sql
create table timer_events (
  id                       uuid primary key default gen_random_uuid(),
  party_session_id         uuid not null references party_sessions(id) on delete restrict,
  round_id                 uuid references rounds(id) on delete set null,
  round_number             int check (round_number is null or round_number >= 1),
  event_type               timer_event_type not null,
  previous_phase           party_phase,
  new_phase                party_phase,
  previous_ends_at         timestamptz,
  new_ends_at              timestamptz,
  seconds_added            int,
  triggered_by             triggered_by not null,
  triggered_by_player_id   uuid references party_players(id) on delete set null,
  created_at               timestamptz not null default now()
);
```

**Indexes:**

- `index on (party_session_id, created_at desc)` — fast retrieval.
- `index on (round_id)` — find all events for a round.

**Notes:**

- Append-only, no `updated_at`.
- This table is useful for reconstructing what happened during a session if `party_sessions` state has moved on.

---

## 9. `party_player_notification_settings`

Per-player notification preferences within a session. Mostly post-MVP.

```sql
create table party_player_notification_settings (
  id                                        uuid primary key default gen_random_uuid(),
  party_session_id                          uuid not null references party_sessions(id) on delete restrict,
  party_player_id                           uuid not null references party_players(id) on delete restrict,
  phone_notifications_enabled               boolean not null default false,
  shot_start_notification_enabled           boolean not null default true,
  pre_shot_warning_enabled                  boolean not null default false,
  pre_shot_warning_seconds                  int not null default 30 check (pre_shot_warning_seconds between 10 and 300),
  sound_enabled                             boolean not null default true,
  vibration_enabled                         boolean not null default true,
  notification_only_mode                    boolean not null default false,
  muted                                     boolean not null default false,
  persistent_timer_notification_enabled     boolean not null default false,
  created_at                                timestamptz not null default now(),
  updated_at                                timestamptz not null default now(),

  unique (party_session_id, party_player_id)
);
```

**Notes:**

- Table exists in MVP but no MVP code writes to it. Created so the model is ready when notifications phase lands.
- One row per (session, player). Defaults are sensible.

---

## 10. Reserved / Future Tables

These tables exist in the data model (per planning blueprint Step 3) but have no MVP implementation. **Do NOT create them in MVP migrations.** They are listed here so when the relevant features arrive, the names and shapes are pre-decided.

- `devices` — push token tracking.
- `user_notification_preferences` — global preferences (per user, not per session).
- `terms_acceptances` — legal-age and terms tracking.
- `party_invites` — when invite-list-only parties exist.
- `party_rules_snapshots` — preserve rules text used per party.
- `party_recaps` — generated summary after party ends.
- `player_party_stats` — per-player per-party rollups.
- `party_albums` — media album per party.
- `party_media_items` — individual photos/videos.
- `media_reports` — moderation reports.
- `referee_assignments` — referee monitor assignments.
- `referee_verdicts` — referee call records.
- `session_events` — general session timeline (intentionally NOT used in MVP — would duplicate `timer_events` and `admin_action_logs`).

When implementing any of these, write a fresh spec section here, generate enums (already done in `enums.md`), then write migrations.

---

## 11. Constraints Summary

A compact list of every cross-field check or unique constraint, for quick reference:

| Table | Constraint | Purpose |
|---|---|---|
| `party_sessions` | `unique (join_code)` | One active session per code |
| `party_settings` | `unique (party_session_id)` | One settings row per session |
| `party_players` | `unique (party_session_id, user_id)` | One row per identity per session |
| `rounds` | `unique (party_session_id, round_number)` | Guards against duplicate round creation during auto-advance |
| `round_player_outcomes` | `unique (round_id, party_player_id)` | DB-level idempotency for `mark_done` / `mark_self_out` |
| `party_player_notification_settings` | `unique (party_session_id, party_player_id)` | One row per player per session |

---

## 12. Index Strategy Summary

Most-used indexes, by access pattern:

- **RLS helpers:** `party_players (party_session_id, user_id)` — every RLS check hits this.
- **Phase queries:** `party_sessions (status, current_phase)` — admin and debug views.
- **Roster filtering:** `party_players (party_session_id, status)` — every roster screen.
- **Idempotency:** unique constraints on `rounds` and `round_player_outcomes`.
- **Audit retrieval:** `admin_action_logs (party_session_id, created_at desc)`.

Add indexes proactively where you can predict the query pattern. Don't over-index — every index slows writes.

---

## 13. `updated_at` Triggers

Every table with an `updated_at` column has a trigger that updates it on every UPDATE. One generic function, one trigger per table:

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

Per table:

```sql
create trigger set_updated_at_party_sessions
before update on party_sessions
for each row
execute function public.set_updated_at();
```

Tables that get this trigger (every table with `updated_at`):

- `party_sessions`
- `party_settings`
- `party_players`
- `rounds`
- `round_player_outcomes`
- `party_player_notification_settings`

`admin_action_logs` and `timer_events` are append-only and do NOT get this trigger.

---

## 14. Migration Ordering

The first MVP migration creates the foundation in this order (single migration file, but ordered statements):

1. Enable extensions: `create extension if not exists "pgcrypto";` (for `gen_random_uuid`).
2. Create all enums (see `enums.md` §3).
3. Create `party_sessions` (without `host_player_id` FK).
4. Create `party_settings` (FK to `party_sessions`).
5. Create `party_players` (FK to `party_sessions`).
6. Add FK from `party_sessions.host_player_id` to `party_players.id` (now that both exist).
7. Create `rounds`.
8. Create `round_player_outcomes`.
9. Create `admin_action_logs`.
10. Create `timer_events`.
11. Create `party_player_notification_settings`.
12. Create the `set_updated_at` function.
13. Create the `updated_at` triggers.
14. Enable RLS on every user-facing table.
15. Create RLS helper functions (per `rls-rules.md` §12).
16. Create RLS policies (per `rls-rules.md`).

Subsequent migrations add RPC functions (per `rpc-contracts.md`), each in its own migration file.

---

## 15. Open Questions

(None currently. Add as they arise.)
