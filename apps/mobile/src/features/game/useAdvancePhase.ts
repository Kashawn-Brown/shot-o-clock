// Drives the server-authoritative phase transition by polling advance_phase_if_due.
//
// The client never advances the phase itself (CLAUDE.md §2.1). It only asks the
// server "is the timer due?" on a cadence once its own skew-corrected clock has
// passed phase_ends_at. The server performs the single real transition — the
// first caller past phase_ends_at wins; every other device gets
// transitioned=false (rpc-contracts.md §8.7 trigger 2).
//
// Because the losing-race devices get transitioned=false, this hook re-pulls
// state (onAdvance) after ANY successful due poll, not only the one that
// transitioned — that is what moves every device off the expired countdown at
// roughly the same moment, instead of leaving the slower phones stuck at 0:00.

import { useEffect, useRef } from 'react';

import { advancePhaseIfDue } from '@/features/party/api/advancePhaseIfDue';
import { isPhaseDue } from '@/features/game/phaseDue';
import { serverNow } from '@/lib/time';

// Poll cadence once the timer is due, per rpc-contracts.md §8.7 trigger (2).
const POLL_INTERVAL_MS = 2_000;

interface UseAdvancePhaseParams {
  partyId: string | undefined;
  /** session.phase_ends_at — the timer the server will key the transition off of. */
  phaseEndsAt: string | null;
  /** session.status === 'active' — do not poll while paused, ended, or in lobby. */
  isActive: boolean;
  /** Re-pull party state after a successful due poll (a transition may have just happened). */
  onAdvance: () => void;
}

export function useAdvancePhase({
  partyId,
  phaseEndsAt,
  isActive,
  onAdvance,
}: UseAdvancePhaseParams): void {
  // Read the latest onAdvance off a ref so the polling effect doesn't tear down
  // and resubscribe every time the callback identity changes.
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  // At most one advance call in flight at a time.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!partyId || !isActive || !phaseEndsAt) return;

    let cancelled = false;

    const tick = async (): Promise<void> => {
      if (inFlightRef.current) return;
      if (!isPhaseDue(phaseEndsAt, isActive, serverNow().getTime())) return;

      inFlightRef.current = true;
      const result = await advancePhaseIfDue({ partySessionId: partyId });
      inFlightRef.current = false;
      if (cancelled) return;

      // Refresh on any ok result (transitioned here or elsewhere). Errors — e.g.
      // the zero-active halt's NO_ACTIVE_PLAYERS (state-machine §8.1) — are left
      // to settle without a refetch so a halt doesn't spin on get_party_state.
      if (result.ok) onAdvanceRef.current();
    };

    // Fire once immediately so a late joiner who lands past phase_ends_at advances
    // without waiting a full interval; then poll on the cadence.
    void tick();
    const id = setInterval(() => void tick(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [partyId, phaseEndsAt, isActive]);
}
