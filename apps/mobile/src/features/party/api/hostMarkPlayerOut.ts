// Typed wrapper for the host_mark_player_out RPC.
// See docs/specs/rpc-contracts.md §11.2 and game-rules.md §6.2.
//
// The host marks an active player out (out_reason = host_marked_out) at the
// current round. Mid-game only (rejected in lobby). Marking an already-out
// player is a logged no-op. Note the parameter is the TARGET player's id, not a
// session id.
//
// Rejections worth handling in the UI: NOT_HOST, PLAYER_NOT_FOUND,
// PLAYER_NOT_ACTIVE (target was removed), and ILLEGAL_TRANSITION (game not
// started).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostMarkPlayerOutParams = {
  partyPlayerId: string;
};

export type HostMarkPlayerOutData = {
  party_player_id: string;
  status: 'out';
};

export function hostMarkPlayerOut(
  params: HostMarkPlayerOutParams,
): Promise<RpcResult<HostMarkPlayerOutData>> {
  return callRpc<HostMarkPlayerOutData>('host_mark_player_out', {
    p_party_player_id: params.partyPlayerId,
  });
}
