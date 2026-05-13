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

(none yet — first issue will land during development)

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
