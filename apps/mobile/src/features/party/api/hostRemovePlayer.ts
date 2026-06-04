// Typed wrapper for the host_remove_player RPC.
// See docs/specs/rpc-contracts.md §11.3 and game-rules.md §6.3.
//
// The host removes a non-host player from the party (active/out → removed). RLS
// then hides the session from that player. Legal in lobby and mid-game. NOT
// idempotent: re-removing returns ALREADY_REMOVED. The optional free-text reason
// is stored on the player row and the audit log. Parameter is the TARGET
// player's id.
//
// Rejections worth handling in the UI: NOT_HOST, PLAYER_NOT_FOUND,
// CANNOT_REMOVE_HOST (the host leaves by ending the party), and ALREADY_REMOVED.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostRemovePlayerParams = {
  partyPlayerId: string;
  reason?: string;
};

export type HostRemovePlayerData = {
  party_player_id: string;
  status: 'removed';
};

export function hostRemovePlayer(
  params: HostRemovePlayerParams,
): Promise<RpcResult<HostRemovePlayerData>> {
  return callRpc<HostRemovePlayerData>('host_remove_player', {
    p_party_player_id: params.partyPlayerId,
    p_reason: params.reason ?? null,
  });
}
