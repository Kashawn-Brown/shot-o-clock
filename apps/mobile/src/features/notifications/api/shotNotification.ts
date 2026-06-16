// Shot O'Clock local notification — scheduling, cancellation, and one-time setup.
//
// Phase 14: the shot window opens at the session's phase_ends_at. While a device is
// in an active countdown we hand the OS a local notification scheduled for that
// instant, so it fires even when our JS is suspended (backgrounded / locked) — where
// a JS timer can't reach. The client never owns the timer (CLAUDE.md §2.1): this only
// mirrors the server's phase_ends_at into an OS alarm and tears it down on any change.

import { Platform } from 'react-native';

// Submodule imports (not the 'expo-notifications' barrel) so the push-token
// auto-registration side effect never loads — see api/expoNotifications.ts.
import {
  AndroidImportance,
  cancelScheduledNotificationAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
  setNotificationHandler,
} from '@/features/notifications/api/expoNotifications';
import { getNotificationPermission } from '@/features/notifications/api/notificationPermission';
import {
  shotNotificationTrigger,
  type ShotNotificationSession,
} from '@/features/notifications/shotNotificationTrigger';
import { getServerTimeOffset } from '@/lib/time';

// Stable identifier — one active game per device, so re-scheduling with the same id
// replaces any pending shot notification instead of stacking duplicates.
const SHOT_NOTIFICATION_ID = 'shot-oclock';
const ANDROID_CHANNEL_ID = 'shot-oclock';

// Monotonic token so a slower in-flight schedule (awaiting the permission read) can't
// land after a newer call has superseded it — e.g. a pause that fired a cancel.
let scheduleGeneration = 0;

let configured = false;

/**
 * One-time setup: install the foreground-suppression handler and (on Android) the
 * notification channel. Safe to call repeatedly — runs once. Call at app startup.
 */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  // Foreground suppression: the Shot O'Clock screen already plays the Phase 13 sound
  // + haptic, so presenting a banner over it would double the alert. The handler runs
  // only while the app is in the foreground; when it's backgrounded/suspended the OS
  // presents the scheduled notification normally (banner + sound).
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Android needs a high-importance channel or the notification makes no sound and
  // won't pop as a heads-up. No-op on iOS.
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Shot O'Clock",
      importance: AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    }).catch(() => {});
  }
}

/**
 * Reconcile the scheduled shot notification with the current session state. Schedules
 * for an active countdown with a future deadline; otherwise cancels. Idempotent and
 * permission-gated — a no-op when the OS permission isn't granted.
 */
export async function scheduleShotNotification(
  session: ShotNotificationSession | null,
): Promise<void> {
  const generation = (scheduleGeneration += 1);

  const decision = shotNotificationTrigger(session, getServerTimeOffset(), Date.now());
  if (!decision.schedule || decision.fireAtMs == null) {
    await cancelShotNotification();
    return;
  }

  // Permission-gated (Phase 14): no point scheduling if the OS won't deliver it. The
  // device-side preference toggle (shotOclockEnabled) drops in here in the prefs task.
  if ((await getNotificationPermission()) !== 'granted') return;

  // Superseded while we awaited the permission read (e.g. the host paused) — don't
  // schedule a now-stale notification.
  if (generation !== scheduleGeneration) return;

  await scheduleNotificationAsync({
    identifier: SHOT_NOTIFICATION_ID,
    content: {
      title: "Shot O'Clock! 🥃",
      body: 'Time to take your shot.',
      sound: 'default',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: decision.fireAtMs,
      channelId: ANDROID_CHANNEL_ID,
    },
  }).catch(() => {});
}

/** Cancel any pending shot notification. Safe when none is scheduled. */
export async function cancelShotNotification(): Promise<void> {
  // Bump the generation so an in-flight schedule that resumes after this cancel
  // is recognized as superseded.
  scheduleGeneration += 1;
  await cancelScheduledNotificationAsync(SHOT_NOTIFICATION_ID).catch(() => {});
}
