// Typed wrapper for the get_server_time RPC.
// See docs/specs/rpc-contracts.md §13.2.
//
// Used by clients to estimate clock skew so countdown displays stay aligned
// with party_sessions.phase_ends_at (server-authoritative timer per CLAUDE.md
// §2.1). Callable by any authenticated user; no party scope.

import { callRpc } from '@/lib/rpcClient';
import type { RpcResult } from '@/types/api';

export type GetServerTimeData = {
  // ISO-format timestamptz string emitted by Postgres now() inside
  // jsonb_build_object (e.g. "2026-05-13T22:45:13.06051+00:00").
  // Parse with Date.parse() or equivalent at the call site.
  server_time: string;
};

export function getServerTime(): Promise<RpcResult<GetServerTimeData>> {
  return callRpc<GetServerTimeData>('get_server_time');
}
