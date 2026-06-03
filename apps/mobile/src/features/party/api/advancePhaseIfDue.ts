// Typed wrapper for the advance_phase_if_due RPC.
// See docs/specs/rpc-contracts.md §8.
//
// The mechanism that makes the timer server-authoritative. Clients poll this
// (every ~2s once their local clock passes phase_ends_at, and inline before
// phase-sensitive actions). The first caller past phase_ends_at performs the
// transition; everyone else gets transitioned = false.
//
// countdown → shot_window when the countdown expires; shot_window → the round
// is finalized (game-rules §7) and the game auto-advances to the next round's
// countdown — or rests in round_complete if no active players remain (D014).
//
// transitioned = false is the normal, non-error response when the timer hasn't
// expired yet or the session is paused. finalize_round_outcomes is internal and
// has no wrapper — it is only ever invoked server-side by this RPC.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type AdvancePhaseIfDueParams = {
  partySessionId: string;
};

// §8.5 — new_phase is the phase the session landed in when a transition
// occurred: 'shot_window' (countdown advanced), 'countdown' (round auto-advanced
// to N+1), or 'round_complete' (zero-active halt). null when transitioned=false.
export type AdvancePhaseIfDueData = {
  transitioned: boolean;
  new_phase: 'shot_window' | 'countdown' | 'round_complete' | null;
};

export function advancePhaseIfDue(
  params: AdvancePhaseIfDueParams,
): Promise<RpcResult<AdvancePhaseIfDueData>> {
  return callRpc<AdvancePhaseIfDueData>('advance_phase_if_due', {
    p_party_session_id: params.partySessionId,
  });
}
