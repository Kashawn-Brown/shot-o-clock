// Typed wrapper for the start_game RPC.
// See docs/specs/rpc-contracts.md §5.
//
// Host transitions the party from lobby to countdown, creating round 1. The
// countdown ends at phase_ends_at = now() + startingIntervalSeconds, after
// which advance_phase_if_due (Batch C2) opens the shot window.
//
// Idempotent in a narrow sense (§5.6): if the game is already in
// active/countdown/round 1, a second call returns ok with the existing round 1
// rather than creating a duplicate.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type StartGameParams = {
  partySessionId: string;
};

// §5.5 — round id, the (always 1) round number, and the ISO timestamp the
// countdown ends at. snake_case keys match the jsonb the function returns.
export type StartGameData = {
  round_id: string;
  round_number: number;
  phase_ends_at: string;
};

export function startGame(params: StartGameParams): Promise<RpcResult<StartGameData>> {
  return callRpc<StartGameData>('start_game', {
    p_party_session_id: params.partySessionId,
  });
}
