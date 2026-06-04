// Checks once on launch whether the guest is in an in-progress party, so the home
// screen can route them straight back into it (reconnect). 'checking' while the
// lookup runs; 'resolved' once it settles (activeParty is null when there is none).

import { useEffect, useState } from 'react';

import { getActiveParty, type ActiveParty } from '@/features/party/api/activeParty';

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

    getActiveParty()
      .then((party) => {
        if (!active) return;
        setActiveParty(party);
        setStatus('resolved');
      })
      .catch((error) => {
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
