// Pure derivation of the Round Results view-model from a round's finalized
// outcomes + the party roster. UI-free so it unit-tests without rendering — the
// results screen (app/party/[partyId]/results.tsx) consumes it.
//
// Seven groups, each player in exactly one. Two are STATE-based (read off the
// player row, not the outcome) and take precedence; the rest read the outcome's
// final_outcome + eliminated_this_round only:
//   - Kicked  = the host removed them (party_players.status = 'removed')
//   - Left    = they left the party (party_players.left_at is set)
//   - Out     = eliminated this round (eliminated_this_round, or final_outcome out)
//   - Missed  = final_outcome 'missed'
//   - UsedGrace = final_outcome 'grace_used' (a miss the server forgave)
//   - Skipped = final_outcome 'self_out' (voluntary skip — grace-spend or not)
//   - TookShot = final_outcome 'completed'
//
// Assignment priority when more than one could apply (a kicked/left player may
// also have an outcome, an eliminated player may have any final_outcome):
//   Kicked > Left > Out > Missed > Used Grace > Skipped > Took the Shot.
//
// Reinstatement is NOT a group — it's a host action, not a round outcome; a
// reinstated player lands in whatever group their actual round result matches.

import type { Database } from '@/types/db.generated';

type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];
type PlayerRow = Database['public']['Tables']['party_players']['Row'];

export type ResultGroupKey =
  | 'took_shot'
  | 'used_grace'
  | 'skipped'
  | 'missed'
  | 'out'
  | 'left'
  | 'kicked';

export interface ResultRow {
  playerId: string;
  displayName: string;
  isYou: boolean;
  // Cumulative shots the player has completed across the game (party_players.
  // total_shots_completed), not this round — the row's "shot count" badge.
  shotCount: number;
  group: ResultGroupKey;
}

export interface ResultGroup {
  key: ResultGroupKey;
  label: string;
  rows: ResultRow[];
}

export interface RoundResultsView {
  // Non-empty groups only, in the fixed display order below.
  groups: ResultGroup[];
  // The caller's own row, for the hero card. null if they had no outcome this
  // round and aren't kicked/left, or aren't identified.
  me: ResultRow | null;
  // Players still in after this round vs. eliminated this round — for the summary
  // line. Left / kicked count as neither.
  stillIn: number;
  outThisRound: number;
}

// Fixed display order: the good news first, departures last.
const GROUP_ORDER: readonly ResultGroupKey[] = [
  'took_shot',
  'used_grace',
  'skipped',
  'missed',
  'out',
  'left',
  'kicked',
];

const GROUP_LABELS: Record<ResultGroupKey, string> = {
  took_shot: 'Took the Shot',
  used_grace: 'Used Grace',
  skipped: 'Skipped',
  missed: 'Missed',
  out: 'Out',
  left: 'Left',
  kicked: 'Kicked',
};

// Groups whose players are still in the game after this round.
const STILL_IN_GROUPS: ReadonlySet<ResultGroupKey> = new Set([
  'took_shot',
  'used_grace',
  'skipped',
  'missed',
]);

// The single group a player belongs to this round, by the priority above; null
// when the player neither has an outcome this round nor is kicked/left (i.e. they
// didn't participate and aren't a departure).
function classify(player: PlayerRow, outcome: OutcomeRow | undefined): ResultGroupKey | null {
  if (player.status === 'removed') return 'kicked';
  if (player.left_at !== null) return 'left';
  if (!outcome) return null;
  if (outcome.eliminated_this_round) return 'out';
  switch (outcome.final_outcome) {
    case 'out':
      return 'out';
    case 'missed':
      return 'missed';
    case 'grace_used':
      return 'used_grace';
    case 'self_out':
      return 'skipped';
    case 'completed':
      return 'took_shot';
    default:
      // 'pending' / 'pardoned' / 'overridden' — not reached in MVP; treat as a miss.
      return 'missed';
  }
}

export function deriveRoundResults(
  outcomes: OutcomeRow[],
  players: PlayerRow[],
  myPlayerId: string | null,
): RoundResultsView {
  const outcomeByPlayer = new Map(outcomes.map((outcome) => [outcome.party_player_id, outcome]));

  // Iterate the roster (so an outcome whose player isn't in the RLS-filtered roster
  // is dropped rather than rendered nameless). A player is shown when classify
  // returns a group — i.e. they have an outcome this round, or are kicked / left.
  const rows: ResultRow[] = [];
  for (const player of players) {
    const group = classify(player, outcomeByPlayer.get(player.id));
    if (group === null) continue;
    rows.push({
      playerId: player.id,
      displayName: player.display_name,
      isYou: myPlayerId !== null && player.id === myPlayerId,
      shotCount: player.total_shots_completed,
      group,
    });
  }

  const groups: ResultGroup[] = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    rows: rows
      .filter((row) => row.group === key)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  })).filter((group) => group.rows.length > 0);

  const me = rows.find((row) => row.isYou) ?? null;
  const outThisRound = rows.filter((row) => row.group === 'out').length;
  const stillIn = rows.filter((row) => STILL_IN_GROUPS.has(row.group)).length;

  return { groups, me, stillIn, outThisRound };
}
