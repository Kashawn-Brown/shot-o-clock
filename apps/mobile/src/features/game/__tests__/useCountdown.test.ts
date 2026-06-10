import { countdownFrom } from '@/features/game/useCountdown';

// countdownFrom is the pure core of the useCountdown hook — given a phaseEndsAt
// and a fixed "now" it returns the remaining-ms / expired pair the display reads.
// Testing it directly pins the boundary behavior without a real clock or React.
describe('countdownFrom', () => {
  const NOW = Date.parse('2026-06-09T20:00:00.000Z');

  it('treats a null timestamp as no active countdown', () => {
    expect(countdownFrom(null, NOW)).toEqual({ remainingMs: 0, isExpired: false });
  });

  it('treats an unparseable timestamp as no active countdown', () => {
    expect(countdownFrom('not-a-date', NOW)).toEqual({ remainingMs: 0, isExpired: false });
  });

  it('returns the remaining ms for a future end time', () => {
    const ends = new Date(NOW + 30_000).toISOString();
    expect(countdownFrom(ends, NOW)).toEqual({ remainingMs: 30_000, isExpired: false });
  });

  it('clamps to zero and marks expired once the end time has passed', () => {
    const ends = new Date(NOW - 1_000).toISOString();
    expect(countdownFrom(ends, NOW)).toEqual({ remainingMs: 0, isExpired: true });
  });

  it('marks the exact boundary as expired', () => {
    const ends = new Date(NOW).toISOString();
    expect(countdownFrom(ends, NOW)).toEqual({ remainingMs: 0, isExpired: true });
  });
});
