import { isPhaseDue } from '@/features/game/phaseDue';

// isPhaseDue is the gate the poll loop checks before asking the server to
// advance: only an active session whose phase_ends_at has passed is "due".
describe('isPhaseDue', () => {
  const NOW = Date.parse('2026-06-09T20:00:00.000Z');
  const past = new Date(NOW - 1_000).toISOString();
  const future = new Date(NOW + 1_000).toISOString();

  it('is not due when the session is not active (paused/ended)', () => {
    expect(isPhaseDue(past, false, NOW)).toBe(false);
  });

  it('is not due when there is no timer (null phase_ends_at)', () => {
    expect(isPhaseDue(null, true, NOW)).toBe(false);
  });

  it('is not due before phase_ends_at', () => {
    expect(isPhaseDue(future, true, NOW)).toBe(false);
  });

  it('is due at the exact boundary', () => {
    expect(isPhaseDue(new Date(NOW).toISOString(), true, NOW)).toBe(true);
  });

  it('is due once phase_ends_at has passed', () => {
    expect(isPhaseDue(past, true, NOW)).toBe(true);
  });

  it('is not due for an unparseable timestamp', () => {
    expect(isPhaseDue('not-a-date', true, NOW)).toBe(false);
  });
});
