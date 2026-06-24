# CLAUDE.md

> **Standing instructions for Claude Code on the Shot O'Clock project.**
> Read this file in full at the start of every session before touching code.
> If anything below conflicts with the user's latest message, ask the user — do not silently override.

---

## 0. Project Status — post-MVP, pre-production (read first)

**The MVP is complete and device-verified.** The full game loop ships and works (see `plan.md` / `timeline.md`). The project is now in **pre-production**: the work between a finished MVP and App Store / Google Play submission.

- **Active phases: 13–17** — Small Fixes + Polish → Phone-Level Notifications → Basic Settings Screen → Push Notifications + Settings Completion → Polish + App Store Readiness. Full scope in `plan.md` and `docs/planning/11-preproduction-roadmap.md`. **Phase 15 is next** (13 + 14 complete).
- **Post-production phases 18–25** — assigned admins, user accounts + saved history, party recaps, full settings, photo/video albums, web/TV display, stats, and the persistent-countdown spike — are planned in `docs/planning/12-postproduction-roadmap.md`. **Do not build any of them until its turn comes;** each gets fully scoped in `plan.md` only when reached.

**This section supersedes the MVP-only framing below where they conflict.** §4.2 (out-of-scope) and §11 (hard "do not" rules) were written for the MVP build — read them through this roadmap now. **Notifications (Phase 14)** and a **basic settings screen incl. "Reset this device" (Phase 15)** are active pre-production work and **no longer out of scope.** **Full user accounts, party albums, web/TV display, referees, and advanced stats remain out of scope until their post-production phase (18–25).** When a task implies a feature, confirm it belongs to the current phase before building it.

---

## 1. What This Project Is

Shot O'Clock is a **mobile-first drinking-game app for legal-drinking-age groups**. The core experience: a host creates a party, players join by code, a synced countdown runs, a full-screen **SHOT O'CLOCK** moment triggers, players mark **Done** or **I'm Out**, the roster updates, and the game continues into the next round.

It is **not** a generic party app. It is a dedicated drinking-game timer and roster app. Future expansion will add referees, notifications, accounts, history, and party albums — but those are explicitly out of MVP scope.

The full product blueprint lives in `docs/planning/`. The active source-of-truth specs live in `docs/specs/`. **Always check the relevant spec before implementing game logic.**

---

## 2. Locked Architecture Rules — Do Not Violate

These rules are non-negotiable. If a task seems to require breaking one of them, **stop and ask the user** rather than working around it.

### 2.1. Server-authoritative timer

The timer is **never** owned by the client. Session state holds:

```
currentPhase
phaseStartedAt
phaseEndsAt
currentRoundNumber
```

Clients compute display time as `timeRemaining = phaseEndsAt - currentServerTime`. No `setInterval` is ever the source of truth. No client may set or advance a phase locally. Late joiners reconstruct the timer from session timestamps.

### 2.2. Game logic lives in Postgres, not the client

All state-mutating game actions go through controlled RPC functions (`create_party`, `join_party`, `start_game`, `mark_done`, `mark_self_out`, `start_next_round`, `host_add_time`, `host_pause_timer`, `host_resume_timer`, `host_mark_player_out`, `host_mark_player_active`, `host_remove_player`, `end_party`, etc.).

The client **never** writes directly to `party_sessions`, `party_players`, `rounds`, or `round_player_outcomes`. The client reads these tables (filtered by RLS) and calls RPCs.

### 2.3. RLS protects all party data

Every user-facing table has Row Level Security enabled. Non-members of a party cannot read its data. Removed players cannot act. Out players cannot tap Done. The exact policies live in `docs/specs/rls-rules.md` — consult it before writing or modifying any RLS policy.

### 2.4. PartyPlayer has three independent fields

```
permissionRole: host | admin | player
status:         active | out | removed
duty:           normal_player | assigned_monitor | referee_pool | spectator
```

These are **separate concepts**. Do not collapse them. An admin who is out and reffing has `permissionRole=admin, status=out, duty=referee_pool`. Code that conflates role and status will be rejected.

