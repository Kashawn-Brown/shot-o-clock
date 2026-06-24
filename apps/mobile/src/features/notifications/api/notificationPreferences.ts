// Device-side BACKGROUNDED-NOTIFICATION preferences (Phase 14 stored defaults;
// Phase 15 adds the settings UI + the per-session overrides, D062/D064). The
// foreground in-app ALERT (sound + haptic) is a separate concern — see
// api/alertPreferences.ts. Two layers here:
//
//   GLOBAL (Surface A, app/settings.tsx) — the device-wide defaults: the Shot
//   O'Clock notification master on/off, the Heads-up on/off, and the Heads-up lead
//   time. Each is its own SecureStore key (the existing one-key-per-pref pattern).
//
//   PER-SESSION OVERRIDE (Surface B, app/party/[partyId]/settings.tsx) — overrides
//   the Heads-up on/off + lead time (and the alert fields, see alertPreferences) for
//   the ACTIVE party only, defaulting from global. The notification MASTER is global
//   only (not overridable per-session). Stored as ONE shared key holding a single
//   { partyId, ... } value: SecureStore has no key-listing API, so we can't clean up
//   per-partyId keys; a guest is in at most one party at a time (same invariant
//   leftParty.ts relies on), so we keep exactly one and guard reads by partyId — a
//   stale entry from a party that ended uncleanly is ignored on mismatch and
//   overwritten when the next party sets one. Reset clears the single key.
//
// SecureStore, same pattern as the onboarding `prompted` flag (notificationPermission).

import * as SecureStore from 'expo-secure-store';

const PRE_WARNING_MINUTES_KEY = 'shotoclock.notifications.preWarningMinutes';
const PRE_WARNING_ENABLED_KEY = 'shotoclock.notifications.preWarningEnabled';
const SESSION_OVERRIDE_KEY = 'shotoclock.notifications.sessionOverride';

// How many minutes before the shot window opens the pre-warning fires. A single
// (non-stacked) lead time — 1, 2, or 5 minutes. Phase 15 adds the picker + an on/off.
export const PRE_WARNING_OPTIONS = [1, 2, 5] as const;
export type PreWarningMinutes = (typeof PRE_WARNING_OPTIONS)[number];
const DEFAULT_PRE_WARNING_MINUTES: PreWarningMinutes = 2;

function isValidPreWarning(value: number): value is PreWarningMinutes {
  return (PRE_WARNING_OPTIONS as readonly number[]).includes(value);
}

/** The configured pre-warning lead time (minutes). Defaults to 2; never throws. */
export async function getPreWarningMinutes(): Promise<PreWarningMinutes> {
  try {
    const raw = await SecureStore.getItemAsync(PRE_WARNING_MINUTES_KEY);
    const value = raw != null ? Number(raw) : NaN;
    return isValidPreWarning(value) ? value : DEFAULT_PRE_WARNING_MINUTES;
  } catch {
    return DEFAULT_PRE_WARNING_MINUTES;
  }
}

/** Persist the pre-warning lead time. (Phase 15 settings UI calls this.) */
export async function setPreWarningMinutes(minutes: PreWarningMinutes): Promise<void> {
  await SecureStore.setItemAsync(PRE_WARNING_MINUTES_KEY, String(minutes));
}

/** Clear the stored pre-warning lead time — part of Reset this device (D018). */
export async function clearPreWarningMinutes(): Promise<void> {
  await SecureStore.deleteItemAsync(PRE_WARNING_MINUTES_KEY);
}

// ─── Global Heads-up on/off ───────────────────────────────────────────────────
// Defaults ON (the Phase 14 behaviour: fires unless turned off). The Shot O'Clock
// window-OPEN alert no longer has a toggle — it moved to server push (D063) and is
// always sent to active players.

export async function getBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw == null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

/** Whether the pre-warning alert fires (global default; on unless set off). */
export async function getPreWarningEnabled(): Promise<boolean> {
  return getBool(PRE_WARNING_ENABLED_KEY, true);
}

export async function setPreWarningEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(PRE_WARNING_ENABLED_KEY, String(enabled));
}

export async function clearPreWarningEnabled(): Promise<void> {
  await SecureStore.deleteItemAsync(PRE_WARNING_ENABLED_KEY);
}

/** The global backgrounded-notification preferences, read together. */
export interface GlobalNotificationPrefs {
  preWarningEnabled: boolean; // Heads-up on/off
  preWarningMinutes: PreWarningMinutes; // Heads-up lead time
}

export async function getGlobalNotificationPrefs(): Promise<GlobalNotificationPrefs> {
  const [preWarningEnabled, preWarningMinutes] = await Promise.all([
    getPreWarningEnabled(),
    getPreWarningMinutes(),
  ]);
  return { preWarningEnabled, preWarningMinutes };
}

// ─── Per-session override (D062/D064) ───────────────────────────────────────
// The overridable per-session fields. Absent field = fall back to global. Covers
// the Heads-up on/off + lead time here, plus the foreground alert fields layered in
// by api/alertPreferences.ts (alertSoundEnabled / alertHapticEnabled / shotOclockSound)
// — all share this one stored blob. The notification master is NOT here (global only).
export interface SessionOverride {
  preWarningEnabled?: boolean; // Heads-up on/off
  leadMinutes?: PreWarningMinutes; // Heads-up lead time
  // Foreground alert overrides (validated/consumed in api/alertPreferences.ts):
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
 * stored, or the stored one belongs to a different party — a guest is in at most
 * one party at a time, so a mismatch means it's stale and is ignored). Invalid
 * fields are dropped so a corrupt value can't poison scheduling. The alert fields
 * are sanitized by alertPreferences (which owns their validity); here we pass them
 * through and validate only the notification fields.
 */
export async function getSessionOverride(partyId: string): Promise<SessionOverride | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_OVERRIDE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as StoredSessionOverride;
    if (parsed.partyId !== partyId) return null;
    const override: SessionOverride = {};
    if (typeof parsed.preWarningEnabled === 'boolean')
      override.preWarningEnabled = parsed.preWarningEnabled;
    if (isValidPreWarning(Number(parsed.leadMinutes))) override.leadMinutes = parsed.leadMinutes;
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

// ─── Effective resolution (pure) ────────────────────────────────────────────

/** The scheduling-ready prefs after layering a per-session override over global. */
export interface EffectiveNotificationPrefs {
  // Effective Heads-up lead time in minutes; 0 means no Heads-up (toggle off).
  preWarningMinutes: number;
}

/**
 * Layer a per-session override over the global defaults. Pure (unit-tested): the
 * Heads-up fires when the effective on/off (override else global) is on, at the
 * effective lead time (override else global). (The window-open alert is server push
 * now and has no client toggle — D063.)
 */
export function resolveEffectivePrefs(
  global: GlobalNotificationPrefs,
  override: SessionOverride | null,
): EffectiveNotificationPrefs {
  const headsUpEnabled = override?.preWarningEnabled ?? global.preWarningEnabled;
  const lead = override?.leadMinutes ?? global.preWarningMinutes;
  return {
    preWarningMinutes: headsUpEnabled ? lead : 0,
  };
}
