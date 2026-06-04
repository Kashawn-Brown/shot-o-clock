import { routeForPhase } from '@/features/party/reconnectRoute';

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
