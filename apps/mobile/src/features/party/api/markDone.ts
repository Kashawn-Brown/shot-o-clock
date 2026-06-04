// Typed wrapper for the mark_done RPC.
// See docs/specs/rpc-contracts.md §6 and game-rules.md §3.1.
//
// A player taps Done during the shot window to record that they took the shot.
// Legal only while the session is active and in shot_window with the window
// still open (now() < phase_ends_at). Idempotent: a second tap returns the same
// outcome row with its original tap time (§6.6).
//
// Rejections worth handling in the UI: PLAYER_NOT_ACTIVE (out players can't tap),
// SHOT_WINDOW_CLOSED / ILLEGAL_TRANSITION (the round is over), and
// SELF_OUT_IS_STICKY (you already opted out this round — Done cannot override it).

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type MarkDoneParams = {
  partySessionId: string;
};

// §6.5 — the outcome row id, the action (always 'done' on success), and the ISO
// timestamp of the recorded tap. snake_case keys match the jsonb the function
// returns.
export type MarkDoneData = {
  outcome_id: string;
  player_action: 'done';
  tapped_at: string;
};

export function markDone(params: MarkDoneParams): Promise<RpcResult<MarkDoneData>> {
  return callRpc<MarkDoneData>('mark_done', {
    p_party_session_id: params.partySessionId,
  });
}
