// Typed wrapper for the host_resume_timer RPC.
// See docs/specs/rpc-contracts.md §10.2 and mvp-state-machine.md §4.
//
// The host unfreezes the timer: phase_ends_at is rebuilt as now() +
// paused_remaining_seconds, and the wall-clock pause duration accrues into the
// session's total_paused_seconds. Idempotent: resuming an already-running
// session returns its current phase_ends_at. phase_ends_at is null when the
// resumed phase had no timer (the round_complete halt).
//
// Rejections worth handling in the UI: NOT_HOST and ILLEGAL_TRANSITION (nothing
// paused to resume — lobby/ended).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostResumeTimerParams = {
  partySessionId: string;
};

export type HostResumeTimerData = {
  status: 'active';
  phase_ends_at: string | null;
};

export function hostResumeTimer(
  params: HostResumeTimerParams,
): Promise<RpcResult<HostResumeTimerData>> {
  return callRpc<HostResumeTimerData>('host_resume_timer', {
    p_party_session_id: params.partySessionId,
  });
}
