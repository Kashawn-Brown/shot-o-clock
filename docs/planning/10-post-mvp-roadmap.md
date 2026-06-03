> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: Post-MVP order is locked here. No specs exist yet for these features — they will be written when each phase begins.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 10: Post-MVP Expansion Roadmap

## Purpose

Step 10 defines what happens after the MVP works.

MVP proves:

> Host creates party → players join → synced timer → Shot O'Clock window → Done/I'm Out → grace logic → round results → host controls → final summary.

Post-MVP expands the app without polluting the first build.

## Post-MVP Strategy

Shot O'Clock should grow in this order:

1. Improve the live game experience.
2. Improve real-party usability.
3. Add saved sessions/history.
4. Add party memories/albums.
5. Add larger-party controls.
6. Prepare for public/app-store release.
7. Add deeper stats only if they actually matter later.

Stats are not the point of the app. The live game and saved party experience matter more.

## Locked Post-MVP Order

```text
1. Referee Pool Mode
2. Phone-Level Shot O'Clock Notifications
3. User Accounts + Saved Party History
4. Party Recaps / Session History
5. Assigned Admins
6. Photo/Video Party Albums
7. Assigned Monitor Mode
8. Web / TV Display Mode
9. Persistent Countdown Notification Spike
10. Stats / Deeper Analytics
11. Polish + App Store Readiness
```

## Phase 1 — Referee Pool Mode

Goal: make the game more interactive and verifiable without making it annoying.

Includes:

- host enables referee pool mode
- eliminated/out players can become referees
- referees see a pending confirmation list
- players tap Done
- referees confirm, miss, or mark questionable
- host/admin can override

Out of scope:

- assigned one-to-one monitors
- referee rankings
- referee chat
- complex disputes

Key rule: referee mode must not slow down the party too much. It needs a timeout or host override path.

## Phase 2 — Phone-Level Shot O'Clock Notifications

Goal: alert users even when they are outside the app, have their phone locked, or are doing something else.

Most important notification:

```text
SHOT O'CLOCK
Time to take your shot.
```

This fires when the countdown hits zero and the shot window begins.

Notification priority:

### Must-have

```text
SHOT O'CLOCK — time to take your shot.
```

### Strong secondary

```text
Round 4 starting — next shot in 7 minutes.
```

### Optional

```text
Shot O'Clock in 1 minute.
```

### Useful but less critical

```text
Party started.
Party ended.
```

Avoid notification spam. Deprioritize:

```text
Round result ready
You completed the round
Player joined
Player left
Someone marked Done
Roster changed
```

User settings:

```text
Shot O'Clock alert: on/off
Round starting alert: on/off
Pre-warning alert: on/off
Pre-warning time: 30s / 1 min / 2 min
Alert mode: sound / vibration / notification only / muted
```

Host/session settings:

```text
everyone can receive alerts
host device only
vibration only
muted
```

Out of scope:

- persistent countdown notification
- Dynamic Island / Live Activities
- lock-screen timer
- advanced scheduling

## Phase 3 — User Accounts + Saved Party History

Goal: let users save and revisit parties.

Why before albums: albums need ownership and access control.

Includes:

- registered accounts
- login/logout
- guest-to-account conversion
- hosted party history
- joined party history
- past party detail screen

Guest-first remains important. Accounts should enhance the app, not block party joining.

## Phase 4 — Party Recaps / Session History

Goal: give each completed party a simple payoff.

Includes:

- party name
- date/time
- total rounds
- active/out list
- who lasted until the end
- basic completed round count
- round-by-round session history

This is not an advanced stats phase. The goal is:

> What happened during this party?

Out of scope:

- lifetime stats
- leaderboards
- global rankings
- deep analytics
- streaks

## Phase 5 — Assigned Admins

Goal: let the host assign trusted players to help manage the party.

Includes:

- host promotes player to admin
- host demotes admin
- admin badge
- admins can pause/resume
- admins can add time
- admins can end shot window early
- admins can mark active/out if allowed
- admin actions are logged

Host-only actions at first:

```text
end party
remove players
promote/demote admins
transfer host
```

Out of scope:

- full custom permission matrix
- multiple-owner model
- admin analytics

## Phase 6 — Photo/Video Party Albums

Goal: turn Shot O'Clock from a live game utility into a party memory product.

This is the flagship future feature.

Includes:

- album attached to a saved party
- upload photos/videos
- party-only visibility
- host can remove media
- uploader can delete own media
- basic reporting/removal
- download/share selected media
- upload limits

Minimum controls:

