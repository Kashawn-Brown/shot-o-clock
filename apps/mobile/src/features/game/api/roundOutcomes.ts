// Typed wrapper for the get_round_outcomes RPC.
// See docs/specs/rpc-contracts.md §13.3.
//
// Caller must be an active or out member of the round's party session;
// otherwise SESSION_NOT_FOUND is returned (collapses both "round not found"
// and "caller not a member" — see §13.3 + §13.1).

import { callRpc } from '@/lib/rpcClient';
import type { Database } from '@/types/db.generated';
import type { RpcResult } from '@/types/api';

type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];

export type GetRoundOutcomesData = {
  // Empty array (never null) for rounds with no outcomes yet — e.g.
  // mid-countdown or pre-shot-window. Ordered by created_at.
  outcomes: OutcomeRow[];
};

export function getRoundOutcomes(roundId: string): Promise<RpcResult<GetRoundOutcomesData>> {
  return callRpc<GetRoundOutcomesData>('get_round_outcomes', {
    p_round_id: roundId,
  });
}
