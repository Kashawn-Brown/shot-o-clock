// Typed wrapper for the host_skip_to_shot_window RPC.
// See docs/specs/rpc-contracts.md §10.5 and mvp-state-machine.md §3.2.
//
// The host ends the current countdown immediately and opens the shot window —
// the same effect as the timer expiring, but triggered by the host. Legal only
// from an unpaused countdown; requires at least one active player. Idempotent:
// if the shot window is already open, returns no-op.
//
// Rejections worth handling in the UI: NOT_HOST, ILLEGAL_TRANSITION (not in a
// running countdown), and NO_ACTIVE_PLAYERS.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostSkipToShotWindowParams = {
  partySessionId: string;
};

export type HostSkipToShotWindowData = {
  new_phase: 'shot_window';
};

export function hostSkipToShotWindow(
  params: HostSkipToShotWindowParams,
): Promise<RpcResult<HostSkipToShotWindowData>> {
  return callRpc<HostSkipToShotWindowData>('host_skip_to_shot_window', {
    p_party_session_id: params.partySessionId,
  });
}
