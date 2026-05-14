# Shot O'Clock

A mobile-first drinking-game app for legal-drinking-age groups. The host creates a party, players join by code, a synced countdown runs, a full-screen **SHOT O'CLOCK** moment triggers, players mark **Done** or **I'm Out**, and the game continues into the next round.

This project is intentionally AI-led — most code is written by Claude Code under supervision rather than by hand. The planning and architecture are locked in `docs/`; the build follows phased, reviewable chunks.

> **Status:** currently mid-MVP build — Phase 1 (schema + RLS) complete, Phase 2 (RPC layer) underway with party lifecycle paths shipped (`create_party`, `join_party`, `leave_party`, `end_party`, and the three read helpers from `rpc-contracts.md` §13). Game flow, player actions, and host controls still to come.

---

## Quick Start

### Prerequisites

You'll need installed locally:

- **Node.js** — current LTS (verify with `node --version`)
- **npm** — bundled with Node (or `pnpm` if you prefer; standardize before the first install)
- **Supabase CLI** — `brew install supabase/tap/supabase` on macOS, or see [the install docs](https://supabase.com/docs/guides/local-development/cli/getting-started) for other platforms
- **Git** — and a GitHub account
- **Expo Go app** on a real phone (easiest dev experience), or iOS Simulator / Android Emulator
- **Claude Code** — for AI-led development

Versions of Expo SDK, React Native, and Supabase JS are not pinned in this README on purpose — install latest stable when you first scaffold (see `CLAUDE.md` §6).

### First-time setup

```bash
# Clone
git clone https://github.com/<your-username>/shot-o-clock.git
cd shot-o-clock

# Copy env template
cp .env.example .env
# Then fill in the values (see "Environment variables" below)

# Install deps — once apps/mobile exists
cd apps/mobile
npm install

# Start local Supabase stack
cd ../..
supabase start
# Note the API URL and anon key from the output

# Apply migrations to the local stack — once migrations exist
supabase db reset

# Run the mobile app
cd apps/mobile
npx expo start
# Scan the QR code with Expo Go, or press 'i' for iOS sim / 'a' for Android emulator
```

### Common commands

```bash
# Stop the local Supabase stack
supabase stop

# Apply a new migration locally
supabase db reset                # nuke and rebuild from migrations
supabase migration new <name>    # create a new empty migration file

# Generate TypeScript types from the current schema
supabase gen types typescript --local > apps/mobile/src/types/db.generated.ts

# Lint the mobile app — once configured
cd apps/mobile && npm run lint

# Typecheck
cd apps/mobile && npx tsc --noEmit
```

---

## Project Structure

Top level:

```
shot-o-clock/
├── apps/
│   └── mobile/                   # React Native + Expo app (TypeScript)
├── supabase/
│   ├── migrations/               # SQL migrations, timestamp-named
│   ├── seed.sql                  # Optional dev seed data
│   └── tests/                    # SQL tests (RLS, RPCs)
├── docs/
│   ├── planning/                 # Sliced planning blueprint (10 step files)
│   ├── specs/                    # Source-of-truth specs (state machine, game rules, RPCs, RLS, schema, enums)
│   ├── AI_BUILD_PROTOCOL.md      # How to prompt Claude Code on this project
│   ├── PROMPT_TEMPLATES.md       # Copy-paste prompt templates
│   ├── REPO_STRUCTURE.md         # Detailed folder layout reference
│   ├── MVP_DEFINITION_OF_DONE.md # When MVP is actually done
│   ├── MANUAL_QA_CHECKLIST.md    # Pre-release manual test script
│   └── PHASE_ACCEPTANCE_CRITERIA.md  # Phase-by-phase done checklist
├── CLAUDE.md                     # Claude Code's standing instructions
├── README.md                     # This file
├── .env.example                  # Env var template
└── .gitignore
```

See `docs/REPO_STRUCTURE.md` for the full layout once `apps/mobile/src/` exists, including the `features/`, `lib/`, and `types/` convention.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Never commit `.env`.

Required for local dev:

- `EXPO_PUBLIC_SUPABASE_URL` — local Supabase URL from `supabase start` output (typically `http://127.0.0.1:54321`)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — anon key from `supabase start` output

For production deploys (post-MVP):

- The same variables, set to the production project's URL and anon key (managed via EAS Build secrets, not the local `.env`)

The `EXPO_PUBLIC_` prefix is required for env vars that need to reach the mobile app at runtime — Expo only exposes prefixed variables. Server-side keys (service role, etc.) must NOT use this prefix and must never appear in the mobile app.

---

## How This Project Is Built

This is an **AI-led, supervised build**. The maintainer is not writing code by hand — Claude Code does the implementation, and the maintainer reviews diffs and directs.

Two key docs make that work:

1. **`CLAUDE.md`** — standing instructions Claude Code reads at the start of every session. Defines architecture guardrails, code quality standards, commit conventions, and what NOT to do.
2. **`docs/specs/`** — source-of-truth specs (state machine, game rules, RPC contracts, RLS, schema, enums). Claude Code references these when implementing; if the code and the spec disagree, the spec wins until amended.

When prompting Claude Code, follow `docs/AI_BUILD_PROTOCOL.md` and use the templates in `docs/PROMPT_TEMPLATES.md`.

---

## Architecture (1-Minute Version)

- **Mobile-first.** React Native + Expo + TypeScript. Expo Router for navigation.
- **Server-authoritative timer.** The session stores `phaseStartedAt` and `phaseEndsAt`; clients render `phaseEndsAt - serverNow()`. No client owns the timer.
- **Game logic lives in Postgres.** All state-mutating actions go through `SECURITY DEFINER` RPC functions. The client never writes directly to game-state tables.
- **RLS protects reads.** Every user-facing table has Row Level Security; non-members of a party cannot read its data.
- **Guest-first auth.** MVP uses Supabase Anonymous Auth so players can join without creating an account. Full accounts are post-MVP.

The full architecture rationale is in `docs/planning/07-components.md` and `docs/planning/08-stack.md`.

---

## MVP Scope

The MVP proves the live game loop and nothing more. In scope:

- Host creates a party with grace mode + interval settings
- Guests join by code (no account required)
- Lobby with realtime roster
- Synced countdown → Shot O'Clock window → Done / I'm Out → Round results → Next round
- Grace mode (disabled / enabled / unlimited)
- Host controls (pause, resume, add time, mark active/out, remove player, end party)
- Final summary

Explicitly out of scope until MVP is shipped:

- Referees (pool or assigned)
- Phone-level notifications
- Photo/video party albums
- Full user accounts as a required path
- Saved party history dashboard
- Web/TV display mode
- Advanced stats

See `docs/planning/04-mvp.md` for the full scope locked list and `docs/MVP_DEFINITION_OF_DONE.md` for the completion criteria.

---

## Contributing

This is a personal portfolio project under AI-led development. External contributions aren't being accepted in the current phase.

If you're forking for your own use: the planning docs and specs are extensive and meant to be self-contained. You should be able to follow `docs/planning/09-development-process.md` and Claude Code from a fresh repo to a running MVP.

---

## License

(To be added before public release.)

---

## Pointers

| If you want to... | Read... |
|---|---|
| Understand the product vision | `docs/planning/01-goal.md` |
| Understand the architecture | `docs/planning/07-components.md`, `docs/planning/08-stack.md` |
| Understand the build process | `docs/planning/09-development-process.md`, `docs/AI_BUILD_PROTOCOL.md` |
| Implement game logic | `docs/specs/game-rules.md`, `docs/specs/mvp-state-machine.md` |
| Write or modify an RPC | `docs/specs/rpc-contracts.md` |
| Write or modify RLS | `docs/specs/rls-rules.md` |
| Understand schema choices | `docs/specs/schema.md`, `docs/specs/enums.md` |
| Prompt Claude Code | `docs/PROMPT_TEMPLATES.md` |
| Know if MVP is done | `docs/MVP_DEFINITION_OF_DONE.md` |
