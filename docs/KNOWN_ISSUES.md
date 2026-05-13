# Known Issues & Decisions Log

> Single source of truth for things that happen during development that aren't (yet) reflected in the locked specs.
> Updated by Claude Code as work happens, and by the user as needed.
> Cross-reference: `CLAUDE.md` §8 for the discipline; `docs/PHASE_ACCEPTANCE_CRITERIA.md` for phase-level progress.

---

## How to Use This File

This file has three sections:

1. **Open Issues** — currently unresolved bugs or problems. New issues are added here.
2. **Decisions Log** — choices made during development that weren't covered by the existing specs. Captured at the moment of decision so they don't get re-litigated later.
3. **Resolved Issues** — archive of bugs/problems that have been fixed. Moved from "Open Issues" when resolved.

### When to log an issue

Claude Code logs an issue when it encounters:

- A bug that can't be fixed in the current task without scope expansion
- Unexpected behavior whose root cause isn't obvious
- An edge case the specs don't cover, where a workaround was applied
- A piece of code that's working but needs revisiting (smells, TODOs, hacks)

A bug fixed in the same task it was discovered does NOT need an entry — that's just a normal fix, captured in the commit history.

### When to log a decision

Claude Code logs a decision when:

- The specs don't cover the case at hand and a judgment call has to be made
- A trade-off is chosen between two reasonable options
- An implementation detail is decided that future Claude Code sessions might revisit (e.g. "use Tone library for sound" vs "build a thin wrapper")
- The user makes a call mid-session that affects future work

**Decisions are required, not optional.** Silent ad-hoc decisions accumulate into invisible technical debt. If you would otherwise make a judgment call, you must log it.

### Entry IDs

- Issues: `#NNN` (zero-padded, sequential: `#001`, `#002`, `#003`)
- Decisions: `#DNNN` (`#D001`, `#D002`)

Don't reuse IDs. When an issue moves from Open to Resolved, its ID stays the same.

### Entry format

See the examples below for the full shape. At minimum:

- Title (one line)
- Date discovered/decided
- Phase or context
- Status
- Description (what's wrong / what's the question)
- Resolution or current plan
- Related files / commits when applicable

---

## Open Issues

*Issues that are known but not yet resolved.*

### #001 — [bug] Metro reports "Asset not found: assets/icon.png" on first `npx expo start`

**Found:** 2026-05-13 during Phase 0 QA (final local verification before phase closure)
**Phase:** 0
**Status:** Open (non-blocking — app bundles and runs, placeholder screen loads on device via Expo Go)

**Description:**
The first time `npx expo start` runs from `apps/mobile/`, Metro emits an "Asset not found: assets/icon.png" error before bundling completes. Bundling then succeeds and the app loads correctly on the user's device, so the error is non-blocking.

**Context:**
Discovered immediately after the template cleanup commit (`dfe5e05`) that deleted the four `react-logo*.png` demo assets and replaced `app/_layout.tsx`. Did not occur in any prior local run because the template's demo assets were present.