### 2.5. No client-owned state for protected game data

Local React state is fine for UI (modal open/closed, input drafts, animations). But round outcomes, player status, roster membership, and timer phase **must** be read from the server and mutated through RPCs only.

### 2.6. Idempotency for transitions

`start_next_round`, `advance_phase_if_due`, and similar transition RPCs must be idempotent. Two clients calling them in the same millisecond must not create two rounds.

---

## 3. Stack

The stack is locked. Do not propose alternatives unless the user explicitly opens the conversation.

```
Mobile:    React Native + Expo + TypeScript + Expo Router
Backend:   Supabase (Postgres + Realtime + Auth + Storage)
Auth:      Supabase Anonymous Auth for MVP guests
Logic:     Postgres functions / RPC, behind RLS
Realtime:  Supabase Realtime channels for live updates
Storage:   Supabase Storage — post-MVP only
Builds:    Expo / EAS
```

**Always verify the current stable version before installing any dependency.** Run `npm view <pkg> version` or check the official docs. Do not assume training-data versions are current. When adding a dependency, briefly note in the commit message why this version was chosen.

---

## 4. MVP Scope

### 4.1. In scope

Legal-age + terms confirmation. Guest-first join flow. Host creates party (name, join code, starting interval, interval increment, shot window, elimination on/off, grace mode). Lobby with realtime roster. Synced countdown. Full-screen Shot O'Clock window. Player Done / I'm Out. Active/out/removed roster status. Grace mode (disabled/enabled/unlimited). Host controls (pause, resume, add time, end shot window early, mark player active/out, remove player, end party). Round results. Next round loop. Final summary.

### 4.2. Explicitly out of scope (do not build these in MVP)

Referee pool. Assigned monitors. Assigned admins. Full user accounts as a required path. Phone-level notifications. Persistent timer notifications. Photo/video albums. Saved party history dashboard. Shareable recaps. Advanced stats. Custom themes. Custom sounds. Web/TV display mode.

If a task implies one of these, stop and ask whether MVP scope is changing.

### 4.3. Future-ready, but not future-built

The MVP data model leaves room for these features (e.g. `PartyPlayer.duty` already includes `referee_pool` and `spectator`). Do not strip these fields. Do not, however, write logic that uses them in MVP.

---

## 5. Code Quality Standards

### 5.1. TypeScript

- **Strict mode on.** `strict: true` in `tsconfig.json`. No `any` unless commented with a justification.
- Prefer explicit return types on exported functions and on anything more complex than a one-liner.
- Use `type` for unions and object shapes; use `interface` for things that may be extended.
- Centralize shared types in `src/types/` — do not re-declare the same shape in multiple files.
- For RPC parameter and return shapes, generate or hand-write types in `src/types/api.ts` and import them everywhere.

### 5.2. Linting and formatting

- Use **ESLint** (with `@typescript-eslint`) and **Prettier**. Run on save in the editor; run in CI before merge later.
- Recommended rules: `no-unused-vars`, `no-console` (warn), `prefer-const`, `eqeqeq`, `react-hooks/exhaustive-deps`.
- 2-space indent, single quotes, trailing commas in multi-line, semicolons on.
- If any rule is intentionally suppressed, comment why on the same line.

### 5.3. File and folder organization

Follow the structure in `docs/REPO_STRUCTURE.md`. The shape is `app/` for routes, `src/features/<feature>/` for feature-grouped code (components, hooks, api wrappers, types), `src/components/` for cross-feature shared UI, `src/lib/` for low-level utilities (supabase client, time helpers), `src/types/` for shared types.

- One component per file. File name matches the exported component (`PartyRoster.tsx` exports `PartyRoster`).
- Co-locate styles, tests, and hooks with the component when they're tightly coupled. Lift them when shared.
- No deep relative imports (`../../../`). Configure path aliases (`@/features/*`, `@/lib/*`, `@/types/*`) and use them.

### 5.4. Naming conventions

