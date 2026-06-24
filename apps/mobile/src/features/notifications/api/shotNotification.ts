// One-time notification setup for the PUSH notifications (Phase 16, D063).
//
// All Shot O'Clock notifications — the window-open alert and the Heads-up — are server
// push now; nothing is scheduled locally anymore (the local scheduler was retired with
// D063). This module only does the startup setup the incoming pushes need: the
// foreground-suppression handler and the Android channel. It also clears any leftover
// locally-scheduled notifications from before the push migration (a one-time cleanup
// for devices upgrading across it).

import { Platform } from 'react-native';

import {
  AndroidImportance,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from '@/features/notifications/api/expoNotifications';

// Identifier prefix of the old locally-scheduled batch — used only to sweep up any
// stragglers left on a device that upgraded past the local-scheduling era.
const SHOT_NOTIFICATION_ID_PREFIX = 'shot-oclock';
// One Android channel for the pushes. The OS default sound is used (D064): sound vs
// vibration is left to the phone's own ring/silent/vibrate mode.
const ANDROID_CHANNEL_ID = 'shot-oclock';

let configured = false;

/**
 * One-time setup: install the foreground-suppression handler and (on Android) the
 * notification channel, and clear any pre-push local stragglers. Safe to call
 * repeatedly — runs once. Call at app startup.
 */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  // Foreground suppression: while the app is open the in-app UI (and the Shot O'Clock
  // screen's own sound + haptic) already cover the moment, so don't also present a
  // banner. Backgrounded/suspended, the OS presents the push normally.
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Android needs a high-importance channel or the push makes no sound and won't pop
  // as a heads-up. No-op on iOS. OS default sound; the phone's mode governs sound vs
  // vibration (D064).
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Shot O'Clock",
      importance: AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    }).catch(() => {});
  }

  // One-time cleanup: cancel any locally-scheduled notifications left over from before
  // the push migration (D063), so a device upgrading across it doesn't fire stale
  // local alerts at now-wrong times. No new local notifications are ever scheduled.
  try {
    const scheduled = await getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => request.identifier.startsWith(SHOT_NOTIFICATION_ID_PREFIX))
        .map((request) => cancelScheduledNotificationAsync(request.identifier).catch(() => {})),
    );
  } catch {
    // No scheduled-notification access (e.g. permission denied) — nothing to clean.
  }
}
