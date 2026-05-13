# Phase Acceptance Criteria

> Per-phase completion criteria for the MVP build sequence.
> Tick a box when the criterion is verified. A phase is "done" when every box in that phase is checked.
> Cross-reference: `docs/planning/09-development-process.md` for the planning rationale; `docs/MVP_DEFINITION_OF_DONE.md` for the overall MVP gate; `docs/MANUAL_QA_CHECKLIST.md` for how to verify functional criteria.

---

## How to Use This Doc

1. **Update as you go.** When Claude Code completes a sub-task that satisfies a criterion, tick the box. Do not batch ticks at the end of a phase — that hides which criteria were met when.
2. **Phase status:** mark the phase status (Not Started / In Progress / Complete) at the top of each phase. A phase can be marked Complete only when every checkbox below it is ticked.
3. **Never silently regress.** If a criterion later breaks (e.g. a refactor regresses something), untick the box and address before re-declaring Complete.
4. **Commit references:** include the commit SHA in the status note when marking a phase complete, so the audit trail is clear.

---

## Phase 0 — Repo Skeleton and Planning Docs

**Status:** In Progress *(most prerequisites complete; mobile/Supabase scaffolding pending)*

**Goal:** repo exists, planning docs and specs are committed, basic local environment runs.

### Deliverables

- [x] Repo created on GitHub (`shot-o-clock`)
- [x] First commit pushed
- [x] `CLAUDE.md` committed (with CI-readiness section)
- [x] `docs/AI_BUILD_PROTOCOL.md` and `docs/PROMPT_TEMPLATES.md` committed
- [x] All six specs committed under `docs/specs/`
- [x] `README.md`, `.env.example`, `.gitignore`, `docs/REPO_STRUCTURE.md` committed
- [x] Sliced planning docs committed under `docs/planning/`
- [x] QA docs committed under `docs/` (this file, `MVP_DEFINITION_OF_DONE.md`, `MANUAL_QA_CHECKLIST.md`)
- [x] Expo app scaffolded under `apps/mobile/` (TypeScript, Expo Router)
- [x] Supabase folder initialized (`supabase init` run, `supabase/config.toml` committed)
- [x] Basic lint/format setup in `apps/mobile/` (ESLint + Prettier configs)
- [ ] `.env` created locally (NOT committed) with local Supabase URL and anon key

### Acceptance criteria

- [x] `git status` shows clean working tree
- [ ] `npx expo start` (from `apps/mobile/`) launches a placeholder app on a real device
- [ ] `supabase start` runs cleanly and prints URL + anon key
- [ ] `README.md` setup steps work for a fresh checkout
- [x] No secrets committed

**Phase 0 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 1 — Supabase Schema Foundation

**Status:** Not Started

**Goal:** all MVP tables, enums, indexes, RLS, and helper functions exist in the local Supabase via migrations.

### Deliverables

- [ ] Migration: `_initial_schema.sql` — extensions, all enums (per `docs/specs/enums.md`), all MVP tables (per `docs/specs/schema.md`), indexes, triggers
- [ ] Migration: `_rls_helpers.sql` — helper functions per `rls-rules.md` §12
- [ ] Migration: `_rls_policies.sql` — enable RLS on all user-facing tables; create policies per `rls-rules.md`
- [ ] Optional: `seed.sql` with a sample party and players for dev convenience
- [ ] Generated `db.generated.ts` committed to `apps/mobile/src/types/`

### Acceptance criteria

- [ ] Migrations apply cleanly to a fresh local Supabase (`supabase db reset` succeeds)
- [ ] All MVP tables exist (verify in Supabase Studio)
- [ ] All MVP enums exist with all locked values
- [ ] RLS is enabled on every user-facing table (verify via `pg_tables`)
- [ ] Helper functions exist and return correct values for the seed data
- [ ] At least one negative-access test: as a non-member user, attempting to read another party's session returns zero rows
- [ ] `supabase gen types typescript --local` produces a file that matches the committed `db.generated.ts`
- [ ] All migrations are idempotent (re-running `supabase db reset` produces the same state)

**Phase 1 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 2 — Core RPC Functions

**Status:** Not Started

**Goal:** every MVP RPC from `docs/specs/rpc-contracts.md` exists, is callable, and respects its preconditions.

### Deliverables

One migration per RPC group (or one per RPC, whichever is cleaner). RPCs to implement:

