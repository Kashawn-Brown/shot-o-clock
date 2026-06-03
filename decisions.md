# Decisions

> Terse architectural decision log. One entry per real decision: what was
> decided, why, and what would change the call. Full audit trail (options
> tables, spec cross-refs) lived in the now-retired docs/KNOWN_ISSUES.md.

## D001 — Package manager: npm
Decided 2026-05-13. Use npm — CLAUDE.md already references `npm view` / `package-lock.json` and there's no monorepo pressure to justify pnpm. Would revisit only if the repo grows into a multi-package workspace.

## D002 — Expo template: default
Decided 2026-05-13. Bootstrap apps/mobile with create-expo-app's `default` template (TypeScript + Expo Router pre-wired) over blank-typescript, which would mean wiring the router by hand. Its demo content is throwaway and was replaced early.

## D003 — Stay on Expo SDK 54
Decided 2026-05-13. Keep SDK 54 (what create-expo-app shipped) rather than force-upgrading to 55, because the template/SDK pairing the Expo team bundles is the most coherent starting point. Revisit with an explicit upgrade task once the bundled template catches up to 55.

## D004 — Path-alias coexistence with template dirs
Decided 2026-05-13. Add REPO_STRUCTURE.md aliases (`@/features/*`, etc.) alongside temporary template-fallback targets so existing template imports don't break mid-phase. The fallbacks self-clean when template dirs are restructured (happened early via D006).

## D005 — Prettier rules beyond CLAUDE.md §5.2
Decided 2026-05-13. For the rules §5.2 left open, pin `printWidth: 100`, `arrowParens: always`, `endOfLine: auto`. `endOfLine: auto` is load-bearing — without it `format:check` fails on Windows CRLF checkouts.

## D006 — Delete template demo code, don't reformat it
Decided 2026-05-13. Delete the Expo template's demo screens/components/assets now and ship a minimal placeholder, rather than burning commits reformatting throwaway code to pass `format:check`. Keeps the tree honest about what's real MVP code.

## D007 — Keep EXPO_PUBLIC_SUPABASE_ANON_KEY name
Decided 2026-05-13. Keep the env var named `…ANON_KEY` even though the Supabase CLI now emits `sb_publishable_`. No downstream consumers exist yet and "anon key" matches every supabase-js tutorial. Rename if Phase 1/2 confusion recurs or the SDK deprecates the term.

## D008 — RLS in one migration file
Decided 2026-05-13. Put RLS helpers and policies together in a single `_rls.sql` (separate from `_initial_schema.sql`), not three files. The four helpers' only callers are the policies, so splitting them yields a file with no standalone consumer.

## D009 — Scope RLS policies TO authenticated
Decided 2026-05-13. Scope every SELECT policy `TO authenticated` rather than relying on Postgres's PUBLIC default, and update rls-rules.md to match. Behavior is identical (helpers already check auth.uid()) but intent is explicit; anonymous-auth guests are still `authenticated`.

## D010 — Phase 2 RPC infrastructure conventions
Decided 2026-05-13. Lock the conventions every later RPC copies: `SET search_path = public, pg_temp` on all SECURITY DEFINER functions; read RPCs do their own auth.uid()+membership check (DEFINER bypasses RLS); internal helpers REVOKE EXECUTE from public/anon/authenticated; §13 reads conform to the standard `{ok,error_code,error_msg,data}` envelope; the supabase client is pulled forward from Phase 3.

## D011 — Batch B1 conventions (create_party + join_party)
Decided 2026-05-14. plpgsql random-index join-code generation with collision retry; `ALREADY_HOSTING` includes `paused`; `phase_started_at` set at create; join codes are permanently consumed (column-level unique kept, §2.5 tightened); reconnect (§3.6) is checked before §3.4 preconditions.

## D012 — Batch B2 conventions (leave_party + end_party)
Decided 2026-05-14. leave_party sets both `removed_at` and `left_at`; success `data = {}`; end_party's timer_event is `triggered_by = host`, preserves pause columns as history, and nulls `phase_ends_at`. Adds a new `round_cancelled` value to the timer_event_type enum so a cancelled round isn't mislabeled `round_completed`.

## D013 — leave_party for kicked callers returns PLAYER_REMOVED
Decided 2026-05-14. A previously-kicked caller (status=removed, removed_reason ≠ self_left_lobby) calling leave_party gets `PLAYER_REMOVED`, not idempotent ok — so the UI can distinguish "you were kicked" from "you left." Idempotent ok is reserved for genuine self-leaves.

## D014 — Auto-advance rounds; remove start_next_round
Decided 2026-06-03. Rounds auto-advance (shot_window → round_complete → countdown(N+1)) atomically inside the finalizing RPC via a shared `finalize_round_outcomes` helper; the host-gated `start_next_round` RPC is removed from MVP. `round_complete` stays in the enum as a transitional pass-through — and as the real resting state when finalization leaves zero active players, which halts for host intervention. Two ordered timer_events are still emitted. Supersedes state-machine §10's "start_next_round is host-triggered." Would change if the product ever wants a manual host gate between rounds.

## Open Items
- **#001:** Metro `icon.png` warning — non-blocking, try clearing `.expo/` cache.
- **#003:** Happy-path + member-state RPC verification deferred to Phase 3+ (needs the real auth flow).
- **#004:** Planning-doc RPC lists drift from rpc-contracts.md §14 — needs a reconciliation pass, low priority.
