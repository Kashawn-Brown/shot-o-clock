// Loads one round's finalized outcomes and keeps them in sync. Two paths feed the
// same state, mirroring useLobby:
//   - Initial / round-change load: shows the spinner, sets 'error' on failure.
//   - Realtime refresh: a round_player_outcomes change for this party (rls-rules.md
//     §5 gates delivery per subscriber) triggers a SILENT re-fetch of
//     get_round_outcomes — no spinner, and a transient failure keeps the last good
//     outcomes rather than blanking the screen.
//
// We re-fetch the authoritative round snapshot on each event rather than splice the
// raw row payload in, for the same reason useLobby does: get_round_outcomes already
// applies the membership RLS, and realtime delivery is gated by those same rules, so
// the event is just a "something changed, re-pull the truth" trigger. Requires
// round_player_outcomes in the supabase_realtime publication (migration 20260611130…).
//
// roundId may be undefined while the screen is still resolving which round to show
// (param vs. session.current_round fallback) — the hook idles until it lands.

import { useCallback, useEffect, useRef, useState } from 'react';

import { getRoundOutcomes } from '@/features/game/api/roundOutcomes';
import { rpcErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/db.generated';

type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];

type OutcomesStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseRoundOutcomesResult {
  status: OutcomesStatus;
  outcomes: OutcomeRow[];
  errorMessage: string | null;
  reload: () => void;
}

export function useRoundOutcomes(
  partyId: string | undefined,
  roundId: string | undefined,
): UseRoundOutcomesResult {
  const [status, setStatus] = useState<OutcomesStatus>('idle');
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guards setState after unmount in the fire-and-forget silent refresh.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Bumping this re-runs the initial-load effect — a spinner-showing retry.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Latest round id read off a ref so a fetch issued for round N can't overwrite
  // state after the screen has moved to a different round (same guard as
  // useTimerSession.refreshOutcome).
  const roundIdRef = useRef(roundId);
  roundIdRef.current = roundId;

  // Silent refresh — swaps in fresh outcomes without touching status/error, so a
  // realtime event neither flashes the spinner nor blanks a working list on a
  // transient failure.
  const refresh = useCallback(() => {
    if (!roundId) return;
    getRoundOutcomes(roundId).then((result) => {
      if (!mountedRef.current || roundIdRef.current !== roundId) return;
      if (!result.ok) return; // transient — keep last good
      setOutcomes(result.data.outcomes);
    });
  }, [roundId]);

  // Initial / round-change load.
  useEffect(() => {
    if (!roundId) {
      setStatus('idle');
      setOutcomes([]);
      return;
    }

    let active = true;
    setStatus('loading');
    setErrorMessage(null);

    getRoundOutcomes(roundId).then((result) => {
      if (!active) return;

      if (result.ok) {
        setOutcomes(result.data.outcomes);
        setStatus('ready');
        return;
      }

      setErrorMessage(rpcErrorMessage(result.error_code));
      setStatus('error');
    });

    return () => {
      active = false;
    };
  }, [roundId, reloadToken]);

  // Realtime sync. Keyed on partyId; an incoming round_player_outcomes change for
  // this party (RLS gates delivery per subscriber) triggers the silent refresh of
  // whichever round the screen is currently showing.
  useEffect(() => {
    if (!partyId) return;

    const channel = supabase
      .channel(`results:round_player_outcomes:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_player_outcomes',
          filter: `party_session_id=eq.${partyId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, refresh]);

  return { status, outcomes, errorMessage, reload };
}
