import type { Session } from '@supabase/supabase-js';

import { isAuthRejection } from '@/lib/orphanedSession';
import { recoverFreshAnonymousSession } from '@/lib/sessionRecovery';
import { supabase } from '@/lib/supabase';

/**
 * Return the current Supabase session, creating an anonymous one on first launch.
 *
 * The session is persisted by the SecureStore adapter (lib/supabase.ts) and
 * restored on later launches without a server round-trip, so the guest's identity
 * (auth.uid) normally stays stable across restarts. But that restored session can
 * be "orphaned": a `supabase db reset` (dev) deletes the user while the signed JWT
 * still validates locally, so getSession() happily returns a session every
 * authenticated call will reject. We validate it against the auth server
 * (getUser); on a 401/403 (e.g. the user was deleted) we silently clear it and
 * sign in a fresh anonymous guest — transparent to the user.
 *
 * A transient/offline getUser failure is NOT treated as orphaned: re-authing on a
 * network blip would needlessly discard a real identity. The RPC layer's orphan
 * retry (lib/rpcClient) is the backstop if the session really was stale.
 *
 * Throws on sign-in failure; callers surface the error (there is no offline guest
 * path in MVP — every action needs a real auth.uid for RLS and the RPCs).
 */
export async function ensureAnonymousSession(): Promise<Session> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // First launch (or storage cleared) — sign in fresh.
    return recoverFreshAnonymousSession();
  }

  // Validate the restored session against the auth server.
  const { error } = await supabase.auth.getUser();
  if (!error) return session;
  if (!isAuthRejection(error)) return session; // transient/offline — keep identity
  return recoverFreshAnonymousSession();
}
