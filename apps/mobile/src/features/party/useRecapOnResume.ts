// Shows the previous round's recap on a WARM resume, mirroring the cold-launch
// reconnect (index.tsx) — which only runs on a fresh start. Mounted on the timer
// screen: while backgrounded on the timer, a countdown→countdown round advance never
// triggers the screen's phase-routing (the phase didn't change), so without this a
// player who stepped away across a round boundary just lands on the new countdown and
// misses the recap. (Resuming on shot-oclock/results already routes via their own
// phase transitions, so the gap is the timer screen alone.)
//
// Reuses the foreground-resume hook (useForegroundEffect, the same one driving the
// pause-sync refetch) and the shared shouldRecapOnReentry rule. It snapshots the round
// at background-time and only recaps if the round actually advanced while away — so a
// brief background within the same round doesn't bounce you to a stale recap.

import { router } from 'expo-router';
import { useRef } from 'react';

import { syncServerTime } from '@/features/game/syncServerTime';
import { getActiveParty } from '@/features/party/api/activeParty';
import { shouldRecapOnReentry } from '@/features/party/reconnectRoute';
import { useForegroundEffect } from '@/features/party/useForegroundEffect';
import { serverNow } from '@/lib/time';

export function useRecapOnResume(
  partyId: string | undefined,
  currentRoundNumber: number | null,
  // False while an exit is in flight (useGameExit.leaving) so a resume mid-exit doesn't
  // fight a navigation already underway.
  enabled: boolean,
): void {
  const currentRoundRef = useRef(currentRoundNumber);
  currentRoundRef.current = currentRoundNumber;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const partyIdRef = useRef(partyId);
  partyIdRef.current = partyId;

  // Round the timer was showing when the app backgrounded — compared against the round
  // on resume to detect a boundary crossed while away.
  const roundAtBackgroundRef = useRef<number | null>(null);

  useForegroundEffect(
    () => {
      const pid = partyIdRef.current;
      const roundAtBackground = roundAtBackgroundRef.current;
      if (!enabledRef.current || !pid || roundAtBackground === null) return;

      void (async () => {
        await syncServerTime();
        const party = await getActiveParty();
        if (!party || party.partyId !== pid) return;
        // Only recap if the round advanced while backgrounded (not a brief same-round
        // background), and only when shouldRecapOnReentry agrees (fresh countdown,
        // round >= 2, within the 30s window).
        if (party.currentRoundNumber === roundAtBackground) return;
        if (
          shouldRecapOnReentry(
            party.phase,
            party.currentRoundNumber,
            party.phaseStartedAt,
            serverNow().getTime(),
          )
        ) {
          router.replace({
            pathname: '/party/[partyId]/results',
            params: { partyId: pid, roundNumber: String(party.currentRoundNumber - 1) },
          });
        }
      })();
    },
    () => {
      roundAtBackgroundRef.current = currentRoundRef.current;
    },
  );
}
