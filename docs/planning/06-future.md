> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: See `docs/planning/10-post-mvp-roadmap.md` for the locked post-MVP build order.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 6: Future of the Project

## Project Future Direction

Shot O'Clock is mainly:

- a fun build
- an AI-led/vibe-coding project
- a portfolio project
- a possible real app-store product later

So the project should be built with this mindset:

> Keep the MVP lean, but do not build it like a disposable toy.

The first version should stay focused, but the architecture should not block serious future features like accounts, saved party history, notifications, stats, or party albums.

## Future Stages

### Stage 1 — Private/Test MVP

Used by you and friends.

Focus:

- core game loop
- host creates party
- players join
- synced timer
- Shot O'Clock window
- Done / I'm Out
- active/out tracking
- basic results

### Stage 2 — More Complete Party App

Add stronger gameplay features:

- referee pool mode
- assigned monitors
- assigned admins
- better host controls
- phone-level notifications
- saved party summaries

### Stage 3 — Real App-Store Candidate

Make it reliable enough for strangers:

- user accounts
- saved party history
- better guest-to-user conversion
- stronger terms/age confirmation
- better notification handling
- privacy/security cleanup
- better error handling
- app-store review readiness

### Stage 4 — Memory/Social Layer

This is where Shot O'Clock becomes more than a timer:

- photo/video party albums
- downloadable/shareable media
- party recaps
- final standings
- lightweight session history
- saved memories

This is a major future pillar, not a random bonus.

## Most Important Future Features

1. Referee pool mode
2. Assigned monitor mode
3. Phone-level notifications
4. User accounts
5. Saved party history
6. Party recaps/session history
7. Photo/video party albums
8. Assigned admins
9. Web/TV display mode
10. Persistent countdown notification

The most important long-term product direction:

> Shot O'Clock starts as a drinking-game timer, but can grow into a saved party experience with memories and media.

## Serious Future Requirements

### Saved History

Users should not lose party results if the app crashes or closes.

### Accounts

Accounts should eventually let users save:

- hosted parties
- joined parties
- basic history
- media/albums
- recaps

### Guest Continuity

Guests should be able to reconnect without duplicating themselves.

Later, guests may be able to claim a party/history by creating an account.

### Albums and Media

Photo/video albums are high-value, but also high-risk.

They require:

- storage
- privacy controls
- deletion
- moderation
- reporting
- upload limits
- cost awareness

### Notifications

Phone-level notifications affect:

- mobile stack choice
- app permissions
- background behavior
- iOS/Android differences
- persistent timer feasibility

## Main Risks to Plan Around

1. Alcohol-related app perception
2. App-store review risk
3. Age confirmation and terms
4. Realtime session reliability
5. Timer sync
6. Guest rejoin issues
7. Lost party history
8. Lost media
9. Notification limitations
10. Drunk-user UX mistakes
11. Privacy issues with party photos/videos

## What We Should Not Overbuild Now

- full account system
- photo/video uploads
- persistent countdown notifications
- full admin permission matrix
- full moderation/reporting system
- advanced stats
- web/TV display
- custom themes
- custom audio packs

## Step 6 Summary

Shot O'Clock should be treated as a lean MVP with real product potential. The first build stays focused on the live game loop, but the planning leaves room for accounts, saved history, notifications, referee modes, assigned admins, recaps, and party albums.

---

