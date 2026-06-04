// Typed wrapper for the host_mark_player_active RPC.
// See docs/specs/rpc-contracts.md §11.1 and game-rules.md §6.1 / §9.5 / §9.6.
//
// The host reinstates an out player. Limited to the most recent round
// (REINSTATE_TOO_OLD otherwise). If the player was out by missed_after_grace,
// their grace is restored. When the session was resting in the zero-active
// round_complete halt, reinstating re-triggers the auto-advance into the next
// round — new_phase reflects where it landed ('countdown' if the loop resumed,
// otherwise the unchanged phase). Mid-game only. Parameter is the TARGET
// player's id. Marking an already-active player is a logged no-op.
//
// Rejections worth handling in the UI: NOT_HOST, PLAYER_NOT_FOUND,
// PLAYER_NOT_OUT (target was removed), REINSTATE_TOO_OLD, and ILLEGAL_TRANSITION
// (game not started).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostMarkPlayerActiveParams = {
  partyPlayerId: string;
};

export type HostMarkPlayerActiveData = {
  party_player_id: string;
  status: 'active';
  new_phase: 'countdown' | 'shot_window' | 'round_complete';
};

export function hostMarkPlayerActive(
  params: HostMarkPlayerActiveParams,
): Promise<RpcResult<HostMarkPlayerActiveData>> {
  return callRpc<HostMarkPlayerActiveData>('host_mark_player_active', {
    p_party_player_id: params.partyPlayerId,
  });
}
