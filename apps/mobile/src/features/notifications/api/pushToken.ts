// Obtains this device's Expo push token — the address the server-side push send
// path (Phase 16, #009 / D063) uses to reach the device when it is backgrounded
// or locked. This module only ACQUIRES the token; storing it server-side is a
// separate concern (the upsert RPC, next task).
//
// Requires a real build with native push support — Expo push tokens cannot be
// obtained in Expo Go on Android (removed in SDK 53), which is why this work
// waited for the Phase 16 EAS dev build. It must also run on a physical device;
// emulators have no push service, so getExpoPushTokenAsync rejects there.

import Constants from 'expo-constants';

import { getExpoPushTokenAsync } from '@/features/notifications/api/expoNotifications';
import { getNotificationPermission } from '@/features/notifications/api/notificationPermission';

/**
 * EAS project id, the credential getExpoPushTokenAsync needs to mint a token. It
 * can infer this from the manifest, but we pass it explicitly so a config-shape
 * change fails loudly here rather than deep in the library.
 */
function getProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  );
}

/**
 * Acquire the device's Expo push token, or null if it can't be obtained.
 *
 * Returns null (not throws) for the expected non-fatal cases — permission not
 * granted, running on an emulator, transient network failure reaching Expo's
 * token service — so callers can treat "no token yet" as a normal state and
 * retry later. The token is only needed for background delivery; the in-app UI
 * and foreground alerts work without it.
 */
export async function getPushToken(): Promise<string | null> {
  // Never prompt here — the OS permission dialog is owned by the onboarding
  // priming gate. Without permission a token is useless, so skip the request.
  const permission = await getNotificationPermission();
  if (permission !== 'granted') {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.error('Cannot get push token: no EAS projectId in app config');
    return null;
  }

  try {
    const { data } = await getExpoPushTokenAsync({ projectId });
    return data;
  } catch (error) {
    // Emulator (no push service) or a network failure reaching Expo. Log with
    // context; the caller retries on a later foreground.
    console.error('Failed to obtain Expo push token', error);
    return null;
  }
}
