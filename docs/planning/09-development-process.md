> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: See `docs/AI_BUILD_PROTOCOL.md` for the operational version of this workflow and `docs/PROMPT_TEMPLATES.md` for the templates.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 9: Overall MVP Development Process

## Development Philosophy

Shot O'Clock should be built in small, testable chunks, not as one giant AI-generated dump.

Rule:

> No feature gets built until its rules, edge cases, required data, and acceptance criteria are clear.

This matters because the app has realtime state, timers, player status, grace logic, and host overrides. If AI improvises those rules, the codebase will become unreliable fast.

## 1. Repo Strategy

Use one repo for the MVP.

```text
shot-o-clock/
  apps/
    mobile/
  supabase/
    migrations/
    seed.sql
    functions/        # future, only when needed
  docs/
    planning/
    specs/
  package.json
  README.md
```

Do not split into multiple repos yet.

## 2. Tooling Setup

Mobile:

```text
React Native
Expo
TypeScript
Expo Router
```

Supabase:

```text
Supabase CLI
Supabase local development
Supabase migrations
Supabase Postgres
Supabase Auth
Supabase Realtime
```

Use migrations from day one. No dashboard-only schema changes unless captured immediately into migrations.

## 3. Branching / PR Workflow

Keep it simple.

```text
main
feature/<small-feature-name>
```

Each feature branch should have:

- one clear goal
- acceptance criteria
- screenshots if UI changed
- migration file if schema changed
- tests or manual test notes

Example branches:

```text
feature/project-skeleton
feature/supabase-schema
feature/create-party-rpc
feature/join-party-flow
feature/realtime-lobby
feature/game-timer
feature/shot-window
feature/grace-logic
feature/host-controls
```

## 4. Documentation First

Create:

```text
docs/planning/01-goal.md
docs/planning/02-user-stories.md
docs/planning/03-data-models.md
docs/planning/04-mvp.md
docs/planning/05-prototype.md
docs/planning/06-future.md
docs/planning/07-components.md
docs/planning/08-stack.md
docs/planning/09-development-process.md
docs/planning/10-post-mvp-roadmap.md
```

Also create:

```text
docs/specs/mvp-state-machine.md
docs/specs/game-rules.md
docs/specs/rpc-contracts.md
docs/specs/rls-rules.md
```

These specs are important because this is an AI-led build.

## 5. Build Order Overview

```text
Phase 0: Planning docs + repo skeleton
Phase 1: Supabase schema + RLS + core RPC contracts
Phase 2: Expo app skeleton + navigation
Phase 3: Guest identity + age/terms flow
Phase 4: Create party + join party
Phase 5: Lobby + realtime roster
Phase 6: Server-authoritative timer
Phase 7: Shot window + player actions
Phase 8: Grace logic + round results
Phase 9: Host controls
Phase 10: Final summary
Phase 11: Hardening, cleanup, tests
Phase 12: Private alpha test
```

## Phase 0 — Repo Skeleton and Planning Docs

Build:

- create repo
- create Expo app under `apps/mobile`
- initialize Supabase folder
- add README
- add planning docs
- add `.env.example`
- add basic lint/format setup

Acceptance criteria:

- repo runs locally
- mobile app starts
- Supabase folder exists
- planning docs are committed
- README explains setup steps
- no secrets committed

Suggested commit:

```text
chore: initialize Shot O'Clock project

- add Expo mobile app skeleton
- add Supabase project folder
- add planning docs and setup README
```

## Phase 1 — Supabase Schema Foundation

Build migrations for MVP tables:

```text
profiles / identities
party_sessions
party_settings
party_players
rounds
round_player_outcomes
admin_action_logs
timer_events
```

Include enums for:

```text
party_status
party_phase
player_permission_role
player_status
player_duty
grace_mode
round_status
player_action
final_outcome
```

Acceptance criteria:

- migrations apply cleanly locally
- tables exist
- enums exist
- RLS enabled on user-facing tables
- basic policies prevent non-party members from reading private party data
- seed data can create a demo party

Suggested commit:

```text
feat: add initial Supabase schema

- add party, player, round, and outcome tables
- add core enums for game state
- enable initial RLS policies
```

## Phase 2 — Core RPC Functions

Build controlled database functions/RPCs:

```text
create_party()
join_party()
start_game()
mark_done()
mark_self_out()
start_next_round()
host_add_time()
host_pause_timer()
host_resume_timer()
host_mark_player_out()
host_mark_player_active()
host_remove_player()
end_party()
```

Required rules:

- only host can start game
- only party members can join/read party state
- removed players cannot act
- out players cannot tap Done
- players can only tap Done during shot_window
- host controls require host permission
- start_next_round must be idempotent
- graceMode must be applied consistently

