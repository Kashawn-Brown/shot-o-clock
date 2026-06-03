> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: See `docs/specs/rpc-contracts.md` for the implementation surface and `docs/REPO_STRUCTURE.md` §2.3 for the code layout.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 7: Drill Into the Components

## Core Architecture Direction

Shot O'Clock is not a local timer app.

It is:

> A mobile-first realtime party session app where the timer, roster, player actions, round results, and host controls are shared session state.

The MVP should be built around:

```text
Mobile-first app
+ synced shared party sessions
+ server/session-authoritative timer
+ guest-first identity
+ backend/realtime layer
+ simple MVP state machine
+ future-ready notifications/media/web display
```

## Locked Architecture Decisions

### 1. Synced Shared Session App

Chosen direction:

```text
Host creates party
Players join by code
Everyone sees shared timer/session state
Players can tap Done or I'm Out
Roster updates live
```

Rejected direction:

```text
Only host has local timer
Everyone else watches manually
```

The local-only version is too small and does not support the real product vision.

### 2. Server/Session-Authoritative Timer

The session should store:

```text
currentPhase
phaseStartedAt
phaseEndsAt
currentRoundNumber
```

Clients calculate:

```text
timeRemaining = phaseEndsAt - currentServerTime
```

This supports synced countdowns, reconnecting, late joins, host controls, future notifications, and future web/TV display.

### 3. Guest-First MVP

MVP should not require full accounts.

Chosen direction:

```text
Guest joins quickly with display name + age/terms confirmation
```

Future direction:

```text
Guest can later create an account and claim history/media
```

### 4. Simple MVP State Machine

MVP phases:

```text
lobby
countdown
shot_window
round_results
ended
```

Future phases to leave room for:

```text
referee_confirmation
host_review
```

## Core Components

### 1. Mobile Client

Responsible for:

- start screen
- rules screen
- create party
- join party
- lobby
- main timer
- Shot O'Clock screen
- player Done / I'm Out actions
- roster
- round results
- final summary
- host controls

Important rule:

> The mobile client displays and submits actions. It should not be the source of truth for game state.

### 2. Identity Component

Responsible for:

- guest identity
- future user accounts
- legal-age confirmation
- terms acceptance
- guest reconnect behavior
- future guest-to-user conversion

MVP version:

```text
Guest identity only
Display name
Age/terms confirmation
Local guest token
```

### 3. Party Session Component

Responsible for:

- party creation
- party name
- join code
- lobby state
- session status
- player joining/leaving
- session locking later
- ending party

### 4. Game State Machine Component

Responsible for:

- lobby → countdown
- countdown → shot window
- shot window → round results
- round results → next countdown
- session → ended

Also enforces:

- interval increment
- shot window length
- grace mode
- elimination behavior
- player status changes

### 5. Realtime Sync Component

Responsible for pushing live updates:

- player joined
- player left
- timer phase changed
- player tapped Done
- player went Out
- roster changed
- host added time
- round ended
- next round started
- party ended

Without realtime sync, Shot O'Clock becomes a worse clock app.

### 6. Roster / Player Status Component

Responsible for:

- active players
- out players
- removed players
- host/player badges
- player status display
- basic per-player round counts
- greyed-out out players

Locked display rule:

```text
Regular players mostly see:
- Active
- Out
```

Host/admin can see more detail later.

### 7. Host Controls Component

MVP host controls:

- start game
- pause timer
- resume timer
- add time
- end shot window early
- mark player active
- mark player out
- remove player
- end party

Dangerous actions like End Party should require confirmation.

### 8. Round Outcome Component

Responsible for recording:

- player tapped Done
- player marked I'm Out
- player missed
- grace was used
- player became out
- host override happened
- final round result

### 9. Notification Component

Not MVP, but important soon.

Future responsibilities:

- phone-level Shot O'Clock alerts
- round-starting alerts
- pre-shot warning notifications
- sound/vibration preferences
- notification permission state
- future persistent timer notification

### 10. Referee Component

Future, not MVP.

Responsibilities later:

- referee pool mode
- assigned monitor mode
- confirmation list
- referee verdicts
- questionable results
- host/admin override

### 11. Admin Component

Future, not MVP.

Later:

- host promotes player to admin
- admin can pause/resume/add time
- admin can help finalize rounds
- admin permission limits
- admin action logs

### 12. Media Album Component

Future pillar, not MVP.

Responsibilities later:

- party albums
- photo/video uploads
- media storage
- thumbnails
- download/share
- privacy controls
- moderation/reporting
- guest media claiming

Important rule:

> Do not mix media logic into the timer/game logic.

### 13. Web / TV Display Component

Future, not MVP.

Possible future use:

- big-screen timer
- QR/join code display
- final recap screen
- TV/desktop display mode

This should consume the same session state as the mobile app.

## Recommended High-Level System Shape

```text
Mobile App
  ↓
Session / Game Backend
  ↓
Realtime Sync Layer
  ↓
Database / Storage Layer

Future:
Notification Layer
Media Album Layer
Web / TV Display Layer
```

## Step 7 Summary

Shot O'Clock should be built as a mobile-first realtime session app with a server/session-authoritative timer and guest-first identity.

---

