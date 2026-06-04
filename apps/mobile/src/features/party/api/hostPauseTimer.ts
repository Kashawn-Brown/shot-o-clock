// Typed wrapper for the host_pause_timer RPC.
// See docs/specs/rpc-contracts.md §10.1 and mvp-state-machine.md §4.
//
// The host freezes the timer. phase_ends_at is left intact (option (a)); the
// remaining seconds are stashed in paused_remaining_seconds and consumed on
// resume. Idempotent: pausing an already-paused session returns its frozen
// state. paused_remaining_seconds is null when the paused phase has no timer
// (the zero-active round_complete halt, §8.6).
//
// Rejections worth handling in the UI: NOT_HOST (only the host may pause) and
// ILLEGAL_TRANSITION (nothing running to pause — lobby/ended).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostPauseTimerParams = {
  partySessionId: string;
};

export type HostPauseTimerData = {
  status: 'paused';
  paused_remaining_seconds: number | null;
};

export function hostPauseTimer(
  params: HostPauseTimerParams,
): Promise<RpcResult<HostPauseTimerData>> {
  return callRpc<HostPauseTimerData>('host_pause_timer', {
    p_party_session_id: params.partySessionId,
  });
}