Acceptance criteria:

- create_party creates session, settings, and host player
- join_party validates code and creates player
- start_game creates Round 1 and countdown phase
- invalid actions fail cleanly
- repeated calls do not corrupt state

Suggested commit:

```text
feat: add core game RPC functions

- add party creation and join functions
- add game start and player action functions
- enforce basic host/player rules
```

## Phase 3 — Expo App Skeleton

Mobile app structure:

```text
apps/mobile/
  app/
    index.tsx
    rules.tsx
    create-party.tsx
    join-party.tsx
    party/
      [partyId]/
        lobby.tsx
        timer.tsx
        shot-window.tsx
        results.tsx
        roster.tsx
        summary.tsx
  src/
    components/
    features/
      auth/
      party/
      game/
      roster/
      host-controls/
    lib/
      supabase.ts
      time.ts
    types/
```

Acceptance criteria:

- app launches
- routes exist
- placeholder screens match Step 5 prototype
- Supabase client is configured using env vars
- no game logic embedded in screens yet

Suggested commit:

```text
feat: add mobile navigation skeleton

- add Expo Router screens for MVP flow
- add Supabase client setup
- add placeholder UI for main app routes
```

## Phase 4 — Guest Identity + Age/Terms Flow

Build:

- anonymous auth session
- display name
- legal-age confirmation
- terms confirmation
- local persisted guest identity
- basic validation

Acceptance criteria:

- user can open app and continue as guest
- display name is required before joining/hosting
- age confirmation is required
- terms confirmation is required
- app stores enough identity to reconnect

Suggested commit:

```text
feat: add guest identity flow

- add anonymous user setup
- require display name and age confirmation
- persist guest identity locally
```

## Phase 5 — Create Party + Join Party

Build:

- Create Party screen connected to `create_party()`
- Join Party screen connected to `join_party()`
- join code validation
- navigate to lobby after success
- error states

Acceptance criteria:

- host can create party with MVP settings
- join code is generated
- guest can join with valid code
- invalid code shows useful error
- duplicate/rejoin behavior does not create obvious duplicates

Suggested commit:

```text
feat: add create and join party flows

- connect create party screen to Supabase RPC
- connect join party screen to join code flow
- add basic error handling
```

## Phase 6 — Lobby + Realtime Roster

Build:

- Host lobby
- Player lobby
- player roster
- host badge
- leave party
- host remove player
- realtime roster updates

Acceptance criteria:

- multiple devices can join same party
- roster updates live
- host sees Start Game
- players see Waiting for Host
- removed player can no longer act

Suggested commit:

```text
feat: add realtime lobby roster

- add host and player lobby views
- subscribe to party player updates
- allow host to remove players
```

## Phase 7 — Server-Authoritative Timer

Build:

- start game from lobby
- create first round
- set countdown phase
- store `phaseStartedAt` and `phaseEndsAt`
- client renders countdown from server/session timestamp
- transition to shot window when due

Do not do:

- no client-owned game timer
- no setInterval as source of truth
- no local-only phase transitions

Acceptance criteria:

- host starts game
- all devices show same round and countdown
- late join/reload shows correct remaining time
- timer reaches zero and enters shot_window
- timer does not create duplicate rounds

Suggested commit:

```text
feat: add synced game timer

- start game with server timestamp phase data
- render countdown from shared session state
- transition countdown into shot window
```

## Phase 8 — Shot Window + Player Actions

Build:

- Shot O'Clock screen
- shot window countdown
- Done button
- I'm Out button
- record player action
- update outcome rows

Acceptance criteria:

- player can tap Done only during shot_window
- player can tap I'm Out during countdown or shot_window
- out players cannot tap Done
- action state updates across devices
- duplicate taps do not corrupt outcome

Suggested commit:

```text
feat: add shot window player actions

- add Shot O'Clock screen
- allow active players to mark Done or I'm Out
- record round outcomes safely
```

## Phase 9 — Grace Logic + Round Results

Implement locked grace modes:

```text
disabled
enabled
unlimited
```

Rules:

```text
disabled:
- miss means out

enabled:
- first miss uses grace
- second miss means out

unlimited:
- misses are tracked
- no automatic out
```

Acceptance criteria:

- grace disabled works
- grace enabled only forgives first miss
- unlimited grace tracks misses without eliminating
- regular players only see simple status
- host can see enough detail to manage the round

Suggested commit:

```text
feat: add grace logic and round results

- apply disabled, enabled, and unlimited grace modes
- add host and player round result screens
- update player statuses after each round
```

