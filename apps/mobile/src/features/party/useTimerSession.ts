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
import { supabase } from '@/lib/supabase';
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
  // The full (RLS-filtered) roster from the snapshot — needed by the Round Results
  // screen to join player names + shot counts onto outcome rows. [] until loaded.
  players: PlayerRow[];
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
  // Silently re-pull the session snapshot (e.g. right after a host control —
  // pause / resume / add time — so the host's own screen updates without waiting
  // on the realtime round-trip). No spinner, no error flip.
  refreshSession: () => void;
}

export function useTimerSession(partyId: string | undefined): UseTimerSessionResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<TimerStatus>('loading');
  const [session, setSession] = useState<PartyRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [currentRound, setCurrentRound] = useState<RoundRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
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
      setPlayers(result.data.players);
      setMe(result.data.players.find((player) => player.user_id === userIdRef.current) ?? null);
    });
  }, [partyId]);

  // Re-pull the caller's outcome for the current round. Keyed on the round id and
  // the caller's id, so it re-reads once when the round advances (and the screen
  // calls it after a tap). One get_round_outcomes call per round, never per tick.
  const roundId = currentRound?.id;
  const myPlayerId = me?.id;
  // Latest round id, read in the async callback so a fetch issued for round N can't
  // overwrite myOutcome after the round has already advanced to N+1 — that stale
  // write was what kept the buttons disabled into the next round.
  const roundIdRef = useRef(roundId);
  roundIdRef.current = roundId;
  const refreshOutcome = useCallback(() => {
    if (!roundId || !myPlayerId) {
      setMyOutcome(null);
      return;
    }
    getRoundOutcomes(roundId).then((result) => {
      if (!mountedRef.current || !result.ok) return;
      if (roundIdRef.current !== roundId) return; // round advanced mid-fetch — drop
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
        setPlayers(result.data.players);
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

  // Realtime session sync. The advance poll only re-pulls while the timer is
  // active and due, so a host control that does not move phase_ends_at — pause
  // (option (a): status → paused, phase_ends_at left intact, §10.1) and resume —
  // would never reach the other devices through it. Watching the session row
  // closes that gap: any UPDATE (pause, resume, add time, end party) triggers the
  // silent re-pull, so every device reflects the host action within realtime
  // latency. party_sessions is already in the supabase_realtime publication
  // (migration 20260610…; schema.md §15); RLS (rls-rules.md §2) gates delivery to
  // members. Mirrors the lobby's session sub (D027/D031).
  useEffect(() => {
    if (!partyId) return;

    const channel = supabase
      .channel(`timer:party_sessions:${partyId}`)
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

  return {
    status,
    session,
    settings,
    currentRound,
    players,
    me,
    myOutcome,
    errorMessage,
    reload,
    refreshOutcome,
    refreshSession: refresh,
  };
}
