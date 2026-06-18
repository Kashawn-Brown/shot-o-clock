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
  getGlobalNotificationPrefs,
  getSessionOverride,
  resolveEffectivePrefs,
  type AlertMode,
} from '@/features/notifications/api/notificationPreferences';
import {
  shotNotificationSchedule,
  type ShotNotificationScheduleInput,
  type ShotNotificationSlot,
} from '@/features/notifications/shotNotificationSchedule';
import { getServerTimeOffset } from '@/lib/time';

// All our scheduled shot notifications share this identifier prefix (one per round:
// `shot-oclock-r{n}`), so we can cancel exactly our own batch without touching any
// other scheduled notification.
const SHOT_NOTIFICATION_ID_PREFIX = 'shot-oclock';
// Two Android channels — channels are immutable once created, so sound-vs-vibration
// (the per-session alert mode, D062) needs a dedicated silent+vibrate channel rather
// than toggling one channel's sound at schedule time.
const ANDROID_CHANNEL_ID = 'shot-oclock'; // sound + vibration (default alert mode)
const ANDROID_CHANNEL_VIBRATE_ID = 'shot-oclock-vibrate'; // silent, vibration only

function androidChannelFor(alertMode: AlertMode): string {
  return alertMode === 'vibration' ? ANDROID_CHANNEL_VIBRATE_ID : ANDROID_CHANNEL_ID;
}

// How many upcoming rounds to pre-schedule. The further out, the more an estimate can
// drift (host pause / add-time) before the next foreground recompute; 8 covers a long
// backgrounded stretch while staying well under the OS pending-notification cap.
const MAX_SCHEDULED_ROUNDS = 8;

// Monotonic token so a slower in-flight schedule (awaiting the permission read) can't
// land after a newer call has superseded it — e.g. a pause that fired a cancel.
let scheduleGeneration = 0;

let configured = false;

// The last schedule request, cached so a per-session preference change (Surface B,
// D062) can re-reconcile immediately via reapplyShotNotifications — the in-game screen
// that owns scheduling stays mounted underneath and won't re-run on its own. A null
// input means there is no active game to (re)schedule for.
let lastInput: ShotNotificationScheduleInput | null = null;
let lastPartyId: string | undefined;

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
  // won't pop as a heads-up. No-op on iOS. Two channels (immutable once created) back
  // the per-session sound-vs-vibration alert mode (D062): the default plays a sound,
  // the vibrate channel is silent and only vibrates.
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Shot O'Clock",
      importance: AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    }).catch(() => {});
    await setNotificationChannelAsync(ANDROID_CHANNEL_VIBRATE_ID, {
      name: "Shot O'Clock (vibration only)",
      importance: AndroidImportance.MAX,
      // No sound — silent heads-up that still vibrates.
      sound: null,
      vibrationPattern: [0, 250, 250, 250],
    }).catch(() => {});
  }
}

/**
 * Reconcile the scheduled shot notifications with the current session state. Schedules
 * the upcoming rounds' shot windows for an active game; otherwise cancels everything.
 * Idempotent (always clears the prior batch first) and permission-gated.
 */
