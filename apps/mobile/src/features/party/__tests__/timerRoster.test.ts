import { deriveTimerRoster } from '@/features/party/timerRoster';
import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];

// Fully-typed row with defaults; tests override only what they exercise. Listing
// every column makes a schema change that adds a required field fail to compile.
function makePlayer(overrides: Partial<PlayerRow>): PlayerRow {
  return {
    avatar_url: null,
    created_at: '2026-06-11T00:00:00Z',
    demoted_at: null,
    display_name: 'Player',
    duty: 'normal_player',
    guest_identity_id: null,
    id: 'p-default',
    is_ready: false,
    joined_at: '2026-06-11T00:00:00Z',
    last_seen_at: '2026-06-11T00:00:00Z',
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
    updated_at: '2026-06-11T00:00:00Z',
    used_grace: false,
    used_grace_at: null,
    used_grace_round_number: null,
    user_id: 'u-default',
    ...overrides,
  };
}

const host = makePlayer({ id: 'p-host', user_id: 'u-host', permission_role: 'host' });
const player = makePlayer({
  id: 'p-guest',
  user_id: 'u-guest',
  display_name: 'Guest',
  total_shots_completed: 3,
});

describe('deriveTimerRoster', () => {
  it('maps name, status, shots, and host/self flags', () => {
    const rows = deriveTimerRoster([host, player], 'u-guest', 'disabled');
    expect(rows).toEqual([
      {
        id: 'p-host',
        displayName: 'Player',
        status: 'active',
        shotsCompleted: 0,
        isHost: true,
        isSelf: false,
        graceAvailable: false,
      },
      {
        id: 'p-guest',
        displayName: 'Guest',
        status: 'active',
        shotsCompleted: 3,
        isHost: false,
        isSelf: true,
        graceAvailable: false,
      },
    ]);
  });

  it('keeps active and out members but drops removed rows', () => {
    const out = makePlayer({ id: 'p-out', user_id: 'u-out', status: 'out' });
    const removed = makePlayer({ id: 'p-removed', user_id: 'u-removed', status: 'removed' });
    const rows = deriveTimerRoster([host, player, out, removed], 'u-host', 'disabled');
    expect(rows.map((r) => r.id)).toEqual(['p-host', 'p-guest', 'p-out']);
  });

  it('preserves the server ordering (host first)', () => {
    const rows = deriveTimerRoster([host, player], 'u-host', 'disabled');
    expect(rows.map((r) => r.id)).toEqual(['p-host', 'p-guest']);
  });

  it('flags no row as self when there is no authenticated user', () => {
    const rows = deriveTimerRoster([host, player], null, 'disabled');
    expect(rows.every((r) => r.isSelf === false)).toBe(true);
  });

  it('derives grace availability from mode and used_grace', () => {
    const unused = makePlayer({ id: 'p-a', user_id: 'u-a', used_grace: false });
    const used = makePlayer({ id: 'p-b', user_id: 'u-b', used_grace: true });

    // enabled: available only while their grace is unspent.
    const enabled = deriveTimerRoster([unused, used], null, 'enabled');
    expect(enabled.map((r) => r.graceAvailable)).toEqual([true, false]);

    // unlimited: always available regardless of used_grace.
    const unlimited = deriveTimerRoster([unused, used], null, 'unlimited');
    expect(unlimited.map((r) => r.graceAvailable)).toEqual([true, true]);

    // disabled: never available.
    const disabled = deriveTimerRoster([unused, used], null, 'disabled');
    expect(disabled.map((r) => r.graceAvailable)).toEqual([false, false]);
  });
});