## Phase 10 — Host Controls

Build host controls:

- pause timer
- resume timer
- add time
- end shot window early
- mark player active
- mark player out
- remove player
- end party

Safety rules:

- End Party requires confirmation
- Remove Player requires confirmation
- only host can use host controls in MVP
- host actions are logged

Acceptance criteria:

- host can recover from messy party situations
- non-host cannot access controls
- controls update all clients live
- dangerous actions are confirmed
- admin_action_logs are created

Suggested commit:

```text
feat: add MVP host controls

- add pause, resume, and add-time actions
- add player status override actions
- log host actions
```

## Phase 11 — Final Summary

Build:

- end party
- final summary screen
- total rounds
- active/out players
- shots completed per player
- last standing if applicable
- placeholder for future memories/recap

Acceptance criteria:

- host can end party
- all players see ended state
- summary data is accurate
- no media upload exists yet
- future memories section is clearly non-functional or hidden

Suggested commit:

```text
feat: add party final summary

- add ended party state
- show basic final results
- summarize player shots and statuses
```

## Phase 12 — Hardening + Cleanup

Required cleanup:

- remove duplicated Supabase calls
- centralize API/RPC wrappers
- centralize game-state helpers
- tighten TypeScript types
- clean screen components
- extract shared UI components
- remove unused fields/code
- improve error messages
- verify RLS
- add manual QA checklist

Acceptance criteria:

- no obvious duplicated game logic
- all core RPC calls have wrappers
- all locked MVP flows tested manually
- RLS policies checked against non-member access
- app works across at least 2-3 devices

Suggested commit:

```text
chore: harden MVP game flow

- clean duplicated game-state logic
- tighten types and error handling
- verify core multiplayer flows
```

## AI-Led Build Rules

Do not prompt AI like:

```text
Build the whole Shot O'Clock app.
```

Use this shape:

```text
We are building Shot O'Clock, a React Native + Expo + Supabase app.

Current task:
[one specific task]

Relevant locked rules:
[paste only the relevant rules]

Files involved:
[list files]

Do not change:
[architecture constraints]

Acceptance criteria:
[clear checklist]

Output:
- explain changes briefly
- provide complete code for changed files
- mention migration or env changes
- mention tests/manual checks
```

## Testing Strategy

Test these first:

```text
create_party()
join_party()
start_game()
mark_done()
mark_self_out()
grace logic
host_add_time()
host_mark_player_out()
host_mark_player_active()
end_party()
```

Manual device testing before MVP done:

```text
1 host + 2 players
host creates party
players join by code
host starts game
all devices see same countdown
one player taps Done
one player does nothing
shot window ends
correct result is shown
next round starts
host adds time
host pauses/resumes
player marks I'm Out
host ends party
summary is accurate
```

Edge cases:

```text
invalid join code
player closes app and reopens
host closes app and reopens
duplicate Done taps
Done after shot window
removed player tries to act
non-host tries host action
grace enabled first miss
grace enabled second miss
unlimited grace miss
```

## Definition of Done for MVP

MVP is done when:

```text
A host can create a party.
At least two guests can join by code.
The host can start the game.
All devices show the same timer.
Shot O'Clock triggers correctly.
Players can tap Done or I'm Out.
Grace logic works.
Roster status updates live.
Host can control/correct the session.
Rounds can continue.
Host can end the party.
Final summary is accurate.
```

Also:

```text
no required account signup
no hardcoded party/session IDs
no client-owned timer state
no direct client mutation of protected game state
no obvious RLS holes for party data
no secrets committed
no albums/referees/notifications pretending to be MVP
```

## MVP Non-Goals

Do not build during MVP:

- referee pool
- assigned monitors
- assigned admins
- full user accounts
- saved history dashboard
- phone-level notifications
- persistent timer notification
- media uploads
- party albums
- shareable recap
- advanced stats
- themes
- custom sounds
- web/TV display

## Development Checkpoints

### Checkpoint 1 — Skeleton Works

- Expo app runs
- Supabase local stack runs
- README setup works

### Checkpoint 2 — Database Foundation Works

- migrations apply
- seed data works
- RLS enabled
- basic RPCs callable

### Checkpoint 3 — First Vertical Slice

- host creates party
- player joins
- both see lobby roster

### Checkpoint 4 — Game Loop Works

- start game
- timer runs
- shot window opens
- Done / I'm Out works
- results show
- next round starts

### Checkpoint 5 — Host Recovery Works

- pause/resume
- add time
- mark active/out
- remove player
- end party

### Checkpoint 6 — MVP Alpha

- tested on multiple devices
- core edge cases handled
- README updated
- known issues documented

---

