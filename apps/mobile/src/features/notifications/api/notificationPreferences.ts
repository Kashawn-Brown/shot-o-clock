// Device-side notification preferences (Phase 14 stored defaults; Phase 15 adds the
// settings UI + the per-session overrides, D062). Two layers:
//
//   GLOBAL (Surface A, app/settings.tsx) — the device-wide defaults: the Shot
//   O'Clock alert on/off, the pre-warning on/off, and the pre-warning lead time.
//   Each is its own SecureStore key (the existing one-key-per-pref pattern).
//
//   PER-SESSION OVERRIDE (Surface B, app/party/[partyId]/settings.tsx) — overrides
//   the lead time and the sound-vs-vibration alert mode for the ACTIVE party only,
//   defaulting from global. Stored as ONE key holding a single { partyId, ... }
//   value: SecureStore has no key-listing API, so we can't clean up per-partyId
//   keys; a guest is in at most one party at a time (same invariant leftParty.ts
//   relies on), so we keep exactly one and guard reads by partyId — a stale entry
//   from a party that ended uncleanly is ignored on mismatch and overwritten when
//   the next party sets one. Reset clears the single key.
//
// SecureStore, same pattern as the onboarding `prompted` flag (notificationPermission).

import * as SecureStore from 'expo-secure-store';

const PRE_WARNING_MINUTES_KEY = 'shotoclock.notifications.preWarningMinutes';
const SHOT_OCLOCK_ENABLED_KEY = 'shotoclock.notifications.shotOclockEnabled';
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

// ─── Global on/off toggles ──────────────────────────────────────────────────
// Both default ON (the Phase 14 behaviour: alerts fire unless turned off).

async function getBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw == null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

/** Whether the Shot O'Clock window-open alert fires (global default; on unless set off). */
export async function getShotOclockEnabled(): Promise<boolean> {
  return getBool(SHOT_OCLOCK_ENABLED_KEY, true);
}

export async function setShotOclockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(SHOT_OCLOCK_ENABLED_KEY, String(enabled));
}

export async function clearShotOclockEnabled(): Promise<void> {
  await SecureStore.deleteItemAsync(SHOT_OCLOCK_ENABLED_KEY);
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

/** All three global notification preferences, read together. */
export interface GlobalNotificationPrefs {
  shotOclockEnabled: boolean;
  preWarningEnabled: boolean;
  preWarningMinutes: PreWarningMinutes;
}

export async function getGlobalNotificationPrefs(): Promise<GlobalNotificationPrefs> {
  const [shotOclockEnabled, preWarningEnabled, preWarningMinutes] = await Promise.all([
    getShotOclockEnabled(),
    getPreWarningEnabled(),
    getPreWarningMinutes(),
  ]);
  return { shotOclockEnabled, preWarningEnabled, preWarningMinutes };
}

// ─── Per-session override (D062) ────────────────────────────────────────────
// How a backgrounded notification alerts: 'sound' (default) plays a sound; 'vibration'
// is silent and vibrates (a dedicated Android channel; see api/shotNotification.ts).
export const ALERT_MODES = ['sound', 'vibration'] as const;
export type AlertMode = (typeof ALERT_MODES)[number];

function isAlertMode(value: unknown): value is AlertMode {
  return typeof value === 'string' && (ALERT_MODES as readonly string[]).includes(value);
}

/** The overridable per-session fields. Absent field = fall back to global. */
export interface SessionOverride {
  leadMinutes?: PreWarningMinutes;
  alertMode?: AlertMode;
}

// Stored shape: the override tagged with the party it belongs to.
interface StoredSessionOverride extends SessionOverride {
  partyId: string;
}

/**
 * The per-session override for `partyId`, or null if none applies (no override
 * stored, or the stored one belongs to a different party — a guest is in at most
 * one party at a time, so a mismatch means it's stale and is ignored). Invalid
 * fields are dropped so a corrupt value can't poison scheduling.
 */
export async function getSessionOverride(partyId: string): Promise<SessionOverride | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_OVERRIDE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as StoredSessionOverride;
    if (parsed.partyId !== partyId) return null;
    const override: SessionOverride = {};
    if (isValidPreWarning(Number(parsed.leadMinutes))) override.leadMinutes = parsed.leadMinutes;
    if (isAlertMode(parsed.alertMode)) override.alertMode = parsed.alertMode;
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
  // Whether to schedule the shot-window 'open' alert at all (global toggle).
  includeOpen: boolean;
  // Effective pre-warning lead time in minutes; 0 means no pre-warning (toggle off).
  preWarningMinutes: number;
  alertMode: AlertMode;
}

/**
 * Layer a per-session override over the global defaults. Pure (unit-tested): the
 * lead time comes from the override when set else global, but only when the global
 * pre-warning toggle is on; the alert mode comes from the override else 'sound';
 * the shot-window 'open' alert follows the global toggle.
 */
export function resolveEffectivePrefs(
  global: GlobalNotificationPrefs,
  override: SessionOverride | null,
): EffectiveNotificationPrefs {
  const lead = override?.leadMinutes ?? global.preWarningMinutes;
  return {
    includeOpen: global.shotOclockEnabled,
    preWarningMinutes: global.preWarningEnabled ? lead : 0,
    alertMode: override?.alertMode ?? 'sound',
  };
}
