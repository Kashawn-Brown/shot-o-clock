import * as SecureStore from 'expo-secure-store';

import {
  clearSessionOverride,
  getSessionOverride,
  setSessionOverride,
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

// The per-session override now carries only the foreground ALERT fields (Heads-up is a
// host-controlled party setting since Phase 16 / D063).
describe('getSessionOverride (partyId guard)', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getSessionOverride('party-a')).toBeNull();
  });

  it('returns the override for the matching party', async () => {
    await setSessionOverride('party-a', { alertSoundEnabled: true, alertHapticEnabled: false });
    expect(await getSessionOverride('party-a')).toEqual({
      alertSoundEnabled: true,
      alertHapticEnabled: false,
    });
  });

  it('ignores a stored override that belongs to a different party (stale)', async () => {
    await setSessionOverride('party-a', { alertSoundEnabled: true });
    expect(await getSessionOverride('party-b')).toBeNull();
  });

  it('overwrites a stale entry when a new party sets one', async () => {
    await setSessionOverride('party-a', { alertSoundEnabled: true, alertHapticEnabled: false });
    await setSessionOverride('party-b', { shotOclockSound: 'classic' });
    // party-a is gone (single-value store); party-b has only what it set.
    expect(await getSessionOverride('party-a')).toBeNull();
    expect(await getSessionOverride('party-b')).toEqual({ shotOclockSound: 'classic' });
  });

  it('merges patches within the same party', async () => {
    await setSessionOverride('party-a', { alertSoundEnabled: true });
    await setSessionOverride('party-a', { alertHapticEnabled: false });
    expect(await getSessionOverride('party-a')).toEqual({
      alertSoundEnabled: true,
      alertHapticEnabled: false,
    });
  });

  it('clears the override', async () => {
    await setSessionOverride('party-a', { alertSoundEnabled: true });
    await clearSessionOverride();
    expect(await getSessionOverride('party-a')).toBeNull();
  });
});
