# MVP Definition of Done

> The locked completion criteria for Shot O'Clock MVP.
> MVP is done when every box in §2, §3, §4, and §5 is checked.
> Cross-reference: `docs/planning/04-mvp.md` for scope context, `docs/PHASE_ACCEPTANCE_CRITERIA.md` for per-phase done criteria, `docs/MANUAL_QA_CHECKLIST.md` for how to verify.

---

## 1. Purpose

MVP is "done" not when the code compiles, not when it works on one device, and not when every blueprint feature is implemented. It is done when the full live game loop works reliably across multiple devices, the data model has no obvious holes, and the architecture rules from `CLAUDE.md` are upheld.

This doc is the gate. If anything in §2–§5 is unchecked, MVP is not done. If something is checked but later breaks, it gets unchecked and fixed before re-declaring MVP done.

---

## 2. Functional Completeness

The MVP game loop must work end-to-end. Verify each via the `MANUAL_QA_CHECKLIST.md` happy-path test.

### 2.1. Party creation and joining

- [ ] A host can create a party with name, starting interval, interval increment, shot window, elimination on/off, and grace mode
- [ ] A unique 6-character join code is generated and shown to the host
- [ ] At least two guests can join the party by entering the code
- [ ] Guests choose a display name on join
- [ ] Legal-age confirmation and terms acceptance are required before joining or hosting
- [ ] Roster updates live for all connected devices as players join

### 2.2. Game start and synced timer

- [ ] The host can start the game from the lobby (requires at least 1 active player)
- [ ] All connected devices show the same countdown, accurate to within ~1 second
- [ ] The countdown transitions to `shot_window` when the timer expires
- [ ] A late-joining player (who reloads the app mid-countdown) sees the correct remaining time
- [ ] Timer state survives a temporary network disconnect — when the device reconnects, the timer is in sync

### 2.3. Shot O'Clock moment

- [ ] A full-screen Shot O'Clock screen appears when shot_window begins
- [ ] The shot window countdown is visible and accurate
- [ ] All active players can tap Done during the window
- [ ] Out / removed players cannot tap Done
- [ ] Any player can tap I'm Out during countdown or shot_window
- [ ] Taps are reflected on other devices live (within ~2 seconds)
- [ ] Duplicate taps do not corrupt state (no duplicate outcome rows)

### 2.4. Grace logic

- [ ] `disabled` mode: a missed round results in `status = out` for the missing player
- [ ] `enabled` mode: first miss results in `grace_used` and player stays active; second miss results in `out`
- [ ] `unlimited` mode: missed rounds increment counters but never auto-eliminate
- [ ] When `eliminationEnabled = false`, missed rounds have no consequence regardless of grace mode

### 2.5. Round results and progression

- [ ] After shot_window ends, all active players see a round results screen
- [ ] Results show: who completed, who used grace, who is now out
- [ ] Regular players see simple statuses (Active / Out / Completed / Used Grace) — not detailed `outReason`
- [ ] Host can see detailed outcomes
- [ ] Host can start the next round, which uses the incremented interval
- [ ] Round numbers display correctly throughout

### 2.6. Host controls

- [ ] Host can pause the timer; remaining time is preserved
- [ ] Host can resume the timer; `phaseEndsAt` is recomputed correctly
- [ ] Host can add time to the active timer
- [ ] Host can end the shot window early
- [ ] Host can mark a player out
- [ ] Host can mark a player active (reinstate from most recent round)
- [ ] Reinstatement after `missed_after_grace` resets `usedGrace = false`
- [ ] Host can remove a player; removed players cannot read further session data
- [ ] Host can end the party; all devices see the ended state
- [ ] Dangerous actions (End Party, Remove Player) require confirmation

### 2.7. Final summary

- [ ] When the party ends, all players see a final summary screen
- [ ] Summary shows: party name, total rounds, players still active, players out, basic shots per player
- [ ] If a single "last standing" player exists, they are highlighted

---

## 3. Non-Negotiables

Architectural invariants from `CLAUDE.md` §2 and §11. These are not features — they are the structural quality of the codebase.

### 3.1. Architecture

