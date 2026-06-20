// Typed wrapper for the host_set_party_lock RPC.
// See docs/specs/rpc-contracts.md §11.4.
//
// The host locks or unlocks the party so new players cannot join even with the
// code — the paired control for the is_locked flag join_party already enforces
// (PARTY_LOCKED). Idempotent: setting the state it's already in is an ok no-op.
//
// Rejections worth handling in the UI: NOT_HOST (only the host may toggle) and
// ILLEGAL_TRANSITION (the party is no longer active).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostSetPartyLockParams = {
  partySessionId: string;
  locked: boolean;
};

export type HostSetPartyLockData = {
  is_locked: boolean;
};

export function hostSetPartyLock(
  params: HostSetPartyLockParams,
): Promise<RpcResult<HostSetPartyLockData>> {
  return callRpc<HostSetPartyLockData>('host_set_party_lock', {
    p_party_session_id: params.partySessionId,
    p_locked: params.locked,
  });
}
