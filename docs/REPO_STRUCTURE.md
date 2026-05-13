# Repo Structure

> The folder layout for Shot O'Clock. When you (or Claude Code) need to know where to put a new file, this is the doc that decides.
> When this doc and the actual repo disagree, the doc wins until amended.

---

## 1. Top-Level Layout

```
shot-o-clock/
├── apps/
│   └── mobile/                       # React Native + Expo + TypeScript
├── supabase/
│   ├── migrations/                   # SQL migrations, timestamp-named
│   ├── seed.sql                      # Optional dev seed data
│   ├── functions/                    # Edge Functions (post-MVP; empty for now)
│   └── tests/                        # SQL test files (RLS, RPCs)
├── docs/
│   ├── planning/                     # Sliced planning blueprint
│   ├── specs/                        # Source-of-truth specs
│   ├── AI_BUILD_PROTOCOL.md
│   ├── PROMPT_TEMPLATES.md
│   ├── REPO_STRUCTURE.md             # This file
│   ├── MVP_DEFINITION_OF_DONE.md
│   ├── MANUAL_QA_CHECKLIST.md
│   └── PHASE_ACCEPTANCE_CRITERIA.md
├── CLAUDE.md                         # Claude Code's standing instructions
├── README.md
├── .env.example
└── .gitignore
```

Rule: one repo, one mobile app, one Supabase project. Do not split into multiple repos until there's a concrete reason.

---

## 2. `apps/mobile/` — The Mobile App

Full layout once scaffolded:

```
apps/mobile/
├── app/                              # Expo Router routes (file-based)
│   ├── _layout.tsx                   # Root layout
│   ├── index.tsx                     # Start screen
│   ├── rules.tsx                     # Rules / How to Play
│   ├── create-party.tsx              # Create Party
│   ├── join-party.tsx                # Join Party
│   ├── party/
│   │   └── [partyId]/
│   │       ├── _layout.tsx           # Party context provider
│   │       ├── lobby.tsx
│   │       ├── timer.tsx
│   │       ├── shot-window.tsx
│   │       ├── results.tsx
│   │       ├── roster.tsx
│   │       └── summary.tsx
│   └── +not-found.tsx
├── src/
│   ├── components/                   # Cross-feature shared UI
│   │   ├── ui/                       # Primitives (Button, Card, Input, etc.)
│   │   ├── layout/                   # Headers, footers, screen wrappers
│   │   └── feedback/                 # Toasts, error displays, loading states
│   ├── features/                     # Feature-grouped code
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   └── types.ts
│   │   ├── party/                    # Create, join, lobby
│   │   ├── game/                     # Timer, shot window, round flow
│   │   ├── roster/                   # Player list, status displays
│   │   ├── results/                  # Round results, final summary
│   │   └── host-controls/            # Pause, add time, mark out, etc.
│   ├── lib/                          # Low-level utilities
│   │   ├── supabase.ts               # Supabase client singleton
│   │   ├── env.ts                    # Typed env var loader
│   │   ├── time.ts                   # Timer math, server time sync
│   │   ├── logger.ts                 # Logging wrapper
│   │   └── errors.ts                 # Error code → user message mapping
│   ├── types/
│   │   ├── db.generated.ts           # Generated from Supabase schema
│   │   ├── api.ts                    # Hand-written RPC param/return types
│   │   └── domain.ts                 # Cross-feature shared domain types
│   └── styles/                       # Theme tokens, shared style values
├── assets/                           # Images, fonts, icons
├── app.json                          # Expo config (or app.config.ts)
├── tsconfig.json
├── package.json
├── package-lock.json
├── .eslintrc.cjs
├── .prettierrc
└── babel.config.js
```

### 2.1. `app/` — Routes (Expo Router)

File-based routing. Every `.tsx` file under `app/` becomes a route. Rules:

- File names are kebab-case (`create-party.tsx`, not `CreateParty.tsx`).
- Dynamic segments use brackets (`[partyId]`).
- Layouts use `_layout.tsx` and apply to their folder.
- Routes are thin — they import a screen component from `src/features/<feature>/components/` and render it. Business logic does not live in route files.

### 2.2. `src/components/` — Shared UI

Cross-feature primitives only. If a component is used by exactly one feature, it lives in that feature's folder. If two or more features use it, lift to `src/components/`.

