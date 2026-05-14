# RPC Contracts

> The complete API surface for MVP. Every state-mutating action goes through one of these functions.
> When this doc and code disagree, the doc wins until the doc is amended.
> Cross-references: `mvp-state-machine.md` for when each RPC is legal; `game-rules.md` for what each RPC's effects mean; `rls-rules.md` for who can read the underlying tables; `schema.md` for table shapes.

---

## 1. Scope and Conventions

This spec covers all MVP Postgres functions exposed as Supabase RPCs. Post-MVP RPCs (referee verdicts, monitor assignments, admin promotion, media uploads) are not included here — they will be added when those features are built.

### 1.1. Function language and security

- All MVP RPCs use `LANGUAGE plpgsql` unless specifically noted otherwise.
- All MVP RPCs use `SECURITY DEFINER` so they can perform privileged operations (cross-table writes, audit log inserts) without granting those table-level rights to the user. RLS is enforced *inside* the function by explicit checks, NOT by `SECURITY INVOKER`.
- All RPCs must check the caller's identity via `auth.uid()` and resolve the caller's `party_players` row before acting. Functions do not trust client-supplied actor IDs.

### 1.2. Naming and signatures

- RPC names are snake_case verbs: `create_party`, `mark_done`, `host_pause_timer`.
- Parameters are also snake_case.
- Every RPC returns a structured result, not a bare value. The return type is either a single row (for create/get) or a JSON object with status + data + error fields.

### 1.3. Standard return shape

All RPCs return a single row (or JSONB) with this shape:

```sql
ok         boolean       -- true on success, false on handled error
error_code text          -- null on success; one of the codes in §15
error_msg  text          -- null on success; human-readable explanation
data       jsonb         -- null on error; the result payload on success
```

This means **RPCs do not raise exceptions for handled error cases.** A failed precondition returns `(ok=false, error_code=...)`. Exceptions are reserved for unexpected failures (constraint violations, infrastructure errors) and will surface as Postgres errors to the client.

### 1.4. Idempotency

Where stated, RPCs are idempotent. Idempotency is enforced at two layers: (a) unique constraints in the schema and (b) explicit checks inside the function. Both are required.

### 1.5. Error codes

A complete list of error codes is in §15. RPCs only return error codes from that list. Adding a new code requires updating both this doc and `src/types/api.ts`.

### 1.6. Time

