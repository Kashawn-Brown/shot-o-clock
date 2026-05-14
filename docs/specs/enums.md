# Enums

> Every Postgres enum used in the Shot O'Clock schema, with locked values.
> When this doc and schema disagree, the doc wins until amended.
> Cross-references: `schema.md` for which tables use each enum; `mvp-state-machine.md` and `game-rules.md` for behavioral meaning.

---

## 1. Why Enums

Postgres enums give us:

- Type safety at the database level (invalid values are rejected on write).
- Indexed equality checks (smaller than text, faster than text comparisons).
- A single source of truth — TypeScript types are generated from these.

Trade-offs:

- Adding a value requires `ALTER TYPE ... ADD VALUE` in a migration. Removing or renaming requires more work (rename via swap-table pattern, since `ALTER TYPE ... DROP VALUE` isn't supported in Postgres).
- We accept this friction in exchange for the safety.

---

## 2. TypeScript Mirror

Every enum below has a matching TypeScript union type in `src/types/db.ts`. Drift between the two is a recurring bug source. Two enforcement mechanisms:

1. **Generated types.** Run `supabase gen types typescript` after each migration; commit the result. The generated file is the source of truth for the TS side.
2. **Manual review.** When adding an enum value, the same commit must update generated types or fail CI.

---

## 3. The Enums

### 3.1. `party_status`

Coarse session state. See `mvp-state-machine.md` §2.

```sql
create type party_status as enum (
  'lobby',
  'active',
  'paused',
  'ended',
  'expired',
  'cancelled'
);
```

| Value | Meaning | MVP-used? |
|---|---|---|
| `lobby` | Pre-game; players joining. | Yes |
| `active` | Game in progress. | Yes |
| `paused` | Frozen by host. | Yes |
| `ended` | Manually ended. Terminal. | Yes |
| `expired` | Auto-closed after inactivity. Terminal. | Post-MVP |
| `cancelled` | Host cancelled before starting. Terminal. | Post-MVP |

`expired` and `cancelled` exist in the enum so we don't need to alter the type later, but no MVP code transitions to them.

---

### 3.2. `party_phase`

Fine-grained phase within an active session. See `mvp-state-machine.md` §3.

```sql
create type party_phase as enum (
  'lobby',
  'countdown',
  'shot_window',
  'referee_confirmation',
  'host_review',
  'round_complete',
  'ended'
);
```

| Value | Meaning | MVP-used? |
|---|---|---|
| `lobby` | Same as the lobby status. | Yes |
| `countdown` | Counting down to a shot. | Yes |
| `shot_window` | Shot is happening; players act. | Yes |
| `referee_confirmation` | Referees confirm shots. | Post-MVP |
| `host_review` | Host reviewing outcomes before next round. | Post-MVP |
| `round_complete` | Round outcomes finalized; awaiting next round. | Yes |
| `ended` | Same as the ended status. | Yes |

The two post-MVP values are reserved for the referee feature.

---

### 3.3. `player_permission_role`

What the player can do at the management level.

```sql
create type player_permission_role as enum (
  'host',
  'admin',
  'player'
);
```

| Value | Meaning | MVP-used? |
|---|---|---|
| `host` | Created the party; full control. Exactly one per session in MVP. | Yes |
| `admin` | Promoted by host; subset of host controls. | Post-MVP |
| `player` | Regular participant. | Yes |

In MVP, no party_players row has `permissionRole = admin`. The value exists for future use.

---

### 3.4. `player_status`

Whether the player is in the game. See `game-rules.md` §2.

```sql
create type player_status as enum (
  'active',
  'out',
  'removed'
);
```

| Value | Meaning |
|---|---|
| `active` | In the game; can act. |
| `out` | No longer playing; visible (greyed) in roster. |
| `removed` | Kicked or self-left; hidden from regular views. |

---

### 3.5. `player_duty`

What role the player serves *within* their status. Separate from permissionRole. See `game-rules.md` §2 and the locked design decision in the planning blueprint.

```sql
create type player_duty as enum (
  'normal_player',
  'assigned_monitor',
  'referee_pool',
  'spectator'
);
```

| Value | Meaning | MVP-used? |
|---|---|---|
| `normal_player` | Default. Plays the game. | Yes |
| `assigned_monitor` | Has a specific person to verify. | Post-MVP |
| `referee_pool` | Verifies anyone from a shared list. | Post-MVP |
| `spectator` | Watches without participating. | Post-MVP |

Every party_players row in MVP has `duty = normal_player`.

---

### 3.6. `grace_mode`

The party's grace setting. See `game-rules.md` §4.

```sql
create type grace_mode as enum (
  'disabled',
  'enabled',
  'unlimited'
);
```

| Value | Meaning |
|---|---|
| `disabled` | Miss once and you're out. |
| `enabled` | First miss is forgiven. |
| `unlimited` | Misses tracked, no auto-out. |

UI labels (per blueprint Step 5): "No Grace" / "Grace" / "Unlimited Grace".

---

### 3.7. `referee_mode`

Whether and how referees are used. Post-MVP.

```sql
create type referee_mode as enum (
  'none',
  'assigned_monitor',
  'referee_pool'
);
```

All MVP parties have `refereeMode = none`. Value exists for future use.

---

### 3.8. `round_status`

State of an individual round. See `mvp-state-machine.md` for the matching session-level phases.

```sql
create type round_status as enum (
  'scheduled',
  'countdown',
  'shot_window',
  'referee_confirmation',
  'host_review',
  'completed',
  'skipped',
  'cancelled'
);
```

| Value | MVP-used? |
|---|---|
| `scheduled` | Yes (very briefly, between round creation and countdown start — usually skipped) |
| `countdown` | Yes |
| `shot_window` | Yes |
| `referee_confirmation` | Post-MVP |
| `host_review` | Post-MVP |
| `completed` | Yes |
| `skipped` | Reserved (not used in MVP) |
| `cancelled` | Yes (when `end_party` is called mid-round, the in-flight round is marked cancelled) |

---

### 3.9. `player_action`

What a player did during a round. Recorded on `round_player_outcomes`. See `game-rules.md` §3.

```sql
create type player_action as enum (
  'none',
  'done',
  'self_out',
  'missed'
);
```

| Value | Meaning |
|---|---|
| `none` | Default before any action. Outcome row may exist with this if pre-created for an active player. |
| `done` | Player tapped Done during shot window. |
| `self_out` | Player tapped I'm Out. |
| `missed` | Player took no action by finalization time. |

---

### 3.10. `final_outcome`

The finalized result for a player in a round, after grace logic. See `game-rules.md` §7.

```sql
create type final_outcome as enum (
  'pending',
  'completed',
  'missed',
  'grace_used',
  'pardoned',
  'out',
  'self_out',
  'overridden'
);
```

| Value | When | MVP-used? |
|---|---|---|
| `pending` | Outcome row exists but round isn't finalized yet. | Yes |
| `completed` | Player tapped Done; counts as shot taken. | Yes |
| `missed` | Player missed; consequences depend on grace mode. | Yes |
| `grace_used` | Player missed; first-miss forgiveness applied. | Yes |
| `pardoned` | Host gave a manual pardon. | Post-MVP |
| `out` | Player is now out as a result of this round. | Yes |
| `self_out` | Player marked themselves out. | Yes |
| `overridden` | Host changed the outcome manually. | Post-MVP (no `host_override_outcome` RPC in MVP) |

---

### 3.11. `out_reason`

Why a player went `out`. Stored on `party_players.outReason`.

```sql
create type out_reason as enum (
  'missed_round',
  'self_opted_out',
  'host_marked_out',
  'missed_after_grace',
  'left_game'
);
```

| Value | When |
|---|---|
| `missed_round` | Missed a round in `disabled` grace mode. |
| `self_opted_out` | Player tapped I'm Out. |
| `host_marked_out` | Host used `host_mark_player_out`. |
| `missed_after_grace` | Missed a round having already used grace (in `enabled` mode). |
| `left_game` | Reserved for future use (currently we use `removed` status instead). |

---

### 3.12. `referee_verdict`

Referee's call on a player's shot. Post-MVP.

```sql
create type referee_verdict as enum (
  'pending',
  'confirmed',
  'missed',
  'questionable',
  'not_required'
);
```

Reserved entirely for the referee feature.

---

### 3.13. `assignment_type`

How a referee was assigned. Post-MVP.

```sql
create type assignment_type as enum (
  'assigned_monitor',
  'referee_pool_claim'
);
```

Reserved.

---

### 3.14. `assignment_status`

Status of a referee assignment. Post-MVP.

```sql
create type assignment_status as enum (
  'assigned',
  'completed',
  'skipped',
  'expired'
);
```

Reserved.

---

### 3.15. `admin_action_type`

What action a host or admin took. Logged in `admin_action_logs`. See `rpc-contracts.md` for which RPCs log which action.

```sql
create type admin_action_type as enum (
  'pause_timer',
  'resume_timer',
  'add_time',
  'skip_to_shot_window',
  'end_shot_window',
  'finalize_round',
  'override_outcome',
  'mark_player_out',
  'mark_player_active',
  'reinstate_player',
  'give_pardon',
  'remove_pardon',
  'reset_grace_used',
  'remove_player',
  'promote_admin',
  'demote_admin',
  'lock_party',
  'unlock_party',
  'transfer_host',
  'end_party'
);
```

MVP-used: `pause_timer`, `resume_timer`, `add_time`, `skip_to_shot_window`, `end_shot_window`, `finalize_round`, `override_outcome` (via `mark_self_out` overriding prior Done), `mark_player_out`, `mark_player_active`, `remove_player`, `end_party`.

Reserved for post-MVP: `reinstate_player` (distinct from `mark_player_active`, used for the more elaborate post-MVP reinstatement flow), `give_pardon`, `remove_pardon`, `reset_grace_used`, `promote_admin`, `demote_admin`, `lock_party`, `unlock_party`, `transfer_host`.

---

### 3.16. `timer_event_type`

Discrete timer-related events. Logged in `timer_events`.

```sql
create type timer_event_type as enum (
  'countdown_started',
  'shot_window_started',
  'referee_window_started',
  'timer_paused',
  'timer_resumed',
  'time_added',
  'phase_skipped',
  'round_completed',
  'round_cancelled',
  'next_round_started'
);
```

MVP-used: all except `referee_window_started`. `round_cancelled` was added in Phase 2 Batch B2 so `end_party` can emit a semantically accurate event when killing an in-flight round (distinct from `round_completed`, which signals a finalized round). See `docs/KNOWN_ISSUES.md` #D012 (g).

---

### 3.17. `triggered_by`

Who or what caused a timer event. Used in `timer_events.triggeredBy`.

```sql
create type triggered_by as enum (
  'system',
  'host',
  'admin'
);
```

`admin` is reserved (no admins in MVP). MVP values: `system`, `host`.

---

### 3.18. `device_platform`

Platform a device runs on. Used in `devices` (post-MVP push notifications).

```sql
create type device_platform as enum (
  'ios',
  'android',
  'web'
);
```

Reserved entirely for post-MVP. Table exists but is unused.

---

### 3.19. `notification_permission_status`

OS-level notification permission state. Post-MVP.

```sql
create type notification_permission_status as enum (
  'granted',
  'denied',
  'provisional',
  'unknown'
);
```

Reserved.

---

### 3.20. `alert_mode`

Per-user notification alert preference. Post-MVP.

```sql
create type alert_mode as enum (
  'sound',
  'vibration',
  'notification_only',
  'muted'
);
```

Reserved.

---

### 3.21. `session_sound_mode`

Host-level session sound preference. Post-MVP.

```sql
create type session_sound_mode as enum (
  'host_only',
  'everyone',
  'muted',
  'vibration_only'
);
```

Reserved.

---

### 3.22. `visibility`

Visibility setting for party sessions (currently only one MVP option).

```sql
create type party_visibility as enum (
  'invite_code_only',
  'private'
);
```

All MVP parties use `invite_code_only`. `private` is reserved for future "no code, invite-list-only" parties.

---

### 3.23. `album_visibility`

Visibility setting for party media albums. Post-MVP.

```sql
create type album_visibility as enum (
  'party_only',
  'host_only',
  'shared_link'
);
```

Reserved.

---

### 3.24. `media_type`

Type of media item in an album. Post-MVP.

```sql
create type media_type as enum (
  'photo',
  'video'
);
```

Reserved.

---

### 3.25. `moderation_status`

State of a media item's moderation. Post-MVP.

```sql
create type moderation_status as enum (
  'visible',
  'pending_review',
  'removed',
  'reported'
);
```

Reserved.

---

### 3.26. `media_report_reason`

Reason a media item was reported. Post-MVP.

```sql
create type media_report_reason as enum (
  'inappropriate',
  'privacy',
  'harassment',
  'other'
);
```

Reserved.

---

### 3.27. `media_report_status`

State of a media report. Post-MVP.

```sql
create type media_report_status as enum (
  'open',
  'reviewed',
  'dismissed',
  'action_taken'
);
```

Reserved.

---

### 3.28. `removed_player_reason`

Free-text alternative is also allowed, but enum captures common cases.

```sql
create type removed_player_reason as enum (
  'host_kicked',
  'self_left_lobby',
  'inactive',
  'other'
);
```

MVP-used: `host_kicked`, `self_left_lobby`. Others reserved.

---

## 4. Migration Strategy for Enums

### 4.1. Adding a value

Postgres allows `ALTER TYPE name ADD VALUE 'new_value'`. Each addition gets its own migration. Migrations must be idempotent — wrap in a check:

```sql
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'new_value'
      and enumtypid = 'public.enum_name'::regtype
  ) then
    alter type public.enum_name add value 'new_value';
  end if;
end$$;
```

### 4.2. Renaming a value

Use `ALTER TYPE name RENAME VALUE 'old' TO 'new'` (Postgres 10+). Idempotency check:

```sql
do $$
begin
  if exists (
    select 1 from pg_enum
    where enumlabel = 'old'
      and enumtypid = 'public.enum_name'::regtype
  ) then
    alter type public.enum_name rename value 'old' to 'new';
  end if;
end$$;
```

After renaming, regenerate TS types in the same commit.

### 4.3. Removing a value

Postgres does NOT support dropping enum values directly. Process:

1. Migrate data: update any rows using the value to a different value.
2. Create a new enum without the value.
3. Alter all columns using the old enum to use the new enum.
4. Drop the old enum.

This is heavy. Avoid removing values in MVP. If a value is no longer used, leave it in place and document it as deprecated.

---

## 5. Index Strategy

Postgres enums are stored as 4-byte integers internally, so equality comparisons are fast and indexable. Index any enum column used in WHERE clauses or RLS policies. Specific index recommendations are in `schema.md` per table.

---

## 6. Open Questions

(None currently.)
