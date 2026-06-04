import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * Return the current Supabase session, creating an anonymous one on first launch.
 *
 * The session is persisted by the SecureStore adapter (lib/supabase.ts), so on
 * later launches `getSession()` restores the stored session and no new anonymous
 * user is created — the guest's identity (auth.uid) stays stable across restarts.
 *
 * Throws on sign-in failure; callers surface the error (there is no offline guest
 * path in MVP — every action needs a real auth.uid for RLS and the RPCs).
 */
export async function ensureAnonymousSession(): Promise<Session> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) {
    throw new Error('Anonymous sign-in returned no session');
  }
  return data.session;
}
