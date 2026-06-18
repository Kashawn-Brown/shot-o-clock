// Device-side notification preferences. Phase 14 stores defaults and respects them;
// the settings UI to change them is Phase 15. This is the home for the broader
// per-event preference matrix later — for now it holds only the Shot O'Clock
// pre-warning lead time.
//
// SecureStore, same pattern as the onboarding `prompted` flag (notificationPermission).

import * as SecureStore from 'expo-secure-store';

const PRE_WARNING_MINUTES_KEY = 'shotoclock.notifications.preWarningMinutes';

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
