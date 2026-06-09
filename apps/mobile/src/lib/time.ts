// Time helpers for the server-authoritative timer.
//
// The timer is never owned by the client (CLAUDE.md §2.1): screens compute
// `timeRemaining = phaseEndsAt - serverNow()` from session timestamps. These
// helpers centralize that math so no screen reimplements it.
//
// `serverNow()` is skew-corrected: it adds a measured device→server clock offset
// so two phones with slightly different clocks compute the same remaining time
// (state-machine §8.7). The offset is measured by syncServerTime()
// (features/game/syncServerTime.ts) from the get_server_time RPC; it is 0 until
// the first sync, so serverNow() falls back to the raw device clock. The offset
// state lives here — not in a feature module — so serverNow()/msUntil()/
// formatDuration() stay import-free and unit-testable without the supabase client.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

// Milliseconds to add to the device clock to estimate server time (server_ms −
// client_ms). Module-level mutable state, set once per session by syncServerTime.
let serverTimeOffsetMs = 0;

/** Store the device→server clock offset (server_ms − client_ms). See syncServerTime. */
export function setServerTimeOffset(offsetMs: number): void {
  serverTimeOffsetMs = offsetMs;
}

/** Current device→server offset in ms (0 before the first sync). */
export function getServerTimeOffset(): number {
  return serverTimeOffsetMs;
}

/** Current server time as a Date, skew-corrected by the measured offset. */
export function serverNow(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * Milliseconds remaining until `isoTimestamp`. Clamped at 0 — a past timestamp
 * returns 0, never a negative number, so callers can render without guarding.
 */
export function msUntil(isoTimestamp: string): number {
  const target = new Date(isoTimestamp).getTime();
  const remaining = target - serverNow().getTime();
  return Math.max(0, remaining);
}

/**
 * Format a millisecond duration as `M:SS` (e.g. 462000 -> "7:42"). Used by the
 * countdown and shot-window displays. Negative input clamps to "0:00".
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