**Suspected root cause (not yet verified):**
The error path Metro reports is `assets/icon.png` (no `images/` segment) — but no in-repo config references that path. `app.json` correctly points at `./assets/images/icon.png` (verified via `grep` after the cleanup), and no source file (TSX, JS, JSON) references the unqualified `assets/icon.png`. Likely candidates:
- Stale entry in the local `.expo/` cache from before the cleanup, still referencing a deleted asset by an internal default-path probe.
- An Expo SDK 54 internal default that falls back to looking for `assets/icon.png` if a referenced icon fails to resolve, masking the real failure.
- A web-build artifact (the template's `expo-router` web `output: "static"` config in `app.json` line 25) checking for a default web icon path.

**Triage plan (for whoever picks this up):**
1. From `apps/mobile/`, `rm -rf .expo/` and re-run `npx expo start`. If the error disappears, it was cache staleness — close as resolved.
2. If the error persists, inspect Metro's `--verbose` output to find the call site requesting `assets/icon.png`.
3. If it's Expo SDK 54 internals, consider adding a no-op `assets/icon.png` (copy of `assets/images/icon.png`) as a workaround, OR file an Expo issue with a minimal repro.

**Why not fixed now:**
Non-blocking; the app loads. Investigating the root cause is its own ~30-minute task, and Phase 1 (Supabase schema) is the next priority. Better to close out Phase 0 cleanly and address this in a dedicated `chore: investigate metro asset-not-found warning` task.

**Related files:**
- `apps/mobile/app.json` (icon and splash paths)
- `apps/mobile/.expo/` (not committed; first place to clear)
- Commit `dfe5e05` (when the issue first surfaced)

---

---

## Decisions Log

*Decisions made during development that fill gaps in the specs.*

### #D001 — [decision] Package manager: npm

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** Claude Code (confirmed implicitly by CLAUDE.md conventions)

**Question:**
CLAUDE.md references `npm view` and `package-lock.json` (§6.1, §6.2) but never explicitly names a package manager. Locking the choice now avoids inconsistency across future commits.

**Options considered:**
- (a) npm — already implied by CLAUDE.md, ships with Node, no extra install
- (b) pnpm — faster, better monorepo support, but adds a tool to the bootstrap path
- (c) yarn — no compelling advantage over npm for this scale

**Decision:** (a) npm

**Why:**
CLAUDE.md already speaks npm. The repo has one mobile app and one Supabase project — there is no monorepo pressure that would justify pnpm. Sticking with the implied default keeps the bootstrap story trivial.

**Documented in:**
- Commit (sub-task 1 of Phase 0)

---

### #D002 — [decision] Expo template: `default` (Expo Router + tabs example)

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** Claude Code

**Question:**
`create-expo-app` offers several templates. Which one bootstraps `apps/mobile/` while honoring the locked stack (TypeScript + Expo Router, per CLAUDE.md §3 and §6.5)?

**Options considered:**
- (a) `default` — TypeScript + Expo Router pre-wired, ships with an example tabs app
- (b) `blank-typescript` — minimal TS app with no router; would require manually installing/configuring `expo-router`
- (c) `tabs` — similar to default; functionally equivalent here

**Decision:** (a) `default`

**Why:**
Expo Router is locked (CLAUDE.md §6.5) and the `default` template wires it correctly out of the box, including `_layout.tsx`, typed routes, and metro config. Bootstrapping it by hand from `blank-typescript` would replicate work the template already does. The template's example tabs content is acceptable as the Phase 0 placeholder; the real route structure (per REPO_STRUCTURE.md §2.1) is created in Phase 3 and will replace it.

**Documented in:**
- Commit (sub-task 1 of Phase 0)

---

### #D003 — [decision] Stay on Expo SDK 54 (not 55)

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** user (after Claude Code surfaced the mismatch)

**Question:**
`expo@latest` dist-tag is SDK 55 (55.0.24), but `create-expo-app@latest` (also v55.0.24) bundles a template that pins `expo@~54.0.33`. CLAUDE.md §6 says stay current — do we accept SDK 54 or force-upgrade to SDK 55 immediately?

**Options considered:**
- (a) Stay on SDK 54 — what `create-expo-app` produced; Expo team's currently bundled template; peer deps guaranteed coherent
- (b) Force-upgrade to SDK 55 now — closer to "latest", but untested template/SDK combination on a fresh scaffold

**Decision:** (a) Stay on SDK 54

**Why:**
The template/SDK pairing the Expo team ships is the most predictable starting point. The mismatch is template lag, not a behavioral concern. We plan an explicit SDK 55 upgrade task once the template catches up, treated like any other dependency bump.

**Documented in:**
- Commit (sub-task 1 of Phase 0)
- Follow-up: a future `chore: upgrade to Expo SDK 55` task once the bundled template catches up

---

### #D007 — [decision] Keep `EXPO_PUBLIC_SUPABASE_ANON_KEY` despite Supabase CLI renaming to `sb_publishable_` / `sb_secret_`

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** user (after Claude Code surfaced the naming mismatch during Phase 0 closeout)

**Question:**
The Supabase CLI version used to scaffold this project (2.98.2) now emits the project's public API key as `sb_publishable_...` and the elevated key as `sb_secret_...` instead of the older `anon` / `service_role` labels. The function of the keys is unchanged (publishable = the same key clients use, protected by RLS; secret = the same elevated key for server-only use). But our `.env.example` declares the variable as `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the legacy name. Renaming the env var now or sticking with the legacy name is a one-way door per env-file consumer.

**Options considered:**
- (a) Keep `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the MVP — matches every `@supabase/supabase-js` example and tutorial that still says "anon key"; consistent with the long tail of community docs; one variable name across the team.
- (b) Rename now to `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — matches the CLI's current label and the new Supabase docs going forward; clearer that this is the *public* key, not just "anonymous-user" key; requires updating `.env.example`, the env loader (`src/lib/env.ts` in Phase 3), and any docs referencing the variable.
- (c) Support both names with a fallback in the env loader — flexibility cost; ambiguous which is canonical; defers the rename rather than deciding.

**Decision:** (a) — keep `EXPO_PUBLIC_SUPABASE_ANON_KEY` for now, revisit during Phase 1 or 2.

**Why:**
Phase 0 has zero downstream consumers of this variable yet (no `src/lib/env.ts`, no Supabase client wired). Changing the name later when we wire the client (Phase 3) costs one search-and-replace; changing it now means we'd have to keep tracking whether community docs / `@supabase/supabase-js` examples have moved over. The "anon key" terminology is also what every existing tutorial uses to explain *what this key does* (it identifies anonymous sessions under RLS), which matches the MVP's anonymous-auth flow. Defer the rename until either: (1) the Supabase JS SDK itself starts emitting deprecation warnings on the old terminology, or (2) we hit confusion during Phase 1/2 RPC work because the CLI surface uses `publishable` everywhere.

**Trigger to revisit:**
If during Phase 1 or 2 we find ourselves writing comments like "the anon key, which Supabase now calls publishable" more than twice, just do the rename. Log the rename as a `#D###` superseding this one.

**Documented in:**
- `.env.example` (variable name unchanged)
- Commit (Phase 0 closure)

---

### #D006 — [decision] Delete Expo template demo code in Phase 0 rather than reformat it

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** user (after Claude Code surfaced the failing `format:check` and proposed deletion vs reformat)

**Question:**
Sub-task 3 of Phase 0 installs Prettier and adds a `format:check` script. The check fails on 9 files inherited from the Expo `default` template (`app/(tabs)/*`, `components/*`, `hooks/*`, `scripts/reset-project.js`, `tsconfig.json`). These files are demo content the template ships to showcase Expo Router, theming, and haptics. None of them are required by the MVP route structure (`docs/REPO_STRUCTURE.md` §2.1). Reformatting them to satisfy `format:check` would burn commits on code Phase 3 already plans to replace.

**Options considered:**
- (a) Reformat in place — keeps the demo running, satisfies `format:check`, but treats throwaway scaffolding as if it were real code; produces a large `style:` diff on files that vanish in Phase 3.
- (b) Delete demo code now, replace with a minimal placeholder screen — smaller working tree, makes the "real code only" boundary explicit, accelerates the cleanup #D004 anticipated for Phase 3, but `npx expo start` shows a stub instead of the template tour.
- (c) Skip the format criterion until Phase 3 — defers the gate; `format:check` stays red on `main` for an indeterminate stretch.

**Decision:** (b) — delete the template demo code now, ship a minimal `app/_layout.tsx` (plain `<Stack />`) and `app/index.tsx` placeholder screen.

**Files deleted in the same commit:** all of `app/(tabs)/`, `app/modal.tsx`, `components/`, `constants/`, `hooks/`, `scripts/`, `apps/mobile/README.md`, and the four demo logos in `assets/images/` (`partial-react-logo.png`, `react-logo*.png`).

**Runtime deps removed alongside:** `expo-haptics`, `expo-image`, `expo-symbols`, `expo-web-browser` — only the demo code referenced them, and Phase 3 has no anticipated use. `@react-navigation/native`, `@react-navigation/elements`, `@react-navigation/bottom-tabs` are kept because Phase 3 is likely to use them via `expo-router`'s header/tab integration.

**Knock-on effect on #D004:** The template-fallback path aliases that #D004 added to `tsconfig.json` (`./components/*`, `./hooks/*`, `./constants/*`) become dead aliases the moment those directories are gone. They're removed in this same commit. This is the cleanup #D004 explicitly anticipated for Phase 3, happening one phase early as a natural side effect — #D004 stands, not superseded.

**Why:**
The Expo default template's example content has a single legitimate purpose: prove the bootstrap worked. Once we've confirmed that (and once we have a minimal `app/index.tsx` that does the same job), the demo code is dead weight. Deleting now keeps the source tree honest about what's real-MVP code versus what's scaffolding, and avoids a confusing review experience later where Phase 3 deletes "code" Phase 0 just spent commits reformatting.

**Documented in:**
- Commit (sub-task 3 follow-up of Phase 0)
- Replacement files: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`

---

### #D005 — [decision] Prettier rule choices beyond CLAUDE.md §5.2

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** Claude Code

**Question:**
CLAUDE.md §5.2 locks four Prettier-controlled style choices (2-space indent, single quotes, trailing commas in multi-line, semicolons on) but is silent on `printWidth`, `arrowParens`, and `endOfLine`. Prettier requires concrete values for those, and silently inheriting Prettier defaults across OSes is risky on Windows.

**Options considered:**
- (a) Use Prettier defaults for the unspecified rules — `printWidth: 80`, `arrowParens: "always"`, `endOfLine: "lf"`. Simplest, but `printWidth: 80` is tight for modern React Native JSX and `endOfLine: "lf"` will make `format:check` flap on Windows checkouts where `core.autocrlf=true` rewrites LF→CRLF on disk.
- (b) Pin the unspecified rules explicitly: `printWidth: 100`, `arrowParens: "always"`, `endOfLine: "auto"`. Slightly wider lines match the typical Expo/RN style, and `"auto"` makes the format check tolerant of CRLF on Windows working trees while still writing LF when Prettier rewrites a file.
- (c) Pin width even wider (120) — common in some JS shops but pushes JSX past readable on a phone-sized editor pane.

**Decision:** (b) — `printWidth: 100`, `arrowParens: "always"`, `endOfLine: "auto"`.

**Why:**
The four §5.2 rules cover the high-impact choices; (b) fills the remaining slots without re-litigating them. `endOfLine: "auto"` is the load-bearing choice — without it, anyone on Windows with default `core.autocrlf=true` would see `prettier --check` fail immediately on a fresh checkout. `printWidth: 100` is a small, conventional bump that keeps short JSX trees on one line. `arrowParens: "always"` is just making the Prettier v3 default explicit so the config doesn't silently flip if a future Prettier major changes the default.

**Documented in:**
- `apps/mobile/.prettierrc`
- Commit (sub-task 3 of Phase 0)

---

### #D004 — [decision] Path alias coexistence with Expo template directories

**Date:** 2026-05-13
**Phase:** 0
**Decided by:** Claude Code

**Question:**
REPO_STRUCTURE.md §2.6 specifies aliases pointing at `src/components/*`, `src/features/*`, etc. The Expo `default` template puts `components/`, `hooks/`, `constants/` at the `apps/mobile/` root (not under `src/`) and imports them via `@/components/...`, `@/hooks/...`, etc. TypeScript path resolution does not fall through between patterns, so a pure REPO_STRUCTURE.md alias would silently break the template's existing imports.

**Options considered:**
- (a) Add REPO_STRUCTURE.md aliases only — breaks template imports immediately; would require moving template dirs under `src/` now (scope expansion)
- (b) Add REPO_STRUCTURE.md aliases plus template-fallback targets — both work; cleanup is natural when the template content is restructured in Phase 3
- (c) Skip path aliases for now — defer to Phase 3, contradicting Phase 0's stated files-involved list

**Decision:** (b) Add REPO_STRUCTURE.md aliases with template-fallback targets

**Why:**
Lets sub-task 1 finish without invalidating any existing template imports. The fallback targets (`components/*`, `hooks/*`, `constants/*`) disappear naturally in Phase 3 when those template files are restructured per REPO_STRUCTURE.md §2.1, so the temporary mapping is self-cleaning rather than persistent debt.

**Documented in:**
- Commit (sub-task 1 of Phase 0)
- `apps/mobile/tsconfig.json` — paths section

---

### #D008 — [decision] RLS migration split: combine helpers and policies in one file

**Date:** 2026-05-13
**Phase:** 1
**Decided by:** user (after Claude Code flagged a 3-file vs 2-file discrepancy)

**Question:**
`docs/PHASE_ACCEPTANCE_CRITERIA.md` Phase 1 deliverables list three migration files (`_initial_schema.sql`, `_rls_helpers.sql`, `_rls_policies.sql`), but `docs/specs/schema.md` §14 describes the foundation as a single ordered migration that bundles schema + RLS together. The user's Phase 1 prompt asks for two files (`_initial_schema.sql` + `_rls.sql`, combining helpers and policies). Locking the file count now avoids inconsistency across the Phase 1 sub-tasks.

**Options considered:**
- (a) Three files (`_initial_schema.sql` + `_rls_helpers.sql` + `_rls_policies.sql`) — matches PHASE_ACCEPTANCE_CRITERIA Phase 1 as written; cleanly separates helper definitions from the policies that consume them; adds one more file and an arbitrary boundary in the middle of the RLS layer with no consumer in isolation.
- (b) Two files (`_initial_schema.sql` + `_rls.sql`) — keeps schema separate from security (so RLS-only changes review independently); co-locates helpers with the policies that are their only callers; matches the spirit of schema.md §14 (RLS treated as one chunk) without collapsing into the schema migration.
- (c) One file (everything in `_initial_schema.sql`) — matches schema.md §14 strictly; couples table creation with security policy, which makes future RLS-only diffs harder to review.

**Decision:** (b) — two files: `_initial_schema.sql` (sub-task 1) and `_rls.sql` containing both helpers and policies (sub-task 2).

**Why:**
The four RLS helpers (`is_party_member`, `is_active_party_member`, `is_party_host`, `my_party_player_id`) are only ever called by RLS policies. Splitting them into their own migration creates a file with no logical consumer when read in isolation. Keeping schema and RLS in *separate* migrations does still pay off — RLS-only changes can be reviewed without scanning a 500-line schema diff — so we don't collapse to one file either. PHASE_ACCEPTANCE_CRITERIA.md Phase 1 deliverables will be updated in sub-task 3 to match the two-file shape.

**Documented in:**
- `supabase/migrations/<timestamp>_initial_schema.sql` (sub-task 1)
- `supabase/migrations/<timestamp>_rls.sql` (sub-task 2)
- `docs/PHASE_ACCEPTANCE_CRITERIA.md` Phase 1 deliverables (updated in sub-task 3)

---

## Resolved Issues

*Issues from "Open Issues" that have been fixed. Kept for reference.*

### Example entry format (delete after the first real entry is logged):

```markdown
### #001 — [bug] <Short title>

**Found:** YYYY-MM-DD during Phase <N> <QA | dev | review>
**Resolved:** YYYY-MM-DD
**Phase:** <N>
**Status:** Resolved (commit <sha>)

**Description:**
<What was wrong, observed behavior>

**Context:**
<What was happening when we hit it; conditions that triggered it>

**Root cause:**
<Why it was happening — the actual bug, not the symptom>

**Resolution:**
<What was changed to fix it>

**Related files:**
- `<path>`
- `<path>`
```

(none yet)

---

## Conventions

### When to mark a Decision as superseded

Sometimes a decision logged here gets revisited and changed later. When that happens:

1. Don't delete the original decision entry. Mark it `[superseded by #DNNN]` in the title.
2. Add a new decision entry with the new choice, referencing the prior one.
3. This preserves the audit trail of how thinking evolved.

### When a decision affects a spec

If a decision rises to the level of "this should be in the locked specs," do BOTH:

1. Log it here for the audit trail.
2. Update the relevant spec in `docs/specs/` (per `CLAUDE.md` §8.1).

Once it's in the spec, the spec becomes the source of truth. The decision log entry remains as historical context.

### Pruning resolved issues

The Resolved Issues list grows over time. Don't delete entries, but if it gets unwieldy (say, 100+ entries), consider archiving the oldest into `docs/archive/RESOLVED_ISSUES_PRE_<date>.md`. For MVP, this won't be a problem.

---

## Quick Reference

- Bug found, fixing now → just commit normally, no entry needed
- Bug found, can't fix immediately → add to **Open Issues**
- Bug fixed that was previously in Open Issues → move to **Resolved Issues**
- Spec gap or unanticipated choice → add to **Decisions Log** BEFORE implementing
- Specs need updating to reflect the decision → update the spec AND log the decision here