- [ ] `create_party`
- [ ] `join_party` (including reconnect path)
- [ ] `leave_party`
- [ ] `start_game`
- [ ] `mark_done`
- [ ] `mark_self_out`
- [ ] `advance_phase_if_due`
- [ ] `start_next_round`
- [ ] `host_pause_timer`
- [ ] `host_resume_timer`
- [ ] `host_add_time`
- [ ] `host_end_shot_window`
- [ ] `host_skip_to_shot_window`
- [ ] `host_mark_player_active`
- [ ] `host_mark_player_out`
- [ ] `host_remove_player`
- [ ] `end_party`
- [ ] `get_party_state` (read-only helper)
- [ ] `get_server_time` (read-only helper)
- [ ] `get_round_outcomes` (read-only helper)
- [ ] Typed client wrappers in `apps/mobile/src/features/<feature>/api/` for each
- [ ] Error code constants in `apps/mobile/src/types/api.ts` matching `rpc-contracts.md` §15

### Acceptance criteria

- [ ] Each RPC has been called manually from Supabase Studio with a valid set of params and returned the documented success shape
- [ ] Each declared error code can be triggered with the documented failure case
- [ ] Idempotency verified for `mark_done`, `mark_self_out`, `start_next_round`, `end_party`, `advance_phase_if_due`
- [ ] `SECURITY DEFINER` is set on all state-mutating RPCs
- [ ] In-function caller checks reject non-host calls to host-only RPCs
- [ ] All RPCs use the standard return shape (per `rpc-contracts.md` §1.3) — no bare exceptions on handled errors
- [ ] Client wrappers have typed params and return values; no `any` types

**Phase 2 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 3 — Expo App Skeleton

**Status:** Not Started

**Goal:** all MVP routes exist as placeholders matching the Step 5 prototype; navigation works; Supabase client is wired up.

### Deliverables