All timestamps use `now()` (the server's transaction time). The client does not supply timestamps. Display calculations on the client use `phaseEndsAt - serverNow()` where `serverNow` is fetched periodically.

---

## 2. `create_party`

Creates a new party session in the `lobby` phase. The caller becomes the host.

### 2.1. Signature

```sql
create_party(
  p_party_name              text,
  p_starting_interval_secs  int,
  p_interval_increment_secs int,
  p_shot_window_secs        int,
  p_elimination_enabled     boolean,
  p_grace_mode              grace_mode,
  p_host_display_name       text
) returns jsonb
```

### 2.2. Caller requirements

- Caller is authenticated via Supabase Anonymous Auth (or full auth) — `auth.uid()` is not null.
- Caller does not already host an open party — defined as a party whose `status` is one of `lobby`, `active`, or `paused`. A `paused` party is mid-game with a host, so opening a second party while paused is also blocked. (Optional MVP guard; can be relaxed later. **Locked: enforce for MVP.** See `docs/KNOWN_ISSUES.md` #D011 for the rationale behind including `paused`.)

### 2.3. Parameter validation

- `p_party_name`: non-empty, length 1–60.
- `p_starting_interval_secs`: between 10 and 3600.
- `p_interval_increment_secs`: between 0 and 600.
- `p_shot_window_secs`: between 5 and 300.
- `p_grace_mode`: one of the enum values (`disabled`, `enabled`, `unlimited`).
- `p_host_display_name`: non-empty, length 1–40.

Any violation returns `error_code = INVALID_PARAM` with `error_msg` naming the offending field.

### 2.4. Effects (single transaction)

1. Insert a `party_sessions` row with `status = lobby`, `currentPhase = lobby`, `currentRoundNumber = 0`, a freshly generated `joinCode` (see §2.5).
2. Insert a `party_settings` row keyed to the session with the supplied settings and defaults for other fields.
3. Insert a `party_players` row for the host with `permissionRole = host`, `status = active`, `duty = normal_player`, `displayName = p_host_display_name`.
4. Update the session's `hostPlayerId` to the host row's id.

### 2.5. Join code generation

- 6 uppercase alphanumeric characters, excluding visually ambiguous chars (`0`, `O`, `I`, `1`). The 32-character alphabet is `A-H`, `J-N`, `P-Z`, `2-9` and is enforced by the regex check on `party_sessions.join_code` (see `schema.md` §2).
- Uniqueness is enforced at the schema level by a column-level `unique (join_code)` constraint on `party_sessions`. The constraint applies across **all** session statuses including `ended`, `expired`, and `cancelled` — a join code is permanently consumed once a session has used it. The 32^6 ≈ 1B address space is sufficient that permanent consumption is not a scaling concern for MVP. See `docs/KNOWN_ISSUES.md` #D011 for the rationale behind matching the spec to the stricter schema rather than loosening the schema.
- On collision, regenerate up to 5 times. If all 5 attempts collide (vanishingly rare), fail with `JOIN_CODE_COLLISION` — the client may retry.

### 2.6. Returns

On success:

```json
{
  "ok": true,
  "data": {
    "party_session_id": "uuid",
    "join_code": "ABC23X",
    "host_player_id": "uuid"
  }
}
```

On failure: standard error shape with one of `INVALID_PARAM`, `ALREADY_HOSTING`, `JOIN_CODE_COLLISION`.

### 2.7. Idempotency

NOT idempotent — calling twice creates two parties. Clients should disable the Create button while the call is in flight.

---

## 3. `join_party`

A guest joins an existing party in the `lobby` phase.

### 3.1. Signature

```sql
join_party(
  p_join_code     text,
  p_display_name  text
) returns jsonb
```

### 3.2. Caller requirements

- Caller is authenticated.
- Caller is not already a `party_players` row in this session with `status ∈ {active, out}`. (If they are: this becomes a reconnect — see §3.6.)

### 3.3. Parameter validation

- `p_join_code`: 6 uppercase alphanumeric chars from the allowed alphabet.
- `p_display_name`: non-empty, length 1–40.

### 3.4. Preconditions

These preconditions apply to the **new-join path only**. The reconnect path (§3.6) short-circuits them: if the caller already has a `party_players` row in this session with `status ∈ {active, out}`, the reconnect branch runs and bypasses the status and lock checks below. The session-existence check applies to both paths. The `removed` case is handled entirely by §3.6.

- Session with this `joinCode` exists. Returns `JOIN_CODE_NOT_FOUND` otherwise. (Applies to both paths.)
- **New-join path only:** Session `status = lobby` (cannot join an `active`, `paused`, or `ended` party in MVP — `allowLateJoin` is false). Returns `PARTY_NOT_JOINABLE` otherwise.
- **New-join path only:** Session `isLocked = false`. Returns `PARTY_LOCKED` otherwise.

See `docs/KNOWN_ISSUES.md` #D011 for why §3.6 is documented as short-circuiting these preconditions.

### 3.5. Effects

1. Insert a `party_players` row with `permissionRole = player`, `status = active`, `duty = normal_player`, `displayName = p_display_name`, `joinedAt = now()`.

### 3.6. Reconnect path

If the caller already has a `party_players` row for this session with `status ∈ {active, out}`:

- Do NOT create a new row.
- Update `lastSeenAt = now()`, `rejoinedAt = now()`.
- Return the existing row's id (treat the call as a successful reconnect).
- `displayName` is NOT updated on reconnect (preserve original).

If the caller's existing row has `status = removed`: return `PLAYER_REMOVED`.

### 3.7. Returns

On success:

```json
{
  "ok": true,
  "data": {
    "party_session_id": "uuid",
    "party_player_id": "uuid",
    "is_reconnect": true | false
  }
}
```

Errors: `JOIN_CODE_NOT_FOUND`, `PARTY_NOT_JOINABLE`, `PARTY_LOCKED`, `PLAYER_REMOVED`, `INVALID_PARAM`.

### 3.8. Idempotency

Idempotent via §3.6 — second call by same caller returns the same row.

---

## 4. `leave_party`

A player leaves a party in lobby. Different from `host_remove_player` (which is host-initiated) and from going `out` (which is in-game).

### 4.1. Signature

```sql
leave_party(p_party_session_id uuid) returns jsonb
```

### 4.2. Caller requirements

- Caller is a `party_players` row in the session.
- Caller is NOT the host. (Host cannot leave — they must call `end_party`. Returns `HOST_CANNOT_LEAVE`.)

### 4.3. Preconditions

- Session `currentPhase = lobby`. Players cannot leave a started game in MVP (they must use `mark_self_out` instead). Returns `ILLEGAL_TRANSITION`.

### 4.4. Effects

1. Update caller's `party_players` row: `status = removed`, `leftAt = now()`, `removedAt = now()`, `removedReason = 'self_left_lobby'`. (Both `leftAt` and `removedAt` are required — the schema's `removed_fields_consistent` CHECK constraint mandates `removed_at NOT NULL` whenever `status = 'removed'`. See `docs/KNOWN_ISSUES.md` #D012 (a).)

### 4.5. Returns

On success:

```json
{
  "ok": true,
  "data": {}
}
```

The `data` field is an empty object on success — the call carries no payload beyond the ok flag. See `docs/KNOWN_ISSUES.md` #D012 (b).

Errors: `NOT_IN_PARTY`, `HOST_CANNOT_LEAVE`, `ILLEGAL_TRANSITION`, `PLAYER_REMOVED` (per §4.6's distinction between self-left and host-removed; see #D013).

### 4.6. Idempotency

Idempotent for the self-left case only. Distinguish on `removed_reason`:

- Existing row has `status = 'removed'` AND `removed_reason = 'self_left_lobby'`: return `{ ok: true, data: {} }` (idempotent re-leave).
- Existing row has `status = 'removed'` AND `removed_reason != 'self_left_lobby'` (i.e. caller was kicked by the host via `host_remove_player`): return `PLAYER_REMOVED`. The two cases produce different player-facing UX downstream — see `docs/KNOWN_ISSUES.md` #D013.

---

## 5. `start_game`

Host transitions the party from `lobby` to `countdown`, creating round 1.

### 5.1. Signature

```sql
start_game(p_party_session_id uuid) returns jsonb
```

### 5.2. Caller requirements

- Caller has `permissionRole = host` for this session.

### 5.3. Preconditions

- Session `status = lobby` AND `currentPhase = lobby`. Returns `ILLEGAL_TRANSITION` otherwise (handles re-entry / already-started).
- Session has at least one `party_players` row with `status = active`. Returns `NO_ACTIVE_PLAYERS` otherwise.

### 5.4. Effects (single transaction)

1. Insert a `rounds` row with `roundNumber = 1`, `status = countdown`, `intervalSeconds = startingIntervalSeconds`, `countdownStartedAt = now()`, `countdownEndsAt = now() + startingIntervalSeconds`.
2. Update session: `status = active`, `currentPhase = countdown`, `currentRoundNumber = 1`, `phaseStartedAt = now()`, `phaseEndsAt = now() + startingIntervalSeconds`, `startedAt = now()`.
3. Insert a `timer_events` row with `eventType = countdown_started`, `roundNumber = 1`, `triggeredBy = host`.

### 5.5. Returns

```json
{
  "ok": true,
  "data": {
    "round_id": "uuid",
    "round_number": 1,
    "phase_ends_at": "2026-05-13T20:00:30Z"
  }
}
```

Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`, `NO_ACTIVE_PLAYERS`.

### 5.6. Idempotency

Idempotent in a narrow sense: if session is already in `active/countdown/round=1`, return the existing round. Use the (party_session_id, round_number) unique constraint as the safety net.

---

## 6. `mark_done`

A player marks themselves as having taken the shot.

### 6.1. Signature

```sql
mark_done(p_party_session_id uuid) returns jsonb
```

### 6.2. Caller requirements

- Caller is a `party_players` row in the session with `status = active`.

### 6.3. Preconditions

- Session `status = active` AND `currentPhase = shot_window`. Returns `ILLEGAL_TRANSITION` otherwise.
- `now() < session.phaseEndsAt`. Returns `SHOT_WINDOW_CLOSED` otherwise. Note: this is checked *inside* the transaction with `select ... for update` on the session row to prevent race with concurrent transitions.
- Existing outcome row for this player + round does NOT have `playerAction = self_out`. Returns `SELF_OUT_IS_STICKY` otherwise.

### 6.4. Effects

1. Upsert `round_player_outcomes` row for `(round_id, party_player_id)`:
   - `playerAction = done`
   - `playerTappedDoneAt = now()`
   - `roundNumber = current`

### 6.5. Returns

```json
{
  "ok": true,
  "data": {
    "outcome_id": "uuid",
    "player_action": "done",
    "tapped_at": "..."
  }
}
```

Errors: `NOT_IN_PARTY`, `PLAYER_NOT_ACTIVE`, `ILLEGAL_TRANSITION`, `SHOT_WINDOW_CLOSED`, `SELF_OUT_IS_STICKY`.

### 6.6. Idempotency

Idempotent — second call returns the same outcome row.

---

## 7. `mark_self_out`

A player opts out of the current round (and the rest of the game, unless host reinstates).

### 7.1. Signature

```sql
mark_self_out(p_party_session_id uuid) returns jsonb
```

### 7.2. Caller requirements

- Caller is a `party_players` row in the session with `status = active`.

### 7.3. Preconditions

- Session `currentPhase ∈ {countdown, shot_window}` (paused or not). Returns `ILLEGAL_TRANSITION` otherwise.

### 7.4. Effects

1. Upsert `round_player_outcomes` row for `(current_round_id, party_player_id)`:
   - `playerAction = self_out`
   - `playerMarkedSelfOutAt = now()`
2. If the row previously had `playerAction = done`, log an `admin_action_logs` entry with `actionType = override_outcome` and `reason = 'player self-out overrode prior Done'`.

Player `status` is NOT changed here — it changes at round finalization (see `game-rules.md` §7).

### 7.5. Returns

```json
{
  "ok": true,
  "data": { "outcome_id": "uuid" }
}
```

Errors: `NOT_IN_PARTY`, `PLAYER_NOT_ACTIVE`, `ILLEGAL_TRANSITION`.

### 7.6. Idempotency

Idempotent — second call returns the same outcome row.

---

## 8. `advance_phase_if_due`

System-callable function that transitions the session to the next phase if the timer has expired. This function is the mechanism that makes the timer authoritative.

### 8.1. Signature

```sql
advance_phase_if_due(p_party_session_id uuid) returns jsonb
```

### 8.2. Caller requirements

- Caller is authenticated (any authenticated user who can read the session can call this — the function is safe to call without elevated privileges).

### 8.3. Preconditions

- Session `status = active` (NOT paused).
- `now() >= session.phaseEndsAt` (if not, no-op).
- `session.currentPhase ∈ {countdown, shot_window}` (only these phases have due transitions).

### 8.4. Effects

Branch on `currentPhase`:

**countdown → shot_window:**

1. Check active player count. If 0, return `NO_ACTIVE_PLAYERS` (session remains in countdown).
2. Update current round: `status = shot_window`, `shotWindowStartedAt = now()`, `shotWindowEndsAt = now() + shotWindowSeconds`.
3. Update session: `currentPhase = shot_window`, `phaseStartedAt = now()`, `phaseEndsAt = now() + shotWindowSeconds`.
4. Insert `timer_events` row with `eventType = shot_window_started`, `triggeredBy = system`.

**shot_window → round_complete:**

1. Run finalization per `game-rules.md` §7 for all active players (single transaction):
   - For each active player without a `done` or `self_out` outcome, create/update outcome row with `playerAction = missed`.
   - Apply grace logic to determine `finalOutcome`.
   - Update player `status`, `usedGrace`, etc. as needed.
2. Update current round: `status = completed`, `completedAt = now()`.
3. Update session: `currentPhase = round_complete`, `phaseStartedAt = now()`, `phaseEndsAt = null`.
4. Insert `timer_events` row with `eventType = round_completed`, `triggeredBy = system`.

### 8.5. Returns

```json
{
  "ok": true,
  "data": {
    "transitioned": true | false,
    "new_phase": "shot_window" | "round_complete" | null
  }
}
```

`transitioned = false` means the timer hasn't expired yet or session was paused (this is normal, not an error).

Errors: `SESSION_NOT_FOUND`, `NO_ACTIVE_PLAYERS`.

### 8.6. Idempotency

Idempotent — calling twice in the same millisecond produces the same end state. The first call advances; the second sees `now() < phaseEndsAt` (now in the new phase) and returns `transitioned = false`.

### 8.7. When is this called?

Three triggers, in order of reliability:

1. **Edge function on a schedule** (post-MVP; not built in MVP).
2. **Client polling.** Each connected client calls this periodically (every ~2 seconds when their local clock says `now() >= phaseEndsAt`). First call to actually transition wins; others get `transitioned = false`.
3. **Inline before any phase-sensitive RPC.** RPCs like `mark_done` should first call `advance_phase_if_due` internally to ensure they're operating on the current phase.

For MVP, rely on (2) and (3). Document (1) as a known scalability improvement.

---

## 9. `start_next_round`

Host transitions from `round_complete` to `countdown` for round N+1.

### 9.1. Signature

```sql
start_next_round(p_party_session_id uuid) returns jsonb
```

### 9.2. Caller requirements

- Caller has `permissionRole = host`.

### 9.3. Preconditions

- Session `currentPhase = round_complete`. Returns `ILLEGAL_TRANSITION` otherwise.
- At least one player has `status = active`. Returns `NO_ACTIVE_PLAYERS` otherwise.
- Round N+1 does not already exist (idempotency check via unique constraint on `(party_session_id, round_number)`).

### 9.4. Effects (single transaction)

1. Compute new interval: `prev.intervalSeconds + party_settings.intervalIncrementSeconds`, clamped at `party_settings.maxIntervalSeconds` if set.
2. Insert new `rounds` row: `roundNumber = current + 1`, `status = countdown`, `intervalSeconds = computed`, `countdownStartedAt = now()`, `countdownEndsAt = now() + computed`.
3. Update session: `currentPhase = countdown`, `currentRoundNumber = current + 1`, `phaseStartedAt = now()`, `phaseEndsAt = now() + computed`.
4. Insert `timer_events` row with `eventType = next_round_started`, `triggeredBy = host`.

### 9.5. Returns

```json
{
  "ok": true,
  "data": {
    "round_id": "uuid",
    "round_number": 2,
    "interval_seconds": 90,
    "phase_ends_at": "..."
  }
}
```

Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`, `NO_ACTIVE_PLAYERS`.

### 9.6. Idempotency

Idempotent — if round N+1 already exists with `status = countdown`, return it.

---

## 10. Host Timer Controls

These four RPCs share a common shape: host-only, session-authoritative time manipulation.

### 10.1. `host_pause_timer(p_party_session_id uuid) returns jsonb`

Caller: host. Precondition: `status = active`. Effect: `status = paused`, `pausedAt = now()`. Idempotent (if already paused, no-op + ok). Logs `admin_action_logs` with `actionType = pause_timer`. Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`.

### 10.2. `host_resume_timer(p_party_session_id uuid) returns jsonb`

Caller: host. Precondition: `status = paused`. Effect: compute `remainingTime = (original phaseEndsAt) - pausedAt`. Set `phaseEndsAt = now() + remainingTime`, `totalPausedSeconds += (now() - pausedAt)`, `pausedAt = null`, `status = active`. Idempotent. Logs `admin_action_logs` with `actionType = resume_timer`. Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`.

Implementation note: storing the original `phaseEndsAt` across pause requires remembering it. Two options: (a) don't mutate `phaseEndsAt` on pause; store `remainingSeconds` on pause and rebuild on resume; or (b) mutate `phaseEndsAt` to `pausedAt + remainingSeconds` semantics. **Locked: option (a)** — `phaseEndsAt` is not mutated on pause, and there's a separate `pausedRemainingSeconds` column populated on pause and consumed on resume.

### 10.3. `host_add_time(p_party_session_id uuid, p_seconds int) returns jsonb`

Caller: host. Precondition: `status ∈ {active, paused}` AND `currentPhase ∈ {countdown, shot_window}`. Param validation: `p_seconds` between 1 and 600. Effect: if active, set `phaseEndsAt += p_seconds`. If paused, set `pausedRemainingSeconds += p_seconds`. Logs `admin_action_logs` with `actionType = add_time`, `newValue = p_seconds`. NOT idempotent — repeated calls keep adding time, that's intended. Clients should debounce. Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`, `INVALID_PARAM`.

### 10.4. `host_end_shot_window(p_party_session_id uuid) returns jsonb`

Caller: host. Precondition: `currentPhase = shot_window`. Effect: same as `advance_phase_if_due` shot_window → round_complete branch (§8.4), but triggered by host. `triggeredBy = host` in the `timer_events` row. Logs `admin_action_logs` with `actionType = end_shot_window`. Idempotent via current-round.status check. Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`.

### 10.5. `host_skip_to_shot_window(p_party_session_id uuid) returns jsonb`

Caller: host. Precondition: `currentPhase = countdown`. Effect: same as `advance_phase_if_due` countdown → shot_window branch, but triggered by host. Logs `admin_action_logs` with `actionType = skip_to_shot_window`. Idempotent. Errors: `NOT_HOST`, `ILLEGAL_TRANSITION`, `NO_ACTIVE_PLAYERS`.

---

## 11. Host Player Overrides

### 11.1. `host_mark_player_active(p_party_player_id uuid) returns jsonb`

Caller: host. Preconditions per `game-rules.md` §6.1 (target `status = out`, `outRoundNumber >= currentRoundNumber - 1`). Effects per same. Logs `admin_action_logs` with `actionType = mark_player_active`. Idempotent (already-active is no-op + ok). Errors: `NOT_HOST`, `PLAYER_NOT_FOUND`, `PLAYER_NOT_OUT`, `REINSTATE_TOO_OLD`.

### 11.2. `host_mark_player_out(p_party_player_id uuid) returns jsonb`

Caller: host. Preconditions per `game-rules.md` §6.2 (target `status = active`). Effects per same. Logs `admin_action_logs` with `actionType = mark_player_out`. Idempotent. Errors: `NOT_HOST`, `PLAYER_NOT_FOUND`, `PLAYER_NOT_ACTIVE`.

### 11.3. `host_remove_player(p_party_player_id uuid, p_reason text default null) returns jsonb`

Caller: host. Preconditions per `game-rules.md` §6.3 (target is not host, target `status ∈ {active, out}`). Effects per same. Logs `admin_action_logs` with `actionType = remove_player`, `reason = p_reason`. NOT idempotent on already-removed players (returns `ALREADY_REMOVED` per game-rules §8). Errors: `NOT_HOST`, `PLAYER_NOT_FOUND`, `CANNOT_REMOVE_HOST`, `ALREADY_REMOVED`.

---

## 12. `end_party`

Host ends the session. Terminal action.

### 12.1. Signature

```sql
end_party(p_party_session_id uuid) returns jsonb
```

### 12.2. Caller requirements

- Caller has `permissionRole = host`.

### 12.3. Preconditions

- Session `status ∈ {lobby, active, paused}` (cannot end an already-ended party — returns ok+no-op for idempotency).

### 12.4. Effects

1. Update session: `status = ended`, `currentPhase = ended`, `endedAt = now()`, `phaseEndsAt = null`. `pausedAt` and `pausedRemainingSeconds` are **not** cleared — they're left as historical record (see `docs/KNOWN_ISSUES.md` #D012 (d), (e)). `currentRoundNumber` is also left as-is.
2. Determine the in-flight round, if any: the `rounds` row matching `current_round_number` whose `status NOT IN ('completed', 'cancelled')`. Null if the session is in lobby (no rounds yet) or already in `round_complete` (current round is `completed`).
3. If an in-flight round exists, update it: `status = cancelled`.
4. If an in-flight round exists, insert a `timer_events` row: `eventType = round_cancelled`, `triggeredBy = 'host'`, `triggered_by_player_id = host's party_player_id`, `round_id` and `round_number` populated. `round_cancelled` is a semantically accurate event type added in Phase 2 Batch B2 — see `enums.md` §3.16 and `docs/KNOWN_ISSUES.md` #D012 (g).
5. Insert an `admin_action_logs` row: `actionType = end_party`, `actor_player_id = host's party_player_id`, `actor_permission_role = 'host'`. `previous_value` and `new_value` default to null. `round_id` and `round_number` mirror the in-flight round if step 3 fired, else both null (see #D012 (f)).

### 12.5. Returns

```json
{
  "ok": true,
  "data": { "ended_at": "..." }
}
```

Errors: `NOT_HOST`, `SESSION_NOT_FOUND`.

### 12.6. Idempotency

Idempotent — if already ended, returns ok + existing `endedAt`.

---

## 13. Read-Only Helpers

These are convenience functions for the client. They do NOT mutate state.

All three return the standard shape per §1.3. They use `SECURITY DEFINER` (per §1.1) and so bypass RLS; each function performs its own `auth.uid()` and membership checks in-function. See `docs/KNOWN_ISSUES.md` #D010 for the rationale behind extending §1.3 uniformly to the §13 read RPCs (the spec previously declared raw `timestamptz` / `setof` returns here, which has been corrected so every MVP RPC produces a single uniform shape for the TypeScript wrapper layer to consume).

### 13.1. `get_party_state(p_party_session_id uuid) returns jsonb`

Returns a denormalized snapshot of the session, settings, current round, and player roster. Used on initial screen load to avoid four separate queries.

**Caller requirements:** authenticated; an active or out member of the session.

**Data payload (on success):**

```jsonc
{
  "session":       <party_sessions row, all columns>,
  "settings":      <party_settings row, all columns>,
  "current_round": <rounds row, all columns> | null,
  "players":       [<party_players row, all columns>, ...]
}
```

- `current_round` is `null` when the session is in `lobby` (no rounds row yet) or when no rounds row matches the session's `current_round_number`.
- `players` always includes rows with `status IN ('active', 'out')`. It additionally includes `status = 'removed'` rows when **either** of these holds:
  - the caller is the host of the session (hosts see moderation history), OR
  - the row is the caller's own (a removed player must be able to render the "you were removed" state).

  This mirrors the dual-policy RLS on `party_players` — see `rls-rules.md` §4.1 (members see non-removed peers; host sees all) and §4.2 (always read your own row).
- `players` is ordered by `joined_at` so the host (who joined at session creation) appears first.

**Errors:** `NOT_AUTHENTICATED`, `SESSION_NOT_FOUND`.

`SESSION_NOT_FOUND` is returned for both "session does not exist" and "session exists but caller is not a member." This non-distinction is deliberate — leaking existence to non-members would let an attacker probe for active sessions. Do not "improve" error specificity here.

**Idempotency:** read-only; safe to call repeatedly.

### 13.2. `get_server_time() returns jsonb`

Returns the server's current wall-clock time. Used by clients to estimate clock skew so countdown displays stay in sync with `phaseEndsAt` (see §1.6).

**Caller requirements:** authenticated.

**Data payload (on success):**

```jsonc
{
  "server_time": "2026-05-13T20:14:32.123456+00:00"
}
```

`server_time` is the ISO-format string Postgres emits when `now()` is serialized inside `jsonb_build_object` (timestamptz → text with timezone offset). Clients should parse it with `Date.parse()` or equivalent.

**Errors:** `NOT_AUTHENTICATED`.

**Idempotency:** read-only.

### 13.3. `get_round_outcomes(p_round_id uuid) returns jsonb`

Returns all outcome rows for a given round.

**Caller requirements:** authenticated; an active or out member of the round's party session.

**Data payload (on success):**

```jsonc
{
  "outcomes": [<round_player_outcomes row, all columns>, ...]
}
```

- `outcomes` is an array, never `null`. An empty array (`[]`) is the valid response for a round that has zero outcome rows yet — e.g. mid-shot-window before any player has tapped Done, or for a round still in countdown.
- `outcomes` is ordered by `created_at`.

**Errors:** `NOT_AUTHENTICATED`, `SESSION_NOT_FOUND`.

`SESSION_NOT_FOUND` is returned for both "round does not exist" and "round exists but caller is not a member of its party." Same deliberate non-distinction as `get_party_state` — see §13.1.

**Idempotency:** read-only.

---

## 14. Function Ownership Summary

| RPC | Who can call |
|---|---|
| `create_party` | Any authenticated user (not already hosting) |
| `join_party` | Any authenticated user |
| `leave_party` | Players in the party (not host) |
| `start_game` | Host |
| `mark_done` | Active player in party |
| `mark_self_out` | Active player in party |
| `advance_phase_if_due` | Any party member |
| `start_next_round` | Host |
| `host_pause_timer` | Host |
| `host_resume_timer` | Host |
| `host_add_time` | Host |
| `host_end_shot_window` | Host |
| `host_skip_to_shot_window` | Host |
| `host_mark_player_active` | Host |
| `host_mark_player_out` | Host |
| `host_remove_player` | Host |
| `end_party` | Host |
| `get_party_state` | Any party member |
| `get_server_time` | Any authenticated user |
| `get_round_outcomes` | Any party member |

Caller checks are enforced inside each function. The function `SECURITY DEFINER` model bypasses RLS for writes, so these in-function checks are the actual security boundary for writes. Reads still go through RLS — see `rls-rules.md`.

---

## 15. Error Codes

Complete list. Adding new codes requires updating this section AND `src/types/api.ts` so TypeScript stays in sync.

| Code | When |
|---|---|
| `INVALID_PARAM` | A parameter failed validation. `error_msg` names the field. |
| `NOT_AUTHENTICATED` | `auth.uid()` is null. |
| `NOT_IN_PARTY` | Caller is not a party_players row in this session. |
| `NOT_HOST` | Caller is in the party but not with `permissionRole = host`. |
| `SESSION_NOT_FOUND` | Session doesn't exist or is hidden by RLS. |
| `PLAYER_NOT_FOUND` | Target player_id doesn't exist or is hidden by RLS. |
| `PLAYER_NOT_ACTIVE` | Target player has `status != active` when required. |
| `PLAYER_NOT_OUT` | Target player has `status != out` when reinstating. |
| `PLAYER_REMOVED` | Caller (or join target) was previously removed. |
| `CANNOT_REMOVE_HOST` | Tried to remove the host via `host_remove_player`. |
| `HOST_CANNOT_LEAVE` | Host tried to use `leave_party`. |
| `ALREADY_REMOVED` | Tried to remove an already-removed player. |
| `ALREADY_HOSTING` | Caller already hosts an active or lobby party. |
| `PARTY_NOT_JOINABLE` | Party is past `lobby` and `allowLateJoin = false`. |
| `PARTY_LOCKED` | Party `isLocked = true`. |
| `JOIN_CODE_NOT_FOUND` | No session with that code in `lobby/active/paused`. |
| `JOIN_CODE_COLLISION` | Internal: generation failed 5 times. Try again. |
| `ILLEGAL_TRANSITION` | The current phase/status does not allow this RPC. |
| `SHOT_WINDOW_CLOSED` | `mark_done` called after `phaseEndsAt`. |
| `SELF_OUT_IS_STICKY` | `mark_done` called by a player who already self-out'd this round. |
| `NO_ACTIVE_PLAYERS` | A transition requires active players and there are none. |
| `REINSTATE_TOO_OLD` | Tried to reinstate a player from a round older than `current - 1`. |

---

## 16. Implementation Checklist

For each RPC, the implementation must include:

- [ ] Parameter validation matching §2.3-style rules
- [ ] `auth.uid()` check
- [ ] Caller's `party_players` row lookup
- [ ] All preconditions checked before any write
- [ ] Phase / status checks via `select ... for update` on the session row to prevent races
- [ ] Atomic transaction for all multi-row writes
- [ ] `admin_action_logs` insert where the spec requires
- [ ] `timer_events` insert where the spec requires
- [ ] Standard return shape (§1.3)
- [ ] All declared error codes returned correctly (not raised as exceptions)
- [ ] Idempotency where declared (function-level check + DB-level unique constraint)
- [ ] Migration file is commented with a reference to this spec section

---

## 17. Open Questions

(None currently. Add as they arise.)
