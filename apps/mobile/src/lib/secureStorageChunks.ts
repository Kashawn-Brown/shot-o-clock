// Pure chunking math for the SecureStore session adapter (see secureStorage.ts).
//
// SecureStore caps a single stored value at 2048 bytes on Android — above that it
// warns and may silently drop the value. supabase-js persists the whole auth
// session as one string that sits near that boundary, so the adapter splits large
// values into byte-bounded chunks. This module holds the split/size math with no
// expo/RN imports, so it unit-tests directly in node.

// Conservative cap below SecureStore's 2048-byte limit, leaving headroom.
export const MAX_CHUNK_BYTES = 2000;

/** UTF-8 byte length of a single Unicode code point. */
function codePointByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** UTF-8 byte length of a string (counts surrogate pairs once). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    bytes += codePointByteLength(ch.codePointAt(0) ?? 0);
  }
  return bytes;
}

/**
 * Split `value` into chunks whose UTF-8 byte length never exceeds `maxBytes`.
 * Splits only on code-point boundaries (never mid-surrogate-pair), so joining the
 * chunks reproduces the input exactly and every chunk is valid UTF-8 — a lone
 * surrogate would be corrupted by SecureStore's native UTF-8 round-trip. An empty
 * string yields zero chunks.
 */
export function splitIntoChunks(value: string, maxBytes: number = MAX_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of value) {
    const chBytes = codePointByteLength(ch.codePointAt(0) ?? 0);
    if (currentBytes + chBytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}
