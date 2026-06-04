// Typed wrapper for the leave_party RPC.
// See docs/specs/rpc-contracts.md §4.
//
// A player exits a party while it's still in lobby. The host cannot call
// this (must call end_party instead — returns HOST_CANNOT_LEAVE). After the
// game has started, players must use mark_self_out instead (ILLEGAL_TRANSITION).
//
// Idempotent for the self-left case: a second leave_party call by a caller
// already removed via self-left returns ok. But a caller removed BY the
// HOST (kicked) returns PLAYER_REMOVED — the two cases produce different
// downstream UX. See docs/KNOWN_ISSUES.md #D013 and rpc-contracts.md §4.6.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type LeavePartyParams = {
  partySessionId: string;
};

// §4.5 / #D012 (b): success payload is an empty object — the call carries
// no information beyond the ok flag. Record<string, never> is the strict
// "empty object" type.
export type LeavePartyData = Record<string, never>;

export function leaveParty(params: LeavePartyParams): Promise<RpcResult<LeavePartyData>> {
  return callRpc<LeavePartyData>('leave_party', {
    p_party_session_id: params.partySessionId,
  });
}