- `PascalCase` for components, types, and interfaces.
- `camelCase` for functions, variables, and hooks (hooks must start with `use`).
- `SCREAMING_SNAKE_CASE` for module-level constants and enums of literal values.
- `kebab-case` for file paths in `app/` (routes) and asset filenames.
- No abbreviations unless they're industry standard (`url`, `id`, `db`). No `tmpVar`, no `data2`, no `handleClick1`.

### 5.5. Component structure

Use functional components with hooks. Class components are forbidden. Within a component, follow this top-down order: hooks → derived values (`useMemo`) → handlers (`useCallback`) → effects (`useEffect`) → early returns → render. Keep render JSX clean; extract complex conditionals into named variables above the return.

### 5.6. Comments

- Comment **why**, not **what**. Code should self-explain *what* it's doing.
- For non-obvious game logic (grace edge cases, idempotency tricks, RLS workarounds), add a comment pointing to the spec that explains the rule: `// See docs/specs/game-rules.md §3.2 — grace_enabled second-miss path`.
- TODO comments must include the author and date: `// TODO(claude, 2026-05-13): handle disconnect-during-shot-window edge case`.

### 5.7. Error handling

- Never silently swallow errors. At minimum, log with context.
- User-facing errors must be displayed via a consistent error UI component, not raw alert dialogs.
- RPCs must return structured error info (error code + message), not just throw. Define error codes in `docs/specs/rpc-contracts.md`.

### 5.8. Magic numbers and strings

Extract to named constants. `const DEFAULT_SHOT_WINDOW_SECONDS = 30` in a shared constants file is always better than `30` inline. Enum-like strings (phase names, status values) must come from a typed source — never typed as a raw string literal at the call site.

### 5.9. CI readiness — write code that will pass CI before CI exists

CI/CD is a planned addition. Initial pipeline: `install → lint → typecheck → build → test → push`. Later additions will include pre-prod checks against a Supabase preview branch and staged deploys. The pipeline is not wired up yet, but write every change as if it were:

- Code must lint clean (`npm run lint`) and typecheck clean (`tsc --noEmit`) before commit.
- New behavior gets at least a minimal test where reasonable — unit tests for pure logic, integration tests for RPCs. Do not skip tests with "I'll add them later."
- Build determinism: no relative paths assuming a specific working directory, no hardcoded absolute paths, no reliance on developer-machine-only tooling.
- Secrets only via env vars, never inline. CI will fail loudly if a secret is hardcoded.
- Migrations must be idempotent against a fresh database. CI will run them from scratch on every build.
- Avoid platform-specific shell commands in npm scripts. Use cross-platform tools (`rimraf` instead of `rm -rf`, `cross-env` if env vars are needed inline).

When CI is wired up, no existing code should need to change to satisfy it. If you are about to introduce something CI would later fail on, stop and ask.

---

## 6. Dependency Management — Stay Current

The user has explicitly asked that the project use up-to-date software and avoid drift and deprecation. Follow these rules.

### 6.1. Before installing any dependency

1. Run `npm view <package> version` to get the current latest stable.
2. Check the package's README / changelog for major version notes.
3. Confirm it supports the current Node LTS and current Expo SDK.
4. In the install commit, note: package, version, why chosen, what alternatives were considered.

### 6.2. Lock versions but allow patch updates

In `package.json`, use caret ranges (`^1.2.3`) — allows patch and minor, blocks major. Commit `package-lock.json`. Treat the lockfile as canonical.

### 6.3. Deprecation watch

- If you encounter a deprecated API (whether in React Native, Expo, Supabase, or any dependency), do not silently use it. Note the deprecation in a comment and propose a replacement to the user.
- When upgrading dependencies, read the migration guide. Do not blanket-bump majors without a changelog review.

### 6.4. Periodic audit

At the end of each build phase, run `npm outdated` and `npm audit`. Surface anything material to the user. Do not auto-upgrade without confirmation.

### 6.5. Specific stack notes

