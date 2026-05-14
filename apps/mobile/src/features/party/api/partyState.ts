// Typed wrapper for the get_party_state RPC.
// See docs/specs/rpc-contracts.md §13.1.
//
// Returns a denormalized snapshot of session + settings + current_round +
// roster. Used on initial screen load to avoid four separate queries.
// Caller must be an active or out member of the session; non-members get
// SESSION_NOT_FOUND.

import { callRpc } from '@/lib/rpcClient';
import type { Database } from '@/types/db.generated';
import type { RpcResult } from '@/types/api';

type PartyRow = Database['public']['Tables']['party_sessions']['Row'];
type SettingsRow = Database['public']['Tables']['party_settings']['Row'];
type RoundRow = Database['public']['Tables']['rounds']['Row'];
type PlayerRow = Database['public']['Tables']['party_players']['Row'];

export type GetPartyStateData = {
  session: PartyRow;
  settings: SettingsRow;
  // null in lobby (no rounds row yet) or when current_round_number does not
  // match any rounds row. See rpc-contracts.md §13.1.
  current_round: RoundRow | null;
  // The §13.1 dual visibility filter is applied in-function:
  //   - active and out always included
  //   - removed included only when caller is host OR row is caller's own
  // (Mirrors rls-rules.md §4.1 + §4.2.)
  players: PlayerRow[];
};

export function getPartyState(
  partySessionId: string,
): Promise<RpcResult<GetPartyStateData>> {
  return callRpc<GetPartyStateData>('get_party_state', {
    p_party_session_id: partySessionId,
  });
}
