// Typed wrapper for the mark_self_left RPC (Phase 10).
//
// Stamps left_at on the caller's party_players row so other devices can show them
// as "Left" rather than "Out" — mark_self_out alone is indistinguishable from an
// "I'm Out". Does not remove the player or change their status. Called alongside
// mark_self_out on the mid-game Leave Party flow (useGameExit).
//
// Rejections are non-fatal for the leave flow (the caller ignores the result and
// routes home regardless): HOST_CANNOT_LEAVE (a host ends the party) and
// NOT_IN_PARTY (session gone / not a member).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type MarkSelfLeftParams = {
  partySessionId: string;
};

export type MarkSelfLeftData = {
  party_player_id: string;
  left_at: string;
};

export function markSelfLeft(params: MarkSelfLeftParams): Promise<RpcResult<MarkSelfLeftData>> {
  return callRpc<MarkSelfLeftData>('mark_self_left', {
    p_party_session_id: params.partySessionId,
  });
}
