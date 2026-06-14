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
import type { Database } from '@/types/db.generated';
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
    // The casts bridge this generic wrapper to supabase-js's per-function typed
    // overload. db.generated.ts now has the full Functions union, but each entry
    // is typed `Returns: Json` with a function-specific Args shape — and callRpc
    // is generic over `fnName: string` plus a caller-supplied `T`, so it can't
    // satisfy that per-function overload statically. `args as never` is assignable
    // to whichever Args supabase infers from the function name. Real per-call type
    // safety lives in the concrete wrappers in features/*/api/*.ts, which supply
    // typed params and the `T` returned here.
    const { data, error } = await supabase.rpc(
      fnName as keyof Database['public']['Functions'],
      args as never,
    );

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

    // The guard proved the envelope shape; this cast only injects the caller's
    // `T` onto `data`, which is unverifiable at runtime (the concrete wrapper
    // that supplied T owns that contract).
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

// Narrows an unknown supabase payload to the standard envelope. Proves the
// shape only — the generic `T` on `data` is injected by the caller (see the
// cast in callRpc), so the guard uses RpcResult<unknown>.
function isStandardShape(value: unknown): value is RpcResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    'error_code' in value &&
    'error_msg' in value &&
    'data' in value
  );
}
