import { deriveTimerRoster } from '@/features/party/timerRoster';
import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];
type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];

// A self_out outcome for `partyPlayerId` — only player_action + party_player_id are
// read by the derivation; the rest are filled to keep the row fully typed.
function selfOutOutcome(partyPlayerId: string): OutcomeRow {
  return {
    created_at: '2026-06-11T00:00:00Z',
    eliminated_this_round: false,
    final_outcome: 'pending',
    finalized_at: null,
    finalized_by_player_id: null,
    grace_applied: false,
    grace_applied_at: null,
    id: `o-${partyPlayerId}`,
    notes: null,
    pardoned: false,
    pardoned_at: null,
    pardoned_by_player_id: null,
    party_player_id: partyPlayerId,
    party_session_id: 's-1',
    player_action: 'self_out',
    player_marked_self_out_at: '2026-06-11T00:00:05Z',
    player_tapped_done_at: null,
    referee_player_id: null,
    referee_verdict: 'not_required',
    referee_verdict_at: null,
    round_id: 'r-1',
    round_number: 1,
    status_after_round: null,
    status_before_round: 'active',
    updated_at: '2026-06-11T00:00:05Z',
  };
}

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
    joined_round_number: null,
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
  it('maps name, status, shots, and host/self flags (self floated first)', () => {
    const rows = deriveTimerRoster([host, player], 'u-guest', 'disabled');
    expect(rows).toEqual([
      {
        id: 'p-guest',
        displayName: 'Guest',
        status: 'active',
        shotsCompleted: 3,
        isHost: false,
        isSelf: true,
        graceAvailable: false,
        reinstatable: false,
      },
      {
        id: 'p-host',
        displayName: 'Player',
        status: 'active',
        shotsCompleted: 0,
        isHost: true,
        isSelf: false,
        graceAvailable: false,
        reinstatable: false,
      },
    ]);
  });

  it('keeps active and out members but drops removed rows', () => {
    const out = makePlayer({ id: 'p-out', user_id: 'u-out', status: 'out' });
    const removed = makePlayer({ id: 'p-removed', user_id: 'u-removed', status: 'removed' });
    const rows = deriveTimerRoster([host, player, out, removed], 'u-host', 'disabled');
    expect(rows.map((r) => r.id)).toEqual(['p-host', 'p-guest', 'p-out']);
  });

  it('preserves the server ordering (host first) when the caller is the host', () => {
    const rows = deriveTimerRoster([host, player], 'u-host', 'disabled');
    expect(rows.map((r) => r.id)).toEqual(['p-host', 'p-guest']);
  });

  it('floats the caller above the host when the caller is a player', () => {
    const rows = deriveTimerRoster([host, player], 'u-guest', 'disabled');
    expect(rows.map((r) => r.id)).toEqual(['p-guest', 'p-host']);
  });

  it('floats self to the front of a larger roster, others keep server order', () => {
    const other = makePlayer({ id: 'p-other', user_id: 'u-other', display_name: 'Other' });
    const rows = deriveTimerRoster([host, other, player], 'u-guest', 'disabled');
    expect(rows.map((r) => r.id)).toEqual(['p-guest', 'p-host', 'p-other']);
  });

  it('flags no row as self when there is no authenticated user', () => {
    const rows = deriveTimerRoster([host, player], null, 'disabled');
    expect(rows.every((r) => r.isSelf === false)).toBe(true);
  });

  it('shows a still-active player who self_out this round as Out', () => {
    const rows = deriveTimerRoster([host, player], 'u-host', 'disabled', [selfOutOutcome('p-guest')]);
    expect(rows.find((r) => r.id === 'p-guest')?.status).toBe('out');
    // The host (no self_out outcome) stays active.
    expect(rows.find((r) => r.id === 'p-host')?.status).toBe('active');
  });

  it('shows a player who left (left_at after last_seen_at) as Left', () => {
    const leaver = makePlayer({
      id: 'p-left',
      user_id: 'u-left',
      last_seen_at: '2026-06-11T00:00:00Z',
      left_at: '2026-06-11T00:05:00Z',
    });
    const rows = deriveTimerRoster([host, leaver], 'u-host', 'disabled');
    expect(rows.find((r) => r.id === 'p-left')?.status).toBe('left');
  });

  it('clears Left once seen again — a rejoin bumps last_seen_at past left_at', () => {
    const rejoined = makePlayer({
      id: 'p-left',
      user_id: 'u-left',
      left_at: '2026-06-11T00:05:00Z',
      last_seen_at: '2026-06-11T00:06:00Z',
    });
    const rows = deriveTimerRoster([host, rejoined], 'u-host', 'disabled');
    expect(rows.find((r) => r.id === 'p-left')?.status).toBe('active');
  });

  it('prefers Left over the self_out Out display when a leaver also self_out', () => {
    const leaver = makePlayer({
      id: 'p-left',
      user_id: 'u-left',
      last_seen_at: '2026-06-11T00:00:00Z',
      left_at: '2026-06-11T00:05:00Z',
    });
    const rows = deriveTimerRoster([leaver], null, 'disabled', [selfOutOutcome('p-left')]);
    expect(rows[0].status).toBe('left');
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

  it('marks a host-marked-out player reinstatable; a self-out in the current round not', () => {
    const hostOut = makePlayer({
      id: 'p-h',
      user_id: 'u-h',
      status: 'out',
      out_reason: 'host_marked_out',
    });
    // Self-out finalized in round 2, and the session is still on round 2 — dimmed.
    const selfOut = makePlayer({
      id: 'p-s',
      user_id: 'u-s',
      status: 'out',
      out_reason: 'self_opted_out',
      out_round_number: 2,
    });
    const rows = deriveTimerRoster([hostOut, selfOut], null, 'disabled', [], 2);
    expect(rows.find((r) => r.id === 'p-h')?.reinstatable).toBe(true);
    expect(rows.find((r) => r.id === 'p-s')?.reinstatable).toBe(false);
  });

  it('marks a self-out reinstatable once a new round has started (out_round < current)', () => {
    const selfOut = makePlayer({
      id: 'p-s',
      user_id: 'u-s',
      status: 'out',
      out_reason: 'self_opted_out',
      out_round_number: 2,
    });
    // Same player, now that the game has advanced to round 3 — full weight.
    const rows = deriveTimerRoster([selfOut], null, 'disabled', [], 3);
    expect(rows[0].reinstatable).toBe(true);
  });

  it('dims a pending self-out (not yet finalized, out_round_number null)', () => {
    const selfOut = makePlayer({
      id: 'p-s',
      user_id: 'u-s',
      status: 'out',
      out_reason: 'self_opted_out',
      out_round_number: null,
    });
    const rows = deriveTimerRoster([selfOut], null, 'disabled', [], 2);
    expect(rows[0].reinstatable).toBe(false);
  });

  it('marks a rejoined-after-out player reinstatable even on a self-out', () => {
    const rejoined = makePlayer({
      id: 'p-r',
      user_id: 'u-r',
      status: 'out',
      out_reason: 'self_opted_out',
      out_at: '2026-06-11T00:00:00Z',
      rejoined_at: '2026-06-11T00:05:00Z',
    });
    const rows = deriveTimerRoster([rejoined], null, 'disabled');
    expect(rows[0].reinstatable).toBe(true);
  });
});
