import { isAuthRejection, isOrphanedSessionError } from '@/lib/orphanedSession';

describe('isOrphanedSessionError', () => {
  it('detects the party_players user_id FK violation by constraint name in the message', () => {
    expect(
      isOrphanedSessionError({
        code: '23503',
        message:
          'insert or update on table "party_players" violates foreign key constraint "party_players_user_id_fkey"',
      }),
    ).toBe(true);
  });

  it('detects the FK violation when the constraint name is in details', () => {
    expect(
      isOrphanedSessionError({
        message: 'insert or update violates foreign key constraint',
        details: 'party_players_user_id_fkey: Key (user_id)=(…) is not present in table "users".',
      }),
    ).toBe(true);
  });

  it('detects a rejected JWT (PGRST301)', () => {
    expect(isOrphanedSessionError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
  });

  it('ignores an unrelated FK violation (server-controlled column)', () => {
    // A different FK should NOT trigger a re-auth — only the user_id FK is the
    // orphaned-session signature.
    expect(
      isOrphanedSessionError({
        code: '23503',
        message: 'violates foreign key constraint "rounds_party_session_id_fkey"',
      }),
    ).toBe(false);
  });

  it('ignores unrelated errors and nullish input', () => {
    expect(isOrphanedSessionError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isOrphanedSessionError(null)).toBe(false);
    expect(isOrphanedSessionError(undefined)).toBe(false);
  });
});

describe('isAuthRejection', () => {
  it('treats 401/403 as a rejection', () => {
    expect(isAuthRejection({ status: 401 })).toBe(true);
    expect(isAuthRejection({ status: 403 })).toBe(true);
  });

  it('does not treat network / other statuses as a rejection', () => {
    expect(isAuthRejection({ status: 0 })).toBe(false);
    expect(isAuthRejection({ status: 500 })).toBe(false);
    expect(isAuthRejection({})).toBe(false);
    expect(isAuthRejection(null)).toBe(false);
    expect(isAuthRejection(undefined)).toBe(false);
  });
});
