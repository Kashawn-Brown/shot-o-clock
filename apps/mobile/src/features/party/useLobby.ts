// Loads a lobby's snapshot (party + settings + roster) for the lobby screen and
// derives its host/player view-model. Read-only for now: it fetches once per
// partyId/identity and on demand via reload(). The realtime party_players
// subscription that keeps the roster in sync across devices is the next Phase 6
// task — this hook is the single seam it will plug into (it will refresh the
// same state setters instead of re-fetching).

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { getPartyState } from '@/features/party/api/partyState';
import { deriveLobbyView, type LobbyView } from '@/features/party/lobbyView';
import { rpcErrorMessage } from '@/lib/errors';
import type { Database } from '@/types/db.generated';

type PartyRow = Database['public']['Tables']['party_sessions']['Row'];
type SettingsRow = Database['public']['Tables']['party_settings']['Row'];

type LobbyStatus = 'loading' | 'ready' | 'error';

interface UseLobbyResult {
  status: LobbyStatus;
  session: PartyRow | null;
  settings: SettingsRow | null;
  view: LobbyView | null;
  errorMessage: string | null;
  reload: () => void;
}

export function useLobby(partyId: string | undefined): UseLobbyResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<LobbyStatus>('loading');
  const [session, setSession] = useState<PartyRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [view, setView] = useState<LobbyView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bumping this re-runs the load effect — manual refresh until realtime lands.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!partyId) return;

    let active = true;
    setStatus('loading');
    setErrorMessage(null);

    // callRpc never rejects — it folds transport/throw failures into an
    // UNEXPECTED_ERROR result, so a single ok/!ok branch covers every case.
    getPartyState(partyId).then((result) => {
      if (!active) return;

      if (result.ok) {
        setSession(result.data.session);
        setSettings(result.data.settings);
        setView(deriveLobbyView(result.data.players, userId));
        setStatus('ready');
        return;
      }

      setErrorMessage(rpcErrorMessage(result.error_code));
      setStatus('error');
    });

    return () => {
      active = false;
    };
  }, [partyId, userId, reloadToken]);

  return { status, session, settings, view, errorMessage, reload };
}
