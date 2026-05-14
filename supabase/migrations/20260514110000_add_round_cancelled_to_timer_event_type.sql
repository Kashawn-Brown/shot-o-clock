-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Batch B2: extend timer_event_type with round_cancelled
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a new value to the timer_event_type enum so end_party can emit a
-- semantically accurate event when killing an in-flight round. References:
--   - docs/specs/enums.md §3.16 (enum definition, amended in the same
--     B2 docs commit)
--   - docs/KNOWN_ISSUES.md #D012 (g) (decision rationale)
--   - docs/specs/rpc-contracts.md §12.4 (the only MVP consumer)
--
-- Positioned between `round_completed` and `next_round_started` so the
-- timeline-event ordering reflects the lifecycle: a round can either complete
-- OR be cancelled; either way the next event is the start of the next round.
--
-- IF NOT EXISTS keeps the migration idempotent across `supabase db reset`.
--
-- This migration must be its own file. Per Postgres, ALTER TYPE ... ADD VALUE
-- has restrictions on referencing the new value in the same transaction;
-- isolating the statement in its own migration file lets the next migration
-- (`_rpc_party_exit.sql`, which uses `round_cancelled` in end_party) commit
-- in a separate transaction.
-- ─────────────────────────────────────────────────────────────────────────────

alter type public.timer_event_type
  add value if not exists 'round_cancelled' before 'next_round_started';
