import { derivePartySummary } from '@/features/game/partySummary';
import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];

// Fully-typed rows with sensible defaults; tests override only what's under test.
// Listing every column means a schema change that adds a required field fails this
// file to compile — a deliberate canary (same pattern as roundResults.test).
function makePlayer(overrides: Partial<PlayerRow>): PlayerRow {
  return {
    avatar_url: null,
    created_at: '2026-06-13T00:00:00Z',
    demoted_at: null,
    display_name: 'Player',
    duty: 'normal_player',
    guest_identity_id: null,
    id: 'p-default',
    is_ready: false,
    joined_at: '2026-06-13T00:00:00Z',
    joined_round_number: null,
    last_seen_at: '2026-06-13T00:00:00Z',
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
    updated_at: '2026-06-13T00:00:00Z',
    used_grace: false,
    used_grace_at: null,
    used_grace_round_number: null,
    user_id: 'u-default',
    ...overrides,
  };
}

const OPTS = { partyName: 'Friday Night Shots', totalRounds: 8, eliminationEnabled: true };

describe('derivePartySummary', () => {
  it('passes through party name, total rounds, and elimination flag', () => {
    const view = derivePartySummary([], null, OPTS);
    expect(view.partyName).toBe('Friday Night Shots');
    expect(view.totalRounds).toBe(8);
    expect(view.eliminationEnabled).toBe(true);
  });

  it('titles the hero "Last Standing" with elimination on, "Top Shots" with it off', () => {
    const players = [makePlayer({ id: 'a', total_shots_completed: 3 })];
    expect(derivePartySummary(players, null, { ...OPTS, eliminationEnabled: true }).heroTitle).toBe(
      'Last Standing',
    );
    expect(
      derivePartySummary(players, null, { ...OPTS, eliminationEnabled: false }).heroTitle,
    ).toBe('Top Shots');
  });

  it('ranks standings by shots descending', () => {
    const players = [
      makePlayer({ id: 'a', display_name: 'Alex', total_shots_completed: 5 }),
      makePlayer({ id: 'b', display_name: 'Bo', total_shots_completed: 8 }),
      makePlayer({ id: 'c', display_name: 'Cy', total_shots_completed: 2 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.standings.map((s) => s.playerId)).toEqual(['b', 'a', 'c']);
    expect(view.standings.map((s) => s.shotCount)).toEqual([8, 5, 2]);
  });

  it('breaks shot-count ties by name ascending', () => {
    const players = [
      makePlayer({ id: 'z', display_name: 'Zoe', total_shots_completed: 4 }),
      makePlayer({ id: 'a', display_name: 'Ann', total_shots_completed: 4 }),
      makePlayer({ id: 'm', display_name: 'Max', total_shots_completed: 4 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.standings.map((s) => s.displayName)).toEqual(['Ann', 'Max', 'Zoe']);
  });

  it('crowns a single leader by name, marks them in the standings', () => {
    const players = [
      makePlayer({ id: 'a', display_name: 'Alex', total_shots_completed: 8 }),
      makePlayer({ id: 'b', display_name: 'Bo', total_shots_completed: 3 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.heroMode).toBe('names');
    expect(view.topShotCount).toBe(8);
    expect(view.leaderCount).toBe(1);
    expect(view.leaders.map((l) => l.displayName)).toEqual(['Alex']);
    expect(view.standings.find((s) => s.playerId === 'a')?.isLeader).toBe(true);
    expect(view.standings.find((s) => s.playerId === 'b')?.isLeader).toBe(false);
  });

  it('shows names for up to 3 tied leaders, sorted by name', () => {
    const players = [
      makePlayer({ id: 'c', display_name: 'Cy', total_shots_completed: 6 }),
      makePlayer({ id: 'a', display_name: 'Alex', total_shots_completed: 6 }),
      makePlayer({ id: 'b', display_name: 'Bo', total_shots_completed: 6 }),
      makePlayer({ id: 'd', display_name: 'Di', total_shots_completed: 1 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.heroMode).toBe('names');
    expect(view.leaderCount).toBe(3);
    expect(view.leaders.map((l) => l.displayName)).toEqual(['Alex', 'Bo', 'Cy']);
  });

  it('collapses 4+ tied leaders to a count, but still trophies all of them in the list', () => {
    const players = [
      makePlayer({ id: 'a', display_name: 'Alex', total_shots_completed: 6 }),
      makePlayer({ id: 'b', display_name: 'Bo', total_shots_completed: 6 }),
      makePlayer({ id: 'c', display_name: 'Cy', total_shots_completed: 6 }),
      makePlayer({ id: 'd', display_name: 'Di', total_shots_completed: 6 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.heroMode).toBe('count');
    expect(view.leaderCount).toBe(4);
    expect(view.topShotCount).toBe(6);
    expect(view.standings.every((s) => s.isLeader)).toBe(true);
  });

  it('crowns no one when nobody took a shot', () => {
    const players = [
      makePlayer({ id: 'a', total_shots_completed: 0 }),
      makePlayer({ id: 'b', total_shots_completed: 0 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.heroMode).toBe('none');
    expect(view.topShotCount).toBe(0);
    expect(view.leaderCount).toBe(0);
    expect(view.leaders).toEqual([]);
    expect(view.standings.every((s) => !s.isLeader)).toBe(true);
  });

  it('lists removed players at the bottom and never crowns them', () => {
    const players = [
      makePlayer({ id: 'a', display_name: 'Alex', status: 'active', total_shots_completed: 2 }),
      // Kicked player with the most shots — still must not lead.
      makePlayer({
        id: 'k',
        display_name: 'Kit',
        status: 'removed',
        removed_at: '2026-06-13T01:00:00Z',
        total_shots_completed: 9,
      }),
      makePlayer({ id: 'b', display_name: 'Bo', status: 'out', total_shots_completed: 5 }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    // Eligible top is Bo at 5, not the kicked Kit at 9.
    expect(view.topShotCount).toBe(5);
    expect(view.leaders.map((l) => l.displayName)).toEqual(['Bo']);
    // Removed player sorts to the bottom regardless of shots, flagged + not a leader.
    const last = view.standings[view.standings.length - 1];
    expect(last.playerId).toBe('k');
    expect(last.isRemoved).toBe(true);
    expect(last.isLeader).toBe(false);
  });

  it('treats an out (or left) player as a normal participant who can lead on shots', () => {
    const players = [
      makePlayer({ id: 'a', display_name: 'Alex', status: 'active', total_shots_completed: 4 }),
      makePlayer({
        id: 'b',
        display_name: 'Bo',
        status: 'out',
        out_round_number: 6,
        total_shots_completed: 7,
      }),
    ];
    const view = derivePartySummary(players, null, OPTS);
    expect(view.leaders.map((l) => l.displayName)).toEqual(['Bo']);
    expect(view.standings[0].playerId).toBe('b');
  });

  it('flags the caller as "you" in leaders and standings', () => {
    const players = [
      makePlayer({ id: 'me', display_name: 'Me', total_shots_completed: 5 }),
      makePlayer({ id: 'other', display_name: 'Other', total_shots_completed: 2 }),
    ];
    const view = derivePartySummary(players, 'me', OPTS);
    expect(view.leaders[0].isYou).toBe(true);
    expect(view.standings.find((s) => s.playerId === 'me')?.isYou).toBe(true);
    expect(view.standings.find((s) => s.playerId === 'other')?.isYou).toBe(false);
  });
});
