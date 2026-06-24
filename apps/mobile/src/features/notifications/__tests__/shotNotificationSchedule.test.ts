import {
  shotNotificationSchedule,
  type ShotNotificationScheduleInput,
} from '@/features/notifications/shotNotificationSchedule';

// The planner now emits ONLY Heads-up (pre-warning) slots — the window-open alert
// moved to server push (D063). A pre-warning only schedules when its lead is shorter
// than the round's own interval, so most tests use a long (300s) interval against a
// 2-min lead; the lead>=interval skip has its own block.

// Round N's countdown ends (its shot window opens) at this server instant.
const PHASE_ENDS_AT = '2026-06-16T12:00:30.000Z';
const ENDS_MS = Date.parse(PHASE_ENDS_AT);
const NOW_MS = ENDS_MS - 30_000; // 30s before the window opens
const EARLY_NOW = ENDS_MS - 600_000; // 10 min before — far enough for pre-warnings

// Base party: 300s interval, +10s increment, 20s shot window, no cap, on round 5.
function input(
  overrides: Partial<ShotNotificationScheduleInput> = {},
): ShotNotificationScheduleInput {
  return {
    session: { current_phase: 'countdown', phase_ends_at: PHASE_ENDS_AT, status: 'active' },
    shotWindowSeconds: 20,
    intervalIncrementSeconds: 10,
    maxIntervalSeconds: null,
    currentRoundNumber: 5,
    currentRoundIntervalSeconds: 300,
    ...overrides,
  };
}

describe('shotNotificationSchedule — gating', () => {
  it.each(['paused', 'ended', 'lobby'] as const)('plans nothing when status is %s', (status) => {
    expect(
      shotNotificationSchedule(
        input({ session: { current_phase: 'countdown', phase_ends_at: PHASE_ENDS_AT, status } }),
        0,
        EARLY_NOW,
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
        EARLY_NOW,
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
        EARLY_NOW,
        5,
        2,
      ),
    ).toEqual([]);
    expect(
      shotNotificationSchedule(
        input({ session: { current_phase: 'countdown', phase_ends_at: 'nope', status: 'active' } }),
        0,
        EARLY_NOW,
        5,
        2,
      ),
    ).toEqual([]);
  });

  it('omits pre-warnings entirely when preWarningMinutes is 0', () => {
    expect(shotNotificationSchedule(input(), 0, EARLY_NOW, 3, 0)).toEqual([]);
  });
});

describe('shotNotificationSchedule — Heads-up slots', () => {
  it('plans a pre-warning for the current round, then future rounds, earliest-first', () => {
    const slots = shotNotificationSchedule(input(), 0, EARLY_NOW, 3, 2); // 3 rounds, 2-min lead
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.kind === 'prewarn')).toBe(true);

    const open5 = ENDS_MS; // round 5 window opens at phase_ends_at
    const open6 = ENDS_MS + (20 + 310) * 1000; // + window + round-6 interval (300 + 10)
    const open7 = open6 + (20 + 320) * 1000; // + window + round-7 interval (310 + 10)
    expect(slots[0]).toEqual({ roundNumber: 5, kind: 'prewarn', fireAtMs: open5 - 120_000 });
    expect(slots[1]).toEqual({ roundNumber: 6, kind: 'prewarn', fireAtMs: open6 - 120_000 });
    expect(slots[2]).toEqual({ roundNumber: 7, kind: 'prewarn', fireAtMs: open7 - 120_000 });
  });

  it('caps the batch at maxCount rounds', () => {
    expect(shotNotificationSchedule(input(), 0, EARLY_NOW, 8, 2)).toHaveLength(8);
  });

  it('clamps interval growth at maxIntervalSeconds', () => {
    // Round 6 interval would be 310 but is clamped to 305; its pre-warning shifts with it.
    const slots = shotNotificationSchedule(input({ maxIntervalSeconds: 305 }), 0, EARLY_NOW, 2, 2);
    const open6 = ENDS_MS + (20 + 305) * 1000;
    expect(slots[1]).toEqual({ roundNumber: 6, kind: 'prewarn', fireAtMs: open6 - 120_000 });
  });

  it('skews fire times by the server offset', () => {
    // Device clock 5s behind the server (offset +5000): the pre-warning fires 5s earlier.
    const slots = shotNotificationSchedule(input(), 5_000, EARLY_NOW, 1, 2);
    expect(slots[0]).toEqual({ roundNumber: 5, kind: 'prewarn', fireAtMs: ENDS_MS - 120_000 - 5_000 });
  });

  it('starts from round N+1 when already in the shot window', () => {
    const slots = shotNotificationSchedule(
      input({
        session: { current_phase: 'shot_window', phase_ends_at: PHASE_ENDS_AT, status: 'active' },
      }),
      0,
      EARLY_NOW,
      2,
      2,
    );
    // Window N is open already; first future is round 6, whose countdown (310s) starts
    // at phase_ends_at (this window's close), so it opens at phase_ends + 310s.
    const open6 = ENDS_MS + 310 * 1000;
    expect(slots[0]).toEqual({ roundNumber: 6, kind: 'prewarn', fireAtMs: open6 - 120_000 });
    expect(slots[1].roundNumber).toBe(7);
  });

  it('skips a pre-warning whose instant is already in the past but keeps later rounds', () => {
    // now is 30s before round 5's window; a 2-min lead is before that → skip round 5's
    // pre-warning, keep round 6+. (Lead < interval, so this is the past-instant rule.)
    const slots = shotNotificationSchedule(input(), 0, NOW_MS, 3, 2);
    expect(slots[0].roundNumber).toBe(6);
    expect(slots.every((s) => s.fireAtMs > NOW_MS)).toBe(true);
  });
});

// Bug fix: a Heads-up lead >= the round's own interval would fire at or before the
// round even starts, so it is skipped — equal counts as skip too, and the check is
// per round (a lead too long early in the game can fit once the interval ramps up).
describe('shotNotificationSchedule — lead vs interval guard', () => {
  it('skips the pre-warning when the lead equals the round interval', () => {
    // Flat 60s interval (no increment), 1-min lead → lead == interval every round → none.
    expect(
      shotNotificationSchedule(
        input({ currentRoundIntervalSeconds: 60, intervalIncrementSeconds: 0 }),
        0,
        EARLY_NOW,
        3,
        1,
      ),
    ).toEqual([]);
  });

  it('skips the pre-warning when the lead exceeds the round interval', () => {
    // Flat 60s interval, 2-min lead → lead > interval every round → none.
    expect(
      shotNotificationSchedule(
        input({ currentRoundIntervalSeconds: 60, intervalIncrementSeconds: 0 }),
        0,
        EARLY_NOW,
        3,
        2,
      ),
    ).toEqual([]);
  });

  it('applies the guard per round as the interval ramps past the lead', () => {
    // +60s/round from 60s, 2-min (120s) lead: round 5=60 and 6=120 skip (<=120),
    // round 7=180 and beyond schedule (>120). Confirms the guard is per-round.
    const slots = shotNotificationSchedule(
      input({ currentRoundIntervalSeconds: 60, intervalIncrementSeconds: 60 }),
      0,
      EARLY_NOW,
      5,
      2,
    );
    const prewarnRounds = slots.map((s) => s.roundNumber);
    expect(prewarnRounds).not.toContain(5);
    expect(prewarnRounds).not.toContain(6);
    expect(prewarnRounds).toContain(7);
  });
});
