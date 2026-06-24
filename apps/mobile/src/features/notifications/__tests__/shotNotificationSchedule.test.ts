import {
  shotNotificationSchedule,
  type ShotNotificationScheduleInput,
} from '@/features/notifications/shotNotificationSchedule';

// Round N's countdown ends (its shot window opens) at this server instant.
const PHASE_ENDS_AT = '2026-06-16T12:00:30.000Z';
const ENDS_MS = Date.parse(PHASE_ENDS_AT);
const NOW_MS = ENDS_MS - 30_000; // 30s before the window opens
const EARLY_NOW = ENDS_MS - 600_000; // 10 min before — far enough for pre-warnings

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

// Most tests use preWarningMinutes = 0 to assert the shot-window 'open' slots alone.
describe('shotNotificationSchedule — open slots', () => {
  it('plans the current round first, then future rounds spaced by window + next interval', () => {
    const slots = shotNotificationSchedule(input(), 0, NOW_MS, 3, 0);
    expect(slots).toHaveLength(3);
    // Round 5 opens at phase_ends_at.
    expect(slots[0]).toEqual({ roundNumber: 5, kind: 'open', fireAtMs: ENDS_MS });
    // Round 6 opens after the 20s window + round 6's interval (60 + 10 = 70s).
    expect(slots[1]).toEqual({
      roundNumber: 6,
      kind: 'open',
      fireAtMs: ENDS_MS + (20 + 70) * 1000,
    });
    // Round 7 opens after another window + round 7's interval (70 + 10 = 80s).
    expect(slots[2]).toEqual({
      roundNumber: 7,
      kind: 'open',
      fireAtMs: ENDS_MS + (20 + 70) * 1000 + (20 + 80) * 1000,
    });
  });

  it('caps the batch at maxCount rounds', () => {
    expect(shotNotificationSchedule(input(), 0, NOW_MS, 8, 0)).toHaveLength(8);
  });

  it('clamps the interval growth at maxIntervalSeconds', () => {
    // Round 6 interval would be 70 but is clamped to 65.
    const slots = shotNotificationSchedule(input({ maxIntervalSeconds: 65 }), 0, NOW_MS, 2, 0);
    expect(slots[1]).toEqual({
      roundNumber: 6,
      kind: 'open',
      fireAtMs: ENDS_MS + (20 + 65) * 1000,
    });
  });

  it('skews fire times by the server offset', () => {
    // Device clock 5s behind the server (offset = server − device = +5000): the window
    // opens 5s earlier on the device clock.
    const slots = shotNotificationSchedule(input(), 5_000, NOW_MS, 1, 0);
    expect(slots[0]).toEqual({ roundNumber: 5, kind: 'open', fireAtMs: ENDS_MS - 5_000 });
  });

  it('starts from round N+1 when already in the shot window', () => {
    const slots = shotNotificationSchedule(
      input({
        session: { current_phase: 'shot_window', phase_ends_at: PHASE_ENDS_AT, status: 'active' },
      }),
      0,
      NOW_MS,
      2,
      0,
    );
    // Window N is open already; first future is round 6, whose countdown (70s) starts
    // at phase_ends_at (this window's close).
    expect(slots[0]).toEqual({ roundNumber: 6, kind: 'open', fireAtMs: ENDS_MS + 70 * 1000 });
    expect(slots[1].roundNumber).toBe(7);
  });

  it('skips a current-round window already in the past but still plans future rounds', () => {
    // "Now" is 1s after the round-5 window opened — skip round 5, keep round 6+.
    const slots = shotNotificationSchedule(input(), 0, ENDS_MS + 1_000, 3, 0);
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
        2,
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
        2,
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
        2,
      ),
    ).toEqual([]);
    expect(
      shotNotificationSchedule(
        input({ session: { current_phase: 'countdown', phase_ends_at: 'nope', status: 'active' } }),
        0,
        NOW_MS,
        5,
        2,
      ),
    ).toEqual([]);
  });
});

