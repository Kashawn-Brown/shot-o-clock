import * as SecureStore from 'expo-secure-store';

import {
  clearSessionOverride,
  getSessionOverride,
  resolveEffectivePrefs,
  setSessionOverride,
  type GlobalNotificationPrefs,
} from '@/features/notifications/api/notificationPreferences';

// In-memory SecureStore so the per-session override persists within a test run.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
    __store: store,
  };
});

const mockStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

const GLOBAL_DEFAULT: GlobalNotificationPrefs = {
  shotOclockEnabled: true,
  preWarningEnabled: true,
  preWarningMinutes: 2,
};

describe('resolveEffectivePrefs', () => {
  it('uses global defaults when there is no override', () => {
    expect(resolveEffectivePrefs(GLOBAL_DEFAULT, null)).toEqual({
      includeOpen: true,
      preWarningMinutes: 2,
      alertMode: 'sound',
    });
  });

  it('lets the override replace the lead time and alert mode', () => {
    expect(
      resolveEffectivePrefs(GLOBAL_DEFAULT, { leadMinutes: 5, alertMode: 'vibration' }),
    ).toEqual({ includeOpen: true, preWarningMinutes: 5, alertMode: 'vibration' });
  });

  it('zeroes the lead time when the global pre-warning toggle is off, even with an override', () => {
    const global: GlobalNotificationPrefs = { ...GLOBAL_DEFAULT, preWarningEnabled: false };
    expect(resolveEffectivePrefs(global, { leadMinutes: 5 })).toEqual({
      includeOpen: true,
      preWarningMinutes: 0,
      alertMode: 'sound',
    });
  });

  it('drops the open alert when the global Shot O’Clock toggle is off', () => {
    const global: GlobalNotificationPrefs = { ...GLOBAL_DEFAULT, shotOclockEnabled: false };
    expect(resolveEffectivePrefs(global, null).includeOpen).toBe(false);
  });
});

describe('getSessionOverride (partyId guard)', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getSessionOverride('party-a')).toBeNull();
  });

  it('returns the override for the matching party', async () => {
    await setSessionOverride('party-a', { leadMinutes: 5, alertMode: 'vibration' });
    expect(await getSessionOverride('party-a')).toEqual({
      leadMinutes: 5,
      alertMode: 'vibration',
    });
  });

  it('ignores a stored override that belongs to a different party (stale)', async () => {
    await setSessionOverride('party-a', { leadMinutes: 5 });
    expect(await getSessionOverride('party-b')).toBeNull();
  });

  it('overwrites a stale entry when a new party sets one', async () => {
    await setSessionOverride('party-a', { leadMinutes: 5, alertMode: 'vibration' });
    await setSessionOverride('party-b', { alertMode: 'sound' });
    // party-a is gone (single-value store); party-b has only what it set.
    expect(await getSessionOverride('party-a')).toBeNull();
    expect(await getSessionOverride('party-b')).toEqual({ alertMode: 'sound' });
  });

  it('merges patches within the same party', async () => {
    await setSessionOverride('party-a', { leadMinutes: 5 });
    await setSessionOverride('party-a', { alertMode: 'vibration' });
    expect(await getSessionOverride('party-a')).toEqual({
      leadMinutes: 5,
      alertMode: 'vibration',
    });
  });

  it('drops invalid stored fields', async () => {
    // Hand-write a corrupt value with an out-of-range lead + bad alert mode.
    mockStore.set(
      'shotoclock.notifications.sessionOverride',
      JSON.stringify({ partyId: 'party-a', leadMinutes: 99, alertMode: 'flash' }),
    );
    expect(await getSessionOverride('party-a')).toEqual({});
  });

  it('clears the override', async () => {
    await setSessionOverride('party-a', { leadMinutes: 5 });
    await clearSessionOverride();
    expect(await getSessionOverride('party-a')).toBeNull();
  });
});
