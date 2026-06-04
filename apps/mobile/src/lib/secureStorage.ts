// Encrypted session storage for Supabase auth, backed by expo-secure-store.
//
// supabase-js persists the whole auth session as a single string under one key,
// and SecureStore caps a stored value at 2048 bytes on Android. A session blob
// sits near that boundary, so this adapter transparently splits large values into
// byte-bounded chunks (see secureStorageChunks) and reassembles them on read —
// keeping "session survives force-close" (plan.md Phase 4) reliable on Android.
//
// Layout per logical key K:
//   K        -> chunk count as a decimal string ("0" = a stored empty string)
//   K.0..K.n -> the value split on UTF-8 code-point boundaries
// A null marker means the key is absent — distinct from a stored empty string.
//
// Lives in lib/ (not features/auth/) because lib/ must not import from features/,
// and the supabase client in lib/supabase.ts consumes this directly.
//
// NOTE: SecureStore is unavailable on web; the app is mobile-only for MVP
// (CLAUDE.md §4.2 — web display is out of scope). `expo start --web` would throw
// here on the first auth call. Revisit only if web becomes a target.

import * as SecureStore from 'expo-secure-store';

import { splitIntoChunks } from '@/lib/secureStorageChunks';

// Structural match for @supabase/auth-js `SupportedStorage` (not re-exported by
// supabase-js). Checked against createClient's `auth.storage` option in
// lib/supabase.ts.
interface SupportedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function parseCount(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export const secureStorage: SupportedStorage = {
  async getItem(key) {
    const marker = await SecureStore.getItemAsync(key);
    if (marker === null) return null;

    const count = parseCount(marker);
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A missing chunk means the stored value is incomplete; fail closed so the
      // caller treats it as no session rather than a corrupted one.
      if (part === null) return null;
      value += part;
    }
    return value;
  },

  async setItem(key, value) {
    const prevCount = parseCount(await SecureStore.getItemAsync(key));
    const chunks = splitIntoChunks(value);

    for (const [i, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunk);
    }
    // Write the count marker last so a crash during a fresh write leaves the key
    // absent (read as no session) rather than a marker referencing unwritten
    // chunks. Overwrites are best-effort, not transactional.
    await SecureStore.setItemAsync(key, String(chunks.length));

    // Drop chunks left over from a previously larger value.
    for (let i = chunks.length; i < prevCount; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
  },

  async removeItem(key) {
    const count = parseCount(await SecureStore.getItemAsync(key));
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(key);
  },
};