export async function scheduleShotNotifications(
  input: ShotNotificationScheduleInput | null,
  partyId?: string,
): Promise<void> {
  // Remember the request so reapplyShotNotifications can re-reconcile after a
  // per-session preference change without the owning screen re-running.
  lastInput = input;
  lastPartyId = partyId;

  const generation = (scheduleGeneration += 1);

  // Layer this party's per-session override (D062) over the global defaults, then plan
  // the batch. Only needed when actually scheduling (input present).
  let alertMode: AlertMode = 'sound';
  let preWarningMinutes = 0;
  let slots: ShotNotificationSlot[] = [];
  if (input) {
    const global = await getGlobalNotificationPrefs();
    const override = partyId ? await getSessionOverride(partyId) : null;
    const effective = resolveEffectivePrefs(global, override);
    alertMode = effective.alertMode;
    preWarningMinutes = effective.preWarningMinutes;
    slots = shotNotificationSchedule(
      input,
      getServerTimeOffset(),
      Date.now(),
      MAX_SCHEDULED_ROUNDS,
      preWarningMinutes,
    );
    // The shot-window 'open' alert follows the global Shot O'Clock toggle; pre-warning
    // slots are already gated by preWarningMinutes (0 when the toggle is off => none).
    if (!effective.includeOpen) slots = slots.filter((slot) => slot.kind !== 'open');
  }

  // Clear the prior batch first, so a shrinking schedule (pause, fewer future rounds)
  // never leaves a stale notification behind. This is our OWN cancel — clearScheduledBatch
  // does NOT bump the generation, so it doesn't count as a superseding call against the
  // guard below (that was the bug: the self-cancel always tripped its own guard).
  await clearScheduledBatch();
  if (slots.length === 0) return;

  // Permission-gated (Phase 14): no point scheduling if the OS won't deliver it.
  if ((await getNotificationPermission()) !== 'granted') return;

  // Superseded by a NEWER schedule/cancel while we awaited the reads above (e.g. the
  // host paused, or the screen unmounted) — don't schedule a now-stale batch.
  if (generation !== scheduleGeneration) return;

  const channelId = androidChannelFor(alertMode);
  await Promise.all(
    slots.map((slot) =>
      scheduleNotificationAsync({
        identifier: identifierFor(slot),
        content: contentFor(slot, preWarningMinutes, alertMode),
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: slot.fireAtMs,
          channelId,
        },
      }).catch(() => {}),
    ),
  );
}

/**
 * Re-run the last schedule with the current preferences. Called after a per-session
 * preference change (Surface B / D062) so the new lead time or alert mode takes effect
 * immediately rather than at the next round. No-op when there's no active game.
 */
export async function reapplyShotNotifications(): Promise<void> {
  await scheduleShotNotifications(lastInput, lastPartyId);
}

// Per-round, per-kind identifier. Both kinds share the SHOT_NOTIFICATION_ID_PREFIX so
// clearScheduledBatch cancels them together.
function identifierFor(slot: ShotNotificationSlot): string {
  return slot.kind === 'prewarn'
    ? `${SHOT_NOTIFICATION_ID_PREFIX}-prewarn-r${slot.roundNumber}`
    : `${SHOT_NOTIFICATION_ID_PREFIX}-r${slot.roundNumber}`;
}

function contentFor(slot: ShotNotificationSlot, preWarningMinutes: number, alertMode: AlertMode) {
  // 'vibration' mode omits the sound so the OS delivers a silent (vibrate-only) alert;
  // on Android the channel reinforces this, on iOS omitting sound is the silent path.
  const sound = alertMode === 'sound' ? ('default' as const) : undefined;
  if (slot.kind === 'prewarn') {
    const unit = preWarningMinutes === 1 ? 'minute' : 'minutes';
    return {
      title: 'Shot O’Clock soon',
      body: `Get ready, the next shot is in ${preWarningMinutes} ${unit}.`,
      sound,
    };
  }
  return {
    title: "It's Shot O'Clock! 🥃",
    body: 'Time to take your shot!',
    sound,
  };
}

/**
 * Cancel every pending shot notification (our prefix only). Public entry point for an
 * unmount / leave: bumps the generation so an in-flight schedule is superseded and
 * won't land after us.
 */
export async function cancelShotNotifications(): Promise<void> {
  scheduleGeneration += 1;
  // Forget the cached request so a later reapply (a stray Surface B save) can't
  // resurrect a batch for a game we've left.
  lastInput = null;
  lastPartyId = undefined;
  await clearScheduledBatch();
}

/**
 * Cancel our scheduled batch (prefix-matched) WITHOUT bumping the generation counter.
 * Used both by the public cancel (which bumps separately) and by scheduleShotNotifications
 * for its own pre-clear — so that self-cancel never counts as a superseding call.
 */
async function clearScheduledBatch(): Promise<void> {
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
