// Typed wrapper for the host_set_heads_up RPC.
// See docs/specs/rpc-contracts.md §10.6.
//
// The host sets the party-wide Heads-up (pre-warning) — on/off and lead time — live
// during the game; the server-push cron reads it when deciding whether/when to send.
// Replaces the old per-device Heads-up preference (Phase 16 / D063).
//
// Rejections worth handling in the UI: NOT_HOST (only the host), HEADS_UP_LOCKED (the
// next Heads-up is about to send — locked for this round), and HEADS_UP_ALREADY_CHANGED
// (one change per round). All carry a host-readable message via rpcErrorMessage.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

// The three offered lead times, in seconds (the RPC validates this exact set).
export const HEADS_UP_LEAD_SECONDS = [60, 120, 300] as const;
export type HeadsUpLeadSeconds = (typeof HEADS_UP_LEAD_SECONDS)[number];

export type HostSetHeadsUpParams = {
  partySessionId: string;
  enabled: boolean;
  leadSeconds: HeadsUpLeadSeconds;
};

export type HostSetHeadsUpData = {
  heads_up_enabled: boolean;
  heads_up_lead_seconds: number;
  // True when the change was saved but can't fire this round (already sent, or the new
  // lead's moment is past) — it applies from the next round. The host is told.
  deferred: boolean;
};

export function hostSetHeadsUp(
  params: HostSetHeadsUpParams,
): Promise<RpcResult<HostSetHeadsUpData>> {
  return callRpc<HostSetHeadsUpData>('host_set_heads_up', {
    p_party_session_id: params.partySessionId,
    p_enabled: params.enabled,
    p_lead_seconds: params.leadSeconds,
  });
}
