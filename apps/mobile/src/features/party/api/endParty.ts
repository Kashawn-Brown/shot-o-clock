// Typed wrapper for the end_party RPC.
// See docs/specs/rpc-contracts.md §12.
//
// Host terminates the session. Terminal action. If an in-flight round
// exists at end time, it's cancelled (rounds.status = 'cancelled') and a
// timer_events row is logged with event_type = 'round_cancelled'. The
// admin_action_logs table records the end. See docs/KNOWN_ISSUES.md #D012
// for the locked B2 conventions covering all five effect steps.
//
// Idempotent (§12.6): a second end_party call after the session is already
// ended returns ok with the existing ended_at — useful for retry-safety in
// the UI.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type EndPartyParams = {
  partySessionId: string;
};

// §12.5 — data payload is the ISO timestamp at which the session ended.
// On idempotent re-call (§12.6), returns the same shape with the existing
// ended_at value preserved from the original end.
export type EndPartyData = {
  ended_at: string;
};

export function endParty(params: EndPartyParams): Promise<RpcResult<EndPartyData>> {
  return callRpc<EndPartyData>('end_party', {
    p_party_session_id: params.partySessionId,
  });
}