- **Expo SDK**: ships major upgrades roughly twice a year. Pin to a specific SDK in `app.json` / `app.config.ts`. Do not mix RN versions across the workspace.
- **Supabase JS**: use `@supabase/supabase-js` v2 patterns (the v1 API is deprecated). For auth, use the current session/user APIs, not the legacy ones.
- **Expo Router**: file-based routing is the locked navigation choice. Do not introduce React Navigation alongside it — pick one.
- **Postgres functions**: prefer `LANGUAGE plpgsql` for control flow, `LANGUAGE sql` for simple expressions. Use `SECURITY DEFINER` only when necessary and document why.

### 6.6. Prefer the right library over a hand-rolled workaround — ask, don't work around

When a well-established library is the obviously correct tool for a task (e.g. SVG drawing, charts, gestures, date math), **ask to install it** rather than silently building a workaround. The ask is one line — *"Can I install X to do Y?"* — and the user answers. Do not pre-emptively hand-roll a fragile substitute to avoid the §10 dependency-confirmation step; that step is a quick yes/no, not a reason to reinvent the wheel. A workaround is only acceptable when the library has been **explicitly denied**. This rule resolves the tension between §10 ("ask before adding a dependency") and "stay current / use the right tool": the resolution is *ask*, not *avoid*. See decisions.md D033 (the react-native-svg progress ring is the case that prompted this).

---

## 7. Build Philosophy

The user is intentionally running this as an AI-led, supervised build. They are not writing code by hand. This means your job is to be a careful, narrow, predictable executor — not a creative co-author.

### 7.1. One feature, one chunk, one acceptance checklist

Every task gets:
- A clear single goal
- A reference to the relevant spec(s)
- A list of files involved
- An explicit list of files / architecture decisions that must NOT change
- Acceptance criteria

If the user prompts you with less than this, ask for the missing pieces before starting.

### 7.2. Show your work before applying it

For non-trivial changes, explain briefly what you'll change and why **before** writing the code. The user is in QA mode — they should be able to predict the diff before reading it.

### 7.3. Commit frequently — you own the commits

**You (Claude Code) are responsible for committing your work.** The user is not driving git. They review diffs after the fact via GitHub Desktop.

**Cadence: often, in small checkpoints, not at the end of each phase.** A working phase will typically produce 5–15 commits. Commit whenever the code is in a self-consistent state, even if the phase isn't done.

Triggers for a checkpoint commit:

- A migration applies cleanly
- An RPC compiles and at least one happy-path call works
- A screen renders without errors
- A test passes
- A refactor lands and the app still runs
- A doc was updated to match a code change
- You're about to switch to a meaningfully different sub-task

Anti-patterns to avoid:

- One giant commit at the end of a phase (`feat: complete phase 4`)
- Mixing unrelated changes in one commit (`feat: lobby + fix typo + bump deps`)
- Committing broken intermediate states without flagging them with the `wip:` type
- Committing without a meaningful body
- Going more than ~30 minutes of active work without a commit

After committing, continue working unless you are at a natural stop point. Do not interrupt flow with a chat note after every commit — the user reviews via GitHub Desktop at their own pace. See CLAUDE.local.md for stop point guidance.

### 7.4. Never expand scope unilaterally

If, while doing task X, you notice task Y also needs doing, **stop and ask**. Do not bundle Y into X silently. Even if Y looks small.

### 7.5. Per-chunk discipline

Each chunk still follows §7.1 (one goal, specs, files, acceptance criteria). The standalone prompt protocol (formerly `docs/AI_BUILD_PROTOCOL.md`) is retired — the workflow is established and lives in §8.

---

## 8. Documentation Discipline & Session Ritual

The specs in `docs/specs/` stay authoritative for behavior. The whole `docs/` folder is
local-only (gitignored) — keep it current on disk when behavior changes; it just no longer
appears in commits. Progress and decisions live in local working files too: plan.md,
decisions.md, and build-log.md are gitignored, while timeline.md is committed.

### 8.1. Spec-code sync

