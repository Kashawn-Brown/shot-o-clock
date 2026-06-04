import * as SecureStore from 'expo-secure-store';

import {
  DISPLAY_NAME_MAX_LENGTH,
  getDisplayName,
  isValidDisplayName,
  normalizeDisplayName,
  setDisplayName,
} from '@/features/auth/api/displayName';

// In-memory SecureStore so the stored name persists within a test run.
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

describe('isValidDisplayName', () => {
  it('accepts a 1–40 character name', () => {
    expect(isValidDisplayName('A')).toBe(true);
    expect(isValidDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBe(true);
  });

  it('rejects empty / whitespace-only names', () => {
    expect(isValidDisplayName('')).toBe(false);
    expect(isValidDisplayName('   ')).toBe(false);
  });

  it('rejects names longer than 40 characters', () => {
    expect(isValidDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(false);
  });

  it('counts an emoji as one character (matches Postgres length())', () => {
    expect(isValidDisplayName('😀'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBe(true);
    expect(isValidDisplayName('😀'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('normalizeDisplayName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeDisplayName('  Sam  ')).toBe('Sam');
  });
});

describe('getDisplayName / setDisplayName', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getDisplayName()).toBeNull();
  });

  it('stores the trimmed name and reads it back', async () => {
    await setDisplayName('  Sam  ');
    expect(await getDisplayName()).toBe('Sam');
  });

  it('rejects an invalid name', async () => {
    await expect(setDisplayName('   ')).rejects.toThrow();
    expect(await getDisplayName()).toBeNull();
  });
});
