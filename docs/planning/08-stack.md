> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: See `CLAUDE.md` §3 for the locked stack and §6 for the dependency-management rules.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 8: Pick Your Stack

## Locked Stack

```text
Frontend:
- React Native
- Expo
- TypeScript
- Expo Router

Backend Platform:
- Supabase

Database:
- Supabase Postgres

Realtime:
- Supabase Realtime

Auth:
- Supabase Anonymous Auth for MVP guests
- Full Supabase Auth accounts later

Game Logic:
- Supabase Postgres functions / RPC
- Row Level Security policies
- Edge Functions only where needed later

Storage:
- Supabase Storage later for party albums/media

Notifications:
- Expo Notifications later
- Not MVP

Build/Release:
- Expo / EAS
- Supabase Free during development
- Supabase Pro before serious public release
```

## Why This Stack

React Native + Expo is the right mobile choice because it matches the existing TypeScript direction, supports iOS/Android from one codebase, and is production-suitable.

Supabase is the right backend choice because Shot O'Clock needs relational data, realtime session updates, auth, future storage, and controlled backend logic.

## Cost Direction

Cost-sensitive path:

```text
Private MVP/testing: near $0/month possible
Public app-store candidate: likely Supabase Pro eventually
```

Current pricing notes should be verified before launch. At planning time, the relevant official pages indicated:

- Supabase has a Free plan and a Pro plan starting at $25/month.
- Expo has a Free plan with limited Android/iOS builds.
- Apple Developer Program is 99 USD per membership year.
- Google Play Console registration has a US$25 one-time fee.

## Key Technical Decisions

### 1. Server/session-authoritative timer

The timer will be stored as session state:

```text
currentPhase
phaseStartedAt
phaseEndsAt
currentRoundNumber
```

The app renders:

```text
timeRemaining = phaseEndsAt - currentServerTime
```

Clients do not own the timer.

### 2. Supabase Realtime for live updates

Use Supabase Realtime for roster/session updates. Durable state changes should come from database updates, while Presence can later track who is online.

### 3. Anonymous Auth for MVP guests

Use Supabase Anonymous Auth so guests can join quickly without email/password.

Future path:

```text
anonymous guest
→ upgrades to account
→ keeps previous party history where possible
```

### 4. RPC/server-side game transitions

Core game actions should go through controlled functions:

```text
create_party()
join_party()
start_game()
mark_done()
mark_self_out()
advance_phase_if_due()
start_next_round()
host_add_time()
host_mark_player_out()
host_mark_player_active()
end_party()
```

Do not let clients randomly update phase, status, or outcomes directly.

### 5. Notifications are post-MVP

Expo Notifications is the future direction, but not MVP.

### 6. Media albums are post-MVP

Use Supabase Storage later for party albums. Do not build media upload in MVP.

## Step 8 Summary

The chosen stack is:

> React Native + Expo + TypeScript + Supabase

This is cost-effective, production-capable, aligned with the AI-led build approach, and supports the future product path: accounts, realtime sessions, saved history, notifications, and albums.

The main architecture rule:

> Supabase can power the app, but the game logic must be centralized in RPC/functions and protected by RLS. Client-side free-for-all updates are not acceptable.

---

