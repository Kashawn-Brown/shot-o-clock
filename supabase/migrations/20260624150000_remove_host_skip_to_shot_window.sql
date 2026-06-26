-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16 (cleanup) — Remove host_skip_to_shot_window
-- ─────────────────────────────────────────────────────────────────────────────
-- The "skip the countdown, open the shot window now" host control is not a wanted
-- feature and never will be — no UI calls it and none is planned. Removing it
-- entirely rather than leaving an inert RPC in the schema. (Its Step 1a push wiring,
-- 20260624140000, goes away with it.)
--
-- DROP the function (idempotent). Prior migrations that created it
-- (20260604140000, 20260613130000, 20260624140000) are left untouched per the
-- no-destructive-edits rule — on a fresh DB they create it and this drops it.
--
-- NOTE: the admin_action_type enum value 'skip_to_shot_window' is intentionally
-- LEFT in place. Postgres cannot DROP an enum value without recreating the whole
-- type (and rewriting any column that uses it), which isn't worth it for an inert
-- reserved value — no code writes it once the function is gone.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.host_skip_to_shot_window(uuid);
