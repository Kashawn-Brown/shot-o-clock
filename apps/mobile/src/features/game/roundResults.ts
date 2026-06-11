// Pure derivation of the Round Results view-model from a round's finalized
// outcomes + the party roster. UI-free so it unit-tests without rendering — the
// results screen (app/party/[partyId]/results.tsx) consumes it.
//
// Grouping reads ONLY the outcome row, never the party settings: finalize_round_
// outcomes already encodes the elimination/grace rules into each row (D034) —
// grace_applied is true only when elimination is on and grace was actually spent,
// and a no-consequence self_out (elimination off, or unlimited grace) lands with
// grace_applied = false and status_after_round = 'active'. So the five groups fall
// straight out of (eliminated_this_round, final_outcome, grace_applied,
// player_action) with no extra context. See game-rules.md §7.

import type { Database } from '@/types/db.generated';

type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];
type PlayerRow = Database['public']['Tables']['party_players']['Row'];

export type ResultGroupKey = 'took_shot' | 'used_grace' | 'skipped' | 'missed' | 'out';

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
  // round (were out/removed before it) or aren't identified.
  me: ResultRow | null;
  // Players still in after this round vs. eliminated this round — for the summary
  // line. Derived from the displayed rows so the counts match what's on screen.
  stillIn: number;
  outThisRound: number;
}

// Fixed display order (game-rules §7 outcome ordering): the good news first,
// elimination last.
const GROUP_ORDER: readonly ResultGroupKey[] = ['took_shot', 'used_grace', 'skipped', 'missed', 'out'];

const GROUP_LABELS: Record<ResultGroupKey, string> = {
  took_shot: 'Took the Shot',
  used_grace: 'Used Grace',
  skipped: 'Skipped',
  missed: 'Missed',
  out: 'Out',
};

// Classify a finalized outcome into exactly one group. Priority matters: a
// self_out that consumed grace is Used Grace (not Skipped); one that eliminated
// is Out. See the file header for why this needs no settings.
function classify(outcome: OutcomeRow): ResultGroupKey {
  if (outcome.eliminated_this_round) return 'out';
  if (outcome.final_outcome === 'completed') return 'took_shot';
  if (outcome.grace_applied) return 'used_grace';
  if (outcome.player_action === 'self_out') return 'skipped';
  return 'missed';
}

export function deriveRoundResults(
  outcomes: OutcomeRow[],
  players: PlayerRow[],
  myPlayerId: string | null,
): RoundResultsView {
  const playerById = new Map(players.map((player) => [player.id, player]));

  // Only players who were finalized this round get an outcome row, so the rows
  // are exactly the round's participants. An outcome whose player isn't in the
  // (RLS-filtered) roster is dropped rather than rendered nameless.
  const rows: ResultRow[] = outcomes
    .map((outcome): ResultRow | null => {
      const player = playerById.get(outcome.party_player_id);
      if (!player) return null;
      return {
        playerId: player.id,
        displayName: player.display_name,
        isYou: myPlayerId !== null && player.id === myPlayerId,
        shotCount: player.total_shots_completed,
        group: classify(outcome),
      };
    })
    .filter((row): row is ResultRow => row !== null);

  const groups: ResultGroup[] = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    rows: rows.filter((row) => row.group === key).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  })).filter((group) => group.rows.length > 0);

  const me = rows.find((row) => row.isYou) ?? null;
  const outThisRound = rows.filter((row) => row.group === 'out').length;
  const stillIn = rows.length - outThisRound;

  return { groups, me, stillIn, outThisRound };
}
