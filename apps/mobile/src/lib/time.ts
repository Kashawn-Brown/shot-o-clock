// Time helpers for the server-authoritative timer.
//
// The timer is never owned by the client (CLAUDE.md §2.1): screens compute
// `timeRemaining = phaseEndsAt - serverNow()` from session timestamps. These
// helpers centralize that math so no screen reimplements it.
//
// NOTE: in Phase 3 `serverNow()` returns the device clock directly. The real
// implementation will correct for client/server skew using the get_server_time
// RPC (already built in Phase 2) once the timer screen is wired up in Phase 7.
// Keeping the call site stable now means that upgrade is internal to this file.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** Current server time as a Date. Phase 3: device clock; Phase 7: skew-corrected. */
export function serverNow(): Date {
  return new Date();
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
