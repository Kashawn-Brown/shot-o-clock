// Typed wrapper around supabase.rpc().
//
// All Phase 2 RPCs return the standard shape from docs/specs/rpc-contracts.md
// §1.3: { ok, error_code, error_msg, data }. This wrapper normalizes the call
// so every caller handles exactly one result shape — `RpcResult<T>` — whether
// the server returned a handled error, threw an exception, or the network
// failed entirely.
//
// Two error categories are folded into the same shape:
//   - "Handled" errors come back as `{ ok: false, error_code: <DbRpcErrorCode> }`
//     from the database itself.
//   - "Unexpected" errors (supabase-js threw, network failure, malformed
//     response) are converted to `{ ok: false, error_code: 'UNEXPECTED_ERROR' }`
//     by this wrapper. See docs/KNOWN_ISSUES.md #D010.

import { isOrphanedSessionError } from '@/lib/orphanedSession';
import { recoverFreshAnonymousSession } from '@/lib/sessionRecovery';
import { supabase } from '@/lib/supabase';
import type { RpcResult } from '@/types/api';

type RpcArgs = Record<string, unknown>;

export async function callRpc<T>(
  fnName: string,
  args: RpcArgs = {},
  // Internal: set on the post-recovery retry so an orphaned-session re-auth runs at
  // most once per call (no retry loop). Callers never pass this.
  isOrphanRetry = false,
): Promise<RpcResult<T>> {
  try {
    // `as never` casts are deliberate, not a bug:
    //   (a) supabase.rpc() is typed against Database['public']['Functions'],
    //       which is currently empty for our RPCs — the Phase 2 functions
    //       (get_party_state, etc.) do not exist yet and so are absent from
    //       `db.generated.ts`. A2 regenerates types after the read-RPC
    //       migration lands.
    //   (b) Call-site type safety is provided by the concrete per-RPC
    //       wrappers in features/*/api/*.ts (Batch A3), which supply typed
    //       params and a typed return payload. This generic wrapper is the
    //       single uniform shape-handler beneath them.
    //   (c) Revisit / tighten in A3 or a Batch B cleanup if the regenerated
    //       Functions union lets us drop the casts without losing the
    //       generic shape — see docs/KNOWN_ISSUES.md #D010.
    const { data, error } = await supabase.rpc(fnName as never, args as never);

    if (error) {
      // Orphaned session (e.g. the user was deleted by a dev `supabase db reset`):
      // the user_id FK violates on a party insert, or the JWT is rejected. Re-auth
      // as a fresh anonymous guest and retry once — transparent to the user. The
      // failed RPC's transaction rolled back, so the retry is safe to re-run.
      if (!isOrphanRetry && isOrphanedSessionError(error)) {
        try {
          await recoverFreshAnonymousSession();
          return await callRpc<T>(fnName, args, true);
        } catch {
          // Recovery itself failed (offline, etc.) — fall through to the error.
        }
      }
      return unexpected(`RPC ${fnName} failed: ${error.message}`);
    }

    if (!isStandardShape(data)) {
      return unexpected(`RPC ${fnName} returned a non-standard shape.`);
    }

    return data as RpcResult<T>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return unexpected(`RPC ${fnName} threw: ${msg}`);
  }
}

function unexpected(msg: string): RpcResult<never> {
  return {
    ok: false,
    error_code: 'UNEXPECTED_ERROR',
    error_msg: msg,
    data: null,
  };
}

function isStandardShape(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    'error_code' in value &&
    'error_msg' in value &&
    'data' in value
  );
}
