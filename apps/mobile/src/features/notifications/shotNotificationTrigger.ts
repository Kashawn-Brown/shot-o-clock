// Pure decision core for the Shot O'Clock local notification: given the session
// state, the device→server clock offset, and "now", decide whether to schedule a
// notification and at what device-local instant it should fire.
//
// Kept pure (no expo-notifications, no clock reads) so the schedule logic is unit-
// testable without the native module. The api layer (api/shotNotification.ts) feeds
// it getServerTimeOffset() and Date.now() and acts on the result.

import type { Database } from '@/types/db.generated';

type SessionRow = Database['public']['Tables']['party_sessions']['Row'];

// The three session fields the schedule decision needs. Phase and status are nullable
// here (unlike the non-null Row columns) so callers can pass them straight from an
// optional session (`session?.current_phase ?? null`) — any non-'countdown' /
// non-'active' value, null included, means "don't schedule".
export type ShotNotificationSession = {
  current_phase: SessionRow['current_phase'] | null;
  phase_ends_at: SessionRow['phase_ends_at'];
  status: SessionRow['status'] | null;
};

export interface ShotNotificationTrigger {
  schedule: boolean;
  // Device-local epoch ms at which the notification should fire. Present only when
  // schedule is true.
  fireAtMs?: number;
}

/**
 * Decide whether a Shot O'Clock notification should be scheduled for this session.
 *
 * Schedules only for an ACTIVE countdown with a future deadline — the shot window
 * opens at phase_ends_at. A paused timer, the shot window itself, the round_complete
 * halt, and an ended party all return schedule:false (the caller cancels), so pause,
 * add-time, window-open, and end-party all resolve through this one function.
 *
 * The fire time is skew-corrected: the OS fires by the device clock, but
 * phase_ends_at is a server instant, so we subtract the measured offset
 * (serverNow = Date.now() + offset). That makes the notification coincide with this
 * device's own countdown reaching zero rather than a clock-skewed instant.
 */
export function shotNotificationTrigger(
  session: ShotNotificationSession | null,
  offsetMs: number,
  nowMs: number,
): ShotNotificationTrigger {
  if (!session) return { schedule: false };
  if (session.current_phase !== 'countdown' || session.status !== 'active') {
    return { schedule: false };
  }
  if (!session.phase_ends_at) return { schedule: false };

  const phaseEndsAtMs = Date.parse(session.phase_ends_at);
  if (Number.isNaN(phaseEndsAtMs)) return { schedule: false };

  const fireAtMs = phaseEndsAtMs - offsetMs;
  // Already due (or in the past): don't schedule an immediate/past notification —
  // the window is opening now and the in-app sound/haptic (Phase 13) covers the
  // foreground case. A backgrounded device this close to zero misses this one
  // window only.
  if (fireAtMs <= nowMs) return { schedule: false };

  return { schedule: true, fireAtMs };
}
