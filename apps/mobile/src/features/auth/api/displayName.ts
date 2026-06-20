// Local persistence of the guest's display name.
//
// Captured once on first launch (NameEntryGate) and reused as guest identity:
// it's the host's name on Create (which has no name field) and prefills the Join
// screen. Stored on-device so it survives reloads (plan.md Phase 4). The name is
// also the create_party/join_party RPC param, so the 1–40 bound mirrors the DB
// CHECK (docs/specs/schema.md:183 — length(display_name) between 1 and 40).

import * as SecureStore from 'expo-secure-store';

const DISPLAY_NAME_KEY = 'shotoclock.identity.displayName';

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 40;

/** Trim surrounding whitespace; the trimmed form is what we store and validate. */
export function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

/**
 * Valid when the trimmed name is 1–40 characters. Length is counted in code
 * points (via spread) to match Postgres `length()`, so an emoji counts as one.
 */
export function isValidDisplayName(raw: string): boolean {
  const length = [...normalizeDisplayName(raw)].length;
  return length >= DISPLAY_NAME_MIN_LENGTH && length <= DISPLAY_NAME_MAX_LENGTH;
}

/** The stored name, or null if none is set (or a stored value fails validation). */
export async function getDisplayName(): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(DISPLAY_NAME_KEY);
  return stored !== null && isValidDisplayName(stored) ? stored : null;
}

export async function setDisplayName(raw: string): Promise<void> {
  const name = normalizeDisplayName(raw);
  if (!isValidDisplayName(name)) {
    throw new Error(`Display name must be ${DISPLAY_NAME_MIN_LENGTH}–${DISPLAY_NAME_MAX_LENGTH} characters`);
  }
  await SecureStore.setItemAsync(DISPLAY_NAME_KEY, name);
}

/** Clear the stored display name — part of Reset this device (D018). */
export async function clearDisplayName(): Promise<void> {
  await SecureStore.deleteItemAsync(DISPLAY_NAME_KEY);
}
