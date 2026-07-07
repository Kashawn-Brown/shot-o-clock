import { avatarColor, initialsFor } from '@/components/ui/PlayerAvatar';
import { AVATAR_COLORS } from '@/styles/tokens';

describe('initialsFor', () => {
  it('takes one letter from a single-word name', () => {
    expect(initialsFor('Jordan')).toBe('J');
  });

  it('takes the first letters of the first and last word', () => {
    expect(initialsFor('Alex Kim')).toBe('AK');
    expect(initialsFor('Mary Jane Watson')).toBe('MW');
  });

  it('uppercases and trims surrounding whitespace', () => {
    expect(initialsFor('  alex  ')).toBe('A');
    expect(initialsFor('sofia rivera')).toBe('SR');
  });

  it('falls back to "?" for an empty or blank name', () => {
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('avatarColor', () => {
  it('is deterministic for the same key', () => {
    expect(avatarColor('player-123')).toBe(avatarColor('player-123'));
  });

  it('always returns a color from the palette', () => {
    for (const key of ['a', 'player-123', 'zzz', '', 'a longer id string 456']) {
      expect([...AVATAR_COLORS]).toContain(avatarColor(key));
    }
  });

  it('maps different keys across more than one color', () => {
    const colors = new Set(['id-1', 'id-2', 'id-3', 'id-4', 'id-5'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
