import { deriveHostOnlySummary, formatElapsed } from '@/features/game/hostOnlySummary';

describe('formatElapsed', () => {
  it('shows hours and minutes past an hour, dropping seconds', () => {
    expect(formatElapsed((1 * 3600 + 18 * 60 + 42) * 1000)).toBe('1h 18m');
  });

  it('shows minutes and seconds under an hour', () => {
    expect(formatElapsed((18 * 60 + 42) * 1000)).toBe('18m 42s');
  });

  it('shows just seconds under a minute', () => {
    expect(formatElapsed(42 * 1000)).toBe('42s');
  });

  it('clamps a negative span to 0s', () => {
    expect(formatElapsed(-5000)).toBe('0s');
  });
});

describe('deriveHostOnlySummary', () => {
  it('reports rounds and a formatted elapsed span', () => {
    const view = deriveHostOnlySummary({
      currentRoundNumber: 7,
      startedAt: '2026-06-13T20:00:00.000Z',
      endedAt: '2026-06-13T21:18:42.000Z',
    });
    expect(view).toEqual({ rounds: 7, elapsedLabel: '1h 18m' });
  });

  it('returns a null elapsed label when a timestamp is missing', () => {
    expect(
      deriveHostOnlySummary({ currentRoundNumber: 3, startedAt: null, endedAt: null }).elapsedLabel,
    ).toBeNull();
  });

  it('returns a null elapsed label when a timestamp is unparseable', () => {
    expect(
      deriveHostOnlySummary({
        currentRoundNumber: 3,
        startedAt: 'not-a-date',
        endedAt: '2026-06-13T21:00:00.000Z',
      }).elapsedLabel,
    ).toBeNull();
  });

  it('clamps a negative round number to zero', () => {
    expect(
      deriveHostOnlySummary({ currentRoundNumber: -1, startedAt: null, endedAt: null }).rounds,
    ).toBe(0);
  });
});
