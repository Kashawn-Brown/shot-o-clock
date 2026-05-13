-- ============================================================================
-- Initial schema migration for Shot O'Clock MVP.
--
-- References:
--   docs/specs/schema.md §14 (migration ordering)
--   docs/specs/enums.md  §3  (all enum definitions, every value)
--
-- Scope: extensions, enums, the set_updated_at() trigger function, all 8 MVP
-- tables, indexes, and updated_at triggers. RLS enablement, helpers, and
-- policies live in a separate migration (see #D008 in docs/KNOWN_ISSUES.md).
--
-- Idempotency: every statement is guarded so re-applying this migration to an
-- already-applied database is a no-op rather than an error. The Phase 1
-- acceptance criterion is "supabase db reset succeeds" + "migrations are
-- idempotent" — both are satisfied.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";


-- ---------------------------------------------------------------------------
-- 2. Enums (per docs/specs/enums.md §3, declaration order)
--    Every value is included, including post-MVP reserved values per
--    enums.md §3 tables.
-- ---------------------------------------------------------------------------

do $$ begin
  create type party_status as enum (
    'lobby', 'active', 'paused', 'ended', 'expired', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type party_phase as enum (
    'lobby', 'countdown', 'shot_window', 'referee_confirmation',
    'host_review', 'round_complete', 'ended'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type player_permission_role as enum ('host', 'admin', 'player');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type player_status as enum ('active', 'out', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type player_duty as enum (
    'normal_player', 'assigned_monitor', 'referee_pool', 'spectator'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type grace_mode as enum ('disabled', 'enabled', 'unlimited');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type referee_mode as enum ('none', 'assigned_monitor', 'referee_pool');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type round_status as enum (
    'scheduled', 'countdown', 'shot_window', 'referee_confirmation',
    'host_review', 'completed', 'skipped', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type player_action as enum ('none', 'done', 'self_out', 'missed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type final_outcome as enum (
    'pending', 'completed', 'missed', 'grace_used',
    'pardoned', 'out', 'self_out', 'overridden'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type out_reason as enum (
    'missed_round', 'self_opted_out', 'host_marked_out',
    'missed_after_grace', 'left_game'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type referee_verdict as enum (
    'pending', 'confirmed', 'missed', 'questionable', 'not_required'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type assignment_type as enum ('assigned_monitor', 'referee_pool_claim');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type assignment_status as enum (
    'assigned', 'completed', 'skipped', 'expired'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type admin_action_type as enum (
    'pause_timer', 'resume_timer', 'add_time', 'skip_to_shot_window',
    'end_shot_window', 'finalize_round', 'override_outcome',
    'mark_player_out', 'mark_player_active', 'reinstate_player',
    'give_pardon', 'remove_pardon', 'reset_grace_used', 'remove_player',
    'promote_admin', 'demote_admin', 'lock_party', 'unlock_party',
    'transfer_host', 'end_party'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type timer_event_type as enum (
    'countdown_started', 'shot_window_started', 'referee_window_started',
    'timer_paused', 'timer_resumed', 'time_added',
    'phase_skipped', 'round_completed', 'next_round_started'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type triggered_by as enum ('system', 'host', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type device_platform as enum ('ios', 'android', 'web');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_permission_status as enum (
    'granted', 'denied', 'provisional', 'unknown'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type alert_mode as enum (
    'sound', 'vibration', 'notification_only', 'muted'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type session_sound_mode as enum (
    'host_only', 'everyone', 'muted', 'vibration_only'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type party_visibility as enum ('invite_code_only', 'private');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type album_visibility as enum (
    'party_only', 'host_only', 'shared_link'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type media_type as enum ('photo', 'video');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type moderation_status as enum (
    'visible', 'pending_review', 'removed', 'reported'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type media_report_reason as enum (
    'inappropriate', 'privacy', 'harassment', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type media_report_status as enum (
    'open', 'reviewed', 'dismissed', 'action_taken'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type removed_player_reason as enum (
    'host_kicked', 'self_left_lobby', 'inactive', 'other'
  );
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 3. set_updated_at() trigger function
--    Hoisted before table creation so each table's updated_at trigger can be
--    attached in the same block as the table. Per docs/specs/schema.md §13.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. party_sessions  (per schema.md §2)
--    host_player_id FK is added in step 7 once party_players exists.
-- ---------------------------------------------------------------------------

create table if not exists party_sessions (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(name) between 1 and 60),
  join_code                text not null unique check (
    join_code ~ '^[A-HJ-NP-Z2-9]{6}$'  -- 6 chars; excludes 0/O/I/1 per rpc-contracts.md §2.5
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
  host_player_id           uuid,  -- FK added below after party_players exists
  started_at               timestamptz,
  ended_at                 timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_party_sessions_status_phase
  on party_sessions (status, current_phase);

create index if not exists idx_party_sessions_host_player_id
  on party_sessions (host_player_id);

drop trigger if exists set_updated_at_party_sessions on party_sessions;
create trigger set_updated_at_party_sessions
  before update on party_sessions
  for each row
  execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 5. party_settings  (per schema.md §3)
--    on delete cascade is the intentional exception to the project-wide
--    on delete restrict default — settings are tightly coupled to their
--    session (schema.md §3 notes).
-- ---------------------------------------------------------------------------

create table if not exists party_settings (
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

  -- Referee settings (post-MVP defaults)
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

drop trigger if exists set_updated_at_party_settings on party_settings;
create trigger set_updated_at_party_settings
  before update on party_settings
  for each row
  execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 6. party_players  (per schema.md §4)
--    Self-FKs (promoted_by_player_id, removed_by_player_id) resolve within
--    CREATE TABLE because the table name exists once the statement is parsed.
-- ---------------------------------------------------------------------------

create table if not exists party_players (
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

  -- One identity per session.
  unique (party_session_id, user_id),

  -- Cross-field consistency. The second clause of each check is intentionally
  -- tautological: when a player is reinstated (status != 'out'), we leave the
  -- prior out_* fields in place for history rather than clearing them. See
  -- schema.md §4 notes for the rationale.
  constraint out_fields_consistent check (
    (status = 'out' and out_reason is not null and out_round_number is not null and out_at is not null)
    or (status != 'out' and (out_reason is null or out_reason is not null))
  ),
  constraint removed_fields_consistent check (
    (status = 'removed' and removed_at is not null)
    or (status != 'removed')
  )
);

create index if not exists idx_party_players_session_status
  on party_players (party_session_id, status);

-- Partial index for fast host lookup (one host per session in MVP).
create index if not exists idx_party_players_session_host
  on party_players (party_session_id, permission_role)
  where permission_role = 'host';

create index if not exists idx_party_players_user_id
  on party_players (user_id);

drop trigger if exists set_updated_at_party_players on party_players;
create trigger set_updated_at_party_players
  before update on party_players
  for each row
  execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. Deferred FK: party_sessions.host_player_id -> party_players(id)
--    Wrapped in a DO block because ADD CONSTRAINT has no IF NOT EXISTS form;
--    the exception swallow keeps the migration idempotent.
-- ---------------------------------------------------------------------------

do $$ begin
  alter table party_sessions
    add constraint party_sessions_host_player_id_fkey
    foreign key (host_player_id) references party_players(id) on delete restrict;
exception
  when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 8. rounds  (per schema.md §5)
-- ---------------------------------------------------------------------------

create table if not exists rounds (
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

  -- DB-level idempotency for start_next_round (rpc-contracts.md §9.6).
  unique (party_session_id, round_number)
);

create index if not exists idx_rounds_session_status
  on rounds (party_session_id, status);

drop trigger if exists set_updated_at_rounds on rounds;
create trigger set_updated_at_rounds
  before update on rounds
  for each row
  execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 9. round_player_outcomes  (per schema.md §6)
--    party_session_id is denormalized for RLS efficiency (schema.md §6 notes).
-- ---------------------------------------------------------------------------

create table if not exists round_player_outcomes (
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

  -- DB-level idempotency for mark_done / mark_self_out.
  unique (round_id, party_player_id)
);

create index if not exists idx_outcomes_session_round
  on round_player_outcomes (party_session_id, round_number);

create index if not exists idx_outcomes_player_session
  on round_player_outcomes (party_player_id, party_session_id);

drop trigger if exists set_updated_at_round_player_outcomes on round_player_outcomes;
create trigger set_updated_at_round_player_outcomes
  before update on round_player_outcomes
  for each row
  execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 10. admin_action_logs  (per schema.md §7)
--     Append-only — no updated_at column, no updated_at trigger.
-- ---------------------------------------------------------------------------

create table if not exists admin_action_logs (
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

create index if not exists idx_admin_action_logs_session_created
  on admin_action_logs (party_session_id, created_at desc);

create index if not exists idx_admin_action_logs_actor_created
  on admin_action_logs (actor_player_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 11. timer_events  (per schema.md §8)
--     Append-only — no updated_at column, no updated_at trigger.
-- ---------------------------------------------------------------------------

create table if not exists timer_events (
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

create index if not exists idx_timer_events_session_created
  on timer_events (party_session_id, created_at desc);

create index if not exists idx_timer_events_round
  on timer_events (round_id);


-- ---------------------------------------------------------------------------
-- 12. party_player_notification_settings  (per schema.md §9)
--     Exists in MVP for shape compatibility; no MVP code writes to it.
-- ---------------------------------------------------------------------------

create table if not exists party_player_notification_settings (
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

drop trigger if exists set_updated_at_party_player_notification_settings
  on party_player_notification_settings;
create trigger set_updated_at_party_player_notification_settings
  before update on party_player_notification_settings
  for each row
  execute function public.set_updated_at();
