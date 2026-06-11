// Loads a started party's timer state — session timestamps + current round — and
// aligns the device clock to the server (syncServerTime) so the countdown reads
// true remaining time across devices.
//
// Phase 7 task 2: the advance_phase_if_due poll (useAdvancePhase) drives the
// transition. When the countdown is due, every device polls; the first past
// phase_ends_at performs the real transition and the rest get transitioned=false,
// so the hook silently re-pulls the snapshot on any successful poll to move every
// device onto the new phase. The screen routes by session.current_phase.
//
// Phase 8 task 2: also exposes the caller's own roster row (`me`) and their outcome
// for the current round (`myOutcome`), so the shot-window / timer screens can drive
// Done / I'm Out — disable Done for non-active players and enforce SELF_OUT_IS_STICKY
// in the UI. `me` is derived from the snapshot's player list (no extra call);
// `myOutcome` is one get_round_outcomes read per round (re-pulled via refreshOutcome
// after the player taps).

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { getRoundOutcomes } from '@/features/game/api/roundOutcomes';
import { useAdvancePhase } from '@/features/game/useAdvancePhase';
import { syncServerTime } from '@/features/game/syncServerTime';
import { getPartyState } from '@/features/party/api/partyState';
import { rpcErrorMessage } from '@/lib/errors';
import type { Database } from '@/types/db.generated';

type PartyRow = Database['public']['Tables']['party_sessions']['Row'];
type SettingsRow = Database['public']['Tables']['party_settings']['Row'];
type RoundRow = Database['public']['Tables']['rounds']['Row'];
type PlayerRow = Database['public']['Tables']['party_players']['Row'];
type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];

type TimerStatus = 'loading' | 'ready' | 'error';

interface UseTimerSessionResult {
  status: TimerStatus;
  session: PartyRow | null;
  settings: SettingsRow | null;
  currentRound: RoundRow | null;
  // The caller's own party_players row, derived from the snapshot's player list
  // (always visible to them, rls-rules.md §4.2). null until the snapshot loads.
  me: PlayerRow | null;
  // The caller's outcome row for the current round, or null if they haven't acted
  // yet. Drives the Done/I'm Out button states. Re-read per round and on demand.
  myOutcome: OutcomeRow | null;
  errorMessage: string | null;
  reload: () => void;
  // Re-pull myOutcome (e.g. right after the player taps Done / I'm Out).
  refreshOutcome: () => void;
}

export function useTimerSession(partyId: string | undefined): UseTimerSessionResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<TimerStatus>('loading');
  const [session, setSession] = useState<PartyRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [currentRound, setCurrentRound] = useState<RoundRow | null>(null);
  const [me, setMe] = useState<PlayerRow | null>(null);
  const [myOutcome, setMyOutcome] = useState<OutcomeRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The silent refresh must not depend on userId (it would re-create on identity
  // change); read the latest off a ref to derive `me` instead.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

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
      setMe(result.data.players.find((player) => player.user_id === userIdRef.current) ?? null);
    });
  }, [partyId]);

  // Re-pull the caller's outcome for the current round. Keyed on the round id and
  // the caller's id, so it re-reads once when the round advances (and the screen
  // calls it after a tap). One get_round_outcomes call per round, never per tick.
  const roundId = currentRound?.id;
  const myPlayerId = me?.id;
  const refreshOutcome = useCallback(() => {
    if (!roundId || !myPlayerId) {
      setMyOutcome(null);
      return;
    }
    getRoundOutcomes(roundId).then((result) => {
      if (!mountedRef.current || !result.ok) return;
      setMyOutcome(result.data.outcomes.find((o) => o.party_player_id === myPlayerId) ?? null);
    });
  }, [roundId, myPlayerId]);

  // Clear the outcome the instant the round changes, before the async re-fetch
  // lands — otherwise the previous round's self_out/done would keep the buttons
  // disabled into the new round. An out player stays disabled regardless: that is
  // driven by `me.status`, not the outcome.
  useEffect(() => {
    setMyOutcome(null);
  }, [roundId]);

  useEffect(() => {
    refreshOutcome();
  }, [refreshOutcome]);

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
        setMe(result.data.players.find((player) => player.user_id === userId) ?? null);
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

  // Poll the server to advance the phase when the countdown is due, then refresh.
  // The client never owns the transition (CLAUDE.md §2.1) — see useAdvancePhase.
  useAdvancePhase({
    partyId,
    phaseEndsAt: session?.phase_ends_at ?? null,
    isActive: session?.status === 'active',
    onAdvance: refresh,
  });

  return {
    status,
    session,
    settings,
    currentRound,
    me,
    myOutcome,
    errorMessage,
    reload,
    refreshOutcome,
  };
}
