# Game Rules

> The rules of Shot O'Clock — what player actions mean, what determines who's in or out.
> When this doc and code disagree, the doc wins.
> Cross-reference: `mvp-state-machine.md` for *when* actions are allowed; this doc for *what they do*.

---

## 1. Scope

This spec defines:

- Player status (`active`, `out`, `removed`) and transitions
- The three player actions: Done, I'm Out, and the implicit "missed"
- Grace mode semantics (`disabled` / `enabled` / `unlimited`)
- The interaction between grace mode and the `eliminationEnabled` setting
- Host override rules
- Round outcome finalization
- Idempotency and edge case handling

Out of MVP scope but referenced for context: pardons, referee verdicts, monitor assignments. These have fields in the data model but no implementation in MVP.

---

## 2. Player Status

A `party_players` row has a `status` field with three values.

### 2.1. `active`

The player is still in the game and can take shots. Their actions count toward round outcomes.

### 2.2. `out`

The player is no longer in the game. They cannot tap Done. They remain visible (greyed out) in the roster and in history views. The `outReason` field records why they went out (`missed_round`, `self_opted_out`, `host_marked_out`, `missed_after_grace`).

### 2.3. `removed`

The player was kicked by the host (or left voluntarily before the game). They cannot read or write session data — RLS hides the session from them. They are hidden from regular player views; the host may see them in an admin-only "removed" list.

### 2.4. Status transitions

Legal:

- `active → out` — via missed round (subject to grace), via `mark_self_out`, via `host_mark_player_out`
- `out → active` — via `host_mark_player_active` (host reinstatement; limited to most-recent-round reinstatements per blueprint)
- `active → removed` — via `host_remove_player`
- `out → removed` — via `host_remove_player`

Forbidden:

- `removed → anything` — removed is terminal for the session

Auto-transitions (e.g. `missed → out`) are NOT logged in `admin_action_logs` — they are recorded in the player's `round_player_outcomes` row via `finalOutcome` and the player's `outReason`/`outRoundNumber` fields. Host-initiated transitions ARE logged in `admin_action_logs`.

---

## 3. The Three Player Actions

### 3.1. Done

A player taps **Done** during `shot_window` to indicate they took their shot.

Preconditions:

- `status = active`
- `currentPhase = shot_window`
- `now() < phaseEndsAt`
- Player has not already self-out'd this round

Effect:

- Upsert into `round_player_outcomes` for `(round_id, party_player_id)`:
  - `playerAction = done`
  - `playerTappedDoneAt = now()`
- If a row already exists with `playerAction = done`: no-op (idempotent), return existing row.
- If a row already exists with `playerAction = self_out`: **reject** with error `SELF_OUT_IS_STICKY`. See §3.3.

Returns the outcome row.

### 3.2. I'm Out (self-out)

A player explicitly stops playing. Available during `countdown` or `shot_window` (and during paused versions of those phases).

Preconditions:

- `status = active`
- `currentPhase ∈ {countdown, shot_window}` (paused or not)

Effect:

- Upsert into `round_player_outcomes` for the current round:
  - `playerAction = self_out`
  - `playerMarkedSelfOutAt = now()`
- At round finalization, the player's `status` will be set to `out` with `outReason = self_opted_out`. (See §7.)
- If the player has already tapped Done this round, the outcome is overwritten — self-out wins. The previous Done is logged in `admin_action_logs` with `actionType = override_outcome` and an automated `reason = "player self-out overrode prior Done"` for traceability.

This action is intentionally non-coercive. There is no way to undo a self-out within the same round. A player who self-outs can be reinstated by the host (see §6.1), but cannot reverse the action themselves. This is a core UX rule — see `docs/planning/02-user-stories.md` §6.

### 3.3. Missed (implicit)

Not a player action — a *result* of inaction. At round finalization, any active player without a `playerAction = done` or `playerAction = self_out` outcome for this round is treated as having missed.

