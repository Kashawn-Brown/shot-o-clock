import { shotNotificationTrigger } from '@/features/notifications/shotNotificationTrigger';
import type { Database } from '@/types/db.generated';

type SessionFields = Pick<
  Database['public']['Tables']['party_sessions']['Row'],
  'current_phase' | 'phase_ends_at' | 'status'
>;

// 2026-06-16T12:00:30Z — a fixed "shot window opens" instant.
const PHASE_ENDS_AT = '2026-06-16T12:00:30.000Z';
const PHASE_ENDS_AT_MS = Date.parse(PHASE_ENDS_AT);
// "Now" is 30s before the deadline, so the window is comfortably in the future.
const NOW_MS = PHASE_ENDS_AT_MS - 30_000;

function session(overrides: Partial<SessionFields> = {}): SessionFields {
  return {
    current_phase: 'countdown',
    phase_ends_at: PHASE_ENDS_AT,
    status: 'active',
    ...overrides,
  };
}

describe('shotNotificationTrigger', () => {
  it('schedules for an active countdown with a future deadline', () => {
    expect(shotNotificationTrigger(session(), 0, NOW_MS)).toEqual({
      schedule: true,
      fireAtMs: PHASE_ENDS_AT_MS,
    });
  });

  it('subtracts the server offset so the fire time matches the device countdown', () => {
    // Device clock 5s ahead of the server (offset = server − device = −5000): the
    // window opens 5s earlier on this device's clock.
    expect(shotNotificationTrigger(session(), -5_000, NOW_MS)).toEqual({
      schedule: true,
      fireAtMs: PHASE_ENDS_AT_MS + 5_000,
    });
  });

  it('does not schedule when paused', () => {
    expect(shotNotificationTrigger(session({ status: 'paused' }), 0, NOW_MS).schedule).toBe(false);
  });

  it.each(['shot_window', 'round_complete', 'ended', 'lobby'] as const)(
    'does not schedule in %s phase',
    (phase) => {
      expect(shotNotificationTrigger(session({ current_phase: phase }), 0, NOW_MS).schedule).toBe(
        false,
      );
    },
  );

  it('does not schedule when the deadline is already past', () => {
    const past = PHASE_ENDS_AT_MS + 1_000; // now is after the deadline
    expect(shotNotificationTrigger(session(), 0, past).schedule).toBe(false);
  });

  it('does not schedule when phase_ends_at is null or unparseable', () => {
    expect(shotNotificationTrigger(session({ phase_ends_at: null }), 0, NOW_MS).schedule).toBe(
      false,
    );
    expect(
      shotNotificationTrigger(session({ phase_ends_at: 'not-a-date' }), 0, NOW_MS).schedule,
    ).toBe(false);
  });

  it('does not schedule for a null session', () => {
    expect(shotNotificationTrigger(null, 0, NOW_MS).schedule).toBe(false);
  });
});
