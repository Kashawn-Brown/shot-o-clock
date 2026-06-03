> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: The wireframes in the project zip implement these screens. See `docs/REPO_STRUCTURE.md` §2.1 for where the route files live.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 5: Stupid Simple Prototype

## Locked MVP Screen Flow

```text
Start
→ Create Party / Join Party / Rules

Host flow:
Create Party
→ Lobby Host
→ Timer Host
→ Shot O'Clock
→ Round Results Host
→ Timer Host for next round
→ Final Summary

Player flow:
Join Party
→ Lobby Player
→ Timer Player
→ Shot O'Clock
→ Round Results Player
→ Timer Player for next round
→ Final Summary / Leave
```

## Locked MVP Screens

1. Start Screen
2. Rules / How to Play Screen
3. Create Party Screen
4. Join Party Screen
5. Lobby — Host View
6. Lobby — Player View
7. Timer — Host View
8. Timer — Player View
9. Shot O'Clock Window
10. Round Results — Host View
11. Round Results — Player View
12. Roster Screen
13. Final Summary Screen

## Screen Details

### 1. Start Screen

Purpose: entry point.

Includes:

- app name/logo
- Create Party
- Join Party
- Rules / How to Play
- legal drinking age / responsible-use note

### 2. Rules / How to Play Screen

Purpose: explain the game before users join.

Rules should explain Grace like this:

```text
No Grace: miss once and you're out.
Grace: first miss is forgiven.
Unlimited Grace: misses are tracked, but nobody is automatically out.
```

Keep this short. It should not become legal-document soup.

### 3. Create Party Screen

Purpose: host configures the MVP game.

Includes:

- party name
- starting interval
- interval increase
- shot window length
- elimination mode
- grace mode
- create party button

Important UX rule:

```text
Elimination off → Grace mode disabled/hidden
Elimination on → Grace mode shown
```

### 4. Join Party Screen

Purpose: guest joins quickly.

Includes:

- join code
- display name
- legal-age confirmation
- terms/rules checkbox
- join button

Future improvement: show party name after code validation before final join.

### 5. Lobby Screens

Host lobby includes:

- party name
- join code
- copy/share code
- roster
- host badge
- start game button
- remove player option

Player lobby includes:

- party name
- waiting for host
- roster
- host badge
- leave party

### 6. Main Timer Screens

Player timer includes:

- party name
- round/shot number
- “Next Shot O'Clock in”
- huge countdown
- View Roster
- I'm Out

Host timer includes:

- same timer
- pause button
- add 30s
- add 1 min
- roster
- host controls
- I'm Out
- end party

Risky/destructive actions like **End Party** should be behind Host Controls or require confirmation.

### 7. Shot O'Clock Screen

Purpose: the main event.

Includes:

- huge **SHOT O'CLOCK**
- shot window countdown
- Done
- I'm Out

Add small context:

```text
Round 3 · Friday Night Shots
```

### 8. Round Results Screens

Host results includes:

- completed
- missed
- used grace
- out
- mark active/out overrides
- start next round
- end party

Player results includes:

- own result
- other player results
- waiting for next round
- view full roster

Locked display rule:

For regular players, show **Out**, not the detailed out reason. Host/admin may see detailed reason.

### 9. Roster Screen

Purpose: let users see who is active/out without cluttering the main timer.

Includes:

- party name
- active/out counts
- active list
- out list
- grace indicator
- host actions: mark out, mark active, remove

Keep player version read-only. Host/admin version gets actions.

### 10. Final Summary Screen

Purpose: end the party cleanly.

Includes:

- party complete
- party name
- last standing
- total rounds
- final standings
- shots completed
- placeholder future memory/photo area

The camera/memories section is allowed as a future placeholder, but should not pretend uploads exist in MVP.

## UX Decisions Locked From Step 5

1. Timer-first design.
2. Host and player views are separate.
3. Host controls exist, but should not dominate.
4. Out reason is mostly hidden from regular players.
5. Shot O'Clock screen should be dramatic and simple.
6. Grace is visible only where relevant.
7. Future albums can be hinted at, not built.

## Fixes Before Coding

1. Disable Grace Mode when Elimination Mode is off.
2. Add confirmation before End Party.
3. Make host remove-player action clearer.
4. Clarify missed vs out in host results.
5. Add round/party context to Shot O'Clock screen.
6. Keep regular player result reasons simple: Active / Out / Completed / Used Grace.
7. Decide whether next round starts manually or automatically. For MVP, host-start next round is safer.

---

