import {
  formatDuration,
  getServerTimeOffset,
  msUntil,
  serverNow,
  setServerTimeOffset,
} from '@/lib/time';

// First test exercising the runner against existing pure logic (see time.ts).
// formatDuration is the timer's display formatter; locking its edges here also
// validates the jest-expo preset + path-alias mapping end to end.
describe('formatDuration', () => {
  it('formats a sub-hour duration as M:SS', () => {
    expect(formatDuration(462_000)).toBe('7:42');
  });

  it('zero-pads the seconds field', () => {
    expect(formatDuration(65_000)).toBe('1:05');
  });

  it('floors partial seconds', () => {
    expect(formatDuration(1_999)).toBe('0:01');
  });

  it('clamps negative input to 0:00', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

// serverNow()/msUntil() shift by the measured device→server offset so two phones
// with different clocks agree on remaining time (state-machine §8.7). Reset the
// module-level offset after each case so tests don't leak into one another.
describe('server clock offset', () => {
  afterEach(() => setServerTimeOffset(0));

  it('defaults to a zero offset (raw device clock)', () => {
    expect(getServerTimeOffset()).toBe(0);
    expect(serverNow().getTime()).toBeCloseTo(Date.now(), -2);
  });

  it('shifts serverNow() forward by a positive offset', () => {
    setServerTimeOffset(5_000);
    expect(getServerTimeOffset()).toBe(5_000);
    // serverNow ≈ device clock + 5s, within a small execution tolerance.
    expect(serverNow().getTime() - Date.now()).toBeGreaterThanOrEqual(4_900);
    expect(serverNow().getTime() - Date.now()).toBeLessThanOrEqual(5_100);
  });

  it('measures msUntil against server time, not the device clock', () => {
    setServerTimeOffset(10_000);
    // A timestamp 3s ahead of *server* now should read ~3s remaining even though
    // the device clock is 10s behind the server.
    const threeSecondsAhead = new Date(serverNow().getTime() + 3_000).toISOString();
    const remaining = msUntil(threeSecondsAhead);
    expect(remaining).toBeGreaterThanOrEqual(2_800);
    expect(remaining).toBeLessThanOrEqual(3_000);
  });

  it('clamps a past timestamp to 0', () => {
    setServerTimeOffset(2_000);
    const oneSecondAgo = new Date(serverNow().getTime() - 1_000).toISOString();
    expect(msUntil(oneSecondAgo)).toBe(0);
  });
});
