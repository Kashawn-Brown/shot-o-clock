// Typed wrapper for the join_party RPC.
// See docs/specs/rpc-contracts.md §3 and §3.6.
//
// A guest joins an existing party by join_code, or reconnects if they
// already have a party_players row in the session. The reconnect path
// (§3.6) short-circuits the §3.4 status/lock preconditions per
// docs/KNOWN_ISSUES.md #D011 (5) — a mid-game player whose app force-quit
// can re-call this function with the same join code and rejoin.
//
// `is_reconnect: true` distinguishes the reconnect branch from a fresh
// join. `display_name` is preserved on reconnect (§3.6) — the value sent
// here only takes effect on the new-join path.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type JoinPartyParams = {
  joinCode: string;
  displayName: string;
};

// Data payload mirrors §3.7 — snake_case keys match the jsonb the function
// returns; the wrapper does not re-shape on the way out.
export type JoinPartyData = {
  party_session_id: string;
  party_player_id: string;
  is_reconnect: boolean;
};

export function joinParty(
  params: JoinPartyParams,
): Promise<RpcResult<JoinPartyData>> {
  return callRpc<JoinPartyData>('join_party', {
    p_join_code: params.joinCode,
    p_display_name: params.displayName,
  });
}
