> **Deprecated:** Replaced by `decisions.md` + `timeline.md` as of 2026-06-03. No longer maintained.

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

### #003 — [verification] Verify Phase 2 RPC happy paths and member-state branches with real party data in Phase 3+

**Found:** 2026-05-13 during Phase 2 Batch A2 verification; extended 2026-05-14 to cover Batch B1 deferrals; extended 2026-05-14 to cover Batch B2 deferrals
**Phase:** 2 (deferred from)
**Status:** Open (non-blocking — auth gates, `INVALID_PARAM`, `JOIN_CODE_NOT_FOUND`, `NOT_IN_PARTY` and `SESSION_NOT_FOUND` collapse already verified via fake JWT + fake UUIDs across A2, B1, and B2)

**Why deferred:**
Happy paths and member-state-dependent branches require a real `auth.users` row referenced by `party_players.user_id`. Direct seeding of `auth.users` is brittle (same rationale as Phase 1 declining `seed.sql`). Same principle as `KNOWN_ISSUES.md` #D010 (5) — defer to where the real auth flow naturally produces the prerequisites.

**What to verify when closing:**

Batch A2 (§13 read RPCs):
- `get_party_state` returns the four-key payload (session + settings + current_round + players) for a real active member.
- §13.1 dual visibility filter exercised across all four caller states: host, regular active player, removed-self caller (should see own row), and removed-other from a non-host caller's perspective (should NOT appear).
- `get_round_outcomes` returns `[]` for a fresh round and a populated array after a round produces outcomes.

