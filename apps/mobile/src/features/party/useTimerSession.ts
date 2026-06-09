// Loads a started party's timer state — session timestamps + current round — and
// aligns the device clock to the server (syncServerTime) so the countdown reads
// true remaining time across devices.
//
// Phase 7 task 1: a one-shot load on mount plus the clock sync. Task 2 adds the
// advance_phase_if_due poll and the party_sessions realtime subscription that
// drive and refresh transitions; the shape here is built to take them (reload()
// already re-pulls the snapshot).

import { useCallback, useEffect, useState } from 'react';

import { syncServerTime } from '@/features/game/syncServerTime';
import { getPartyState } from '@/features/party/api/partyState';
import { rpcErrorMessage } from '@/lib/errors';
import type { Database } from '@/types/db.generated';

type PartyRow = Database['public']['Tables']['party_sessions']['Row'];
type SettingsRow = Database['public']['Tables']['party_settings']['Row'];
type RoundRow = Database['public']['Tables']['rounds']['Row'];

type TimerStatus = 'loading' | 'ready' | 'error';

interface UseTimerSessionResult {
  status: TimerStatus;
  session: PartyRow | null;
  settings: SettingsRow | null;
  currentRound: RoundRow | null;
  errorMessage: string | null;
  reload: () => void;
}

export function useTimerSession(partyId: string | undefined): UseTimerSessionResult {
  const [status, setStatus] = useState<TimerStatus>('loading');
  const [session, setSession] = useState<PartyRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [currentRound, setCurrentRound] = useState<RoundRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bumping this re-runs the load effect — a spinner-showing retry from the
  // error state, and the hook task 2 will reuse after a transition.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Align to server time as the screen mounts so the first rendered countdown is
  // skew-corrected. Fire-and-forget: a failure just leaves the offset in place
  // (device clock), still within display tolerance (state-machine §8.7).
  useEffect(() => {
    void syncServerTime();
  }, []);

  // Load the snapshot. callRpc never rejects — transport/throw failures fold into
  // an ok=false result — so one ok/!ok branch covers everything.
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
        setCurrentRound(result.data.current_round);
        setStatus('ready');
        return;
      }

      setErrorMessage(rpcErrorMessage(result.error_code));
      setStatus('error');
    });

    return () => {
      active = false;
    };
  }, [partyId, reloadToken]);

  return { status, session, settings, currentRound, errorMessage, reload };
}
