import { deriveLobbyView } from '@/features/party/lobbyView';
import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];

// Build a fully-typed party_players row with sensible defaults; tests override
// only the fields under test. Keeping every column here means a schema change
// that adds a required column fails this file to compile — a deliberate canary.
function makePlayer(overrides: Partial<PlayerRow>): PlayerRow {
  return {
    avatar_url: null,
    created_at: '2026-06-09T00:00:00Z',
    demoted_at: null,
    display_name: 'Player',
    duty: 'normal_player',
    guest_identity_id: null,
    id: 'p-default',
    is_ready: false,
    joined_at: '2026-06-09T00:00:00Z',
    last_seen_at: '2026-06-09T00:00:00Z',
    left_at: null,
    out_at: null,
    out_reason: null,
    out_round_number: null,
    party_session_id: 's-1',
    permission_role: 'player',
    promoted_at: null,
    promoted_by_player_id: null,
    rejoined_at: null,
    removed_at: null,
    removed_by_player_id: null,
    removed_reason: null,
    status: 'active',
    total_missed_rounds: 0,
    total_pardons_received: 0,
    total_shots_completed: 0,
    updated_at: '2026-06-09T00:00:00Z',
    used_grace: false,
    used_grace_at: null,
    used_grace_round_number: null,
    user_id: 'u-default',
    ...overrides,
  };
}

const host = makePlayer({ id: 'p-host', user_id: 'u-host', permission_role: 'host' });
const player = makePlayer({ id: 'p-guest', user_id: 'u-guest', permission_role: 'player' });

describe('deriveLobbyView', () => {
  it('marks the caller as host when their own row holds the host role', () => {
    const view = deriveLobbyView([host, player], 'u-host');
    expect(view.isHost).toBe(true);
    expect(view.me?.id).toBe('p-host');
  });

  it('marks the caller as non-host when their own row is a player', () => {
    const view = deriveLobbyView([host, player], 'u-guest');
    expect(view.isHost).toBe(false);
    expect(view.me?.id).toBe('p-guest');
  });

  it('returns me=null and isHost=false when the caller is not in the roster', () => {
    const view = deriveLobbyView([host, player], 'u-stranger');
    expect(view.me).toBeNull();
    expect(view.isHost).toBe(false);
  });

  it('returns me=null and isHost=false when there is no authenticated user', () => {
    const view = deriveLobbyView([host, player], null);
    expect(view.me).toBeNull();
    expect(view.isHost).toBe(false);
    // Roster still renders; nobody is flagged as self.
    expect(view.roster.every((entry) => entry.isSelf === false)).toBe(true);
  });

  it('counts only active players toward activePlayerCount', () => {
    const outPlayer = makePlayer({ id: 'p-out', user_id: 'u-out', status: 'out' });
    const view = deriveLobbyView([host, player, outPlayer], 'u-host');
    expect(view.activePlayerCount).toBe(2);
  });

  it('drops removed rows from the roster but keeps active and out members', () => {
    const outPlayer = makePlayer({ id: 'p-out', user_id: 'u-out', status: 'out' });
    const removed = makePlayer({ id: 'p-removed', user_id: 'u-removed', status: 'removed' });
    const view = deriveLobbyView([host, player, outPlayer, removed], 'u-host');
    const ids = view.roster.map((entry) => entry.id);
    expect(ids).toEqual(['p-host', 'p-guest', 'p-out']);
  });

  it('flags the caller-owned roster entry as self', () => {
    const view = deriveLobbyView([host, player], 'u-guest');
    const selfEntries = view.roster.filter((entry) => entry.isSelf).map((entry) => entry.id);
    expect(selfEntries).toEqual(['p-guest']);
  });

  it('preserves the server-provided ordering (host first)', () => {
    const view = deriveLobbyView([host, player], 'u-host');
    expect(view.roster.map((entry) => entry.id)).toEqual(['p-host', 'p-guest']);
    expect(view.roster[0].isHost).toBe(true);
    expect(view.roster[1].isHost).toBe(false);
  });
});
