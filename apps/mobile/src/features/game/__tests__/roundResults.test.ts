import { deriveRoundResults, type ResultGroupKey } from '@/features/game/roundResults';
import type { Database } from '@/types/db.generated';

type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];
type PlayerRow = Database['public']['Tables']['party_players']['Row'];

// Fully-typed rows with sensible defaults; tests override only what's under test.
// Listing every column means a schema change that adds a required field fails
// this file to compile — a deliberate canary (same pattern as lobbyView.test).
function makeOutcome(overrides: Partial<OutcomeRow>): OutcomeRow {
  return {
    created_at: '2026-06-11T00:00:00Z',
    eliminated_this_round: false,
    final_outcome: 'pending',
    finalized_at: '2026-06-11T00:00:00Z',
    finalized_by_player_id: null,
    grace_applied: false,
    grace_applied_at: null,
    id: 'o-default',
    notes: null,
    pardoned: false,
    pardoned_at: null,
    pardoned_by_player_id: null,
    party_player_id: 'p-default',
    party_session_id: 's-1',
    player_action: 'none',
    player_marked_self_out_at: null,
    player_tapped_done_at: null,
    referee_player_id: null,
    referee_verdict: 'not_required',
    referee_verdict_at: null,
    round_id: 'r-1',
    round_number: 3,
    status_after_round: 'active',
    status_before_round: 'active',
    updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  };
}

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

// Finds which group a given player landed in (or undefined if absent).
function groupOf(
  view: ReturnType<typeof deriveRoundResults>,
  playerId: string,
): ResultGroupKey | undefined {
  return view.groups.find((group) => group.rows.some((row) => row.playerId === playerId))?.key;
}

