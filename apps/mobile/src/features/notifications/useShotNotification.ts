// Keeps the Shot O'Clock local notifications in sync with the live session. Mounted
// inside useTimerSession, so every in-game screen (timer / shot-oclock / results)
// drives it. Schedules a BATCH — the current round plus the next several — because a
// fully-suspended app never wakes to reschedule per round (see shotNotificationSchedule).

import { useEffect } from 'react';

import {
  cancelShotNotifications,
  scheduleShotNotifications,
} from '@/features/notifications/api/shotNotification';
import type { Database } from '@/types/db.generated';

type SessionRow = Database['public']['Tables']['party_sessions']['Row'];
type SettingsRow = Database['public']['Tables']['party_settings']['Row'];
type RoundRow = Database['public']['Tables']['rounds']['Row'];

export function useShotNotification(
  session: SessionRow | null,
  settings: SettingsRow | null,
  currentRound: RoundRow | null,
  partyId: string | undefined,
): void {
  const phase = session?.current_phase ?? null;
  const phaseEndsAt = session?.phase_ends_at ?? null;
  const status = session?.status ?? null;
  const shotWindowSeconds = settings?.shot_window_seconds ?? null;
  const intervalIncrementSeconds = settings?.interval_increment_seconds ?? null;
  const maxIntervalSeconds = settings?.max_interval_seconds ?? null;
  const currentRoundNumber = currentRound?.round_number ?? null;
  const currentRoundIntervalSeconds = currentRound?.interval_seconds ?? null;

  // Re-reconcile whenever any input to the schedule changes (a new round changes
  // phase_ends_at + the round fields; pause/end changes status). Re-derives and
  // replaces the whole batch, correcting any drift since the last schedule.
  useEffect(() => {
    if (
      shotWindowSeconds == null ||
      intervalIncrementSeconds == null ||
      currentRoundNumber == null ||
      currentRoundIntervalSeconds == null
    ) {
      void scheduleShotNotifications(null, partyId);
      return;
    }
    void scheduleShotNotifications(
      {
        session: { current_phase: phase, phase_ends_at: phaseEndsAt, status },
        shotWindowSeconds,
        intervalIncrementSeconds,
        maxIntervalSeconds,
        currentRoundNumber,
        currentRoundIntervalSeconds,
      },
      partyId,
    );
  }, [
    phase,
    phaseEndsAt,
    status,
    shotWindowSeconds,
    intervalIncrementSeconds,
    maxIntervalSeconds,
    currentRoundNumber,
    currentRoundIntervalSeconds,
    partyId,
  ]);

  // Cancel when the in-game screen unmounts — covers a guest leaving, a removed
  // player, and navigating to the summary, none of which show up in the inputs here.
  // Backgrounding does NOT unmount, so the scheduled batch survives it.
  useEffect(() => {
    return () => {
      void cancelShotNotifications();
    };
  }, []);
}
