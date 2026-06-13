// Recovery for an orphaned anonymous session (see lib/orphanedSession.ts for the
// detectors). When the persisted session's user no longer exists server-side
// (most commonly a `supabase db reset` in development), the stale session is
// rejected the moment it is used — a 401 at bootstrap, or a user_id FK violation
// on a party RPC. Recovery drops the stale session and signs in a fresh anonymous
// guest — the same end state as a first launch, transparent to the user.
//
// Lives in lib/ (only touches the supabase client) so lib/rpcClient can use it
// without importing from features/.

import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// De-dupes concurrent recoveries: several in-flight RPCs can all observe the
// orphan error at once; without this each would create a brand-new anonymous
// user. They instead share one recovery and the same resulting session.
let recoveryInFlight: Promise<Session> | null = null;

/**
 * Clear any persisted session and sign in a fresh anonymous guest. Concurrent
 * callers share a single in-flight recovery.
 */
export function recoverFreshAnonymousSession(): Promise<Session> {
  if (!recoveryInFlight) {
    recoveryInFlight = runRecovery().finally(() => {
      recoveryInFlight = null;
    });
  }
  return recoveryInFlight;
}

async function runRecovery(): Promise<Session> {
  // scope: 'local' — do not ask the server to revoke a token whose user may be
  // gone; this clears the in-memory + persisted session, and the secureStorage
  // adapter's removeItem drops every chunk and the count marker, so SecureStore is
  // fully cleared.
  await supabase.auth.signOut({ scope: 'local' });

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) {
    throw new Error('Anonymous sign-in returned no session after recovery');
  }
  return data.session;
}
