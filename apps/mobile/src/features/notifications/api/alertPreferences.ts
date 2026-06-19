// Device-side FOREGROUND ALERT preferences (D064) — the in-app Shot O'Clock moment,
// fully app-controlled (expo-audio + expo-haptics on the Shot O'Clock screen), no OS
// involvement. Distinct from the backgrounded NOTIFICATION prefs (notificationPreferences).
//
// Three prefs, each a global default plus a per-session override (the override shares
// the single sessionOverride blob in notificationPreferences — D062):
//   - Alert sound on/off — default OFF (reverses the Phase 13 sound+haptic default)
//   - Alert haptic on/off — default ON
//   - Shot O'Clock sound — which sound file the Alert plays (a ShotSoundId)
//
// The sound-file choice applies ONLY to this foreground Alert; the backgrounded
// notification always uses the OS default sound.

import * as SecureStore from 'expo-secure-store';

import {
  getBool,
  getSessionOverride,
  type SessionOverride,
} from '@/features/notifications/api/notificationPreferences';
import {
  DEFAULT_SHOT_SOUND_ID,
  isShotSoundId,
  type ShotSoundId,
} from '@/features/notifications/api/shotSounds';

const ALERT_SOUND_ENABLED_KEY = 'shotoclock.alert.soundEnabled';
const ALERT_HAPTIC_ENABLED_KEY = 'shotoclock.alert.hapticEnabled';
const ALERT_SOUND_KEY = 'shotoclock.alert.sound';

// ─── Global getters/setters/clears ──────────────────────────────────────────

/** Alert sound on/off (global default; OFF unless set on — D064). */
export async function getAlertSoundEnabled(): Promise<boolean> {
  return getBool(ALERT_SOUND_ENABLED_KEY, false);
}

export async function setAlertSoundEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ALERT_SOUND_ENABLED_KEY, String(enabled));
}

export async function clearAlertSoundEnabled(): Promise<void> {
  await SecureStore.deleteItemAsync(ALERT_SOUND_ENABLED_KEY);
}

/** Alert haptic on/off (global default; ON unless set off — D064). */
export async function getAlertHapticEnabled(): Promise<boolean> {
  return getBool(ALERT_HAPTIC_ENABLED_KEY, true);
}

export async function setAlertHapticEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ALERT_HAPTIC_ENABLED_KEY, String(enabled));
}

export async function clearAlertHapticEnabled(): Promise<void> {
  await SecureStore.deleteItemAsync(ALERT_HAPTIC_ENABLED_KEY);
}

/** Which sound the in-app Alert plays (global default). */
export async function getShotOclockSound(): Promise<ShotSoundId> {
  try {
    const raw = await SecureStore.getItemAsync(ALERT_SOUND_KEY);
    return isShotSoundId(raw) ? raw : DEFAULT_SHOT_SOUND_ID;
  } catch {
    return DEFAULT_SHOT_SOUND_ID;
  }
}

export async function setShotOclockSound(id: ShotSoundId): Promise<void> {
  await SecureStore.setItemAsync(ALERT_SOUND_KEY, id);
}

export async function clearShotOclockSound(): Promise<void> {
  await SecureStore.deleteItemAsync(ALERT_SOUND_KEY);
}

// ─── Combined read + effective resolution ───────────────────────────────────

export interface GlobalAlertPrefs {
  soundEnabled: boolean;
  hapticEnabled: boolean;
  soundChoice: ShotSoundId;
}

export async function getGlobalAlertPrefs(): Promise<GlobalAlertPrefs> {
  const [soundEnabled, hapticEnabled, soundChoice] = await Promise.all([
    getAlertSoundEnabled(),
    getAlertHapticEnabled(),
    getShotOclockSound(),
  ]);
  return { soundEnabled, hapticEnabled, soundChoice };
}

/** The alert prefs after layering a per-session override over the global defaults. */
export type EffectiveAlertPrefs = GlobalAlertPrefs;

/**
 * Layer a per-session override over the global alert defaults. Pure (unit-tested):
 * each field takes the override when present else global; an invalid stored sound id
 * falls back to the global choice.
 */
export function resolveAlertPrefs(
  global: GlobalAlertPrefs,
  override: SessionOverride | null,
): EffectiveAlertPrefs {
  return {
    soundEnabled: override?.alertSoundEnabled ?? global.soundEnabled,
    hapticEnabled: override?.alertHapticEnabled ?? global.hapticEnabled,
    soundChoice: isShotSoundId(override?.shotOclockSound)
      ? override.shotOclockSound
      : global.soundChoice,
  };
}

/** Effective alert prefs for a party — global layered with its per-session override. */
export async function getEffectiveAlertPrefs(
  partyId: string | undefined,
): Promise<EffectiveAlertPrefs> {
  const global = await getGlobalAlertPrefs();
  const override = partyId ? await getSessionOverride(partyId) : null;
  return resolveAlertPrefs(global, override);
}