The outcome row is created (or updated) at finalization with `playerAction = missed`. Grace logic then determines whether `finalOutcome = grace_used` or `out`. See §4 and §7.

---

## 4. Grace Mode

The host chooses one of three grace modes when creating the party. The choice is stored in `party_settings.graceMode` and never changes mid-game.

### 4.1. `disabled` — No Grace

Miss once and you're out.

- On miss: `finalOutcome = out`. Set player `status = out`, `outReason = missed_round`, `outRoundNumber = current`, `outAt = now()`.
- `usedGrace` remains `false` throughout.
- `totalMissedRounds` is still incremented for stats.

### 4.2. `enabled` — Grace (one free miss)

First miss is forgiven. Second miss puts you out.

- On miss, if `usedGrace = false`:
  - Set `usedGrace = true`
  - Set `usedGraceAt = now()`, `usedGraceRoundNumber = current`
  - Outcome: `finalOutcome = grace_used`, `graceApplied = true`, `graceAppliedAt = now()`
  - Player stays `active`
  - Increment `totalMissedRounds`
- On miss, if `usedGrace = true`:
  - Outcome: `finalOutcome = out`
  - Set player `status = out`, `outReason = missed_after_grace`, `outRoundNumber = current`, `outAt = now()`
  - Increment `totalMissedRounds`

### 4.3. `unlimited` — Unlimited Grace

Misses are tracked but never auto-eliminate.

- On miss: increment `totalMissedRounds`. Set outcome `finalOutcome = missed`. Player stays `active`.
- `usedGrace` is never set in this mode (stays `false`).
- The host can still manually mark someone `out` via `host_mark_player_out`.

### 4.4. Worked Examples

**Player A, `graceMode = enabled`:**

| Round | Action | Outcome | Status after | Notes |
|---|---|---|---|---|
| 1 | Done | `completed` | active | |
| 2 | (missed) | `grace_used` | active | `usedGrace = true` |
| 3 | Done | `completed` | active | |
| 4 | (missed) | `out` | out | `outReason = missed_after_grace` |

**Player B, `graceMode = disabled`:**

| Round | Action | Outcome | Status after |
|---|---|---|---|
| 1 | Done | `completed` | active |
| 2 | (missed) | `out` | out (`outReason = missed_round`) |

**Player C, `graceMode = unlimited`:**

| Round | Action | Outcome | Status after | `totalMissedRounds` |
|---|---|---|---|---|
| 1 | (missed) | `missed` | active | 1 |
| 2 | (missed) | `missed` | active | 2 |
| 3 | Done | `completed` | active | 2 |
| 4 | (missed) | `missed` | active | 3 |

Player C is never auto-eliminated, regardless of total misses.

---

## 5. Elimination Setting

`party_settings.eliminationEnabled` is a separate setting from `graceMode`. It is the higher-level switch.

- `eliminationEnabled = true`: grace mode applies as defined in §4.
- `eliminationEnabled = false`: grace mode is **irrelevant**. Missing has no consequence. Player status never transitions to `out` automatically. Self-out and host override still work.

When `eliminationEnabled = false`, finalization treats every missed round like the `unlimited` grace case (status stays active, `totalMissedRounds` increments, `finalOutcome = missed`). The stored `graceMode` value is not consulted.

**UX rule (locked in blueprint):** When `eliminationEnabled = false`, the grace mode UI in Create Party is hidden. The DB column still holds a value (default `disabled` for new parties; left alone if previously set), but it is not used.

---

## 6. Host Overrides

The host can change player status mid-game. These actions are always logged in `admin_action_logs` with the actor, target, and a structured reason.

### 6.1. `host_mark_player_active` (reinstatement)

Preconditions:

