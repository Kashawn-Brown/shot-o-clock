// Pure planner for the Shot O'Clock local notifications: given the session, the
// party settings, the current round, the device→server clock offset and "now", it
// returns the device-local instants to schedule notifications at — the current
// round's shot window PLUS the next several rounds', computed from the deterministic
// round loop.
//
// Why a batch, not one: when the app is fully backgrounded the JS thread is frozen,
// so the client never wakes to reschedule for the next round's phase_ends_at — only
// the first backgrounded round would fire. Pre-scheduling future rounds covers the
// gap. The estimates are exact for the realistic away-player case (an unanswered
// active player blocks the all-submitted early finalize, so rounds run their full
// timers); they drift only on host pause / add-time, and are recomputed and replaced
// every time the app is foreground. (The robust cross-case fix is server push — a
// Phase 16 follow-up that needs an EAS build for push tokens.)
//
// Kept pure (no expo-notifications, no clock reads) so it unit-tests without the
// native module. api/shotNotification.ts feeds it getServerTimeOffset() + Date.now().

import type { Database } from '@/types/db.generated';

type SessionRow = Database['public']['Tables']['party_sessions']['Row'];

// The session fields the planner needs. Phase and status are nullable here (unlike
// the non-null Row columns) so callers can pass them from an optional session
// (`session?.current_phase ?? null`).
export type ShotNotificationSession = {
  current_phase: SessionRow['current_phase'] | null;
  phase_ends_at: SessionRow['phase_ends_at'];
  status: SessionRow['status'] | null;
};

export interface ShotNotificationScheduleInput {
  session: ShotNotificationSession;
  shotWindowSeconds: number;
  intervalIncrementSeconds: number;
  // null = no cap; otherwise each round's interval is clamped to this.
  maxIntervalSeconds: number | null;
  currentRoundNumber: number;
  currentRoundIntervalSeconds: number;
}

export interface ShotNotificationSlot {
  roundNumber: number;
  // Device-local epoch ms at which the notification should fire.
  fireAtMs: number;
}

/**
 * Up to `maxCount` upcoming shot-window-open instants (device-local), earliest first.
 *
 * Schedules only for an ACTIVE game in countdown or shot_window — a paused timer, the
 * round_complete halt, and an ended party return [] (the caller cancels). Fire times
 * are skew-corrected (server instant − offset) so they coincide with this device's
 * own countdown reaching zero. Instants already in the past are skipped (the in-app
 * sound/haptic covers a window opening now), but later rounds are still planned.
 */
export function shotNotificationSchedule(
  input: ShotNotificationScheduleInput,
  offsetMs: number,
  nowMs: number,
  maxCount: number,
): ShotNotificationSlot[] {
  const { session } = input;
  if (session.status !== 'active') return [];
  if (session.current_phase !== 'countdown' && session.current_phase !== 'shot_window') return [];
  if (!session.phase_ends_at) return [];

  const phaseEndsMs = Date.parse(session.phase_ends_at);
  if (Number.isNaN(phaseEndsMs)) return [];

  const windowMs = input.shotWindowSeconds * 1000;
  const clamp = (secs: number): number =>
    input.maxIntervalSeconds != null && secs > input.maxIntervalSeconds
      ? input.maxIntervalSeconds
      : secs;

  // Seed the walk at the first relevant shot-window open, in SERVER time:
  //   - countdown: round N's window opens at phase_ends_at.
  //   - shot_window: round N's window is already open (and notified), so the first
  //     future one is round N+1, whose countdown starts at phase_ends_at (this
  //     window's close).
  // `intervalSecs` tracks the interval of the round whose window opens at openMs, so
  // the next round's interval is clamp(intervalSecs + increment).
  let roundNumber: number;
  let openMs: number;
  let intervalSecs: number;

  if (session.current_phase === 'countdown') {
    roundNumber = input.currentRoundNumber;
    openMs = phaseEndsMs;
    intervalSecs = input.currentRoundIntervalSeconds;
  } else {
    const nextInterval = clamp(input.currentRoundIntervalSeconds + input.intervalIncrementSeconds);
    roundNumber = input.currentRoundNumber + 1;
    openMs = phaseEndsMs + nextInterval * 1000;
    intervalSecs = nextInterval;
  }

  const slots: ShotNotificationSlot[] = [];
  // Bounded loop: at most maxCount future slots, with a small buffer so a skipped
  // past first slot doesn't cost a future one. openMs strictly increases, so this
  // terminates well within the cap.
  for (let i = 0; i < maxCount + 4 && slots.length < maxCount; i += 1) {
    const fireAtMs = openMs - offsetMs;
    if (fireAtMs > nowMs) slots.push({ roundNumber, fireAtMs });

    const nextInterval = clamp(intervalSecs + input.intervalIncrementSeconds);
    openMs += windowMs + nextInterval * 1000;
    intervalSecs = nextInterval;
    roundNumber += 1;
  }

  return slots;
}
