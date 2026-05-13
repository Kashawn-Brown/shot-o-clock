# Manual QA Checklist

> The multi-device test script for verifying Shot O'Clock works end-to-end.
> Run this at the end of each significant phase and before declaring MVP done.
> Cross-reference: `docs/MVP_DEFINITION_OF_DONE.md` for the gating criteria; `docs/specs/game-rules.md` and `docs/specs/mvp-state-machine.md` for expected behavior.

---

## 1. When to Run This

- **End of every build phase** (per `PHASE_ACCEPTANCE_CRITERIA.md`): run the smoke test and any sections relevant to the new phase.
- **Before declaring MVP done**: run the full checklist end-to-end.
- **After any architectural change** (RPCs, RLS, migrations, schema): run the smoke test plus relevant sections.
- **When something feels off in development**: run the smoke test as a sanity check.

This is manual testing. Automated tests cover the RPCs and SQL layer; this covers the integrated app behavior across real devices.

---

## 2. Setup Requirements

Before starting any test:

- [ ] Local Supabase is running (`supabase start`)
- [ ] Mobile app starts cleanly (`cd apps/mobile && npx expo start`)
- [ ] At least 2 real physical devices available (3 is better), OR 1 real device + 1 simulator + 1 emulator. Web + simulator-only is acceptable for smoke tests but NOT for the full multi-device validation.
- [ ] All devices are on the same wifi network as the dev machine
- [ ] Devices have Expo Go installed (or a development build)
- [ ] Browser DevTools / Supabase Studio open on the dev machine for live database inspection
- [ ] A scratch pad or this checklist open to mark observations

### Recommended device labeling

Throughout this doc, the three test devices are referred to as:

- **Device A** — the host
- **Device B** — player 2
- **Device C** — player 3

