// Lightweight one-shot read of the caller's role in a party — just enough for the
// per-session settings screen (Surface B, D062) to show or hide the host-only
// party-lock row. Deliberately NOT useTimerSession: that hook also drives the
// notification scheduling (whose unmount cancel would kill the timer's batch when
// the pushed settings screen closes), the advance-phase poll, and realtime subs —
// none of which Surface B needs. One get_party_state call, no subscription.

import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { getPartyState } from '@/features/party/api/partyState';
import { rpcErrorMessage } from '@/lib/errors';

type PartyRoleStatus = 'loading' | 'ready' | 'error';

interface UsePartyRoleResult {
  status: PartyRoleStatus;
  isHost: boolean;
  errorMessage: string | null;
}

export function usePartyRole(partyId: string | undefined): UsePartyRoleResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<PartyRoleStatus>('loading');
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!partyId) {
      setStatus('error');
      setErrorMessage('Missing party.');
      return;
    }
    let active = true;
    getPartyState(partyId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setErrorMessage(rpcErrorMessage(result.error_code));
          setStatus('error');
          return;
        }
        const me = result.data.players.find((player) => player.user_id === userId) ?? null;
        setIsHost(me?.permission_role === 'host');
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage('Something went wrong.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [partyId, userId]);

  return { status, isHost, errorMessage };
}
