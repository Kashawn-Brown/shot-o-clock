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
  // Flips true when a realtime refresh finds the caller is no longer a member
  // (get_party_state → SESSION_NOT_FOUND) — i.e. the host removed them. The
  // screen routes out on this. See plan.md Phase 6 "removed player routes out."
  membershipLost: boolean;
  reload: () => void;
  refresh: () => void;
}

export function useLobby(partyId: string | undefined): UseLobbyResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<LobbyStatus>('loading');
  const [session, setSession] = useState<PartyRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [view, setView] = useState<LobbyView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [membershipLost, setMembershipLost] = useState(false);

  // The realtime subscription must not resubscribe when identity changes, so the
  // silent-refresh handler reads the latest userId off a ref instead of closing
  // over it (and depending on it).
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Guards setState after unmount in the fire-and-forget silent refresh.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Bumping this re-runs the initial-load effect — a manual, spinner-showing
  // refresh (e.g. an error-state retry).
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Silent refresh — swaps in fresh state without touching status/error, so
  // realtime events and post-action refreshes (e.g. after a host removes a
  // player) neither flash the spinner nor blank a working roster on a transient
  // failure. The screen calls this after a mutation for an immediate update
  // rather than waiting on the realtime round-trip.
  const refresh = useCallback(() => {
    if (!partyId) return;
    getPartyState(partyId).then((result) => {
      if (!mountedRef.current) return;
      if (!result.ok) {
        // The caller has lost membership (removed by the host) — signal the
        // screen to route out. Any other failure is transient: keep last good.
        if (result.error_code === 'SESSION_NOT_FOUND') setMembershipLost(true);
        return;
      }
      setSession(result.data.session);
      setSettings(result.data.settings);
      setView(deriveLobbyView(result.data.players, userIdRef.current));
    });
  }, [partyId]);

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

  // Realtime roster sync. Keyed on partyId; an incoming party_players change
  // (RLS gates delivery per subscriber) triggers the shared silent refresh.
  useEffect(() => {
    if (!partyId) return;

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
      supabase.removeChannel(channel);
    };
  }, [partyId, refresh]);

  // Realtime session sync. A party_players change never fires when the host starts
  // the game (start_game only mutates party_sessions), so the lobby also watches
  // the session row: an UPDATE (status lobby → active, phase → countdown) triggers
  // the silent refresh, and the screen navigates off the lobby once session.status
  // leaves 'lobby'. Requires party_sessions in the supabase_realtime publication
  // (migration 20260610…; schema.md §15). RLS (rls-rules.md §2) gates delivery, so
  // only members receive it.
  useEffect(() => {
    if (!partyId) return;

    const channel = supabase
      .channel(`lobby:party_sessions:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'party_sessions',
          filter: `id=eq.${partyId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, refresh]);

  return { status, session, settings, view, errorMessage, membershipLost, reload, refresh };
}
