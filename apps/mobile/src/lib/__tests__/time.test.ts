import { formatDuration } from '@/lib/time';

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
