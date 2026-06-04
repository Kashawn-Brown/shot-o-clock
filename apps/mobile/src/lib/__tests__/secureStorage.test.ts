import * as SecureStore from 'expo-secure-store';

import { secureStorage } from '@/lib/secureStorage';
import { MAX_CHUNK_BYTES, splitIntoChunks, utf8ByteLength } from '@/lib/secureStorageChunks';

// In-memory SecureStore so the adapter's orchestration (count marker, reassembly,
// stale-chunk cleanup) runs without the native module.
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

// Read the test-only backing map the mock exposes (avoids `any`).
const mockStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('splitIntoChunks', () => {
  it('keeps a small ASCII value in a single chunk', () => {
    expect(splitIntoChunks('hello')).toEqual(['hello']);
  });

  it('returns no chunks for an empty string', () => {
    expect(splitIntoChunks('')).toEqual([]);
  });

  it('splits a value larger than the cap into byte-bounded chunks', () => {
    const value = 'a'.repeat(MAX_CHUNK_BYTES * 2 + 123);
    const chunks = splitIntoChunks(value);
    expect(chunks.length).toBe(3);
    chunks.forEach((c) => expect(utf8ByteLength(c)).toBeLessThanOrEqual(MAX_CHUNK_BYTES));
    expect(chunks.join('')).toBe(value);
  });

  it('never splits a multi-byte code point across chunks', () => {
    const value = '😀'.repeat(2000); // 4 bytes each → forces splits between emoji
    const chunks = splitIntoChunks(value);
    chunks.forEach((c) => expect(utf8ByteLength(c)).toBeLessThanOrEqual(MAX_CHUNK_BYTES));
    expect(chunks.join('')).toBe(value);
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('counts a 4-byte emoji correctly', () => {
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('secureStorage adapter', () => {
  it('returns null for an absent key', async () => {
    expect(await secureStorage.getItem('missing')).toBeNull();
  });

  it('round-trips a small value', async () => {
    await secureStorage.setItem('k', 'small');
    expect(await secureStorage.getItem('k')).toBe('small');
  });

  it('round-trips a value larger than one chunk', async () => {
    const big = 'x'.repeat(MAX_CHUNK_BYTES * 3 + 50);
    await secureStorage.setItem('k', big);
    expect(await secureStorage.getItem('k')).toBe(big);
  });

  it('round-trips an empty string as "" not null', async () => {
    await secureStorage.setItem('k', '');
    expect(await secureStorage.getItem('k')).toBe('');
  });

  it('cleans up stale chunks when a value shrinks', async () => {
    await secureStorage.setItem('k', 'x'.repeat(MAX_CHUNK_BYTES * 3 + 50)); // 4 chunks
    await secureStorage.setItem('k', 'tiny'); // 1 chunk
    expect(await secureStorage.getItem('k')).toBe('tiny');
    const leftover = [...mockStore.keys()].filter((key) => /^k\.\d+$/.test(key));
    expect(leftover).toEqual(['k.0']);
  });

  it('removes the marker and all chunks', async () => {
    await secureStorage.setItem('k', 'x'.repeat(MAX_CHUNK_BYTES * 2)); // 2 chunks
    await secureStorage.removeItem('k');
    expect(await secureStorage.getItem('k')).toBeNull();
    expect([...mockStore.keys()]).toEqual([]);
  });
});
