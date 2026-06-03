> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: See `docs/MVP_DEFINITION_OF_DONE.md` for the locked completion checklist and `docs/PHASE_ACCEPTANCE_CRITERIA.md` for per-phase done criteria.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 4: Nail the MVP

## MVP Definition

The MVP of Shot O'Clock is:

> A mobile-first drinking-game session where a host creates a party, players join by code, a synced timer runs, Shot O'Clock triggers, players mark Done or I'm Out, the roster updates, and the game continues into the next round.

That is the minimum version that proves the app is useful.

## MVP Includes

1. Legal-age confirmation + basic terms
2. Guest-first join flow
3. Host creates a party
4. Party name + join code
5. Lobby roster
6. Host starts game
7. Synced countdown timer
8. Full-screen **SHOT O'CLOCK** window
9. Player taps **Done** or **I'm Out**
10. Active/out roster status
11. Grace mode: disabled / enabled / unlimited
12. Host controls:
    - pause/resume
    - add time
    - end shot window early
    - mark player active/out
    - remove player
    - end party
13. Basic round results
14. Next round loop
15. Basic final summary

## Must-Have MVP Areas

### A. Age Confirmation + Basic Terms

Required because the app is alcohol-related.

MVP includes:

- user confirms legal drinking age
- user accepts basic terms/responsible-use disclaimer
- guests must also confirm before joining
- no ID verification
- no full legal system yet

### B. Guest-First Joining

MVP includes:

- join as guest
- enter display name
- accept age/terms confirmation
- join party by code
- guest identity persists during the session if app reloads/reopens

Not MVP:

- guest claiming history after account creation
- full user profile
- profile image/avatar
- account stats

### C. Host Creates Party

MVP includes:

- create party/session
- set party name
- generate join code
- choose basic game settings:
  - starting interval
  - interval increment
  - shot window length
  - grace mode
  - elimination on/off
- host automatically joins as a player
- host can start the game from lobby

MVP settings should be limited to:

```text
startingIntervalSeconds
intervalIncrementSeconds
shotWindowSeconds
eliminationEnabled
graceMode: disabled / enabled / unlimited
```

### D. Lobby

MVP includes:

- party name
- join code
- player roster
- host indicator
- player joined/left updates
- host can remove player before game starts
- host starts game

### E. Synced Timer

MVP includes:

- everyone sees same countdown
- timer based on server/session timestamp
- current round number
- current phase:
  - lobby
  - countdown
  - shot_window
  - round_results / next_round
  - ended
- countdown automatically transitions into Shot O'Clock window
- next round uses incremented interval

### F. Shot O'Clock Moment

MVP includes:

- full-screen **SHOT O'CLOCK** screen
- visible shot window countdown
- basic sound/vibration alert if possible in-app
- player can tap **Done** or **I'm Out**

### G. Player Actions

MVP includes:

- tap Done
- tap I'm Out
- see confirmation that action was recorded
- inactive/out players stay visible but greyed out
- player can leave/mark self out at any point

### H. Roster + Status Tracking

MVP includes:

- active players
- out players
- removed players hidden or marked separately for host
- active/out tab or simple grouped list
- greyed-out out players
- basic shot count / round count per player

### I. Host Controls

MVP includes:

- pause timer
- resume timer
- add time
- end shot window early
- mark player out
- mark player active again
- remove player
- end party

### J. Grace Mode

MVP includes:

```text
graceMode:
- disabled
- enabled
- unlimited
```

Meaning:

- disabled: miss once and you are out
- enabled: first miss is forgiven, second miss makes you out
- unlimited: misses are tracked, but players are not automatically eliminated

### K. Basic Round Results

MVP includes:

- who tapped Done
- who marked Out
- who missed
- who used grace
- who is now out
- host can continue to next round
- next round timer starts

### L. Basic Session End

MVP includes:

- host ends session
- final screen shows:
  - party name
  - total rounds
  - players still active
  - players out
  - basic shots completed per player

## Cut From MVP

- referee pool
- assigned monitors
- assigned admins
- phone-level notifications
- persistent timer notification
- party albums
- saved history
- full accounts as required path
- shareable recaps
- advanced stats
- custom sounds
- custom themes
- web/TV display

## MVP State Machine

```text
Lobby
↓
Countdown
↓
Shot Window
↓
Round Results
↓
Next Round Countdown
↓
...
↓
Ended
```

Do not include these in MVP yet:

```text
Referee Confirmation
Host Review
Media Upload
Saved Recap
```

## Recommended Build Order for MVP

1. Guest/host identity flow
2. Create party + join code
3. Lobby + roster
4. Start game
5. Synced countdown
6. Shot window
7. Done / I'm Out
8. Status updates
9. Grace logic
10. Host controls
11. Round results
12. Next round loop
13. End party summary

---