describe('shotNotificationSchedule — pre-warning slots', () => {
  // A pre-warning only makes sense when the lead is shorter than the round's own
  // countdown, so the valid-case tests use a long interval (5 min) against a 2-min
  // lead. The lead>=interval skip is covered in its own block below.
  const longInput = (o: Partial<ShotNotificationScheduleInput> = {}): ShotNotificationScheduleInput =>
    input({ currentRoundIntervalSeconds: 300, ...o });

  it('adds a pre-warning before each round, sorted earliest-first', () => {
    const slots = shotNotificationSchedule(longInput(), 0, EARLY_NOW, 2, 2); // 2 rounds, 2-min lead
    expect(slots).toHaveLength(4); // 2 open + 2 prewarn

    const open5 = ENDS_MS;
    const open6 = ENDS_MS + (20 + 310) * 1000; // window + round-6 interval (300 + 10)
    expect(slots).toContainEqual({ roundNumber: 5, kind: 'prewarn', fireAtMs: open5 - 120_000 });
    expect(slots).toContainEqual({ roundNumber: 5, kind: 'open', fireAtMs: open5 });
    expect(slots).toContainEqual({ roundNumber: 6, kind: 'prewarn', fireAtMs: open6 - 120_000 });
    expect(slots).toContainEqual({ roundNumber: 6, kind: 'open', fireAtMs: open6 });

    const times = slots.map((s) => s.fireAtMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('skips a pre-warning whose lead time is already in the past', () => {
    // now is 30s before round 5's window; a 2-min lead is before that → skip it, keep
    // the open. Lead (120s) < interval (300s) here, so this is the past-instant rule,
    // not the lead>=interval rule below.
    const slots = shotNotificationSchedule(longInput(), 0, NOW_MS, 1, 2);
    expect(slots).toEqual([{ roundNumber: 5, kind: 'open', fireAtMs: ENDS_MS }]);
  });

  it('omits pre-warnings entirely when preWarningMinutes is 0', () => {
    const slots = shotNotificationSchedule(input(), 0, EARLY_NOW, 2, 0);
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.kind === 'open')).toBe(true);
  });
});

// Bug fix: a Heads-up lead >= the round's own interval would fire at or before the
// round even starts, so it is skipped — equal counts as skip too, and the check is
// per round (a lead too long early in the game can fit once the interval ramps up).
describe('shotNotificationSchedule — lead vs interval guard', () => {
  it('skips the pre-warning when the lead equals the round interval', () => {
    // Flat 60s interval (no increment), 1-min lead → lead == interval every round →
    // opens only, no pre-warning.
    const slots = shotNotificationSchedule(input({ intervalIncrementSeconds: 0 }), 0, EARLY_NOW, 3, 1);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.kind === 'open')).toBe(true);
  });

  it('skips the pre-warning when the lead exceeds the round interval', () => {
    // Flat 60s interval, 2-min lead → lead > interval every round → opens only.
    const slots = shotNotificationSchedule(input({ intervalIncrementSeconds: 0 }), 0, EARLY_NOW, 3, 2);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.kind === 'open')).toBe(true);
  });

  it('applies the guard per round as the interval ramps past the lead', () => {
    // +60s/round from 60s, 2-min (120s) lead: round 5=60 and 6=120 skip (<=120),
    // round 7=180 and beyond schedule (>120). Confirms the guard is per-round.
    const slots = shotNotificationSchedule(input({ intervalIncrementSeconds: 60 }), 0, EARLY_NOW, 5, 2);
    const prewarnRounds = slots.filter((s) => s.kind === 'prewarn').map((s) => s.roundNumber);
    expect(prewarnRounds).not.toContain(5);
    expect(prewarnRounds).not.toContain(6);
    expect(prewarnRounds).toContain(7);
  });
});