- [ ] Expo Router configured with the route structure from `docs/REPO_STRUCTURE.md` §2.1
- [ ] Placeholder screens exist for all 13 MVP routes (Start, Rules, Create Party, Join Party, Lobby Host, Lobby Player, Timer Host, Timer Player, Shot O'Clock, Round Results Host, Round Results Player, Roster, Final Summary)
- [ ] `apps/mobile/src/lib/supabase.ts` — typed Supabase client singleton
- [ ] `apps/mobile/src/lib/env.ts` — typed env var loader with required-var validation at startup
- [ ] `apps/mobile/src/lib/time.ts` — server time sync and remaining-time helpers
- [ ] `apps/mobile/src/lib/errors.ts` — error-code-to-message mapping
- [ ] Path aliases configured in `tsconfig.json`
- [ ] Base theme tokens / shared style values in `src/styles/`

### Acceptance criteria

- [ ] `npx expo start` launches the app
- [ ] Every route is reachable via navigation
- [ ] No game logic is embedded in route files (routes import screen components)
- [ ] Supabase client connects to local stack on app launch
- [ ] Missing required env var causes a startup error with a clear message
- [ ] Lint and typecheck both pass with no errors
- [ ] No actual feature logic yet — these are placeholders that look like the wireframes

**Phase 3 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 4 — Guest Identity + Age/Terms Flow

**Status:** Not Started

**Goal:** users can confirm legal age, accept terms, choose a display name, and become an anonymous Supabase user.

### Deliverables

- [ ] Anonymous Auth flow that runs on first app launch
- [ ] Age confirmation screen (or modal) — required before proceeding
- [ ] Terms acceptance screen — required before proceeding
- [ ] Display name entry — required before joining or hosting
- [ ] Local persistence of confirmation flags (so user doesn't re-confirm each launch)
- [ ] Identity feature module: `apps/mobile/src/features/auth/`

### Acceptance criteria

- [ ] First launch: user sees age + terms gates before reaching Create/Join
- [ ] Second launch: gates are skipped (already confirmed)
- [ ] Anonymous user ID is created and stored
- [ ] Display name is required; empty submission shows a clear error
- [ ] Age confirmation: cannot proceed without ticking
- [ ] Terms acceptance: cannot proceed without ticking
- [ ] App stores enough state to reconnect to an in-progress party after a force-close

**Phase 4 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 5 — Create Party + Join Party

**Status:** Not Started

**Goal:** users can create and join parties through the UI, reaching the lobby.

### Deliverables

- [ ] Create Party screen wired to `create_party` RPC
- [ ] Join Party screen wired to `join_party` RPC
- [ ] Both forms validate inputs client-side AND server-side
- [ ] Successful create → navigate to Host Lobby
- [ ] Successful join → navigate to Player Lobby
- [ ] Error states displayed via the shared feedback component
- [ ] Grace mode UI hidden when Elimination is off (per `docs/planning/05-prototype.md`)

### Acceptance criteria

- [ ] Host can create a party with all MVP settings
- [ ] Generated join code displays correctly and is copyable
- [ ] Guest can join with valid code → see lobby
- [ ] Invalid code shows a useful error
- [ ] Reconnect path works (guest joins with same identity → returns existing player row, no duplicate)
- [ ] Cannot create a party while already hosting one (returns ALREADY_HOSTING error)
- [ ] Cannot join a started party (returns PARTY_NOT_JOINABLE)

**Phase 5 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 6 — Lobby + Realtime Roster

**Status:** Not Started

**Goal:** lobby shows live roster updates; host can remove players; players can leave.

### Deliverables

- [ ] Host lobby screen showing party name, join code (copyable), roster
- [ ] Player lobby screen showing party name, "Waiting for host" state, roster
- [ ] Realtime subscription to `party_players` for the current session
- [ ] Host badge displayed correctly
- [ ] Host can remove a player; UI updates on all devices
- [ ] Player can leave the lobby; UI updates on all devices
- [ ] Host's Start Game button enabled when ≥ 1 active player exists

### Acceptance criteria

- [ ] Multiple devices joining the same party see the roster sync live (within 3 seconds)
- [ ] Player join/leave events propagate to all connected devices
- [ ] Removed player's app routes to a "you were removed" or "session ended" state
- [ ] Host cannot remove themselves
- [ ] Start Game is grayed out / disabled when conditions aren't met

**Phase 6 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 7 — Server-Authoritative Timer

**Status:** Not Started

**Goal:** countdown displays correctly across all devices and transitions into shot window when due.

### Deliverables

- [ ] Host can start the game; Round 1 is created with countdown phase
- [ ] Timer hook in `apps/mobile/src/features/game/hooks/` that renders countdown from `phaseEndsAt - serverNow()`
- [ ] Periodic call to `advance_phase_if_due` from connected clients
- [ ] Transition into shot_window when timer expires
- [ ] Late-join behavior: a player loading mid-countdown sees the correct remaining time
- [ ] Timer Player screen (basic, without Shot O'Clock yet)
- [ ] Timer Host screen (with placeholder host controls — wired in Phase 10)

### Acceptance criteria

- [ ] All connected devices show the same countdown (±1 second)
- [ ] When countdown reaches zero, all devices transition to shot_window simultaneously
- [ ] No client-owned `setInterval` is the source of truth for state changes
- [ ] Reload mid-countdown: timer shows correct remaining time
- [ ] No duplicate rounds created when multiple clients call `advance_phase_if_due` concurrently
- [ ] `timer_events` rows are logged for countdown_started and shot_window_started

**Phase 7 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 8 — Shot Window + Player Actions

**Status:** Not Started

**Goal:** full-screen Shot O'Clock screen works; players can Done or I'm Out.

### Deliverables

- [ ] Shot O'Clock screen — full-screen, large countdown, Done and I'm Out buttons
- [ ] Done button wired to `mark_done` RPC
- [ ] I'm Out button wired to `mark_self_out` RPC
- [ ] Optimistic UI feedback on tap (button state changes immediately)
- [ ] Disabled state for non-active players
- [ ] Shot window countdown ends → transition to round_complete

### Acceptance criteria

- [ ] Active player can tap Done during shot window; outcome row created
- [ ] Active player can tap I'm Out during countdown OR shot window
- [ ] Out / removed players cannot tap Done (button disabled or rejected)
- [ ] Duplicate Done taps do not corrupt state (idempotent)
- [ ] Done after shot window closes: error displayed clearly
- [ ] I'm Out followed by Done: Done is rejected (SELF_OUT_IS_STICKY)
- [ ] Player actions visible on other devices within ~3 seconds (via realtime subscription)

**Phase 8 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 9 — Grace Logic + Round Results

**Status:** Not Started

**Goal:** all three grace modes work correctly; round results display.

### Deliverables

- [ ] Round finalization logic in `advance_phase_if_due` (already declared in Phase 2; verify behavior here)
- [ ] Round Results screen for host (with detailed outReason visible)
- [ ] Round Results screen for player (with simple Active/Out display)
- [ ] Start Next Round button (host only)
- [ ] Realtime subscription to `round_player_outcomes` for the current round

### Acceptance criteria

- [ ] `disabled` grace mode: miss → out
- [ ] `enabled` grace mode: first miss → grace_used; second miss → out (verified across 3 rounds)
- [ ] `unlimited` grace mode: misses tracked, never auto-eliminated
- [ ] `eliminationEnabled = false`: missed rounds have no consequence
- [ ] Regular players see simple status; hosts see detailed reason
- [ ] Round results match the data in `round_player_outcomes` for that round
- [ ] Next round starts with the incremented interval (per `intervalIncrementSeconds`)
- [ ] All players see new countdown when next round starts

**Phase 9 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 10 — Host Controls

**Status:** Not Started

**Goal:** host can recover from messy situations and manage the party.

### Deliverables

- [ ] Host controls panel (drawer or modal) accessible from timer screens
- [ ] Pause / Resume buttons
- [ ] Add Time buttons (e.g. +30s, +60s)
- [ ] End Shot Window Early button
- [ ] Mark Player Out / Mark Player Active actions (from roster)
- [ ] Remove Player action (from roster, with confirmation)
- [ ] End Party button (with confirmation)
- [ ] All actions wired to their respective RPCs
- [ ] `admin_action_logs` rows verified after each action

### Acceptance criteria

- [ ] Pause freezes timer on all devices; Resume restarts correctly
- [ ] Add Time updates timer on all devices
- [ ] End Shot Window Early transitions immediately to round_complete
- [ ] Mark Player Out updates roster on all devices
- [ ] Mark Player Active correctly handles `usedGrace` reset (when reinstating after `missed_after_grace`)
- [ ] Remove Player removes from regular roster; host still sees removed players
- [ ] End Party requires confirmation; routes all devices to final summary
- [ ] Non-host cannot trigger any host control (UI hides; RPCs reject)
- [ ] All host actions appear in `admin_action_logs` with correct actor and target

**Phase 10 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 11 — Final Summary

**Status:** Not Started

**Goal:** ending a party shows an accurate summary on all devices.

### Deliverables

- [ ] Final Summary screen
- [ ] Display: party name, total rounds, last standing (if any), total active/out players, shots completed per player
- [ ] Placeholder "memories" / "photos" section that is clearly NOT functional in MVP (or omitted entirely)
- [ ] All connected devices route to this screen when party ends

### Acceptance criteria

- [ ] Ending the party from the host's End Party button routes all devices to the summary
- [ ] Summary data matches the database (total rounds, players, shots)
- [ ] Removed players see an appropriate state (either summary if they were a known member, or "session ended")
- [ ] No live state mutations possible from the summary screen
- [ ] If photo/memories section exists, it is visibly non-functional (greyed out, "coming soon" label, etc.)

**Phase 11 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## Phase 12 — Hardening + Cleanup

**Status:** Not Started

**Goal:** code is consistent, types are tight, RLS is verified, and the full MVP runs cleanly across multiple devices.

### Deliverables

- [ ] Centralized RPC wrappers — no inline `supabase.rpc(...)` calls in screens
- [ ] All shared game-state helpers in `apps/mobile/src/lib/` or `src/features/<feature>/hooks/`
- [ ] No duplicated error-handling logic — consolidated via `lib/errors.ts`
- [ ] Tight TypeScript types — `noImplicitAny`, no unjustified `any`
- [ ] Cleaned up unused fields, dead code, console.logs
- [ ] All planning slices and specs reflect the actual implementation (any drift fixed)
- [ ] README updated with any setup quirks discovered

### Acceptance criteria

- [ ] `tsc --noEmit` clean
- [ ] ESLint clean (no warnings if possible)
- [ ] No `console.log` left in production code paths (logger usage only)
- [ ] `MANUAL_QA_CHECKLIST.md` ran end-to-end with no blockers
- [ ] RLS spot-check from §7 of the QA checklist passes
- [ ] Local Supabase reset → migrations apply → app works (fresh-environment smoke test)
- [ ] Any known issues documented in a separate file (e.g. `docs/KNOWN_ISSUES.md`) so they're not lost

**Phase 12 complete when:** all checkboxes above ticked. Status note: commit `<sha>`.

---

## After Phase 12: MVP Done

When Phase 12 is complete, run `docs/MVP_DEFINITION_OF_DONE.md` end-to-end. That doc is the final gate.

The post-MVP roadmap continues in `docs/planning/10-post-mvp-roadmap.md`.

---

## Open Questions

(None currently. Add as criteria need to be refined during implementation.)