- `ui/` — design-system primitives: `Button`, `Card`, `Input`, `Label`, `Avatar`, `Badge`, etc.
- `layout/` — `Screen`, `Header`, `Footer`, `Container`.
- `feedback/` — `Toast`, `ErrorBoundary`, `Loading`, `EmptyState`.

One component per file, file name matches the export.

### 2.3. `src/features/<feature>/` — Feature Modules

Each feature owns its screens, components, hooks, API wrappers, and types. Standard sub-folders:

```
features/<feature>/
├── components/         # Feature-specific UI
├── hooks/              # Feature-specific hooks (use*.ts)
├── api/                # RPC wrappers (one file per RPC group)
├── types.ts            # Feature-scoped types
└── index.ts            # Optional public surface (re-exports)
```

Features for MVP:

- `auth/` — guest identity, age confirmation, terms.
- `party/` — create, join, lobby, settings.
- `game/` — timer screen, shot window, phase logic.
- `roster/` — player list, status badges.
- `results/` — round results, final summary.
- `host-controls/` — host-only actions.

Post-MVP features get their own folder when implemented: `notifications/`, `history/`, `albums/`, `referee/`, `admin/`.

### 2.4. `src/lib/` — Low-Level Utilities

Pure utilities with no React-specific code (where possible).

- `supabase.ts` — single Supabase client instance, exported. Configure via `env.ts`.
- `env.ts` — typed loader for `EXPO_PUBLIC_*` env vars. Throws on missing required vars at startup.
- `time.ts` — utilities for computing `phaseEndsAt - serverNow()`, formatting durations, etc.
- `logger.ts` — wraps `console` with levels and structured fields. Lets us route to a real logger post-MVP.
- `errors.ts` — maps RPC error codes (from `rpc-contracts.md` §15) to user-facing messages.

### 2.5. `src/types/` — Shared Types

- `db.generated.ts` — generated by `supabase gen types typescript`. Regenerate after every migration; commit the result.
- `api.ts` — hand-written types for RPC params, return shapes, and error codes. Must stay in sync with `rpc-contracts.md`.
- `domain.ts` — cross-feature types (e.g. `PartyPlayerWithStatus`).

Do NOT redeclare DB types here — import from `db.generated.ts`.

### 2.6. Path Aliases

Configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/app/*":       ["app/*"],
      "@/components/*": ["src/components/*"],
      "@/features/*": ["src/features/*"],
      "@/lib/*":      ["src/lib/*"],
      "@/types/*":    ["src/types/*"],
      "@/styles/*":   ["src/styles/*"]
    }
  }
}
```

Always prefer aliases over deep relative imports. `../../../lib/supabase` is forbidden; `@/lib/supabase` is required.

---

## 3. `supabase/` — Database and Backend

```
supabase/
├── config.toml                       # Generated by `supabase init`
├── migrations/
│   ├── 20260513000001_initial_schema.sql
│   ├── 20260513000002_rls_policies.sql
│   ├── 20260513000003_create_party_rpc.sql
│   └── ...
├── seed.sql                          # Local dev seed; runs after migrations
├── functions/                        # Edge Functions (post-MVP)
└── tests/
    ├── rls/                          # RLS policy tests
    └── rpc/                          # RPC integration tests
```

### 3.1. `migrations/`

- One logical change per migration. No bundled "add three RPCs and modify two tables" files.
- File names: `<14-digit-timestamp>_<descriptive_name>.sql`. The CLI generates the timestamp via `supabase migration new <name>`.
- Each file starts with a comment block: purpose, spec references, related migration IDs if any.
- Migrations are append-only — never edit a committed migration. Add a new one to fix or extend.
- Migrations must be idempotent against a fresh database (CI will rebuild from scratch).

Suggested order for the first phase (per `schema.md` §14):

1. `_initial_schema.sql` — extensions, enums, all MVP tables, triggers, indexes.
2. `_rls_helpers.sql` — helper functions (`is_party_member`, etc.).
3. `_rls_policies.sql` — enable RLS, create policies.
4. `_rpc_<name>.sql` — one migration per RPC, in dependency order.

### 3.2. `seed.sql`

Optional dev seed: creates a sample host user, a sample party, and a few players for testing the UI without manually creating sessions. Runs after every `supabase db reset`. Keep small.

### 3.3. `functions/`

Empty in MVP. Edge Functions arrive when we add scheduled phase advancement (post-MVP scalability improvement) and notification triggers.

### 3.4. `tests/`

SQL-based tests. Use `pgTAP` or Supabase's built-in test runner.

- `rls/` — one file per table, asserting positive and negative access.
- `rpc/` — one file per RPC, asserting preconditions, postconditions, and error codes.

CI runs these in addition to the JS tests. See `CLAUDE.md` §5.9 for the CI plan.

---

## 4. `docs/` — Documentation

### 4.1. `planning/`

The 10 sliced planning files from the master blueprint:

```
docs/planning/
├── 01-goal.md
├── 02-user-stories.md
├── 03-data-models.md
├── 04-mvp.md
├── 05-prototype.md
├── 06-future.md
├── 07-components.md
├── 08-stack.md
├── 09-development-process.md
└── 10-post-mvp-roadmap.md
```

These are reference docs sliced from the master blueprint. When product intent is unclear, this is where to look.

### 4.2. `specs/`

The six source-of-truth specs:

```
docs/specs/
├── mvp-state-machine.md
├── game-rules.md
├── rpc-contracts.md
├── rls-rules.md
├── enums.md
└── schema.md
```

When code and specs disagree, specs win until amended. Spec updates and code updates that change behavior should ideally ship in the same commit.

### 4.3. Process docs (top of `docs/`)

- `AI_BUILD_PROTOCOL.md` — how to prompt Claude Code.
- `PROMPT_TEMPLATES.md` — copy-paste templates.
- `REPO_STRUCTURE.md` — this file.
- `MVP_DEFINITION_OF_DONE.md` — completion criteria.
- `MANUAL_QA_CHECKLIST.md` — pre-release test script.
- `PHASE_ACCEPTANCE_CRITERIA.md` — phase-by-phase done checklist.

---

## 5. Naming Conventions Summary

| Where | Convention | Example |
|---|---|---|
| Route files (`app/`) | kebab-case | `create-party.tsx` |
| Component files | PascalCase, matches export | `PartyRoster.tsx` |
| Hook files | camelCase, starts with `use` | `usePartyState.ts` |
| API wrapper files | camelCase | `partyApi.ts` |
| Type files | camelCase or descriptive | `domain.ts`, `api.ts` |
| Folders under `features/` | lowercase, singular | `game/`, `roster/` |
| SQL migration files | `<timestamp>_snake_case.sql` | `20260513000001_initial_schema.sql` |
| Doc files | kebab-case (within folders) | `mvp-state-machine.md` |
| Top-level doc files | SCREAMING_SNAKE_CASE | `CLAUDE.md`, `README.md` |

---

## 6. What Goes Where — Decision Quick Reference

When adding a new file, ask:

| The file is... | Put it in... |
|---|---|
| A new route / screen entry point | `apps/mobile/app/...` |
| A screen component (the actual UI) | `apps/mobile/src/features/<feature>/components/` |
| A shared UI primitive used by 2+ features | `apps/mobile/src/components/ui/` |
| A feature-specific hook | `apps/mobile/src/features/<feature>/hooks/` |
| An RPC wrapper | `apps/mobile/src/features/<feature>/api/` |
| A type used by one feature | `apps/mobile/src/features/<feature>/types.ts` |
| A type used by 2+ features | `apps/mobile/src/types/domain.ts` |
| A pure utility (no React) | `apps/mobile/src/lib/` |
| A migration | `supabase/migrations/` |
| A SQL test | `supabase/tests/rls/` or `supabase/tests/rpc/` |
| A planning slice | `docs/planning/` |
| A spec | `docs/specs/` |
| A new process doc | `docs/` (top level) |

If a file doesn't fit any of these, stop and ask. Adding a new top-level location is a real decision, not a default.

---

## 7. What NOT to Create

- A new top-level folder outside the ones listed in §1 (without discussion).
- A `utils/` folder (use `lib/` instead — same intent, less generic).
- A `helpers/` folder (same reason).
- A `common/` folder (use `components/` or `lib/` based on the actual concern).
- Per-screen folders inside `features/` (the feature itself is the grouping unit).
- Duplicate type definitions across files (declare once, import everywhere).
- Files named `index.ts` that just re-export from one other file (low value, hides the real location).

---

## 8. Open Questions

(None currently. Add as they arise.)
