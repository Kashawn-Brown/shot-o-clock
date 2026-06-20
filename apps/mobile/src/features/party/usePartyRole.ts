// Lightweight one-shot read of the caller's role + a little party context — just
// enough for the per-session settings screen (Surface B, D062): the host-only party
// lock (isHost + initial isLocked), and whether to hide it in host-only mode (hostOnly).
// Deliberately NOT useTimerSession: that hook also drives the notification scheduling
// (whose unmount cancel would kill the timer's batch when the pushed settings screen
// closes), the advance-phase poll, and realtime subs — none of which Surface B needs.
// One get_party_state call, no subscription.

import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { getPartyState } from '@/features/party/api/partyState';
import { rpcErrorMessage } from '@/lib/errors';

type PartyRoleStatus = 'loading' | 'ready' | 'error';

interface UsePartyRoleResult {
  status: PartyRoleStatus;
  isHost: boolean;
  // Whether the party is locked at load — the Surface B toggle seeds from this, then
  // owns the value (the host is the only one toggling; no realtime on this screen).
  isLocked: boolean;
  // Single-phone mode (D040/D050): no joiners, so the party-lock control is hidden.
  hostOnly: boolean;
  errorMessage: string | null;
}

export function usePartyRole(partyId: string | undefined): UsePartyRoleResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<PartyRoleStatus>('loading');
  const [isHost, setIsHost] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hostOnly, setHostOnly] = useState(false);
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
        setIsLocked(result.data.session.is_locked);
        setHostOnly(result.data.settings.host_only);
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

  return { status, isHost, isLocked, hostOnly, errorMessage };
}
