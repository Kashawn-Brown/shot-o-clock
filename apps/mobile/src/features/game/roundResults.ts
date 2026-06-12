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
type AdminActionRow = Database['public']['Tables']['admin_action_logs']['Row'];

export type ResultGroupKey =
  | 'took_shot'
  | 'reinstated'
  | 'used_grace'
  | 'skipped'
  | 'missed'
  | 'out'
  | 'kicked';

export interface ResultRow {
  playerId: string;
  displayName: string;
  isYou: boolean;
  // Cumulative shots the player has completed across the game (party_players.
  // total_shots_completed), not this round — the row's "shot count" badge.
  shotCount: number;
  group: ResultGroupKey;
  // Optional per-row sub-label, used where the group label alone is ambiguous —
  // chiefly inside Used Grace, to separate a voluntary skip-that-spent-grace from
  // an automatic miss the server forgave. null when the group label suffices.
  detail: string | null;
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
// elimination last. The host-action groups bracket the auto groups — Reinstated
// (back in) near the top, Kicked (gone) at the very end.
const GROUP_ORDER: readonly ResultGroupKey[] = [
  'took_shot',
  'reinstated',
  'used_grace',
  'skipped',
  'missed',
  'out',
  'kicked',
];

const GROUP_LABELS: Record<ResultGroupKey, string> = {
  took_shot: 'Took the Shot',
  reinstated: 'Reinstated',
  used_grace: 'Used Grace',
  skipped: 'Skipped',
  missed: 'Missed',
  out: 'Out',
  kicked: 'Kicked',
};

// A no-op reinstate (host marked an already-active player) logs this reason — it
// isn't a real reinstatement, so it shouldn't surface a Reinstated row.
const REINSTATE_NO_OP_REASON = 'no-change: already active';

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

// Sub-label where the group alone is ambiguous. Inside Used Grace a player either
// chose to skip (spending grace) or simply missed and the server forgave it — the
// row should say which. grace_applied is only ever true on that path (a forgiven
// row is never eliminated), so this returns null for every other group.
function detailFor(outcome: OutcomeRow): string | null {
  if (!outcome.grace_applied) return null;
  return outcome.player_action === 'self_out' ? 'Skipped — grace used' : 'Missed — grace used';
}

export function deriveRoundResults(
  outcomes: OutcomeRow[],
  players: PlayerRow[],
  myPlayerId: string | null,
  // Host override actions logged against this round (admin_action_logs). Empty for
  // a guest (host-only RLS), so Kicked / Reinstated simply don't appear for them.
  adminActions: AdminActionRow[] = [],
): RoundResultsView {
  const playerById = new Map(players.map((player) => [player.id, player]));

  // Players the host removed this round. They have no outcome row (removed before
  // finalization), so they surface ONLY here.
  const kickedIds = new Set(
    adminActions
      .filter((a) => a.action_type === 'remove_player' && a.affected_player_id !== null)
      .map((a) => a.affected_player_id as string),
  );
  // Players the host reinstated this round (excluding no-op marks). Kick wins over
  // reinstate if both somehow landed on the same player.
  const reinstatedIds = new Set(
    adminActions
      .filter(
        (a) =>
          a.action_type === 'mark_player_active' &&
          a.affected_player_id !== null &&
          a.reason !== REINSTATE_NO_OP_REASON &&
          !kickedIds.has(a.affected_player_id),
      )
      .map((a) => a.affected_player_id as string),
  );

  // Outcome-based rows. A player surfaced in an event group (Kicked / Reinstated)
  // is pulled out of their auto group so they appear once, in the event group.
  const rows: ResultRow[] = outcomes
    .map((outcome): ResultRow | null => {
      const player = playerById.get(outcome.party_player_id);
      if (!player) return null;
      if (kickedIds.has(player.id) || reinstatedIds.has(player.id)) return null;
      return {
        playerId: player.id,
        displayName: player.display_name,
        isYou: myPlayerId !== null && player.id === myPlayerId,
        shotCount: player.total_shots_completed,
        group: classify(outcome),
        detail: detailFor(outcome),
      };
    })
    .filter((row): row is ResultRow => row !== null);

  // Event rows from the host log. Kicked players may not have an outcome row, so
  // these are built from the player lookup directly. A player not in the
  // (RLS-filtered) roster is dropped rather than rendered nameless.
  const eventRow = (playerId: string, group: ResultGroupKey): ResultRow | null => {
    const player = playerById.get(playerId);
    if (!player) return null;
    return {
      playerId: player.id,
      displayName: player.display_name,
      isYou: myPlayerId !== null && player.id === myPlayerId,
      shotCount: player.total_shots_completed,
      group,
      detail: null,
    };
  };
  const eventRows: ResultRow[] = [
    ...[...kickedIds].map((id) => eventRow(id, 'kicked')),
    ...[...reinstatedIds].map((id) => eventRow(id, 'reinstated')),
  ].filter((row): row is ResultRow => row !== null);

  const allRows = [...rows, ...eventRows];

  const groups: ResultGroup[] = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    rows: allRows
      .filter((row) => row.group === key)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  })).filter((group) => group.rows.length > 0);

  const me = allRows.find((row) => row.isYou) ?? null;
  // Eliminated and kicked are both no-longer-in; reinstated counts as still in.
  const outThisRound = allRows.filter((row) => row.group === 'out').length;
  const kickedCount = allRows.filter((row) => row.group === 'kicked').length;
  const stillIn = allRows.length - outThisRound - kickedCount;

  return { groups, me, stillIn, outThisRound };
}
