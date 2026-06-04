// Typed wrapper for the host_add_time RPC.
// See docs/specs/rpc-contracts.md §10.3 and mvp-state-machine.md §3.2/§3.3.
//
// The host extends the current phase. While active, phase_ends_at is pushed out
// by `seconds`; while paused, the stored paused_remaining_seconds is extended
// instead (phase_ends_at is frozen under option (a)). NOT idempotent — each call
// adds more time, so the UI should debounce the button. seconds must be 1–600.
//
// The authoritative field in the response depends on `status`: phase_ends_at
// while active, paused_remaining_seconds while paused.
//
// Rejections worth handling in the UI: NOT_HOST, INVALID_PARAM (seconds out of
// range), and ILLEGAL_TRANSITION (not in a countdown / shot window).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostAddTimeParams = {
  partySessionId: string;
  seconds: number;
};

export type HostAddTimeData = {
  status: 'active' | 'paused';
  phase_ends_at: string | null;
  paused_remaining_seconds: number | null;
};

export function hostAddTime(
  params: HostAddTimeParams,
): Promise<RpcResult<HostAddTimeData>> {
  return callRpc<HostAddTimeData>('host_add_time', {
    p_party_session_id: params.partySessionId,
    p_seconds: params.seconds,
  });
}