- When you change behavior, update the relevant spec on disk (docs/ is local-only, so the spec edit won't appear in the commit — keep it current anyway).
- When you add an RPC, document it in `docs/specs/rpc-contracts.md`.
- When you change RLS, update `docs/specs/rls-rules.md`.
- When you change schema, the migration file IS the doc — write clear comments in the migration SQL, and update `docs/specs/schema.md` if column shape changes.

### 8.2. Session start

Before writing any code:
1. Read CLAUDE.md, plan.md, decisions.md, timeline.md
2. Read any spec files relevant to today's work
3. Confirm current branch and last completed work
4. State what we're about to build and wait for confirmation

### 8.3. Session checkpoints

Stop points happen at natural semantic breaks — not after every commit. See CLAUDE.local.md for the full definition of a stop point, what to include in a summary, and examples of good vs bad summaries.

The short version: stop when a coherent chunk of work is complete and has a clear name. At each stop point give a plain-English summary of what changed in the system's behavior, the list of commits since the last stop, and what's next.

### 8.4. Wrapping a session

When wrapping — asked to wrap, or at a phase or batch close — follow the session wrap checklist in CLAUDE.local.md. All steps are required. The short version:

1. Tick completed items in plan.md
2. Update timeline.md Current Status
3. Update decisions.md if anything architectural was decided
4. Write the build-log.md entry (show draft in chat first)
5. Give a handoff note in chat
6. At phase close only: generate a PR description (see CLAUDE.local.md for format). Show it in chat after the build-log draft is approved.

plan.md, decisions.md, and build-log.md are gitignored — no commit needed, just write to disk. timeline.md is committed, so its update needs its own commit.

### 8.5. Build log (build-log.md)

Rules for build-log timing, format, and voice live in CLAUDE.local.md. Read that before writing any build-log entry.

The one rule that belongs here: always show the draft in chat before writing to disk. The user approves before it lands.

### 8.6. The blocking rule

If a code change would invalidate the docs and you don't have time to update them, **stop the code change** and tell the user. Code that drifts from docs is worse than no code.

---

## 9. Git Conventions

### 9.1. Branch strategy

```
main                      → always green, deployable
feature/<short-name>      → one feature, one branch
fix/<short-name>          → one bug, one branch
chore/<short-name>        → tooling, docs, deps
wip/<short-name>          → exploratory work; rebase or squash before merging to main
```

Branch names use kebab-case. Match the names in the planning blueprint (Step 9, Phase 5):
`feature/project-skeleton`, `feature/supabase-schema`, `feature/create-party-rpc`, etc.

For the very early phases (before a feature is large enough to warrant a branch), committing directly to `main` is acceptable. Once the codebase grows past the scaffolding stage, switch to feature branches.

### 9.2. Commit message format

```
<type>: <imperative summary, no period>

- bullet describing change
- bullet describing change
- bullet describing change

References: docs/specs/<file>.md §<section>   (when relevant)
```

Types: `feat` (new functionality), `fix` (bug fix), `chore` (tooling/deps/config), `refactor` (no behavior change), `docs` (documentation), `test` (tests only), `style` (formatting only), `wip` (intentionally incomplete checkpoint).

Each commit must include at least 2 body bullets unless it's a trivial one-line change (`docs: fix typo in README` is fine without bullets). Each bullet is a single physical line — never insert a line break in the middle of a bullet, no matter how long the line gets. Do not hard-wrap bullet text at 72/80 characters the way commit-message convention sometimes does for prose; that convention is for paragraphs, not bullets, and a bullet split across two lines renders as two disconnected fragments in git log and on GitHub instead of one statement. Let the line run as long as it needs to. Bullets describe **what changed**, not narrate the process.

`wip:` is only for intentionally incomplete checkpoints mid-task. The next commit should clear the WIP state. Do not leave `wip:` commits in `main` once the task is complete — squash or rewrite them.

### 9.3. Examples

✓ Good:

```
feat: add create_party RPC

- accept party_name, starting_interval_seconds, grace_mode params
- create party_session, party_settings, and host party_player in one transaction
- return join_code and host_player_id
- reject calls with invalid grace_mode enum values

References: docs/specs/rpc-contracts.md §2.1
```

```
fix: prevent duplicate Done taps from creating extra outcome rows

- add unique constraint on (round_id, party_player_id) in round_player_outcomes
- update mark_done RPC to upsert instead of insert
- add manual test note for double-tap scenario
```

✗ Bad:

```
feat: stuff
- added some code
- fixed a thing
```

```
feat: phase 5 complete
- did everything in the lobby phase
- 47 files changed
```

### 9.4. Never commit

- `.env` (the real env file)
- `node_modules/`
- build outputs (`.expo/`, `dist/`, `build/`)
- secrets of any kind, even temporary or test ones
- `supabase/.branches/`, `supabase/.temp/`
- IDE-specific configs unrelated to the project
- Generated files that can be reproduced from source

`.env.example` IS committed and lists every env var the app expects, with placeholder values.

### 9.5. Pushing

After a commit, push to the remote unless the user has explicitly asked you to batch pushes. Default behavior: commit → push. The user is reviewing via GitHub Desktop or GitHub web — they need pushes to land for the diff to be visible.

---

## 10. What Requires Explicit User Confirmation

Always pause and ask before:

- Running migrations against any environment (local, dev, prod)
- Adding a new dependency, especially one not listed in `docs/specs/` or the stack
- Adding a new environment variable
- Changing RLS policies on existing tables
- Deleting any column, table, or migration
- Modifying anything in `docs/planning/` (this is the locked blueprint — only edits with user say-so)
- Changing the file/folder structure in `docs/REPO_STRUCTURE.md`
- Touching anything related to billing, accounts, or destructive operations
- Reformatting / mass-rewriting existing code (even if it's "cleanup")

When in doubt, ask. A 5-second confirmation is cheaper than a 1-hour rollback.

---

## 11. Hard "Do Not" Rules

These are the brightest lines. Violating any of them is a serious bug.

- **Do not** put timer state on the client.
- **Do not** let the client write directly to game-state tables.
- **Do not** collapse `permissionRole`, `status`, and `duty` into a single field.
- **Do not** add referee, notification, account, or media features to MVP.
- **Do not** introduce deprecated APIs without flagging them.
- **Do not** generate a giant code dump in one response. Build in chunks.
- **Do not** invent game rules. If the spec doesn't cover a case, ask the user.
- **Do not** commit secrets or real env values.
- **Do not** drop or destructively alter existing migrations. Add a new migration instead.
- **Do not** use `any` in TypeScript without a comment explaining why.
- **Do not** silently catch and ignore errors.

---

## 12. Where to Look for More Detail

When you need product context or progress: `plan.md` and `timeline.md` (local working files). The planning blueprint under `docs/planning/` is retired and no longer maintained.

When you need the rationale behind a past choice: `decisions.md`.

When you need to implement game logic: `docs/specs/game-rules.md` and `docs/specs/mvp-state-machine.md`.

When you need to call or write an RPC: `docs/specs/rpc-contracts.md`.

When you need to write or check an RLS policy: `docs/specs/rls-rules.md`.

When you need schema-level detail: `docs/specs/schema.md` and `docs/specs/enums.md`.

When you need to know the repo structure: `docs/REPO_STRUCTURE.md`.

When you need to know if MVP is done: the Definition of Done at the bottom of each phase in `plan.md`.

---

## 13. Operating Principle

**Be a careful executor, not a creative author.** The user has done the planning work in the blueprint. Your job is to translate that plan into clean, current, well-organized code, one small piece at a time, with the user reviewing each piece. When the plan is ambiguous, ask. When you spot a real architectural concern, flag it. When you don't know which version of something to use, look it up. When you're about to write 500 lines in one shot, slow down and ask if that's what's wanted.

The goal is a codebase the user can read and trust, not one that's impressive to skim.