Use sticky notes or tape on the back of the devices to keep track during testing. (Yes, this matters when you're juggling three phones.)

---

## 3. Smoke Test (5-Minute Sanity)

Run this anytime you want quick confidence the app still works. Failure here means stop everything and investigate.

- [ ] Open the app on Device A. Land on the Start screen.
- [ ] Tap Create Party. Fill in valid values. Confirm a join code appears.
- [ ] Open the app on Device B. Tap Join Party. Enter the code. See Device A's party.
- [ ] Roster on Device A shows Device B as a player within ~3 seconds.
- [ ] Tap Start Game on Device A. Both devices show a countdown.
- [ ] Wait for the countdown to reach zero. Both devices show the Shot O'Clock screen.
- [ ] On Device B, tap Done. On Device A, do nothing.
- [ ] Wait for shot window to end. Both devices show round results.
- [ ] Tap End Party on Device A. Both devices show final summary.

If any step fails, the build is not in a runnable state. Diagnose before continuing.

---

## 4. Happy Path — Full Multi-Round Session

This is the core test. Verifies the game loop works for multiple rounds with all three player states.

### 4.1. Setup

- [ ] Device A creates a party named "QA Happy Path"
  - Starting interval: 30 seconds
  - Interval increment: 10 seconds
  - Shot window: 15 seconds
  - Elimination: ON
  - Grace mode: Enabled
- [ ] Device B joins as "Bob"
- [ ] Device C joins as "Carol"
- [ ] All three devices show roster: Host, Bob, Carol

### 4.2. Round 1 — everyone completes

- [ ] Device A taps Start Game
- [ ] All devices: countdown begins, starts at 30 seconds
- [ ] At ~10 seconds remaining, all devices show same time (±1 sec)
- [ ] Countdown reaches 0, all devices transition to Shot O'Clock screen
- [ ] Shot window countdown shows 15 seconds
- [ ] Device A taps Done
- [ ] Device B taps Done
- [ ] Device C taps Done
- [ ] Shot window ends naturally
- [ ] All devices show round results: 3 completed, 0 missed
- [ ] Device A taps Start Next Round

### 4.3. Round 2 — one missed, grace applied

- [ ] Countdown shows ~40 seconds (30 + 10 increment)
- [ ] Countdown reaches 0, Shot O'Clock screen
- [ ] Device A taps Done
- [ ] Device B taps Done
- [ ] Device C does NOT tap anything
- [ ] Shot window ends
- [ ] Results screen:
  - Device A and B show as Completed
  - Device C shows as Used Grace (or grey + grace indicator)
  - Carol on Device C remains active
- [ ] Verify in Supabase Studio: `party_players` row for Carol has `usedGrace = true`

### 4.4. Round 3 — second miss eliminates

- [ ] Device A taps Start Next Round
- [ ] Countdown ~50 seconds
- [ ] Shot O'Clock
- [ ] Device A taps Done
- [ ] Device B taps Done
- [ ] Device C does NOT tap anything
- [ ] Shot window ends
- [ ] Results screen:
  - Carol now shown as Out
  - On regular player views (Device B), Carol's outReason is NOT shown explicitly
  - On Device A (host), detailed reason is available (missed_after_grace)
- [ ] Verify in Supabase Studio: Carol's `status = 'out'`, `outReason = 'missed_after_grace'`

### 4.5. Round 4 — self-out

- [ ] Device A taps Start Next Round
- [ ] During countdown, Device B taps I'm Out
- [ ] Device A and Device B should both see Bob's status update
- [ ] Countdown continues to 0
- [ ] Shot O'Clock screen
- [ ] On Device B, Done button should not be tappable (Bob is out)
- [ ] On Device A, tap Done
- [ ] Shot window ends
- [ ] Results screen:
  - Host shown as Completed
  - Bob shown as Out (self_out)
  - Carol still Out from round 3
- [ ] Verify: Bob's `status = 'out'`, `outReason = 'self_opted_out'`

### 4.6. Last standing

- [ ] Device A taps Start Next Round
- [ ] Host is the only active player
- [ ] Countdown runs, Shot O'Clock fires
- [ ] Host taps Done
- [ ] Round results, host completed
- [ ] Device A taps End Party
- [ ] Confirmation modal appears (dangerous action)
- [ ] Confirm
- [ ] All three devices show Final Summary:
  - Total rounds: 5
  - Last standing: Host
  - Shots completed per player

---

## 5. Host Controls Test

Verifies the host can recover from messy situations.

### 5.1. Pause and resume

- [ ] Create new party, B and C join, host starts game
- [ ] Mid-countdown, Device A taps Pause
- [ ] All devices: timer freezes
- [ ] Wait ~10 seconds
- [ ] Device A taps Resume
- [ ] Timer resumes from where it was, NOT from a new start
- [ ] Verify `party_sessions.total_paused_seconds` increased by ~10

### 5.2. Add time

- [ ] During countdown with ~15 seconds remaining, Device A taps Add 30s
- [ ] Timer immediately jumps to ~45 seconds remaining
- [ ] All devices see the same new remaining time

### 5.3. End shot window early

- [ ] During shot window, Device A taps End Shot Window
- [ ] Shot window ends immediately
- [ ] Round results appear

### 5.4. Mark player out

- [ ] Mid-game, Device A opens host controls
- [ ] Tap "Mark Bob Out"
- [ ] Bob's status changes to Out on all devices
- [ ] Verify Bob's `outReason = 'host_marked_out'`

### 5.5. Reinstate player

- [ ] Continue from 5.4 — Bob is out
- [ ] Device A taps "Mark Bob Active" (reinstate)
- [ ] Bob's status changes back to Active on all devices
- [ ] Bob's `outReason`, `outRoundNumber`, `outAt` are cleared (or stale, per spec)
- [ ] If Bob was out via `missed_after_grace`, his `usedGrace` is now reset to false

### 5.6. Remove player

- [ ] Mid-game, Device A taps "Remove Carol"
- [ ] Confirmation modal appears
- [ ] Confirm
- [ ] Carol's app shows ended/removed state
- [ ] Host's roster on Device A still shows Carol (host can see removed players)
- [ ] Device B's roster does NOT show Carol
- [ ] Carol cannot rejoin with the same code

---

## 6. Edge Cases

### 6.1. Invalid join code

- [ ] Device B tries to join with code `ZZZZZZ`
- [ ] Error: "Invalid code" or similar
- [ ] No new party_players row is created

### 6.2. Duplicate Done taps

- [ ] During shot window on Device B, tap Done 3 times rapidly
- [ ] Only one outcome row exists for Bob in this round
- [ ] No errors visible to the user; second/third taps are silent no-ops or show confirmation

### 6.3. Done after shot window closed

- [ ] During shot window, do not tap Done on Device B
- [ ] Shot window closes
- [ ] On Device B, force-tap Done (if button is still visible — it should not be)
- [ ] Either: button is disabled, OR backend returns SHOT_WINDOW_CLOSED error and UI displays "too late"

### 6.4. Removed player tries to act

- [ ] Host removes Bob mid-session
- [ ] On Device B, try to tap I'm Out or Done
- [ ] Backend rejects with NOT_IN_PARTY or PLAYER_REMOVED error
- [ ] UI handles gracefully

### 6.5. Non-host tries host action

- [ ] On Device B (not host), inspect the app — host controls should NOT be visible
- [ ] If you manage to bypass UI (e.g. with a manual RPC call via Supabase Studio): backend returns NOT_HOST error

### 6.6. Reconnect after backgrounding

- [ ] Mid-countdown, send Device B's app to background for 30 seconds
- [ ] Bring app back to foreground
- [ ] Timer is in sync with other devices
- [ ] No duplicate player rows created

### 6.7. Reconnect after force-close

- [ ] Mid-game, force-close Device B's app
- [ ] Reopen Expo Go and re-launch the app
- [ ] Bob's session is restored to the correct state
- [ ] No duplicate player rows

### 6.8. All players opt out during countdown

- [ ] Create a party with B and C
- [ ] Host starts game
- [ ] During countdown, both B and C tap I'm Out
- [ ] When timer expires, transition to shot_window is BLOCKED (no active players besides host who is also playing)
- [ ] Host sees a clear message about no active players
- [ ] (Workaround: host can reinstate someone or end the party)

### 6.9. Grace re-grant on reinstatement

- [ ] Player goes out via `missed_after_grace` (run rounds with grace=enabled, miss twice)
- [ ] Verify `usedGrace = true` before reinstatement
- [ ] Host reinstates
- [ ] Verify `usedGrace = false` after reinstatement
- [ ] In a subsequent round, that player can miss once and only use grace (not get out)

---

## 7. RLS Verification

These tests confirm Row Level Security is working. Easiest with two devices on different parties + Supabase Studio.

### 7.1. Cross-party isolation

- [ ] Device A creates Party 1
- [ ] On a different account/anonymous-user, Device B creates Party 2
- [ ] In Supabase Studio, log in as Device B's auth.uid()
- [ ] Try to SELECT * FROM party_sessions WHERE id = '<Party 1 id>'
- [ ] Expected: zero rows returned
- [ ] Try to SELECT * FROM party_players WHERE party_session_id = '<Party 1 id>'
- [ ] Expected: zero rows returned

### 7.2. Removed player isolation

- [ ] Host removes a player mid-game
- [ ] As the removed player's auth.uid, try to read `party_sessions` row
- [ ] Expected: only their own `party_players` row is visible; session, rounds, other players are hidden
- [ ] The removed player's UI should reflect this (they don't see updates from the still-running party)

