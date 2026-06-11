// Checks once on launch whether the guest is in an in-progress party, so the home
// screen can route them straight back into it (reconnect). 'checking' while the
// lookup runs; 'resolved' once it settles (activeParty is null when there is none).
//
// One exception: a player who tapped Leave Party mid-game is still a member (they
// were marked Out, not removed), so getActiveParty would keep returning their
// party and pull them back in. If the found party matches the intentionally-left
// marker (leftParty), we suppress the reconnect and report no active party. The
// marker is cleared once they are no longer in that party (different party, or
// none), so it can't strand a later, unrelated session.

import { useEffect, useState } from 'react';

import { getActiveParty, type ActiveParty } from '@/features/party/api/activeParty';
import { clearLeftPartyId, getLeftPartyId } from '@/features/party/leftParty';

type ReconnectStatus = 'checking' | 'resolved';

interface UseActivePartyResult {
  status: ReconnectStatus;
  activeParty: ActiveParty | null;
}

export function useActiveParty(): UseActivePartyResult {
  const [status, setStatus] = useState<ReconnectStatus>('checking');
  const [activeParty, setActiveParty] = useState<ActiveParty | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const party = await getActiveParty();
      const leftId = await getLeftPartyId();
      if (!active) return;

      // Intentionally left this party — stay home, keep the marker (still a member).
      if (party && leftId === party.partyId) {
        setActiveParty(null);
        setStatus('resolved');
        return;
      }

      // No longer in the left party (moved on, or it ended) — drop the stale marker.
      if (leftId !== null) await clearLeftPartyId();
      if (!active) return;

      setActiveParty(party);
      setStatus('resolved');
    })().catch((error) => {
      // Fail open: on a lookup error, fall through to home rather than trap the user.
      console.error('Failed to check for an active party', error);
      if (active) setStatus('resolved');
    });

    return () => {
      active = false;
    };
  }, []);

  return { status, activeParty };
}
