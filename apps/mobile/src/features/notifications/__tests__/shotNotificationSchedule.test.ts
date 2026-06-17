import {
  shotNotificationSchedule,
  type ShotNotificationScheduleInput,
} from '@/features/notifications/shotNotificationSchedule';

// Round N's countdown ends (its shot window opens) at this server instant.
const PHASE_ENDS_AT = '2026-06-16T12:00:30.000Z';
const ENDS_MS = Date.parse(PHASE_ENDS_AT);
const NOW_MS = ENDS_MS - 30_000; // 30s before the window opens

// Base party: 60s interval, +10s increment, 20s shot window, no cap, on round 5.
function input(
  overrides: Partial<ShotNotificationScheduleInput> = {},
): ShotNotificationScheduleInput {
  return {
    session: { current_phase: 'countdown', phase_ends_at: PHASE_ENDS_AT, status: 'active' },
    shotWindowSeconds: 20,
    intervalIncrementSeconds: 10,
    maxIntervalSeconds: null,
    currentRoundNumber: 5,
    currentRoundIntervalSeconds: 60,
    ...overrides,
  };
}

describe('shotNotificationSchedule', () => {
  it('plans the current round first, then future rounds spaced by window + next interval', () => {
    const slots = shotNotificationSchedule(input(), 0, NOW_MS, 3);
    expect(slots).toHaveLength(3);
    // Round 5 opens at phase_ends_at.
    expect(slots[0]).toEqual({ roundNumber: 5, fireAtMs: ENDS_MS });
    // Round 6 opens after the 20s window + round 6's interval (60 + 10 = 70s).
    expect(slots[1]).toEqual({ roundNumber: 6, fireAtMs: ENDS_MS + (20 + 70) * 1000 });
    // Round 7 opens after another window + round 7's interval (70 + 10 = 80s).
    expect(slots[2]).toEqual({
      roundNumber: 7,
      fireAtMs: ENDS_MS + (20 + 70) * 1000 + (20 + 80) * 1000,
    });
  });

  it('caps the batch at maxCount', () => {
    expect(shotNotificationSchedule(input(), 0, NOW_MS, 8)).toHaveLength(8);
  });

  it('clamps the interval growth at maxIntervalSeconds', () => {
    // Round 6 interval would be 70 but is clamped to 65.
    const slots = shotNotificationSchedule(input({ maxIntervalSeconds: 65 }), 0, NOW_MS, 2);
    expect(slots[1]).toEqual({ roundNumber: 6, fireAtMs: ENDS_MS + (20 + 65) * 1000 });
  });

  it('skews fire times by the server offset', () => {
    // Device clock 5s behind the server (offset = server − device = +5000): the window
    // opens 5s earlier on the device clock.
    const slots = shotNotificationSchedule(input(), 5_000, NOW_MS, 1);
    expect(slots[0]).toEqual({ roundNumber: 5, fireAtMs: ENDS_MS - 5_000 });
  });

  it('starts from round N+1 when already in the shot window', () => {
    const slots = shotNotificationSchedule(
      input({
        session: { current_phase: 'shot_window', phase_ends_at: PHASE_ENDS_AT, status: 'active' },
      }),
      0,
      NOW_MS,
      2,
    );
    // Window N is open already; first future is round 6, whose countdown (70s) starts
    // at phase_ends_at (this window's close).
    expect(slots[0]).toEqual({ roundNumber: 6, fireAtMs: ENDS_MS + 70 * 1000 });
    expect(slots[1].roundNumber).toBe(7);
  });

  it('skips a current-round window already in the past but still plans future rounds', () => {
    // "Now" is 1s after the round-5 window opened — skip round 5, keep round 6+.
    const slots = shotNotificationSchedule(input(), 0, ENDS_MS + 1_000, 3);
    expect(slots[0].roundNumber).toBe(6);
    expect(slots.every((s) => s.fireAtMs > ENDS_MS + 1_000)).toBe(true);
  });

  it.each(['paused', 'ended', 'lobby'] as const)('plans nothing when status is %s', (status) => {
    expect(
      shotNotificationSchedule(
        input({ session: { current_phase: 'countdown', phase_ends_at: PHASE_ENDS_AT, status } }),
        0,
        NOW_MS,
        5,
      ),
    ).toEqual([]);
  });

  it.each(['round_complete', 'ended', 'lobby'] as const)('plans nothing in %s phase', (phase) => {
    expect(
      shotNotificationSchedule(
        input({
          session: { current_phase: phase, phase_ends_at: PHASE_ENDS_AT, status: 'active' },
        }),
        0,
        NOW_MS,
        5,
      ),
    ).toEqual([]);
  });

  it('plans nothing when phase_ends_at is null or unparseable', () => {
    expect(
      shotNotificationSchedule(
        input({ session: { current_phase: 'countdown', phase_ends_at: null, status: 'active' } }),
        0,
        NOW_MS,
        5,
      ),
    ).toEqual([]);
    expect(
      shotNotificationSchedule(
        input({ session: { current_phase: 'countdown', phase_ends_at: 'nope', status: 'active' } }),
        0,
        NOW_MS,
        5,
      ),
    ).toEqual([]);
  });
});
