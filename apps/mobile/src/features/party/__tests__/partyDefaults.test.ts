import * as SecureStore from 'expo-secure-store';

import {
  clearPartyCreateDefaults,
  FACTORY_PARTY_CREATE_DEFAULTS,
  getPartyCreateDefaults,
  setPartyCreateDefaults,
  type PartyCreateDefaults,
} from '@/features/party/partyDefaults';

// In-memory SecureStore so the defaults persist within a test run.
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
const KEY = 'shotoclock.party.createDefaults';

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

const CUSTOM: PartyCreateDefaults = {
  startingIntervalMinutes: 10,
  intervalIncrementMinutes: 2,
  shotWindowSeconds: 30,
  eliminationEnabled: false,
  graceMode: 'enabled',
};

describe('getPartyCreateDefaults', () => {
  it('returns the factory defaults when nothing is stored', async () => {
    expect(await getPartyCreateDefaults()).toEqual(FACTORY_PARTY_CREATE_DEFAULTS);
  });

  it('round-trips stored custom defaults', async () => {
    await setPartyCreateDefaults(CUSTOM);
    expect(await getPartyCreateDefaults()).toEqual(CUSTOM);
  });

  it('falls back per-field for out-of-range / wrong-type values', async () => {
    mockStore.set(
      KEY,
      JSON.stringify({
        startingIntervalMinutes: 999, // above max → default
        intervalIncrementMinutes: -1, // below min → default
        shotWindowSeconds: 30, // valid → kept
        eliminationEnabled: 'nope', // wrong type → default
        graceMode: 'unlimited', // not a UI choice → default
      }),
    );
    expect(await getPartyCreateDefaults()).toEqual({
      startingIntervalMinutes: FACTORY_PARTY_CREATE_DEFAULTS.startingIntervalMinutes,
      intervalIncrementMinutes: FACTORY_PARTY_CREATE_DEFAULTS.intervalIncrementMinutes,
      shotWindowSeconds: 30,
      eliminationEnabled: FACTORY_PARTY_CREATE_DEFAULTS.eliminationEnabled,
      graceMode: FACTORY_PARTY_CREATE_DEFAULTS.graceMode,
    });
  });

  it('rejects a non-integer interval', async () => {
    mockStore.set(KEY, JSON.stringify({ ...CUSTOM, startingIntervalMinutes: 5.5 }));
    expect((await getPartyCreateDefaults()).startingIntervalMinutes).toBe(
      FACTORY_PARTY_CREATE_DEFAULTS.startingIntervalMinutes,
    );
  });

  it('returns the factory defaults for a corrupt blob', async () => {
    mockStore.set(KEY, 'not json');
    expect(await getPartyCreateDefaults()).toEqual(FACTORY_PARTY_CREATE_DEFAULTS);
  });

  it('clears back to the factory defaults', async () => {
    await setPartyCreateDefaults(CUSTOM);
    await clearPartyCreateDefaults();
    expect(await getPartyCreateDefaults()).toEqual(FACTORY_PARTY_CREATE_DEFAULTS);
  });
});
