// Loads a lobby's snapshot (party + settings + roster) and keeps it in sync
// across devices. Two paths feed the same state:
//   - Initial / identity load: shows the spinner, sets 'error' on failure.
//   - Realtime refresh: a party_players change for this party (rls-rules.md §4
//     gates delivery per subscriber) triggers a SILENT re-fetch of
//     get_party_state — no spinner, and a transient failure keeps the last good
//     roster rather than blanking the screen.
//
// We re-fetch the authoritative snapshot on each event rather than splice the
// raw row payload in: get_party_state already applies the dual-visibility rules
// (members see non-removed peers; host sees all; you always see your own row),
// and a non-host never receives a peer's removal UPDATE (they can't SELECT a
// removed row), so patching from payloads alone would drift. The event is just
// a "something changed, re-pull the truth" trigger.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { getPartyState } from '@/features/party/api/partyState';
import { deriveLobbyView, type LobbyView } from '@/features/party/lobbyView';
import { rpcErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
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

  // The realtime subscription must not resubscribe when identity changes, so the
  // silent-refresh handler reads the latest userId off a ref instead of closing
  // over it (and depending on it).
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Bumping this re-runs the initial-load effect — a manual, spinner-showing
  // refresh (e.g. an error-state retry).
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Initial / identity load. callRpc never rejects — it folds transport/throw
  // failures into an UNEXPECTED_ERROR result — so one ok/!ok branch covers all.
  useEffect(() => {
    if (!partyId) return;

    let active = true;
    setStatus('loading');
    setErrorMessage(null);

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

  // Realtime roster sync. Keyed on partyId only; the silent refresh keeps the
  // last good state on a failed re-fetch instead of surfacing an error.
  useEffect(() => {
    if (!partyId) return;

    let active = true;

    const refresh = (): void => {
      getPartyState(partyId).then((result) => {
        if (!active || !result.ok) return;
        setSession(result.data.session);
        setSettings(result.data.settings);
        setView(deriveLobbyView(result.data.players, userIdRef.current));
      });
    };

    const channel = supabase
      .channel(`lobby:party_players:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_players',
          filter: `party_session_id=eq.${partyId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  return { status, session, settings, view, errorMessage, reload };
}
