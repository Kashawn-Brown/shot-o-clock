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
// One Android channel. The backgrounded notification always uses the OS default sound
// (D064): sound-vs-vibration is left to the phone's own ring/silent/vibrate mode, not
// the app — so there is no dedicated vibrate channel.
const ANDROID_CHANNEL_ID = 'shot-oclock';

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

// Heads-up fires AT MOST ONCE per round (design decision). The recompute is otherwise
// stateless — it re-derives eligibility from current remaining-time math each run — so
// if a host adds time AFTER a round's Heads-up already fired and the countdown
// re-crosses the lead threshold, a naive recompute would schedule a second one. We
// remember the instant we last planned each round's pre-warning for; once that instant
// has passed we treat the Heads-up as fired for that round and never reschedule it
// (an add-time before it fires just updates the planned instant — still one fire).
// Scoped to the current party; reset on party change / cancel. NOTE: in-memory only,
// so a kill-and-relaunch mid-round loses the record — an accepted edge that the move
// to server push (D063) eliminates entirely.
let prewarnPlannedByRound = new Map<number, number>();
let prewarnGuardPartyId: string | undefined;

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
  // won't pop as a heads-up. No-op on iOS. One channel using the OS default sound;
  // the phone's ring/silent/vibrate mode governs sound-vs-vibration (D064).
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

  // New party → forget the prior party's once-per-round Heads-up record.
  if (partyId !== prewarnGuardPartyId) {
    prewarnPlannedByRound = new Map();
    prewarnGuardPartyId = partyId;
  }

  const generation = (scheduleGeneration += 1);

  // Layer this party's per-session override (D062) over the global defaults, then plan
  // the batch. Only needed when actually scheduling (input present).
  let preWarningMinutes = 0;
  let slots: ShotNotificationSlot[] = [];
  if (input) {
    const nowMs = Date.now();
    const global = await getGlobalNotificationPrefs();
    const override = partyId ? await getSessionOverride(partyId) : null;
    const effective = resolveEffectivePrefs(global, override);
    preWarningMinutes = effective.preWarningMinutes;
    slots = shotNotificationSchedule(
      input,
      getServerTimeOffset(),
      nowMs,
      MAX_SCHEDULED_ROUNDS,
      preWarningMinutes,
    );
    // The shot-window 'open' notification follows the global master; Heads-up slots are
    // already gated by preWarningMinutes (0 when off => none) and the per-round
    // lead<interval rule in the planner.
    if (!effective.includeOpen) slots = slots.filter((slot) => slot.kind !== 'open');

    // Once-per-round Heads-up guard: drop a pre-warning for a round whose Heads-up
    // already fired (its last-planned instant has passed), and record the planned
    // instant for the rest so a later add-time recompute can recognize it. See
    // prewarnPlannedByRound. Only the prewarn kind is governed; opens are unaffected.
    slots = slots.filter((slot) => {
      if (slot.kind !== 'prewarn') return true;
      const planned = prewarnPlannedByRound.get(slot.roundNumber);
      if (planned !== undefined && nowMs >= planned) return false; // already fired this round
      prewarnPlannedByRound.set(slot.roundNumber, slot.fireAtMs);
      return true;
    });
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

  await Promise.all(
    slots.map((slot) =>
      scheduleNotificationAsync({
        identifier: identifierFor(slot),
        content: contentFor(slot, preWarningMinutes),
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: slot.fireAtMs,
          channelId: ANDROID_CHANNEL_ID,
        },
      }).catch(() => {}),
    ),
  );
}

/**
 * Re-run the last schedule with the current preferences. Called after a per-session
 * preference change (Surface B / D062) so the new Heads-up on/off or lead time takes
 * effect immediately rather than at the next round. No-op when there's no active game.
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

function contentFor(slot: ShotNotificationSlot, preWarningMinutes: number) {
  // The backgrounded notification always uses the OS default sound (D064); the phone's
  // ring/silent/vibrate mode decides whether that plays a sound or vibrates.
  if (slot.kind === 'prewarn') {
    const unit = preWarningMinutes === 1 ? 'minute' : 'minutes';
    return {
      title: 'Shot O’Clock soon',
      body: `Get ready, the next shot is in ${preWarningMinutes} ${unit}.`,
      sound: 'default' as const,
    };
  }
  return {
    title: "It's Shot O'Clock! 🥃",
    body: 'Time to take your shot!',
    sound: 'default' as const,
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
  // Forget the once-per-round Heads-up record — a fresh game starts clean.
  prewarnPlannedByRound = new Map();
  prewarnGuardPartyId = undefined;
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
