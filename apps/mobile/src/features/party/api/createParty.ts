// Typed wrapper for the create_party RPC.
// See docs/specs/rpc-contracts.md §2.
//
// Creates a new party session in the lobby phase. The caller becomes the
// host. Caller-supplied settings populate party_settings; remaining fields
// take schema defaults. Returns the new session id, the generated join code,
// and the host's party_player_id.
//
// See docs/KNOWN_ISSUES.md #D011 for the locked B1 conventions (join code
// generation, ALREADY_HOSTING scope, phase_started_at on create).

import { callRpc } from '@/lib/rpcClient';
import type { Database } from '@/types/db.generated';
import type { RpcResult } from '@/types/api';

type GraceMode = Database['public']['Enums']['grace_mode'];

export type CreatePartyParams = {
  partyName: string;
  startingIntervalSecs: number;
  intervalIncrementSecs: number;
  shotWindowSecs: number;
  eliminationEnabled: boolean;
  graceMode: GraceMode;
  hostDisplayName: string;
};

// Data payload mirrors §2.6 — snake_case keys match the jsonb the function
// returns; the wrapper does not re-shape on the way out.
export type CreatePartyData = {
  party_session_id: string;
  join_code: string;
  host_player_id: string;
};

export function createParty(params: CreatePartyParams): Promise<RpcResult<CreatePartyData>> {
  return callRpc<CreatePartyData>('create_party', {
    p_party_name: params.partyName,
    p_starting_interval_secs: params.startingIntervalSecs,
    p_interval_increment_secs: params.intervalIncrementSecs,
    p_shot_window_secs: params.shotWindowSecs,
    p_elimination_enabled: params.eliminationEnabled,
    p_grace_mode: params.graceMode,
    p_host_display_name: params.hostDisplayName,
  });
}
