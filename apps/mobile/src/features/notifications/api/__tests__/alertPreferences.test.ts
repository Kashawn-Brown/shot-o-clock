import { resolveAlertPrefs, type GlobalAlertPrefs } from '@/features/notifications/api/alertPreferences';

const GLOBAL: GlobalAlertPrefs = {
  soundEnabled: false, // default OFF (D064)
  hapticEnabled: true, // default ON
  soundChoice: 'classic',
};

describe('resolveAlertPrefs', () => {
  it('uses the global defaults when there is no override', () => {
    expect(resolveAlertPrefs(GLOBAL, null)).toEqual({
      soundEnabled: false,
      hapticEnabled: true,
      soundChoice: 'classic',
    });
  });

  it('lets the override flip each field independently', () => {
    expect(resolveAlertPrefs(GLOBAL, { alertSoundEnabled: true, alertHapticEnabled: false })).toEqual(
      { soundEnabled: true, hapticEnabled: false, soundChoice: 'classic' },
    );
  });

  it('falls back to the global sound when the override sound id is unknown', () => {
    expect(resolveAlertPrefs(GLOBAL, { shotOclockSound: 'not-a-real-sound' }).soundChoice).toBe(
      'classic',
    );
  });

  it('keeps a valid override sound id', () => {
    expect(resolveAlertPrefs(GLOBAL, { shotOclockSound: 'classic' }).soundChoice).toBe('classic');
  });

  it('treats override false as a real value, not a fall-through to global', () => {
    const globalOn: GlobalAlertPrefs = { ...GLOBAL, hapticEnabled: true };
    expect(resolveAlertPrefs(globalOn, { alertHapticEnabled: false }).hapticEnabled).toBe(false);
  });
});
