// Pure detectors for an "orphaned" anonymous session — a persisted session whose
// server-side user no longer exists. The Supabase session is restored from
// SecureStore on launch without a server round-trip, so it can outlive its user:
// most commonly a `supabase db reset` in development deletes auth.users while the
// signed JWT still validates locally. Such a session passes getSession() but is
// rejected the moment it is used.
//
// Kept import-free (no supabase client) so it unit-tests in isolation. The
// recovery action that consumes these lives in lib/sessionRecovery.ts.

// An orphaned user_id trips this foreign key when create_party / join_party
// insert the caller's roster row (party_players.user_id references auth.users).
// Postgres puts the constraint name in the error message/details, and PostgREST
// passes that through — so matching the name is precise (it won't fire on an
// unrelated FK violation, which only server-controlled columns could cause).
const PARTY_PLAYERS_USER_FK = 'party_players_user_id_fkey';

// PostgREST's code for a rejected JWT (expired or invalid for a deleted user),
// surfaced on any authenticated request.
const PGRST_JWT_REJECTED = 'PGRST301';

/**
 * True when a PostgREST/RPC error indicates the caller's session is orphaned: the
 * user_id no longer exists (party_players FK violation) or the JWT was rejected.
 */
export function isOrphanedSessionError(
  error: { code?: string; message?: string; details?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === PGRST_JWT_REJECTED) return true;
  const haystack = `${error.message ?? ''} ${error.details ?? ''}`;
  return haystack.includes(PARTY_PLAYERS_USER_FK);
}

/**
 * True when an auth-server response (e.g. getUser) rejected the token with a
 * 401/403 — the user was deleted or the token is invalid. A network failure has
 * no such status and must NOT count: re-authing on a transient blip would discard
 * a real guest identity.
 */
export function isAuthRejection(error: { status?: number } | null | undefined): boolean {
  return error?.status === 401 || error?.status === 403;
}