- Caller has `permissionRole = host`
- Target player has `status = out` (cannot reinstate a `removed` player — they're gone)
- Per blueprint UX rule: reinstatement is limited to the most recent round. Implementation: reject if `outRoundNumber < currentRoundNumber - 1` with error `REINSTATE_TOO_OLD`.

Effect:

- Set `status = active`
- Clear `outRoundNumber`, `outReason`, `outAt`
- If `outReason` was `missed_after_grace`: also reset `usedGrace = false`, `usedGraceAt = null`, `usedGraceRoundNumber = null`. This re-grants the player their grace. (Document this in the UI so the host knows.)
- Log to `admin_action_logs` with `actionType = mark_player_active`

### 6.2. `host_mark_player_out`

Preconditions:

- Caller has `permissionRole = host`
- Target player has `status = active`

Effect:

- Set `status = out`
- Set `outRoundNumber = currentRoundNumber`
- Set `outReason = host_marked_out`
- Set `outAt = now()`
- Log to `admin_action_logs` with `actionType = mark_player_out`

### 6.3. `host_remove_player`

Preconditions:

- Caller has `permissionRole = host`
- Target player is NOT the host themselves (no self-remove via this RPC; host leaves by calling `end_party`)
- Target player has `status ∈ {active, out}` (cannot re-remove an already-removed player)

Effect:

- Set `status = removed`
- Set `removedAt = now()`
- Set `removedByPlayerId = host_player_id`
- Set `removedReason` (optional, free-text)
- Existing outcome rows for this player are preserved (history not deleted)
- RLS will hide subsequent session data from this player on next query
- Log to `admin_action_logs` with `actionType = remove_player`

---

## 7. Round Outcome Finalization

When `shot_window` ends (either via timer expiry or `host_end_shot_window`), the system finalizes the round. **This happens as a single transactional step inside the transition function.** No partial finalization is permitted.

Steps (per active player at the moment of finalization):

1. Read existing `round_player_outcomes` row for `(round_id, party_player_id)`, if any.
2. Determine `playerAction` (default `missed` if no row exists).
3. Apply rules:
   - `playerAction = done` → `finalOutcome = completed`; increment `totalShotsCompleted`.
   - `playerAction = self_out` → `finalOutcome = self_out`; set player `status = out`, `outReason = self_opted_out`, `outRoundNumber = current`, `outAt = now()`.
   - `playerAction = missed` AND `eliminationEnabled = false` → `finalOutcome = missed`; player stays active; increment `totalMissedRounds`.
   - `playerAction = missed` AND `eliminationEnabled = true` → apply grace logic from §4:
     - `graceMode = disabled` → `out`
     - `graceMode = enabled` AND `!usedGrace` → `grace_used`
     - `graceMode = enabled` AND `usedGrace` → `out` (`outReason = missed_after_grace`)
     - `graceMode = unlimited` → `missed`, stays active
4. Write/upsert the outcome row with `finalOutcome`, `finalizedAt = now()`, `finalizedByPlayerId = system` (use a sentinel or null), `statusBeforeRound`, `statusAfterRound`.
5. Update player `status`, `usedGrace`, `totalShotsCompleted`, `totalRoundsMissed`, `outReason`, `outRoundNumber`, `outAt` as determined above.

Players with `status ∈ {out, removed}` at finalization time get NO new outcome row for this round (they aren't playing).

Once finalization completes, set `round.completedAt = now()` and `round.status = completed`. Log a `TimerEvent` of type `round_completed`.

**Finalization must be idempotent.** If `round.completedAt is not null` when the function is called, return immediately without re-running. See `mvp-state-machine.md` §6.

---

## 8. Idempotency

- `mark_done` — repeated calls return the existing outcome. No duplicate rows.
- `mark_self_out` — repeated calls return the existing outcome. No duplicate rows.
- `host_mark_player_out` on an already-out player — no-op at the DB level, but log the call to `admin_action_logs` with a structured note "no-change: already out" for audit clarity.
- `host_mark_player_active` on an already-active player — same: no-op, but logged.
- `host_remove_player` on an already-removed player — reject with error `ALREADY_REMOVED` (this is unusual enough to be worth flagging, not silently absorbing).
- Round finalization — single-pass, gated by `round.completedAt`.

---

## 9. Edge Cases

### 9.1. Player taps Done late (clock skew or network lag)

The server compares `now()` against `round.shotWindowEndsAt` at execution time. If `now() > shotWindowEndsAt`, reject with `SHOT_WINDOW_CLOSED`. The client should display a "too late" message. Server is always authoritative — the client's local timer is for display only.

### 9.2. Player marks self_out, then host marks them back active before finalization

Allowed. Order of operations:

1. `mark_self_out` writes `playerAction = self_out` to outcome row.
2. `host_mark_player_active` is called. This is unusual — the player isn't out yet — but the function still runs. It clears `outRoundNumber`, etc. on the player row, but those fields haven't been set yet (player is still active). Effectively no-op on the player row.
3. However, the outcome row still says `self_out`. At finalization, this will cause the player to go out.

**Locked: this is correct.** A host who wants to truly reverse a self-out must additionally clear the outcome row via a post-MVP `host_override_outcome` RPC. For MVP, document this as a limitation: "if a player self-outs, only the host can reinstate them, and reinstatement happens at the start of the next round, not the current one."

### 9.3. Host self-removes via `host_remove_player`

**Rejected** by precondition in §6.3. If the host wants to leave, they call `end_party`. (Host transfer is post-MVP.)

### 9.4. Host participates as a player

`permissionRole = host` and `duty = normal_player` is the default. The host's status follows player rules — they can be `active`, `out`, or `removed`. A host who is `out` retains their host controls but cannot tap Done.

The host cannot be `removed` via `host_remove_player` (§6.3). The host can effectively "leave" by calling `end_party`.

### 9.5. Last active player goes out mid-round

After finalization, if zero players have `status = active`, the session does NOT auto-end. The host sees a clear "No active players remaining" message in `round_complete` and decides:

- Reinstate someone via `host_mark_player_active`, which re-triggers the auto-advance into `countdown` for round N+1 (per D014)
- Call `end_party` to close the session

This is the locked decision (`mvp-state-machine.md` §10). The reason: auto-end is a surprise; host control is predictable.

### 9.6. Grace re-grant on reinstatement

When the host reinstates a player who was `out` due to `missed_after_grace`, the player's `usedGrace` is reset to `false` (see §6.1). This is intentionally generous — the host's reinstatement signals "this miss didn't count," so the grace that *led* to elimination is also reset.

The host should be informed of this in the UI (e.g. a small note: "Player's grace has been restored").

### 9.7. Player rejoins same party after closing the app

A player who closed the app (or temporarily lost connection) reconnects using their stored guest token / auth session. The identifier maps to an existing `party_players` row:

- If that row has `status ∈ {active, out}` — they reconnect to it, no new row.
- If that row has `status = removed` — rejoin is rejected with `PLAYER_REMOVED`.

A guest who opens the app on a new device, with no stored token, cannot claim an existing `party_players` row. They are a new identity and must re-join via the join code (and will create a new `party_players` row if the party is still in lobby and allows new joins).

### 9.8. Duplicate device for same identity

If a single guest opens the app on two phones with the same identity (rare but possible via account login in post-MVP), both devices share the same `party_players` row. Actions are merged via idempotency. There is no "this device is active, that device is stale" notion in MVP.

---

## 10. Locked Decisions

- Grace is restored on reinstatement after `missed_after_grace` (§6.1, §9.6).
- Self-out overrides prior Done in the same shot window (§3.3).
- Missed rounds in `unlimited` grace mode produce outcome rows with `finalOutcome = missed` (§4.3).
- Host cannot self-remove via `host_remove_player` (§6.3, §9.3).
- Zero-active-players state does NOT auto-end the session (§9.5).
- Host who is `out` retains host controls but cannot tap Done (§9.4).
- Finalization is single-pass and idempotent (§7).

---

## 11. Open Questions

(None currently. Add here as they arise during implementation. Resolve with the user before writing code that depends on them.)
