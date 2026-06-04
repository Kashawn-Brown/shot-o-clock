import * as SecureStore from 'expo-secure-store';

import { getConsent, hasGivenConsent, recordConsent } from '@/features/auth/api/consent';

// In-memory SecureStore so the consent flags persist within a test run.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
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

describe('getConsent', () => {
  it('returns both flags false when nothing is stored', async () => {
    expect(await getConsent()).toEqual({ ageConfirmed: false, termsAccepted: false });
  });

  it('reads back both flags after recordConsent', async () => {
    await recordConsent();
    expect(await getConsent()).toEqual({ ageConfirmed: true, termsAccepted: true });
  });
});

describe('hasGivenConsent', () => {
  it('is true only when both confirmations are present', () => {
    expect(hasGivenConsent({ ageConfirmed: true, termsAccepted: true })).toBe(true);
    expect(hasGivenConsent({ ageConfirmed: true, termsAccepted: false })).toBe(false);
    expect(hasGivenConsent({ ageConfirmed: false, termsAccepted: true })).toBe(false);
    expect(hasGivenConsent({ ageConfirmed: false, termsAccepted: false })).toBe(false);
  });
});
