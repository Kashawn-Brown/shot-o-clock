// Device-side per-session notification override (Surface B, D062/D064) + a shared
// boolean helper. The foreground in-app ALERT fields (sound + haptic + sound file) are
// owned by api/alertPreferences.ts but stored in the ONE shared per-session blob here.
//
// As of Phase 16 (D063) the Heads-up is a host-controlled, party-wide server setting
// (party_settings, via host_set_heads_up) and the window-open alert is unconditional
// server push — so there are no per-device Heads-up / master preferences anymore. What
// remains device-side is the per-session ALERT override.
//
// The override is stored as ONE shared key holding a single { partyId, ... } value:
// SecureStore has no key-listing API, so we can't clean up per-partyId keys; a guest is
// in at most one party at a time (the invariant leftParty.ts relies on), so we keep
// exactly one and guard reads by partyId — a stale entry from a party that ended
// uncleanly is ignored on mismatch and overwritten when the next party sets one. Reset
// clears the single key.

import * as SecureStore from 'expo-secure-store';

const SESSION_OVERRIDE_KEY = 'shotoclock.notifications.sessionOverride';

/** Read a stored boolean with a fallback; never throws. Shared by alertPreferences. */
export async function getBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw == null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

// ─── Per-session override (D062/D064) ───────────────────────────────────────
// The overridable per-session ALERT fields (foreground sound + haptic + sound file),
// validated/consumed in api/alertPreferences.ts; absent field = fall back to global.
// All share this one stored blob. (Heads-up is no longer here — it's a party setting.)
export interface SessionOverride {
  alertSoundEnabled?: boolean;
  alertHapticEnabled?: boolean;
  shotOclockSound?: string; // a ShotSoundId (validated in alertPreferences)
}

// Stored shape: the override tagged with the party it belongs to.
interface StoredSessionOverride extends SessionOverride {
  partyId: string;
}

/**
 * The per-session override for `partyId`, or null if none applies (no override
 * stored, or the stored one belongs to a different party — a guest is in at most one
 * party at a time, so a mismatch means it's stale and is ignored). The alert fields
 * are sanitized by alertPreferences (which owns their validity); here we pass them
 * through.
 */
export async function getSessionOverride(partyId: string): Promise<SessionOverride | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_OVERRIDE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as StoredSessionOverride;
    if (parsed.partyId !== partyId) return null;
    const override: SessionOverride = {};
    if (typeof parsed.alertSoundEnabled === 'boolean')
      override.alertSoundEnabled = parsed.alertSoundEnabled;
    if (typeof parsed.alertHapticEnabled === 'boolean')
      override.alertHapticEnabled = parsed.alertHapticEnabled;
    if (typeof parsed.shotOclockSound === 'string') override.shotOclockSound = parsed.shotOclockSound;
    return override;
  } catch {
    return null;
  }
}

/**
 * Merge a patch into this party's override (a mismatched stored party is replaced,
 * not merged). Persists the single tagged value.
 */
export async function setSessionOverride(partyId: string, patch: SessionOverride): Promise<void> {
  const current = (await getSessionOverride(partyId)) ?? {};
  const next: StoredSessionOverride = { partyId, ...current, ...patch };
  await SecureStore.setItemAsync(SESSION_OVERRIDE_KEY, JSON.stringify(next));
}

/** Clear the per-session override — on party end and as part of Reset this device. */
export async function clearSessionOverride(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_OVERRIDE_KEY);
}