- [ ] No client-owned timer state — every countdown is derived from `phaseEndsAt - serverNow()`
- [ ] No direct client mutation of `party_sessions`, `party_players`, `rounds`, or `round_player_outcomes` — all writes go through RPCs
- [ ] `permissionRole`, `status`, and `duty` are three independent fields on `party_players` — never collapsed
- [ ] Every state-mutating RPC is idempotent where the spec declares it so
- [ ] All transitions go through the legal paths in `mvp-state-machine.md`; no forbidden transitions are reachable

### 3.2. Security

- [ ] RLS is enabled on every user-facing table
- [ ] A non-member of a party cannot read its data (manually verified per `MANUAL_QA_CHECKLIST.md`)
- [ ] A removed player cannot read further session data (except their own `party_players` row)
- [ ] All RPCs check the caller's role before mutating
- [ ] No secrets are committed to git
- [ ] `.env` is gitignored and never appears in commits

### 3.3. Scope discipline

- [ ] No referee features sneaking in — `refereeMode = 'none'` on all MVP parties
- [ ] No notification features in the client — no `expo-notifications` calls, no push token registration
- [ ] No media upload UI — no album screens, no camera, no file pickers
- [ ] No full-account-required paths — guest auth works end-to-end
- [ ] No advanced stats screens
- [ ] No web/TV display mode

### 3.4. Data integrity

- [ ] All MVP enums are declared in the schema and match `docs/specs/enums.md`
- [ ] Unique constraints exist on `(party_session_id, round_number)`, `(round_id, party_player_id)`, and `(party_session_id, user_id)`
- [ ] `set_updated_at` triggers exist on every table with an `updated_at` column
- [ ] Migration files are commented and idempotent against a fresh database
- [ ] Generated TypeScript types match the current schema (regenerated after the last migration)

---

## 4. Documentation Completeness

Code without docs is half-done.

- [ ] All RPCs implemented match their definitions in `docs/specs/rpc-contracts.md`
- [ ] Any clarifications discovered during implementation are reflected in the specs (not just in code comments)
- [ ] All locked enum values used are in `docs/specs/enums.md`
- [ ] `README.md` setup steps work from a fresh clone on a machine without prior project setup
- [ ] `docs/MANUAL_QA_CHECKLIST.md` has been run end-to-end at least once and any gaps captured

---

## 5. Multi-Device Validation

The MVP is a multi-device app. Single-device testing is necessary but not sufficient.

- [ ] One host + two players on three different physical devices (or two real + one simulator) completed a full session
- [ ] All three devices stayed in sync throughout (timer, roster, outcomes)
- [ ] At least one device was backgrounded mid-session and recovered correctly on resume
- [ ] At least one device was closed and reopened mid-session and reconnected to the correct state
- [ ] Removed-player flow tested: host removed a player; the removed player's app showed an appropriate ended/removed state
- [ ] Network interruption tested: device disconnected from wifi mid-shot-window, reconnected, state synced

---

## 6. What "Done" Does NOT Mean

To prevent scope drift on the upside, here's what MVP done is NOT:

- **Not app-store ready.** No app icon final pass, no splash screen polish, no privacy policy URL, no Apple Developer / Google Play submission. Those are post-MVP polish work.
- **Not multi-region tested.** MVP is verified to work; it's not stress-tested for hundreds of concurrent parties.
- **Not optimized.** Database indexes match spec but may need tuning under load. UI animations are functional, not delightful.
- **Not feature-complete.** Referees, notifications, accounts, history, albums — all explicitly post-MVP. The point of MVP is to prove the live game loop works.
- **Not crash-free under abuse.** Drunk-user UX is on the post-MVP polish list. MVP must handle ordinary use cleanly.
- **Not CI-protected.** CI/CD is planned but not in MVP. Code is written CI-ready (per `CLAUDE.md` §5.9) but the GitHub Actions pipeline lands after MVP.

---

## 7. Sign-Off

When all of §2 through §5 is checked, MVP is declared done. The sign-off commit and any tag should reference this doc:

```
chore: MVP done — verified against docs/MVP_DEFINITION_OF_DONE.md

- all functional completeness criteria met
- all non-negotiables verified
- multi-device validation completed (3 devices, full session, edge cases)
- manual QA checklist run end-to-end with no blockers
```

If unchecking happens later (regression after MVP done), it gets re-checked before re-declaring done. No silent reversions.

---

## 8. Open Questions

(None currently.)
