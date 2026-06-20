// Device-side party-creation defaults (Phase 15) — the host's preferred Create Party
// settings, pre-filling the Create form for every new party. Stored as ONE JSON blob
// (the five fields are always read/written together; one key for Reset to clear).
//
// Values are held in the SAME units the Create form uses (minutes for intervals,
// seconds for the shot window) so pre-fill is a direct hand-off. Bounds + factory
// defaults are reused from createPartyForm so there's a single source of truth; the
// server re-validates on create regardless. Party NAME and host-only are intentionally
// not stored — name is always a fresh dated default, host-only is a per-party choice.

import * as SecureStore from 'expo-secure-store';

import {
  DEFAULT_ELIMINATION_ENABLED,
  DEFAULT_GRACE_MODE,
  DEFAULT_INTERVAL_INCREMENT_MINUTES,
  DEFAULT_SHOT_WINDOW_SECONDS,
  DEFAULT_STARTING_INTERVAL_MINUTES,
  GRACE_MODE_OPTIONS,
  INTERVAL_INCREMENT_MAX_MINUTES,
  INTERVAL_INCREMENT_MIN_MINUTES,
  SHOT_WINDOW_MAX_SECONDS,
  SHOT_WINDOW_MIN_SECONDS,
  STARTING_INTERVAL_MAX_MINUTES,
  STARTING_INTERVAL_MIN_MINUTES,
  type GraceMode,
} from '@/features/party/createPartyForm';

const PARTY_CREATE_DEFAULTS_KEY = 'shotoclock.party.createDefaults';

export interface PartyCreateDefaults {
  startingIntervalMinutes: number;
  intervalIncrementMinutes: number;
  shotWindowSeconds: number;
  eliminationEnabled: boolean;
  graceMode: GraceMode;
}

/** The factory defaults — what Create Party uses when the user hasn't set their own. */
export const FACTORY_PARTY_CREATE_DEFAULTS: PartyCreateDefaults = {
  startingIntervalMinutes: DEFAULT_STARTING_INTERVAL_MINUTES,
  intervalIncrementMinutes: DEFAULT_INTERVAL_INCREMENT_MINUTES,
  shotWindowSeconds: DEFAULT_SHOT_WINDOW_SECONDS,
  eliminationEnabled: DEFAULT_ELIMINATION_ENABLED,
  graceMode: DEFAULT_GRACE_MODE,
};

// Accept only a whole number within [min, max]; otherwise the factory fallback. Guards
// a corrupt/out-of-range stored value from reaching the form (and the RPC).
function validInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function validGraceMode(value: unknown): GraceMode {
  // Only the UI-offered modes are valid here ('unlimited' exists in the schema but is
  // not a Create choice — treat it, and anything unknown, as the factory default).
  return GRACE_MODE_OPTIONS.some((option) => option.value === value)
    ? (value as GraceMode)
    : DEFAULT_GRACE_MODE;
}

/**
 * The stored party-creation defaults, fully validated — every field clamped to its
 * Create bound or fall back to the factory default. Returns the factory defaults when
 * nothing is stored or the blob is corrupt, so the Create form always gets sane values.
 */
export async function getPartyCreateDefaults(): Promise<PartyCreateDefaults> {
  try {
    const raw = await SecureStore.getItemAsync(PARTY_CREATE_DEFAULTS_KEY);
    if (raw == null) return FACTORY_PARTY_CREATE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PartyCreateDefaults>;
    return {
      startingIntervalMinutes: validInt(
        parsed.startingIntervalMinutes,
        STARTING_INTERVAL_MIN_MINUTES,
        STARTING_INTERVAL_MAX_MINUTES,
        DEFAULT_STARTING_INTERVAL_MINUTES,
      ),
      intervalIncrementMinutes: validInt(
        parsed.intervalIncrementMinutes,
        INTERVAL_INCREMENT_MIN_MINUTES,
        INTERVAL_INCREMENT_MAX_MINUTES,
        DEFAULT_INTERVAL_INCREMENT_MINUTES,
      ),
      shotWindowSeconds: validInt(
        parsed.shotWindowSeconds,
        SHOT_WINDOW_MIN_SECONDS,
        SHOT_WINDOW_MAX_SECONDS,
        DEFAULT_SHOT_WINDOW_SECONDS,
      ),
      eliminationEnabled:
        typeof parsed.eliminationEnabled === 'boolean'
          ? parsed.eliminationEnabled
          : DEFAULT_ELIMINATION_ENABLED,
      graceMode: validGraceMode(parsed.graceMode),
    };
  } catch {
    return FACTORY_PARTY_CREATE_DEFAULTS;
  }
}

export async function setPartyCreateDefaults(defaults: PartyCreateDefaults): Promise<void> {
  await SecureStore.setItemAsync(PARTY_CREATE_DEFAULTS_KEY, JSON.stringify(defaults));
}

/** Clear the stored defaults — Restore defaults on the editor, and Reset this device. */
export async function clearPartyCreateDefaults(): Promise<void> {
  await SecureStore.deleteItemAsync(PARTY_CREATE_DEFAULTS_KEY);
}
