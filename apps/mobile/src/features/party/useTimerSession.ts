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
import { useShotNotification } from '@/features/notifications/useShotNotification';
import { useForegroundEffect } from '@/features/party/useForegroundEffect';
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

// Process-wide monotonic counter for the realtime channel topic. It MUST be
// module-scoped, not a per-hook ref: the timer screen remounts every round, so a
// per-instance counter restarts at 1 and collides with the previous instance's
// channel of the same topic — whose removeChannel is still async-pending — and
// supabase hands back that already-subscribed channel, whose .on() then throws
// ("cannot add postgres_changes callbacks after subscribe()"). A global counter
// never repeats, so every channel topic is unique for the life of the process.
let realtimeChannelSeq = 0;

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
  // Every outcome row for the current round — lets the roster show a player who
  // self_out this round as Out before finalization changes their status. [] until
  // loaded / between rounds.
  roundOutcomes: OutcomeRow[];
  errorMessage: string | null;
  // Flips true when a realtime refresh finds the caller is no longer a member —
  // the host removed them (get_party_state → SESSION_NOT_FOUND, or their own row
  // is now 'removed'). The timer screen routes home on this. Mirrors useLobby.
  membershipLost: boolean;
  // Flips true when the host ends the party — read directly off the party_sessions
  // realtime payload (status='ended'), so routing home does NOT depend on a
  // get_party_state refresh succeeding (the silent refresh swallows failures, which
  // would otherwise strand the device on the game screen). The timer / shot-oclock
  // screens route home on this. Phase 11 will route to the Final Summary instead.
  partyEnded: boolean;
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
  // All outcomes for the current round, so the roster can show a player who has
  // self_out this round as Out promptly — before finalization flips their status.
  const [roundOutcomes, setRoundOutcomes] = useState<OutcomeRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [membershipLost, setMembershipLost] = useState(false);
  const [partyEnded, setPartyEnded] = useState(false);
  // Bumped on a foreground resume to force the realtime channel to tear down and
  // resubscribe (the OS may have killed the socket while backgrounded).
  const [realtimeNonce, setRealtimeNonce] = useState(0);

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
      if (!mountedRef.current) return;
      if (!result.ok) {
        // The host removed us — RLS now hides the session. Signal the screen to
        // route home. Any other failure is transient: keep the last good snapshot.
        if (result.error_code === 'SESSION_NOT_FOUND') setMembershipLost(true);
        return;
      }
      const mine =
        result.data.players.find((player) => player.user_id === userIdRef.current) ?? null;
      // Defensive: if the snapshot ever returns our own row marked removed (rather
      // than hiding the session), treat it the same as a membership loss.
      if (mine?.status === 'removed') {
        setMembershipLost(true);
        return;
      }
      setSession(result.data.session);
      setSettings(result.data.settings);
      setCurrentRound(result.data.current_round);
      setPlayers(result.data.players);
      setMe(mine);
    });
  }, [partyId]);

  // Latest silent refresh, read off a ref so the realtime effect keys only on
  // partyId and never tears down / resubscribes when refresh's identity changes.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

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
    if (!roundId) {
      setMyOutcome(null);
      setRoundOutcomes([]);
      return;
    }
    getRoundOutcomes(roundId).then((result) => {
      if (!mountedRef.current || !result.ok) return;
      if (roundIdRef.current !== roundId) return; // round advanced mid-fetch — drop
      setRoundOutcomes(result.data.outcomes);
      setMyOutcome(
        myPlayerId
          ? (result.data.outcomes.find((o) => o.party_player_id === myPlayerId) ?? null)
          : null,
      );
    });
  }, [roundId, myPlayerId]);

  // Latest refreshOutcome, read off a ref so the realtime effect (keyed on
  // partyId) can call it without depending on the round/player ids.
  const refreshOutcomeRef = useRef(refreshOutcome);
  refreshOutcomeRef.current = refreshOutcome;

  // Clear the outcome the instant the round changes, before the async re-fetch
  // lands — otherwise the previous round's self_out/done would keep the buttons
  // disabled into the new round. An out player stays disabled regardless: that is
  // driven by `me.status`, not the outcome.
  useEffect(() => {
    setMyOutcome(null);
    setRoundOutcomes([]);
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

  // Schedule the local Shot O'Clock notifications (current round + the next several)
  // so they fire even when the app is backgrounded / the phone is locked — a suspended
  // app can't reschedule per round. Needs settings + currentRound for the round-loop
  // math. Self-cancels on pause / end / unmount (Phase 14, §2.1 — mirrors the server's
  // deterministic timing, never owns the timer).
  useShotNotification(session, settings, currentRound, partyId);

  // On a foreground resume, realtime delivered nothing while we were suspended and
  // the socket may be dead — so the screen would render stale state (a frozen
  // countdown) until the old phase_ends_at expired and the advance poll refetched.
  // Re-align the clock, re-pull the authoritative snapshot + outcomes, and bump the
  // realtime nonce to resubscribe — so re-entry reflects live state immediately.
  useForegroundEffect(
    useCallback(() => {
      void syncServerTime();
      refreshRef.current();
      refreshOutcomeRef.current();
      setRealtimeNonce((nonce) => nonce + 1);
    }, []),
  );

  // Realtime sync for the live game state. One channel carries two streams:
  //   - party_sessions UPDATE: the advance poll only re-pulls while the timer is
  //     active and due, so a host control that doesn't move phase_ends_at — pause
  //     (option (a): status → paused, phase_ends_at intact, §10.1) and resume, and
  //     end_party — would never reach the other devices through it. Watching the
  //     session row closes that gap.
  //   - party_players *: a host marking a player out / active / removed mutates
  //     only party_players, so the roster (and the target's own `me.status`) stays
  //     live across devices. Mirrors the lobby's subs (D027/D031).
  //   - round_player_outcomes *: a player tapping Done / I'm Out (and leaving via
  //     mark_self_out) writes only an outcome row — no party_players change — so
  //     without this the other devices' rosters wouldn't reflect a self_out until
  //     finalization. Re-pulls the round's outcomes (refreshOutcome).
  // All three tables are in the supabase_realtime publication (schema.md §15); RLS
  // (rls-rules.md §2/§4) gates delivery to members. Keyed on partyId only — the
  // handlers read the latest refreshers off refs.
  useEffect(() => {
    if (!partyId) return;

    // Globally-unique topic per subscription — see realtimeChannelSeq. Guards the
    // remount/reconnect double-subscribe crash.
    realtimeChannelSeq += 1;
    const channel = supabase
      .channel(`timer:${partyId}:${realtimeChannelSeq}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'party_sessions', filter: `id=eq.${partyId}` },
        (payload) => {
          // end_party is terminal: signal the screen to route home directly from the
          // payload (the session is the caller's own party row, fully visible to
          // members — no RLS-filtered field), rather than via a get_party_state
          // refresh that the silent path would swallow on failure. Mirrors
          // results.tsx. Any other session change is a normal re-pull.
          if ((payload.new as { status?: string }).status === 'ended') {
            setPartyEnded(true);
            return;
          }
          refreshRef.current();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_players',
          filter: `party_session_id=eq.${partyId}`,
        },
        () => refreshRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_player_outcomes',
          filter: `party_session_id=eq.${partyId}`,
        },
        () => refreshOutcomeRef.current(),
      )
      .subscribe((channelStatus) => {
        // Refetch once the channel is genuinely live (socket + auth handshake done).
        // postgres_changes never replays what was missed while suspended, so a state
        // that emits no further events — a paused game — would otherwise stay stale
        // until the old countdown expired. SUBSCRIBED fires on every (re)subscribe,
        // including the foreground resubscribe forced by realtimeNonce.
        if (channelStatus === 'SUBSCRIBED') {
          refreshRef.current();
          refreshOutcomeRef.current();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
    // realtimeNonce bumps on foreground resume to force a fresh channel (see above).
  }, [partyId, realtimeNonce]);

  return {
    status,
    session,
    settings,
    currentRound,
    players,
    me,
    myOutcome,
    roundOutcomes,
    errorMessage,
    membershipLost,
    partyEnded,
    reload,
    refreshOutcome,
    refreshSession: refresh,
  };
}
