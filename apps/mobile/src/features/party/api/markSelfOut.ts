// Typed wrapper for the mark_self_out RPC.
// See docs/specs/rpc-contracts.md §7 and game-rules.md §3.2.
//
// A player opts out of the current round. Legal during countdown or shot_window,
// paused or not — there is no time gate. The player's status is NOT changed here;
// round finalization (game-rules §7) turns the self_out outcome into status=out.
//
// Self-out is sticky: there is no self-service undo within the round (only a host
// reinstatement next round). If the player had already tapped Done this round,
// self_out overrides it and the server logs the override. Idempotent (§7.6): a
// second call returns the same outcome row.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type MarkSelfOutParams = {
  partySessionId: string;
};

// §7.5 — the outcome row id only. snake_case key matches the returned jsonb.
export type MarkSelfOutData = {
  outcome_id: string;
};

export function markSelfOut(
  params: MarkSelfOutParams,
): Promise<RpcResult<MarkSelfOutData>> {
  return callRpc<MarkSelfOutData>('mark_self_out', {
    p_party_session_id: params.partySessionId,
  });
}