### 7.3. Direct write attempts

- [ ] As any authenticated user, attempt INSERT into `party_sessions` directly from Supabase Studio
- [ ] Expected: permission denied (no policy grants this)
- [ ] Attempt UPDATE on `party_players` to change own status to 'active' after being marked out
- [ ] Expected: permission denied

---

## 8. Performance Sanity

Not strict tests, but rough sanity checks. If any of these feel obviously bad, file as a follow-up.

- [ ] App launches to the Start screen in under 3 seconds on a mid-range device
- [ ] Joining a party (entering code → seeing roster) completes in under 2 seconds
- [ ] Tapping Done shows confirmation feedback in under 1 second
- [ ] Realtime updates (other devices' actions) appear in under 3 seconds
- [ ] No visible jank or dropped frames on the Shot O'Clock screen

---

## 9. Cleanup

After testing:

- [ ] End or expire any active test parties via the app
- [ ] In Supabase Studio, verify no test parties are stuck in `lobby` or `active` status
- [ ] If lots of test data accumulated, optionally `supabase db reset` to start fresh
- [ ] Note any bugs or unexpected behavior found in a separate log

---

## 10. Reporting Issues

If anything fails during QA:

1. Note the exact step that failed
2. Capture the state: which devices, what was the timer showing, what was in the database
3. File the issue with: section number from this checklist, expected behavior, actual behavior, repro steps
4. Do NOT mark the relevant phase as done until the issue is resolved

For bugs found mid-test that block continuing, stop the test and address. Don't try to work around a bug to keep going — that defeats the purpose.

---

## 11. Open Questions

(None currently. Add testing edge cases as they're discovered in practice.)
