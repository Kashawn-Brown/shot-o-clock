// Role + party context for the per-session settings screen (Surface B). One initial
// get_party_state read seeds the host-only controls (party lock, Heads-up), which only
// the host changes on this screen — so they stay locally owned after seed. A light
// ~3s poll then keeps the ROUND-derived Heads-up gate inputs fresh (changed/sent this
// round, phase timing) so the proactive gate UI stays trustworthy if the host lingers
// across a round advance — this screen has no realtime subscription. `refresh()` forces
// an immediate re-fetch (call right after a host change). Not useTimerSession: that
// hook drives the advance poll + realtime subs Surface B doesn't need.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { getPartyState, type GetPartyStateData } from '@/features/party/api/partyState';
import { rpcErrorMessage } from '@/lib/errors';

type PartyRoleStatus = 'loading' | 'ready' | 'error';

const ROUND_GATE_POLL_MS = 3_000;

// The round-derived inputs the Heads-up gate needs, re-fetched on the poll.
export interface RoundGateState {
  changedThisRound: boolean; // rounds.heads_up_setting_changed_at != null
  sentThisRound: boolean; // rounds.heads_up_push_sent_at != null
  sessionStatus: string | null;
  currentPhase: string | null;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
}

const EMPTY_ROUND_GATE: RoundGateState = {
  changedThisRound: false,
  sentThisRound: false,
  sessionStatus: null,
  currentPhase: null,
  phaseStartedAt: null,
  phaseEndsAt: null,
};

function extractRoundGate(data: GetPartyStateData): RoundGateState {
  return {
    changedThisRound: data.current_round?.heads_up_setting_changed_at != null,
    sentThisRound: data.current_round?.heads_up_push_sent_at != null,
    sessionStatus: data.session.status,
    currentPhase: data.session.current_phase,
    phaseStartedAt: data.session.phase_started_at,
    phaseEndsAt: data.session.phase_ends_at,
  };
}

interface UsePartyRoleResult {
  status: PartyRoleStatus;
  isHost: boolean;
  // Single-phone mode (D040/D050): no joiners, so the host controls are hidden.
  hostOnly: boolean;
  // Seed values for the locally-owned host controls (host is the only one changing
  // them on this screen, so they're seeded once, not polled).
  initialLocked: boolean;
  initialHeadsUpEnabled: boolean;
  initialHeadsUpLeadSeconds: number;
  // Live round-derived Heads-up gate inputs (polled ~3s).
  roundGate: RoundGateState;
  // Force an immediate roundGate re-fetch (call after a host Heads-up change).
  refresh: () => void;
  errorMessage: string | null;
}

export function usePartyRole(partyId: string | undefined): UsePartyRoleResult {
  const { userId } = useAuth();
  const [status, setStatus] = useState<PartyRoleStatus>('loading');
  const [isHost, setIsHost] = useState(false);
  const [hostOnly, setHostOnly] = useState(false);
  const [initialLocked, setInitialLocked] = useState(false);
  const [initialHeadsUpEnabled, setInitialHeadsUpEnabled] = useState(true);
  const [initialHeadsUpLeadSeconds, setInitialHeadsUpLeadSeconds] = useState(120);
  const [roundGate, setRoundGate] = useState<RoundGateState>(EMPTY_ROUND_GATE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refresh only the round-gate inputs (the poll + refresh path) — never the seeds,
  // so it can't clobber the locally-owned lock / Heads-up values.
  const refresh = useCallback((): void => {
    if (!partyId) return;
    void getPartyState(partyId).then((result) => {
      if (result.ok) setRoundGate(extractRoundGate(result.data));
    });
  }, [partyId]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Initial read: seeds + first round-gate snapshot.
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
        setHostOnly(result.data.settings.host_only);
        setInitialLocked(result.data.session.is_locked);
        setInitialHeadsUpEnabled(result.data.settings.pre_shot_warning_enabled);
        setInitialHeadsUpLeadSeconds(result.data.settings.pre_shot_warning_seconds);
        setRoundGate(extractRoundGate(result.data));
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

  // Poll the round-gate inputs so the gate stays fresh across a round advance.
  useEffect(() => {
    if (!partyId) return;
    const id = setInterval(() => refreshRef.current(), ROUND_GATE_POLL_MS);
    return () => clearInterval(id);
  }, [partyId]);

  return {
    status,
    isHost,
    hostOnly,
    initialLocked,
    initialHeadsUpEnabled,
    initialHeadsUpLeadSeconds,
    roundGate,
    refresh,
    errorMessage,
  };
}