describe('deriveRoundResults — classification', () => {
  const player = makePlayer({ id: 'p-1' });

  it('a completed shot → Took the Shot', () => {
    const view = deriveRoundResults(
      [makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' })],
      [player],
      null,
    );
    expect(groupOf(view, 'p-1')).toBe('took_shot');
  });

  it('a missed round forgiven by grace → Used Grace', () => {
    const view = deriveRoundResults(
      [
        makeOutcome({
          party_player_id: 'p-1',
          player_action: 'missed',
          final_outcome: 'grace_used',
          grace_applied: true,
        }),
      ],
      [player],
      null,
    );
    expect(groupOf(view, 'p-1')).toBe('used_grace');
  });

  it('a self_out that consumed grace (elimination on) → Used Grace, not Skipped', () => {
    const view = deriveRoundResults(
      [
        makeOutcome({
          party_player_id: 'p-1',
          player_action: 'self_out',
          final_outcome: 'self_out',
          grace_applied: true, // D034: skip absorbed by spending grace
          status_after_round: 'active',
        }),
      ],
      [player],
      null,
    );
    expect(groupOf(view, 'p-1')).toBe('used_grace');
  });

  it('a no-consequence self_out (elimination off / unlimited) → Skipped', () => {
    const view = deriveRoundResults(
      [
        makeOutcome({
          party_player_id: 'p-1',
          player_action: 'self_out',
          final_outcome: 'self_out',
          grace_applied: false,
          status_after_round: 'active',
        }),
      ],
      [player],
      null,
    );
    expect(groupOf(view, 'p-1')).toBe('skipped');
  });

  it('a missed round with no consequence (elimination off / unlimited) → Missed', () => {
    const view = deriveRoundResults(
      [makeOutcome({ party_player_id: 'p-1', player_action: 'missed', final_outcome: 'missed' })],
      [player],
      null,
    );
    expect(groupOf(view, 'p-1')).toBe('missed');
  });

  it('an eliminated player → Out, regardless of how (missed or self_out)', () => {
    const byMiss = deriveRoundResults(
      [
        makeOutcome({
          party_player_id: 'p-1',
          player_action: 'missed',
          final_outcome: 'out',
          eliminated_this_round: true,
          status_after_round: 'out',
        }),
      ],
      [player],
      null,
    );
    expect(groupOf(byMiss, 'p-1')).toBe('out');

    const bySelfOut = deriveRoundResults(
      [
        makeOutcome({
          party_player_id: 'p-1',
          player_action: 'self_out',
          final_outcome: 'self_out',
          eliminated_this_round: true,
          status_after_round: 'out',
        }),
      ],
      [player],
      null,
    );
    expect(groupOf(bySelfOut, 'p-1')).toBe('out');
  });
});

describe('deriveRoundResults — structure', () => {
  it('hides empty groups and orders them good-news-first', () => {
    const players = [makePlayer({ id: 'p-1' }), makePlayer({ id: 'p-2' })];
    const view = deriveRoundResults(
      [
        makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' }),
        makeOutcome({
          party_player_id: 'p-2',
          player_action: 'missed',
          final_outcome: 'out',
          eliminated_this_round: true,
          status_after_round: 'out',
        }),
      ],
      players,
      null,
    );
    // Only the two non-empty groups, Took the Shot before Out.
    expect(view.groups.map((group) => group.key)).toEqual(['took_shot', 'out']);
  });

  it('tags the caller (You) and exposes them as `me` for the hero', () => {
    const players = [makePlayer({ id: 'p-1' }), makePlayer({ id: 'p-2' })];
    const view = deriveRoundResults(
      [
        makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' }),
        makeOutcome({ party_player_id: 'p-2', player_action: 'done', final_outcome: 'completed' }),
      ],
      players,
      'p-2',
    );
    expect(view.me?.playerId).toBe('p-2');
    expect(view.me?.isYou).toBe(true);
    expect(view.groups[0].rows.find((row) => row.playerId === 'p-1')?.isYou).toBe(false);
  });

  it('joins the cumulative shot count from the player row', () => {
    const view = deriveRoundResults(
      [makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' })],
      [makePlayer({ id: 'p-1', total_shots_completed: 4 })],
      null,
    );
    expect(view.groups[0].rows[0].shotCount).toBe(4);
  });

  it('counts still-in vs out-this-round from the displayed rows', () => {
    const players = [makePlayer({ id: 'p-1' }), makePlayer({ id: 'p-2' }), makePlayer({ id: 'p-3' })];
    const view = deriveRoundResults(
      [
        makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' }),
        makeOutcome({ party_player_id: 'p-2', player_action: 'self_out', final_outcome: 'self_out' }),
        makeOutcome({
          party_player_id: 'p-3',
          player_action: 'missed',
          final_outcome: 'out',
          eliminated_this_round: true,
          status_after_round: 'out',
        }),
      ],
      players,
      null,
    );
    expect(view.stillIn).toBe(2);
    expect(view.outThisRound).toBe(1);
  });

  it('drops an outcome whose player is not in the (RLS-filtered) roster', () => {
    const view = deriveRoundResults(
      [makeOutcome({ party_player_id: 'p-missing', player_action: 'done', final_outcome: 'completed' })],
      [makePlayer({ id: 'p-1' })],
      null,
    );
    expect(view.groups).toHaveLength(0);
    expect(view.me).toBeNull();
  });

  it('distinguishes a grace-forgiven miss from a grace-spending skip on the row', () => {
    const players = [makePlayer({ id: 'p-1' }), makePlayer({ id: 'p-2' })];
    const view = deriveRoundResults(
      [
        makeOutcome({
          party_player_id: 'p-1',
          player_action: 'missed',
          final_outcome: 'grace_used',
          grace_applied: true,
        }),
        makeOutcome({
          party_player_id: 'p-2',
          player_action: 'self_out',
          final_outcome: 'self_out',
          grace_applied: true,
        }),
      ],
      players,
      null,
    );
    const usedGrace = view.groups.find((group) => group.key === 'used_grace');
    expect(usedGrace?.rows.find((row) => row.playerId === 'p-1')?.detail).toBe('Missed — grace used');
    expect(usedGrace?.rows.find((row) => row.playerId === 'p-2')?.detail).toBe('Skipped — grace used');
  });

  it('leaves detail null for rows outside Used Grace', () => {
    const view = deriveRoundResults(
      [makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' })],
      [makePlayer({ id: 'p-1' })],
      null,
    );
    expect(view.groups[0].rows[0].detail).toBeNull();
  });

  it('sorts rows within a group by display name', () => {
    const players = [
      makePlayer({ id: 'p-1', display_name: 'Zoe' }),
      makePlayer({ id: 'p-2', display_name: 'Ana' }),
    ];
    const view = deriveRoundResults(
      [
        makeOutcome({ party_player_id: 'p-1', player_action: 'done', final_outcome: 'completed' }),
        makeOutcome({ party_player_id: 'p-2', player_action: 'done', final_outcome: 'completed' }),
      ],
      players,
      null,
    );
    expect(view.groups[0].rows.map((row) => row.displayName)).toEqual(['Ana', 'Zoe']);
  });
});
