# Shot O'Clock

Shot O'Clock is a mobile-first drinking-game app for legal-drinking-age groups. The host creates a party, players join by a code, a synced countdown runs, a full-screen **SHOT O'CLOCK** moment triggers, players mark **Done** or **I'm Out**, and the game continues into the next round.

I designed and built the project end-to-end, including the data model, server-side game logic, realtime sync layer, mobile client, and the full session lifecycle from lobby to final summary.

> **Status:** MVP complete. App Store release coming soon.

---

## The Problem

Shot O'Clock is already a real game people play informally — someone sets a phone timer, everyone tries to remember who's still in, and the host yells when it's time. It works, but it's messy.

The app gives that game a dedicated home: a clear interval timer, a loud Shot O'Clock moment, live roster tracking, and host control — all synced across every phone in the room.

---

## Features

- **Host creates a party** — set the interval, increment, shot window length, and grace mode
- **Players join by code** — no account required, guest-first
- **Synced countdown** — server-authoritative timer, every device sees the same clock
- **Full-screen Shot O'Clock moment** — the main event
- **Done / I'm Out** — players mark their result during the shot window
- **Grace modes** — disabled, one grace, or unlimited
- **Live roster** — active, out, and left players tracked in real time
- **Host controls** — pause, resume, add time, mark players active/out, remove players, end party
- **Mid-game joining** — players can join after the game has started
- **Round results** — per-round breakdown after each shot window closes
- **Final summary** — shots-ranked standings at the end of the game
- **Single-phone host-only mode** — run the whole game on one device, no other phones needed

---

## Tech Stack

- **React Native + Expo + TypeScript** — iOS and Android from one codebase
- **Expo Router** — file-based navigation
- **Supabase** — Postgres database, Realtime subscriptions, Anonymous Auth
- **Row Level Security** — party data is scoped to members only
- **SECURITY DEFINER RPCs** — all game logic runs server-side in Postgres functions

---

## Architecture

- **Server-authoritative timer.** The session stores `phaseStartedAt` and `phaseEndsAt`; clients render `phaseEndsAt - serverNow()`. No client owns the timer.
- **Game logic lives in Postgres.** All state-mutating actions go through RPC functions. The client displays state and submits actions — it never writes directly to game-state tables.
- **RLS protects reads.** Every user-facing table has Row Level Security. Non-members of a party cannot read its data.
- **Guest-first auth.** Players join via Supabase Anonymous Auth — no account required. Full accounts are post-MVP.
- **Realtime sync.** Roster changes, timer phases, player actions, and host controls propagate to every device through Supabase Realtime subscriptions.

---

## Quick Start

### Prerequisites

- **Node.js** — current LTS
- **npm** — bundled with Node
- **Supabase CLI** — `brew install supabase/tap/supabase` on macOS, or see [the install docs](https://supabase.com/docs/guides/local-development/cli/getting-started)
- **Git**
- **Expo Go** on a real phone, or iOS Simulator / Android Emulator

### Setup

```bash
# Clone
git clone https://github.com/Kashawn-Brown/shot-o-clock.git
cd shot-o-clock

# Copy the env template
cp apps/mobile/.env.example apps/mobile/.env
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# Install dependencies
cd apps/mobile && npm install

# Start local Supabase
cd ../.. && supabase start

# Apply migrations
supabase db reset

# Run the app
cd apps/mobile && npx expo start
```

### Environment Variables

The app reads from `apps/mobile/.env` — Expo reads `.env` from the app directory, not the repo root.

- `EXPO_PUBLIC_SUPABASE_URL` — from `supabase start` output
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — from `supabase start` output

### Common Commands

```bash
supabase stop                          # stop local Supabase
supabase db reset                      # rebuild schema from migrations
supabase migration new <name>          # create a new migration file
supabase gen types typescript --local > apps/mobile/src/types/db.generated.ts
cd apps/mobile && npx tsc --noEmit    # typecheck
cd apps/mobile && npm run lint         # lint
```

---

## Project Structure

```
shot-o-clock/
├── apps/
│   └── mobile/          # React Native + Expo app
├── supabase/
│   ├── migrations/      # SQL migrations, timestamp-named
│   └── seed.sql
├── CLAUDE.md            # AI build instructions and architecture guardrails
├── timeline.md          # Phase-by-phase build history
└── METHODOLOGY.md       # How this project was planned and built
```

---

## What's Planned

- Phone-level Shot O'Clock notifications
- User accounts and saved party history
- Party recaps and session history
- And more

---

## Methodology

Shot O'Clock was built using a structured AI-assisted development process — deliberate planning, phased execution, and close supervision at every step. See [METHODOLOGY.md](https://claude.ai/chat/METHODOLOGY.md) for how that process worked.

---

## License

To be added before public release.