```text
Only party members can view album.
Uploader can delete own media.
Host can remove any media.
Removed media is no longer visible.
Reported media can be hidden or flagged.
Upload size/type limits exist.
```

Out of scope:

- public albums
- AI highlight reels
- comments
- likes
- tagging
- face recognition

Risk: this is the highest-risk feature because of privacy, moderation, drunk uploads, storage cost, and app-store scrutiny.

## Phase 7 — Assigned Monitor Mode

Goal: add structured one-to-one verification.

Why after referee pool: assigned monitor mode is fun, but more fragile. People move around at parties.

Includes:

- host enables assigned monitor mode
- app assigns each monitor/player a target
- player sees who they are monitoring
- player sees who monitors them
- monitor confirms/misses/questionable

Rules:

```text
No one monitors themselves.
Prefer out/referee players as monitors.
If not enough refs, active players can monitor.
Avoid same pairing twice in a row when possible.
```

## Phase 8 — Web / TV Display Mode

Goal: let the party show the timer on a shared screen.

Includes:

- display-only web route
- big countdown
- party name
- join code / QR code
- Shot O'Clock screen
- active/out roster
- final recap screen

Important rule:

> Web/TV display should be read-only first.

Out of scope:

- full web app
- browser host controls
- Chromecast/AirPlay native integration
- custom display themes

## Phase 9 — Persistent Countdown Notification Spike

Goal: test whether a live countdown can appear outside the app.

Examples:

```text
notification shade countdown
lock-screen timer
iOS Live Activity
Dynamic Island
Android persistent notification
```

This is platform-sensitive. It should not be promised before testing.

Spike success criteria:

```text
Can show useful live countdown outside app.
Works reliably enough on real devices.
Does not require unacceptable native complexity.
Does not drain battery badly.
Does not create annoying UX.
```

Fallback:

```text
Shot O'Clock now
Round starting
Optional pre-warning
```

## Phase 10 — Stats / Deeper Analytics

Goal: only add stats if they actually improve the app.

Defer:

```text
lifetime stats
leaderboards
rankings
global stats
detailed dashboards
streaks
achievement systems
```

Acceptable later stats:

```text
rounds completed
shots marked done
used grace
final status
party participation history
```

The app should not become a stats app.

## Phase 11 — Polish + App Store Readiness

Goal: prepare for real public use.

Product polish:

- better onboarding
- loading states
- error states
- smoother transitions
- app icon
- splash screen
- final visual identity
- improved sound/vibration UX

Safety/legal UX:

- legal-age confirmation
- terms acceptance
- responsible-use language
- easy **I'm Out**
- no shaming people who stop
- host moderation basics

Technical hardening:

- RLS review
- crash reporting
- error monitoring
- database indexes
- rate limits
- backup strategy
- cost monitoring
- privacy policy
- support URL

Out of scope:

- ads
- subscriptions
- public social network
- paid plans

## Future Architecture Rule

Each feature must be added as a module.

Do not do this:

```text
Add notification logic directly into timer screen.
Add album logic into final summary screen.
Add referee logic inside random roster code.
Add admin permissions as scattered if-statements.
```

Do this:

```text
features/
  game/
  party/
  roster/
  host-controls/
  referee/
  notifications/
  history/
  recap/
  albums/
  admin/
  display/
```

Each feature should own:

- screens
- components
- hooks
- API/RPC wrappers
- types
- tests/manual QA notes

## Post-MVP AI Workflow

For every post-MVP feature:

1. Write feature spec.
2. Define data model changes.
3. Define RPC/API changes.
4. Define screen changes.
5. Define acceptance criteria.
6. Define edge cases.
7. Implement in small chunks.
8. Test on multiple devices if realtime.
9. Do cleanup/refactor pass.
10. Update docs.

Correct prompt example:

```text
Implement Shot O'Clock phone-level notification when a round enters shot_window.

Rules:
- fires when countdown hits zero
- respects user notification settings
- does not fire after party ended
- does not fire for removed players
- does not create duplicate notifications

Acceptance criteria:
...
```

## Step 10 Summary

The post-MVP roadmap is locked around this priority:

> Live game first, real-party alerts second, saved history third, memories/albums fourth, stats much later.

The most important future feature remains:

> Photo/video party albums attached to saved Shot O'Clock sessions.

Correct path:

```text
MVP game loop
→ referee pool
→ phone-level Shot O'Clock alerts
→ accounts/history
→ recaps/session history
→ assigned admins
→ albums
→ assigned monitors
→ web/TV display
→ persistent timer spike
→ stats only if useful
→ app-store readiness
```

---

