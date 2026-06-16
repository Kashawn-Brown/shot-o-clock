// OS-level notification permission, plus a device-side record of whether we've
// already shown the onboarding priming screen.
//
// Phase 14 delivers Shot O'Clock alerts as LOCAL scheduled notifications (we mirror
// the server-authoritative phase_ends_at into a local alarm — the timer is never
// client-owned; see CLAUDE.md §2.1). Local delivery still needs the OS notification
// permission, which is what this module requests and reports.
//
// iOS shows the system permission dialog only once, so onboarding shows our own
// priming screen first and only fires the OS prompt when the user opts in. The
// `prompted` flag below records that the priming screen has been shown so it doesn't
// reappear on later launches — it is NOT the grant/deny answer (that lives with the
// OS and is read via getNotificationPermission). The per-player preference rows
// (party_player_notification_settings) and the preference UI are Phase 15.

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const PROMPTED_KEY = 'shotoclock.notifications.prompted';

/** Cross-platform permission state, normalized to a simple tri-state. */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

function normalize(status: Notifications.PermissionStatus): NotificationPermission {
  switch (status) {
    case Notifications.PermissionStatus.GRANTED:
      return 'granted';
    case Notifications.PermissionStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

/** Whether the onboarding priming screen has already been shown on this device. */
export async function hasPromptedForNotifications(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(PROMPTED_KEY);
  return value === 'true';
}

/** Record that the onboarding priming screen has been shown (grant or skip). */
export async function recordNotificationsPrompted(): Promise<void> {
  await SecureStore.setItemAsync(PROMPTED_KEY, 'true');
}

/** Current OS-level permission without prompting. */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return normalize(status);
}

/**
 * Trigger the OS permission dialog and return the resulting permission. iOS allows
 * this dialog only once per install — call it from a deliberate user action (the
 * priming screen's "Enable" button), never silently on launch.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const { status } = await Notifications.requestPermissionsAsync();
  return normalize(status);
}