Batch B1 (§2 / §3 write RPCs):
- `create_party` happy path: returns `{party_session_id, join_code, host_player_id}` with `join_code` matching `^[A-HJ-NP-Z2-9]{6}$`, session row at `status='lobby'`, settings row keyed to it, host party_players row inserted, host_player_id FK populated.
- `create_party` `ALREADY_HOSTING` branch: caller with an existing host row in a `lobby`/`active`/`paused` party is rejected (per #D011 (2) amendment to §2.2).
- `join_party` new-join happy path: returns `{party_session_id, party_player_id, is_reconnect: false}`; new party_players row created with `permission_role='player'`, `status='active'`, `duty='normal_player'`.
- `join_party` `PARTY_NOT_JOINABLE`: started or ended party rejects new joiners.
- `join_party` `PARTY_LOCKED`: locked party rejects new joiners.
- `join_party` `PLAYER_REMOVED`: caller with `status='removed'` is rejected.
- `join_party` reconnect path (§3.6): caller with existing `active`/`out` row returns `{is_reconnect: true}`, `last_seen_at` and `rejoined_at` are refreshed, `display_name` is preserved.

Batch B2 (§4 / §12 write RPCs):
- `leave_party` happy path: lobby caller's row updated to `status='removed'`, `left_at=now()`, `removed_at=now()`, `removed_reason='self_left_lobby'`; success payload `{}`.
- `leave_party` `HOST_CANNOT_LEAVE`: host caller is rejected; must use `end_party`.
- `leave_party` `ILLEGAL_TRANSITION`: caller in a started game (phase != 'lobby') is rejected; must use `mark_self_out`.
- `leave_party` `PLAYER_REMOVED` (kicked): caller previously removed by host (`removed_reason != 'self_left_lobby'`) returns `PLAYER_REMOVED` per #D013.
- `leave_party` idempotent self-left: caller previously removed with `removed_reason='self_left_lobby'` returns ok with `data={}`.
- `end_party` happy path from lobby (no in-flight round): session `status='ended'`, `phase_ends_at=null`, `ended_at=now()`; `admin_action_logs` row inserted with `action_type='end_party'`; no `timer_events` row; no `rounds` row updated.
- `end_party` happy path from active/paused (in-flight round): all of the above PLUS in-flight round's `status='cancelled'` AND a `timer_events` row inserted with `event_type='round_cancelled'`, `triggered_by='host'`. Verify `paused_at` and `paused_remaining_seconds` are preserved per #D012 (d).
- `end_party` `NOT_HOST`: regular player caller is rejected.
- `end_party` idempotent already-ended: second call returns ok with the original `ended_at` (not a fresh timestamp).

**When to close:**
Earliest natural opportunity is Phase 6 — host can remove a player, so all four roster-visibility conditions exist together. Phase 3 / 5 can close the basic happy-path checks (create_party, join_party new-join, get_party_state) if convenient there. B1's reconnect path is naturally exercised in Phase 4 (Anonymous Auth + reconnect-to-in-progress-party requirement). B2's `end_party` in-flight-round branch needs Phase 7+ (server-authoritative timer running, rounds existing); B2's `leave_party` happy path can close in Phase 6 alongside the host-remove flow.

**Related files:**
- `docs/specs/rpc-contracts.md` §2, §3, §4, §12, §13.1, §13.3
- `supabase/migrations/20260513150100_rpc_reads.sql`
- `supabase/migrations/20260514100000_rpc_party_entry.sql`
- `supabase/migrations/20260514110000_add_round_cancelled_to_timer_event_type.sql`
- `supabase/migrations/20260514110100_rpc_party_exit.sql`

---

### #004 — [doc] Planning-doc RPC lists are illustrative and drift from the authoritative rpc-contracts.md §14 inventory

**Found:** 2026-06-03 during Phase 2 Batch C planning (the #D014 Round 1 docs pass, while striking `start_next_round()` from the planning blueprint)
**Phase:** 2 (Batch C)
**Status:** Open (non-blocking — doc-only; the authoritative RPC surface is rpc-contracts.md §14, which is correct)

**Description:**
The RPC lists embedded in the planning blueprint were written early as illustrative sketches, not as a maintained inventory. They drift both from each other and from the authoritative surface in `docs/specs/rpc-contracts.md` §14:

- `docs/planning/08-stack.md` §4 (lines ~112–124) lists `advance_phase_if_due()` but omits `leave_party`, `host_pause_timer`, `host_resume_timer`, `host_end_shot_window`, `host_skip_to_shot_window`, `host_remove_player`, and the three read helpers.
- `docs/planning/09-development-process.md` Phase 2 (lines ~224–238) omits `advance_phase_if_due()`, `leave_party`, `host_end_shot_window`, `host_skip_to_shot_window`, and the read helpers — a *different* set of omissions than 08-stack.md.
- `docs/planning/09-development-process.md` Testing Strategy (lines ~654–665) is shorter still (no `host_pause_timer` / `host_resume_timer` / `host_remove_player`).

**Why logged now and not fixed:**
The #D014 Round 1 docs pass touches both files only to strike `start_next_round()` (removed from MVP by #D014). Reconciling the full RPC lists against rpc-contracts.md §14 in the same commit would be scope expansion (CLAUDE.md §7.4) and would also mean editing the locked planning blueprint beyond the narrow #D014 mandate (CLAUDE.md §10). The authoritative inventory lives in rpc-contracts.md §14; the planning lists are descriptive prose, not a contract. So the #D014 pass strikes only `start_next_round()` and leaves the pre-existing gaps in place, tracked here.

**Resolution plan (for whoever picks this up):**
A dedicated `docs: reconcile planning-blueprint RPC lists with rpc-contracts.md §14` task — gated on user say-so because it edits `docs/planning/` (CLAUDE.md §10). Either bring both lists to parity with §14, or replace the inline lists with a pointer to rpc-contracts.md §14 as the single source of truth.

**Related files:**
- `docs/planning/08-stack.md` §4
- `docs/planning/09-development-process.md` Phase 2 + Testing Strategy
- `docs/specs/rpc-contracts.md` §14 (the authoritative inventory)

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

### #D009 — [decision] Scope RLS policies to `TO authenticated` (deviates from rls-rules.md examples as originally written)

**Date:** 2026-05-13
**Phase:** 1
**Decided by:** user (after Claude Code surfaced that rls-rules.md §2-§11 examples omit a TO clause)

**Question:**
The example SQL snippets in `docs/specs/rls-rules.md` §2 through §11 never include a `TO <role>` clause on any policy. Postgres defaults to `TO public`, which means all roles (`authenticated`, `anon`, `service_role`, `postgres`, etc.) are evaluated by the policy. In our case the helpers already deny unauthenticated callers via `auth.uid()` checks, and Supabase's `service_role` bypasses RLS regardless — so the functional behavior is identical whether we scope or not. But explicit scoping makes intent clear in the SQL. Lock the convention before writing the first RLS migration so every future policy follows it.

**Options considered:**
- (a) Match spec verbatim (no TO clause) — keeps the migration 1:1 with the spec; no doc updates needed; reader has to infer that PUBLIC is intentional rather than an oversight.
- (b) Scope every SELECT policy to `TO authenticated` — clearer intent; aligns with modern Supabase patterns; requires updating both the migration AND the spec examples (otherwise the spec drifts away from the code, violating CLAUDE.md §8.1).

**Decision:** (b) — scope all SELECT policies to `TO authenticated`. Update both the migration AND `docs/specs/rls-rules.md` to reflect the new convention in the same docs commit.

**Why:**
The user prefers explicit policy scoping (the SQL says exactly who the policy applies to instead of relying on Postgres's PUBLIC default). Per `CLAUDE.md` §8.1, the spec is the source of truth — if the migration uses `TO authenticated` but the spec doesn't, the spec rots immediately. Updating both keeps them in lockstep. Supabase Anonymous Auth users are still `authenticated` to Postgres, so this scope change does not exclude guest sessions — anonymous auth was the only path I worried might be excluded, and it isn't.

**Documented in:**
- `docs/specs/rls-rules.md` §1.5 (new) and §2-§11 (every example SQL policy updated)
- `supabase/migrations/<timestamp>_rls.sql` (every CREATE POLICY, sub-task 2)

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

### #D010 — [decision] Phase 2 RPC infrastructure conventions

**Date:** 2026-05-13
**Phase:** 2
**Decided by:** user (after Claude Code surfaced five spec/scope questions during Batch A planning)

**Question:**
Batch A of Phase 2 establishes the infrastructure pattern every subsequent RPC will copy. Five conventions need to be locked in one place before any code lands, because changing any of them later would mean revisiting every committed RPC:

1. How are `SECURITY DEFINER` functions hardened against `search_path` attacks?
2. SECURITY DEFINER bypasses RLS — what's the in-function policy for read RPCs that need to enforce party-member access themselves?
3. Internal SQL helpers (`_rpc_error`, `_rpc_success`) are auto-exposed by PostgREST as RPC endpoints — how do we prevent that?
4. `rpc-contracts.md` §1.3 mandates the standard `{ok, error_code, error_msg, data}` shape for all RPCs, but §13.2 and §13.3 specify raw `timestamptz` and `setof round_player_outcomes` returns instead. Which is canonical?
5. The Batch A typed wrappers can't compile without `src/lib/supabase.ts`, which `PHASE_ACCEPTANCE_CRITERIA.md` Phase 3 owns. Where does the supabase client come from?

**Options considered:**

(1) search_path pinning:
- (a) `SET search_path = public, pg_temp` on every SECURITY DEFINER function — the Postgres-recommended hardening against schema-shadowing attacks where a malicious caller creates objects in their own schema and tricks a definer-rights function into resolving to them.
- (b) Rely on the default search_path — works in practice but leaves a documented privilege-escalation class open.

(2) SECURITY DEFINER + reads:
- (a) Every SECURITY DEFINER read RPC calls `auth.uid()` + an in-function membership check (e.g. `is_active_party_member`) before returning data — explicit, mirrors the write-path pattern, no implicit reliance on RLS for definer-rights functions.
- (b) Use SECURITY INVOKER for read RPCs so RLS applies automatically — simpler, but inconsistent with `rpc-contracts.md` §1.1's locked "every MVP RPC uses SECURITY DEFINER" rule.

(3) Helper exposure:
- (a) Helpers in `public` with explicit `REVOKE EXECUTE FROM public, anon, authenticated` — callable by SECURITY DEFINER RPCs (which run as `postgres`) but not reachable via the PostgREST `/rpc/_rpc_error` URL.
- (b) Helpers in a separate `internal` schema — clean isolation but adds a schema PostgREST doesn't introspect by default; more wiring than (a).

(4) §13 return-shape contradiction:
- (a) Amend §13.2 and §13.3 to use the standard shape, with `data` containing `{server_time}` and `{outcomes: [...]}` respectively — one TypeScript wrapper signature, one error pipeline, every RPC uniform.
- (b) Treat §13 reads as exceptions — needs two distinct rpcClient code paths and two TS wrapper patterns.

(5) Supabase client:
- (a) Pull `@supabase/supabase-js` install + minimal `src/lib/supabase.ts` into Phase 2 Batch A1, marked "Phase 3 deliverable pulled forward by dependency" so Phase 3 doesn't re-create.
- (b) Defer typed wrappers + rpcClient to Phase 3 — breaks Batch A's "wrappers compile clean" acceptance criterion.
- (c) Inject a supabase-like client so types are pure until Phase 3 — abstraction the codebase has no other use for.

**Decision:**
- (1) — (a) Every SECURITY DEFINER function pins `SET search_path = public, pg_temp`.
- (2) — (a) Every SECURITY DEFINER read RPC performs its own `auth.uid()` + membership check before reading. Results that bypass these checks are a bug, not a feature.
- (3) — (a) Internal helpers live in `public` with explicit `REVOKE EXECUTE` from `public, anon, authenticated`. Migration includes an inline comment.
- (4) — (a) Amend `rpc-contracts.md` §13.2 and §13.3 to the standard shape. Amendment ships in the same docs commit as the A2 migration (the commit that introduces the read RPCs themselves) so spec and code land together per `CLAUDE.md` §8.1.
- (5) — (a) `@supabase/supabase-js` install + minimal `src/lib/supabase.ts` land in Batch A1. When Phase 3 starts, `PHASE_ACCEPTANCE_CRITERIA.md` Phase 3 deliverables for `supabase.ts` will be marked already-satisfied; Phase 3's typed `env.ts` loader replaces A1's inline env validation.

**Why:**
These are the conventions every Phase 2 RPC will copy from Batch A. Locking them in one decision means: search-path hardening is uniform; SECURITY DEFINER read paths are explicit about their own checks rather than silently relying on RLS that doesn't apply to definer-rights functions; internal helpers can't be hit from the client; the TS wrapper layer handles one shape, not two; and the supabase client is created once rather than rebuilt in Phase 3. The §13 spec amendment is the right call because the alternative (two return-shape variants) propagates through `RpcResult<T>`, the error pipeline, and every screen that calls these reads — far more invasive than fixing a five-line spec inconsistency.

**Documented in:**
- `supabase/migrations/<timestamp>_rpc_infrastructure.sql` (search_path on helpers; revoke statements with inline comment) — Batch A1
- `apps/mobile/src/lib/supabase.ts` + `apps/mobile/package.json` (Phase 3 deliverable pulled forward) — Batch A1
- `apps/mobile/src/lib/rpcClient.ts`, `apps/mobile/src/types/api.ts`, `apps/mobile/src/lib/errors.ts` — Batch A1
- `docs/specs/rpc-contracts.md` §13.2 and §13.3 (amended) — Batch A2 docs commit
- All subsequent Phase 2 RPC migrations (search_path + auth.uid() pattern repeated)

---

### #D011 — [decision] Phase 2 Batch B1 conventions (create_party + join_party)

**Date:** 2026-05-14
**Phase:** 2 (Batch B1)
**Decided by:** user (after Claude Code surfaced five spec/scope flags during B1 planning)

**Question:**
B1 implements `create_party` and `join_party`. Five spec-silence items needed locking before the migration could be written:

1. Join code generation method (`rpc-contracts.md` §2.5 specifies alphabet and retry count but not the algorithm).
2. Scope of the `ALREADY_HOSTING` check (§2.2 says "active or lobby" — does this include `paused`?).
3. Whether `phase_started_at` is set on `create_party` (state-machine §3.1 says yes; rpc-contracts.md §2.4 is silent).
4. Mismatch between schema's column-level `unique(join_code)` (across all statuses) and §2.5's "uniqueness across `{lobby, active, paused}`."
5. Whether §3.6 reconnect short-circuits §3.4 preconditions.

**Options considered / decisions:**

(1) **Join code generation:**
- (a) plpgsql loop, `floor(random() * 32) + 1` to index a constant 32-char alphabet array; retry on collision via `EXCEPTION WHEN unique_violation` up to 5 times.
- (b) `gen_random_bytes()` + base32-like encoding — overkill for the 32^6 ≈ 1B address space and MVP threat model.

**Decision:** (a). No spec amendment needed (§2.5 prescribes the alphabet and retry count, both of which (a) satisfies).

(2) **`ALREADY_HOSTING` scope:**
- (a) Literal §2.2: `status in ('lobby', 'active')`.
- (b) Include `paused`: `status in ('lobby', 'active', 'paused')`.

**Decision:** (b). A paused party is mid-game with a host; that host opening a second party while paused would be surprising. §2.2 amended in the same docs commit as the B1 migration.

(3) **`phase_started_at` on `create_party`:**
- (a) Leave null until `start_game` sets it.
- (b) Set to `now()` at create — matches state-machine §3.1's "phaseStartedAt = party creation time" for the lobby phase.

**Decision:** (b). Implementation detail; no rpc-contracts.md amendment needed — state-machine spec already prescribes it.

(4) **Join code uniqueness mismatch:**
- (a) Loosen schema to a partial unique on `status in ('lobby', 'active', 'paused')` so ended/expired/cancelled codes can be reused.
- (b) Tighten §2.5 wording to match the schema's stricter column-level `unique(join_code)` — codes are permanently consumed once a session has used them.

**Decision:** (b). Schema is stricter and safer; 32^6 ≈ 1B address space is plenty even with permanent consumption. §2.5 amended.

(5) **§3.4 vs §3.6 ordering:**
- (a) §3.4 preconditions apply universally — would mean post-lobby reconnect is impossible (broken).
- (b) Reconnect (§3.6) is checked first: if the caller has an existing party_players row in this session with `status ∈ {active, out}`, only the §3.6 branch runs; §3.4 status/lock preconditions are bypassed. New-join path (no existing row) applies the full §3.4 preconditions.

**Decision:** (b). Already implicit in §3.6's existence, but §3.4 is amended to state the ordering explicitly so future readers don't have to infer it.

**Documented in:**
- `supabase/migrations/<timestamp>_rpc_party_entry.sql` (B1 migration; (1), (2), (3) realized in SQL with inline comments referencing this entry)
- `docs/specs/rpc-contracts.md` §2.2, §2.5, §3.4 (amended in the B1 docs commit, lands BEFORE the B1 migration commit per `CLAUDE.md` §8.1)
- `apps/mobile/src/features/party/api/createParty.ts`, `apps/mobile/src/features/party/api/joinParty.ts`

---

### #D012 — [decision] Phase 2 Batch B2 conventions (leave_party + end_party)

**Date:** 2026-05-14
**Phase:** 2 (Batch B2)
**Decided by:** user (resolved during B1 planning round; logged at B2 start, with (g) added during B2 planning)

**Question:**
B2 implements `leave_party` and `end_party`. Seven small spec-silence items needed locking:

(a) `leave_party` effects: schema's `removed_fields_consistent` CHECK requires `removed_at NOT NULL` when `status = 'removed'`, but §4.4 only mentioned `left_at`. Do we set both?
(b) `leave_party` success payload: §4.5 said "standard ok/error shape" but didn't define the `data` field.
(c) `end_party` timer_events row: §12.4 didn't specify `triggered_by`.
(d) `end_party` pause-related columns: do we clear `paused_at` / `paused_remaining_seconds` on end?
(e) `end_party` `phase_ends_at`: spec was silent on whether to null it.
(f) `end_party` admin_action_logs row: spec was silent on `previous_value` / `new_value` / `round_id` / `round_number`.
(g) `end_party` timer_events `event_type`: spec said `round_completed`, but the round was cancelled, not completed — misleading audit trail.

**Decisions:**

(a) Set both `removed_at = now()` AND `left_at = now()` on `leave_party`. The schema CHECK mandates `removed_at`; `left_at` is the semantic "when did the player leave" field per §4.4's literal wording. **§4.4 amended.**

(b) `data = {}` on `leave_party` success (empty jsonb object). Matches the standard envelope contract (`data` is always present, never `null` on success). **§4.5 amended.**

(c) `triggered_by = 'host'` on the timer_events row inserted by `end_party`. The host called end_party; the event was host-triggered. **§12.4 amended.**

(d) Leave `paused_at` and `paused_remaining_seconds` set as historical record. Don't touch them on end. They're informational once `status = 'ended'`; clearing them loses audit trail. **§12.4 amended.**

(e) Set `phase_ends_at = null` on end. Matches state-machine §3.5 ("phase_ends_at = null in lobby, round_complete, and ended"). **§12.4 amended.**

(f) `previous_value = null`, `new_value = null` on the `admin_action_logs` entry for `end_party`. `round_id` and `round_number` are populated when an in-flight round was cancelled (matching the timer_events row's targets); both are null otherwise (e.g. end from lobby). **§12.4 amended.**

(g) Add a new `round_cancelled` value to the `timer_event_type` enum. `end_party` emits `round_cancelled` instead of `round_completed` for the in-flight-round case. Audit-trail accuracy: a cancelled round and a completed round are semantically different events; overloading `round_completed` would propagate that ambiguity through every consumer reading `timer_events.event_type` forever. Pre-positions vocabulary for any future round-killing RPCs. Options considered:
- (i) Add `round_cancelled` to the enum (schema migration + `enums.md` amendment) — chosen.
- (ii) Keep `round_completed` as an overload — zero schema change, permanently muddy audit trail.

**Decision:** (i). One ALTER TYPE statement in its own migration (PG 12+ allows `ALTER TYPE ... ADD VALUE` in a transaction as long as the value isn't used in the same transaction — the subsequent B2 RPC migration is a separate transaction). **§12.4 amended to reference `round_cancelled`; `enums.md` §3.16 amended to add the value.**

**Why:**
Six of seven (a, b, c, d, e, f) are spec gap-fills derived from existing constraints (schema CHECK; state-machine §3.5; the "host triggered this" semantics; the standard envelope contract). (g) is a schema vocabulary addition driven by audit-trail accuracy. None of these are architectural choices — they're tightening the spec where it was silent or vague. `#D013` (front-loaded during B1 planning) covers the orthogonal `leave_party` PLAYER_REMOVED-vs-idempotent-ok decision and is referenced from §4.6.

**Documented in:**
- `supabase/migrations/<timestamp>_add_round_cancelled_to_timer_event_type.sql` (B2 schema migration; ALTER TYPE statement)
- `supabase/migrations/<timestamp>_rpc_party_exit.sql` (B2 RPC migration; uses `round_cancelled`)
- `docs/specs/rpc-contracts.md` §4.4, §4.5, §12.4 (amended in B2 docs commit, lands BEFORE the B2 migration commit per `CLAUDE.md` §8.1)
- `docs/specs/rpc-contracts.md` §4.6 (amended for #D013, same docs commit)
- `docs/specs/enums.md` §3.16 (timer_event_type enum extended with `round_cancelled`, same docs commit)
- `apps/mobile/src/features/party/api/leaveParty.ts`, `apps/mobile/src/features/party/api/endParty.ts`

---

### #D013 — [decision] `leave_party` for previously-kicked callers returns PLAYER_REMOVED

**Date:** 2026-05-14
**Phase:** 2 (Batch B2; front-loaded during B1 planning)
**Decided by:** user (after Claude Code flagged §4.6 idempotency ambiguity in the Batch B planning round)

**Question:**
§4.6 says `leave_party` is idempotent — "second call returns ok if already removed-via-leave." But what's the right behavior when the caller's existing `party_players` row has `status = 'removed'` with `removed_reason != 'self_left_lobby'` (i.e. the caller was kicked by the host before trying to leave)?

**Options considered:**
- (a) Return idempotent ok uniformly — treat any `status = 'removed'` as "you're not in this party, done." Simpler logic; but a kicked player calling leave_party would never see PLAYER_REMOVED, and the UI couldn't distinguish "you left voluntarily" from "you were kicked" without re-reading `removed_reason` explicitly.
- (b) Return PLAYER_REMOVED when `status = 'removed'` AND `removed_reason != 'self_left_lobby'`. Idempotent ok is only returned when `removed_reason = 'self_left_lobby'` (caller really did call leave_party before). Different UX downstream: "you were kicked" vs "you left."

**Decision:** (b).

**Why:**
The two cases produce different player-facing UX downstream (summary screen messaging, rejoin attempts, etc.). Collapsing them at the RPC layer would force every screen that calls leave_party to re-derive "was this player kicked?" from `removed_reason` — defeating the point of having a typed error code surface. Better to distinguish at the API boundary, mirroring `join_party`'s PLAYER_REMOVED return for the same situation.

**Documented in:**
- `supabase/migrations/<timestamp>_rpc_party_exit.sql` (B2 migration)
- `docs/specs/rpc-contracts.md` §4.6 (amended in B2 docs commit to clarify the distinction)
- `apps/mobile/src/features/party/api/leaveParty.ts` (B2 wrapper)

---

### #D014 — [decision] Auto-advance round transitions; remove host-gated `start_next_round` from MVP

**Date:** 2026-06-03
**Phase:** 2 (Batch C)
**Decided by:** user (after Claude Code drafted the decision in chunks during Batch C planning)
**Status:** Decided — supersedes the state-machine §10 locked line "`start_next_round` is host-triggered, not auto-after-delay."

**Question:**
The MVP state machine models `round_complete` as a host-paced resting phase that the host leaves by explicitly calling `start_next_round` (state-machine §3.4, §5, §10; rpc-contracts.md §9). Reviewing the actual MVP experience — a synced group timer that paces itself — this manual gate between every shot is friction, not a feature. Should the chain `shot_window → round_complete → countdown(N+1)` auto-advance, removing the host gate and `start_next_round` from MVP? Four entangled sub-questions had to be locked together:

1. If the chain auto-advances, where does the chaining live?
2. What happens to the `round_complete` value in the `party_phase` enum?
3. How is the audit trail emitted across a collapsed transition?
4. What happens when round-N finalization leaves zero active players?

**Options considered:**

(1) **Transition chaining:**
- (a) Atomic chain inside the finalizing RPCs (`advance_phase_if_due` / `host_end_shot_window`) via a shared helper `finalize_round_outcomes(p_round_id uuid)` — one transaction performs `shot_window → round_complete → countdown(N+1)`.
- (b) Keep `round_complete` as a real phase with its own short auto-timer, and let a *second* `advance_phase_if_due` poll fire `round_complete → countdown`. Two transactions; a brief real dwell in `round_complete`.

(2) **`round_complete` enum lifetime:**
- (a) Keep it in `party_phase` as transitional-only (passed through in ~0ms; retained as the audit anchor and as the resting state for the zero-active-players halt).
- (b) Remove `round_complete` from the enum entirely, since the client never dwells there.

(3) **Audit-trail events:**
- (α) Emit a single collapsed event for the whole chain.
- (β) Emit two ordered events in the same transaction: `round_completed` (`shot_window → round_complete`) then `next_round_started` (`round_complete → countdown`).

(4) **Zero active players after finalization:**
- (i) Halt at `round_complete` with an explicit data payload (`requires_host_intervention`, typed `reason`).
- (ii) Auto-end the party (`status = ended`) when finalization drains the roster.

**Decision:**

**(1) Transition chaining — (a) Atomic chain inside the transition RPCs.** The sequence `shot_window → round_complete → countdown(N+1)` collapses into a single atomic transaction owned by the function that finalizes the round: `advance_phase_if_due` (timer-expiry path) and `host_end_shot_window` (host-early-end path). There is no client-observable stop at `round_complete` in the normal flow, and no separate RPC call is needed to begin the next round. A shared SQL helper `finalize_round_outcomes(p_round_id uuid)` performs the round-N finalization (grace logic, missed-outcome creation, player-status updates per `game-rules.md` §7) so both entry points run identical finalization logic. The helper is `SECURITY DEFINER` with `REVOKE EXECUTE FROM public, anon, authenticated` (it is an internal building block, never a PostgREST endpoint — same hardening pattern as `_rpc_error`/`_rpc_success` per #D010 (3)).

**(2) `round_complete` enum lifetime — (a) Keep it, transitional-only.** The `round_complete` value stays in the `party_phase` enum. It is no longer a phase the client dwells in: in the auto-advance chain the session passes *through* `round_complete` and out to `countdown(N+1)` within the same transaction, so the phase is held for ~0ms of client-observable time. It is retained (rather than dropped from the enum) because (i) it remains the correct audit-trail anchor for the `round_completed` timer_event, (ii) the halt case in sub-decision (4) genuinely rests in it, and (iii) removing an enum value is a destructive schema change we have no reason to take.

**(3) Audit-trail events — (β) Two events in the same transaction.** The atomic chain emits **two** `timer_events` rows, in order, within the one transaction: first `round_completed` (`previous_phase = shot_window`, `new_phase = round_complete`), then `next_round_started` (`previous_phase = round_complete`, `new_phase = countdown`). Both carry the same `triggered_by` as the originating call (`system` for the `advance_phase_if_due` path, `host` for the `host_end_shot_window` path). The `next_round_started` enum value already exists (added in Phase 1), so no schema change is required. The pair preserves a faithful audit trail: a reader of `timer_events` sees the round close and the next round open as two distinct, ordered facts, exactly as they would have appeared under the old two-call model.

**(4) Zero active players after finalization — (i) Halt at `round_complete` with an explicit payload.** If finalizing round N leaves zero `status = active` players (everyone went out, was marked out, or was removed), the chain does **not** auto-advance into `countdown(N+1)`. It stops in `round_complete` and returns:

```json
{
  "ok": true,
  "data": {
    "transitioned": true,
    "new_phase": "round_complete",
    "new_round_number": null,
    "requires_host_intervention": true,
    "reason": "no_active_players"
  }
}
```

`reason` is a typed string union (initially the single member `"no_active_players"`), extensible for any future halt cause without breaking the payload shape. This is the one path where `round_complete` is a real resting state in MVP: the host must reinstate a player or end the party, consistent with the locked rule in state-machine §10 ("when the last active player goes out, the session does NOT auto-end").

**Why:**

The driving change is to delete a manual step the product never wanted. State-machine §10 had locked "`start_next_round` is host-triggered, not auto-after-delay" — but reviewing the actual MVP experience (a synced group timer that just keeps running) showed the host-gated stop at Round Results is friction: it forces someone to tap "start next round" between every shot, stalling a game whose whole appeal is that it paces itself. Auto-advancing restores the intended feel. Round Results becomes a **view** layered on the live session data (a screen the client renders from the round's finalized outcomes), not a **phase** the state machine parks in.

Choosing **(1)(a)** — one atomic transaction per transition RPC rather than a client-issued follow-up call — is what makes auto-advance safe under the locked architecture (CLAUDE.md §2.1, §2.6). If `round_complete → countdown` were a second round-trip, two clients polling `advance_phase_if_due` in the same instant could race to open Round N+1, and a client that finalized but disconnected before the follow-up call would strand the session at `round_complete` — exactly the manual stop we're removing, reintroduced as a failure mode. Collapsing the chain into the finalizing transaction means the round closes and the next round opens atomically or not at all, and the existing `(party_session_id, round_number)` unique constraint keeps a duplicate N+1 from ever being created. Extracting `finalize_round_outcomes` as a shared helper (rather than duplicating finalization in both `advance_phase_if_due` and `host_end_shot_window`) keeps the grace/missed/status logic in exactly one place — when Batch E builds `host_end_shot_window`, it reuses the helper verbatim instead of cloning a copy that can drift.

Keeping `round_complete` in the enum **(2)(a)** rather than deleting it is the conservative call: it costs nothing to retain, it stays the natural audit anchor, and the halt case in (4) needs it to be a representable resting state. Emitting **two** events **(3)(β)** rather than one collapsed event keeps the audit trail honest — the same accuracy principle behind #D012 (g)'s `round_cancelled` addition. A consumer reading `timer_events` must still see "round N completed" as its own fact, distinct from "round N+1 started," even though no human watched the intervening phase; folding them into one event would erase a real transition from the record forever. Halting on zero active players **(4)(i)** rather than auto-ending upholds state-machine §10's locked decision that the host — not the system — decides whether a drained party reinstates or ends; the explicit `requires_host_intervention` + typed `reason` payload gives the client an unambiguous signal to render the host-intervention prompt instead of a normal Round Results view.

**Documented in:**

This decision lands across one docs commit (Round 1), then is realized in code across two migration commits (Round 2). The docs commit ships *before* any Round 2 migration, per CLAUDE.md §8.1.

*Spec amendments (Round 1 docs commit):*

- `docs/KNOWN_ISSUES.md` — this entry (#D014) plus Open Issue #004 (the pre-existing planning-doc RPC-list drift surfaced by the B5 edit).
- `docs/specs/mvp-state-machine.md`:
  - §3.4 (`round_complete`) — reframed from a host-paced resting phase to a transitional pass-through state; `start_next_round` removed from its allowed actions; the zero-active-players halt (sub-decision (4)) documented as the one real resting case.
  - §5 (transition table) — the `round_complete → countdown / start_next_round / host` row replaced; the `shot_window → round_complete` rows amended to show the atomic chain continuing into `countdown(N+1)` and emitting two timer_events.
  - §6 (idempotency) — `start_next_round` bullet removed; idempotency of the chained advance folded into the `advance_phase_if_due` bullet (the `(party_session_id, round_number)` constraint still guards duplicate N+1).
  - §7 (forbidden transitions) — the "Round N+1 starting before Round N is in `round_complete`" and skip-`round_complete` rules reworded so the atomic pass-through is explicitly legal while a *client-initiated* skip remains forbidden.
  - §8.6 (host pauses during `round_complete`) — amended to note this is now reachable only in the zero-active-players halt case.
  - §9 (visual) — the `start_next_round` back-edge from `round_complete → countdown` redrawn as an automatic chained transition.
  - §10 (locked decisions) — the "`start_next_round` is host-triggered, not auto-after-delay" line struck and replaced with the auto-advance rule; cross-referenced to this entry.
- `docs/specs/rpc-contracts.md`:
  - §5 (`start_game`) — cross-reference touch-up only.
  - §8 (`advance_phase_if_due`) — **major rewrite**: the shot_window branch finalizes via `finalize_round_outcomes(p_round_id uuid)` and chains into `countdown(N+1)` in the same transaction; §8.4 emits the two-event sequence; §8.5 return payload extended to `{transitioned, new_phase, new_round_number, requires_host_intervention, reason}`; the zero-active-players halt documented.
  - **§8.8 (new subsection)** — "Shared helper: `finalize_round_outcomes`": signature, behavior, and `SECURITY DEFINER` + `REVOKE EXECUTE FROM public, anon, authenticated` hardening (internal-only; not a client RPC).
  - §9 (`start_next_round`) — **removed** from MVP (section content replaced with a stub note recording removal by #D014 and pointing to §8).
  - §10.4 (`host_end_shot_window`) — cross-reference noting it shares `finalize_round_outcomes` and the same atomic-chain behavior (Batch E implements it against this contract).
  - §14 (Function Ownership Summary) — `start_next_round` row removed; `finalize_round_outcomes` row added, marked "Internal only — not exposed (REVOKE EXECUTE from public/anon/authenticated)."
- `docs/PHASE_ACCEPTANCE_CRITERIA.md` — Phase 2: `start_next_round` deliverable removed; RPC count corrected 17 → 16.

*Planning-doc edits (same Round 1 docs commit; these touch the locked blueprint, made only with the user's say-so per CLAUDE.md §10):*

- B1 — `docs/planning/05-prototype.md`: strike the "start next round" button from the Round Results prototype; add a cross-reference sentence pointing at the auto-advance model.
- B2 — `docs/planning/05-prototype.md`: narrate the locked-decision reversal (host-gated → auto-advance) so the prototype prose matches §10.
- B4 — `docs/planning/08-stack.md`: strike `start_next_round()` from the RPC list.
- B5 — `docs/planning/09-development-process.md`: strike `start_next_round()` from the Phase 2 RPC list **only**; the pre-existing list inconsistency is logged as Open Issue **#004** rather than fixed here.
- B6 — `docs/planning/09-development-process.md`: strike the `start_next_round` idempotency rule.
- B3 — `docs/planning/07-components.md`: **untouched** (no `start_next_round` reference to remove; recorded here so the no-op is intentional).

*Code (Round 2, separate commits after the docs commit lands):*

- C1 — `supabase/migrations/<timestamp>_rpc_start_game.sql` + `apps/mobile/src/features/party/api/startGame.ts`.
- C2 — `supabase/migrations/<timestamp>_rpc_advance_phase.sql`: `advance_phase_if_due` rewrite + the extracted `finalize_round_outcomes(p_round_id uuid)` helper (SECURITY DEFINER, REVOKE EXECUTE from public/anon/authenticated, reused by `host_end_shot_window` in Batch E) + `apps/mobile/src/features/party/api/advancePhaseIfDue.ts`.
- C3 — docs tick commit (PHASE_ACCEPTANCE_CRITERIA.md Phase 2 criteria ticked as C1/C2 land).

---

## Resolved Issues

*Issues from "Open Issues" that have been fixed. Kept for reference.*

### #002 — [doc] Plan and commit message overstated RLS policy count as "10" when actual count is 9

**Found:** 2026-05-13 during sub-task 2 verification (Phase 1)
**Resolved:** 2026-05-13
**Phase:** 1
**Status:** Resolved (commit `462ffc3` — no code change required, documentation acknowledgement only)

**Description:**
Sub-task 2's plan summary and the resulting feat commit (`462ffc3`) said "10 SELECT policies" in their natural-language summary text. A direct query against `pg_policies` after `supabase db reset` returned 9 rows. The discrepancy between the prose and the database state raised a "did we forget to create a tenth policy?" question.

**Context:**
The plan's per-table breakdown table correctly listed 9 distinct policies: 1 on `party_sessions`, 1 on `party_settings`, **2 on `party_players`**, 1 on `rounds`, 1 on `round_player_outcomes`, 1 on `admin_action_logs`, 1 on `timer_events`, 1 on `party_player_notification_settings` (1+1+2+1+1+1+1+1 = 9). The rollup sentence at the bottom of the plan summary added them up wrong, and the commit body inherited the same "10" wording.

**Root cause:**
Counting error in the plan summary and again in the commit body. Not a migration bug.

**Resolution:**
Re-ran `select tablename, policyname from pg_policies where schemaname = 'public' order by tablename, policyname;` and confirmed 9 rows: `party_players` appears exactly twice (the `§4.1` peer-view policy and the `§4.2` own-row policy), every other MVP table appears exactly once, and every policy name matches `docs/specs/rls-rules.md` §2-§9 verbatim. No code change required. The commit message text was left as-is — not worth a force-push to fix a documentation typo on an already-pushed commit. This entry exists so future readers don't try to "fix" the apparently-missing tenth policy.

**Related files:**
- Commit `462ffc3` (the affected commit)
- `supabase/migrations/20260513142120_rls.sql`
- `docs/specs/rls-rules.md` §2-§9 (the canonical 9-policy list)

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
