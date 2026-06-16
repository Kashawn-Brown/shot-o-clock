// Keeps the Shot O'Clock local notification in sync with the live session. Mounted
// inside useTimerSession, so every in-game screen (timer / shot-oclock / results)
// drives it — the next round's countdown is already running on the results screen, so
// scheduling there closes the gap before the timer screen remounts.

import { useEffect } from 'react';

import {
  cancelShotNotification,
  scheduleShotNotification,
} from '@/features/notifications/api/shotNotification';
import type { Database } from '@/types/db.generated';

type SessionRow = Database['public']['Tables']['party_sessions']['Row'];

export function useShotNotification(session: SessionRow | null): void {
  const phase = session?.current_phase ?? null;
  const phaseEndsAt = session?.phase_ends_at ?? null;
  const status = session?.status ?? null;

  // Re-reconcile whenever the phase, deadline, or run-status changes.
  // scheduleShotNotification self-cancels when the state isn't an active countdown,
  // so pause, add-time, window-open, and end-party all resolve through this one call.
  useEffect(() => {
    void scheduleShotNotification({
      current_phase: phase,
      phase_ends_at: phaseEndsAt,
      status,
    });
  }, [phase, phaseEndsAt, status]);

  // Cancel when the in-game screen unmounts — covers a guest leaving, a removed
  // player, and navigating to the summary, none of which show up in `session` here.
  // Backgrounding does NOT unmount, so a legitimately-pending notification survives it.
  useEffect(() => {
    return () => {
      void cancelShotNotification();
    };
  }, []);
}
