// Shot O'Clock local notifications — scheduling, cancellation, and one-time setup.
//
// Phase 14: the shot window opens at the session's phase_ends_at. While a device is
// in a game we hand the OS local notifications scheduled for the upcoming shot
// windows, so they fire even when our JS is suspended (backgrounded / locked) — where
// a JS timer can't reach. The client never owns the timer (CLAUDE.md §2.1): this only
// mirrors the server's deterministic round loop into OS alarms and tears them down on
// any change. We schedule a BATCH (the current round plus the next several) because a
// fully-suspended app never wakes to reschedule per round — see shotNotificationSchedule.

import { Platform } from 'react-native';

// Submodule imports (not the 'expo-notifications' barrel) so the push-token
// auto-registration side effect never loads — see api/expoNotifications.ts.
import {
  AndroidImportance,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
  setNotificationHandler,
} from '@/features/notifications/api/expoNotifications';
import { getNotificationPermission } from '@/features/notifications/api/notificationPermission';
import {
  shotNotificationSchedule,
  type ShotNotificationScheduleInput,
} from '@/features/notifications/shotNotificationSchedule';
import { getServerTimeOffset } from '@/lib/time';

// All our scheduled shot notifications share this identifier prefix (one per round:
// `shot-oclock-r{n}`), so we can cancel exactly our own batch without touching any
// other scheduled notification.
const SHOT_NOTIFICATION_ID_PREFIX = 'shot-oclock';
const ANDROID_CHANNEL_ID = 'shot-oclock';

// How many upcoming rounds to pre-schedule. The further out, the more an estimate can
// drift (host pause / add-time) before the next foreground recompute; 8 covers a long
// backgrounded stretch while staying well under the OS pending-notification cap.
const MAX_SCHEDULED_ROUNDS = 8;

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
 * Reconcile the scheduled shot notifications with the current session state. Schedules
 * the upcoming rounds' shot windows for an active game; otherwise cancels everything.
 * Idempotent (always cancels the prior batch first) and permission-gated.
 */
export async function scheduleShotNotifications(
  input: ShotNotificationScheduleInput | null,
): Promise<void> {
  const generation = (scheduleGeneration += 1);

  const slots = input
    ? shotNotificationSchedule(input, getServerTimeOffset(), Date.now(), MAX_SCHEDULED_ROUNDS)
    : [];

  // Always clear the prior batch first, so a shrinking schedule (pause, fewer future
  // rounds) never leaves a stale notification behind.
  await cancelShotNotifications();
  if (slots.length === 0) return;

  // Permission-gated (Phase 14): no point scheduling if the OS won't deliver it. The
  // device-side preference toggle (shotOclockEnabled) drops in here in the prefs task.
  if ((await getNotificationPermission()) !== 'granted') return;

  // Superseded while we awaited the permission read (e.g. the host paused) — don't
  // schedule a now-stale batch (cancelShotNotifications bumped the generation too).
  if (generation !== scheduleGeneration) return;

  await Promise.all(
    slots.map((slot) =>
      scheduleNotificationAsync({
        identifier: `${SHOT_NOTIFICATION_ID_PREFIX}-r${slot.roundNumber}`,
        content: {
          title: "Shot O'Clock! 🥃",
          body: 'Time to take your shot.',
          sound: 'default',
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: slot.fireAtMs,
          channelId: ANDROID_CHANNEL_ID,
        },
      }).catch(() => {}),
    ),
  );
}

/** Cancel every pending shot notification (our prefix only). Safe when none exist. */
export async function cancelShotNotifications(): Promise<void> {
  // Bump the generation so an in-flight schedule that resumes after this cancel is
  // recognized as superseded.
  scheduleGeneration += 1;
  try {
    const scheduled = await getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => request.identifier.startsWith(SHOT_NOTIFICATION_ID_PREFIX))
        .map((request) => cancelScheduledNotificationAsync(request.identifier).catch(() => {})),
    );
  } catch {
    // No scheduled-notification access (e.g. permission denied) — nothing to cancel.
  }
}
