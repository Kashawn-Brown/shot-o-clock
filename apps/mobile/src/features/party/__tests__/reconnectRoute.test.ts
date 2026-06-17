import {
  RECAP_REENTRY_WINDOW_MS,
  routeForPhase,
  shouldRecapOnReentry,
} from '@/features/party/reconnectRoute';

describe('routeForPhase', () => {
  it('routes lobby to the lobby screen', () => {
    expect(routeForPhase('lobby')).toBe('lobby');
  });

  it('routes countdown to the timer screen', () => {
    expect(routeForPhase('countdown')).toBe('timer');
  });

  it('routes shot_window to the shot-oclock screen', () => {
    expect(routeForPhase('shot_window')).toBe('shot-oclock');
  });

  it('routes round_complete to the results screen', () => {
    expect(routeForPhase('round_complete')).toBe('results');
  });

  it('routes ended to the summary screen', () => {
    expect(routeForPhase('ended')).toBe('summary');
  });

  it('falls back to lobby for reserved post-MVP phases', () => {
    expect(routeForPhase('referee_confirmation')).toBe('lobby');
    expect(routeForPhase('host_review')).toBe('lobby');
  });
});

describe('shouldRecapOnReentry', () => {
  const NOW = Date.parse('2026-06-16T12:00:30.000Z');
  const justStarted = '2026-06-16T12:00:20.000Z'; // 10s ago (< 30s)
  const longAgo = '2026-06-16T11:59:00.000Z'; // 90s ago (> 30s)

  it('recaps a fresh countdown (started < 30s ago) with a prior round', () => {
    expect(shouldRecapOnReentry('countdown', 3, justStarted, NOW)).toBe(true);
  });

  it('does not recap once the countdown is older than the window', () => {
    expect(shouldRecapOnReentry('countdown', 3, longAgo, NOW)).toBe(false);
  });

  it('does not recap on round 1 (no previous round)', () => {
    expect(shouldRecapOnReentry('countdown', 1, justStarted, NOW)).toBe(false);
  });

  it('does not recap outside the countdown phase', () => {
    expect(shouldRecapOnReentry('shot_window', 3, justStarted, NOW)).toBe(false);
    expect(shouldRecapOnReentry('round_complete', 3, justStarted, NOW)).toBe(false);
  });

  it('does not recap on a null or unparseable start time', () => {
    expect(shouldRecapOnReentry('countdown', 3, null, NOW)).toBe(false);
    expect(shouldRecapOnReentry('countdown', 3, 'not-a-date', NOW)).toBe(false);
  });

  it('treats the window edge as expired (not < window)', () => {
    const edge = new Date(NOW - RECAP_REENTRY_WINDOW_MS).toISOString();
    expect(shouldRecapOnReentry('countdown', 3, edge, NOW)).toBe(false);
  });
});
