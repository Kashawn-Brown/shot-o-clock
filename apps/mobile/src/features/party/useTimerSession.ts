// Loads a started party's timer state — session timestamps + current round — and
// aligns the device clock to the server (syncServerTime) so the countdown reads
// true remaining time across devices.
//
// Phase 7 task 2: the advance_phase_if_due poll (useAdvancePhase) now drives the
// transition. When the countdown is due, every device polls; the first past
// phase_ends_at performs the real transition and the rest get transitioned=false,
// so the hook silently re-pulls the snapshot on any successful poll to move every
// device onto the new phase. The screen routes by session.current_phase.
// (A party_sessions realtime push, so paused/ended changes propagate without a
// due poll, is left to a later phase.)

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdvancePhase } from '@/features/game/useAdvancePhase';
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
  // error state.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Guards setState in the fire-and-forget silent refresh after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Silent re-pull of the snapshot — no spinner, no error flip. Called by the
  // advance poll after a due transition so the new phase/round/phase_ends_at land
  // without flashing the loading state. A transient failure keeps the last good
  // snapshot rather than blanking the screen.
  const refresh = useCallback(() => {
    if (!partyId) return;
    getPartyState(partyId).then((result) => {
      if (!mountedRef.current || !result.ok) return;
      setSession(result.data.session);
      setSettings(result.data.settings);
      setCurrentRound(result.data.current_round);
    });
  }, [partyId]);

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

  // Poll the server to advance the phase when the countdown is due, then refresh.
  // The client never owns the transition (CLAUDE.md §2.1) — see useAdvancePhase.
  useAdvancePhase({
    partyId,
    phaseEndsAt: session?.phase_ends_at ?? null,
    isActive: session?.status === 'active',
    onAdvance: refresh,
  });

  return { status, session, settings, currentRound, errorMessage, reload };
}
