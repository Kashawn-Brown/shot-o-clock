import { headsUpGate, type HeadsUpGateInputs } from '@/features/party/headsUpGate';

// Round 5's countdown opens its window at this instant; started 5 min earlier.
const ENDS = '2026-06-24T12:05:00.000Z';
const STARTED = '2026-06-24T12:00:00.000Z';
const ENDS_MS = Date.parse(ENDS);

function inputs(overrides: Partial<HeadsUpGateInputs> = {}): HeadsUpGateInputs {
  return {
    status: 'active',
    currentPhase: 'countdown',
    phaseStartedAt: STARTED,
    phaseEndsAt: ENDS,
    enabled: true,
    leadSeconds: 120,
    changedThisRound: false,
    sentThisRound: false,
    ...overrides,
  };
}

describe('headsUpGate', () => {
  it('is unlocked well before the lead window', () => {
    // 4 min before the window; 2-min lead entry is 2 min away.
    expect(headsUpGate(inputs(), ENDS_MS - 240_000)).toEqual({ locked: false });
  });

  it('locks once per round when already changed (takes precedence)', () => {
    // Even outside the fire window, a prior change this round locks it.
    const gate = headsUpGate(inputs({ changedThisRound: true }), ENDS_MS - 240_000);
    expect(gate).toEqual({
      locked: true,
      reason: 'Already changed this round — try again next round.',
    });
  });

  it('locks inside the fire window (lead entry reached, not yet sent)', () => {
    // 90s before the window — past the 2-min (120s) entry point.
    const gate = headsUpGate(inputs(), ENDS_MS - 90_000);
    expect(gate).toEqual({
      locked: true,
      reason: "About to send — try again after this round's shot.",
    });
  });

  it('does not lock the fire window once the round has sent', () => {
    expect(headsUpGate(inputs({ sentThisRound: true }), ENDS_MS - 90_000)).toEqual({
      locked: false,
    });
  });

  it('does not lock the fire window when Heads-up is disabled', () => {
    expect(headsUpGate(inputs({ enabled: false }), ENDS_MS - 90_000)).toEqual({ locked: false });
  });

  it('prefers the once-per-round message when both gates apply', () => {
    const gate = headsUpGate(inputs({ changedThisRound: true }), ENDS_MS - 90_000);
    expect(gate).toEqual({
      locked: true,
      reason: 'Already changed this round — try again next round.',
    });
  });

  it('does not lock the fire window when the lead does not fit the countdown', () => {
    // 5-min lead on a 5-min countdown: entry == start, not strictly after → no window.
    expect(headsUpGate(inputs({ leadSeconds: 300 }), ENDS_MS - 90_000)).toEqual({ locked: false });
  });

  it('is unlocked once the window has opened (now >= ends)', () => {
    expect(headsUpGate(inputs(), ENDS_MS + 1_000)).toEqual({ locked: false });
  });

  it('does not lock outside an active countdown', () => {
    expect(headsUpGate(inputs({ currentPhase: 'shot_window' }), ENDS_MS - 90_000)).toEqual({
      locked: false,
    });
    expect(headsUpGate(inputs({ status: 'paused' }), ENDS_MS - 90_000)).toEqual({ locked: false });
  });
});
