// Typed wrapper for the host_end_shot_window RPC.
// See docs/specs/rpc-contracts.md §10.4 and game-rules.md §7.
//
// The host ends the open shot window immediately. The round is finalized (grace
// rules applied per game-rules §7) and the game auto-advances to the next round's
// countdown — or rests in round_complete if no active players remain (D014).
// Same finalize + auto-advance the timer path runs, triggered by the host.
//
// new_phase is where finalization landed: 'countdown' (round N+1 began) or
// 'round_complete' (zero-active halt).
//
// Rejections worth handling in the UI: NOT_HOST and ILLEGAL_TRANSITION (no open
// shot window — e.g. paused, or the round already ended).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type HostEndShotWindowParams = {
  partySessionId: string;
};

export type HostEndShotWindowData = {
  new_phase: 'countdown' | 'round_complete';
};

export function hostEndShotWindow(
  params: HostEndShotWindowParams,
): Promise<RpcResult<HostEndShotWindowData>> {
  return callRpc<HostEndShotWindowData>('host_end_shot_window', {
    p_party_session_id: params.partySessionId,
  });
}
