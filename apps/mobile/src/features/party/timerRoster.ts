// Pure derivation of the in-game roster (the timer screen's Roster sheet) from a
// get_party_state snapshot. UI-free so it unit-tests without rendering, matching
// deriveLobbyView's split.
//
// Per CLAUDE.md §2.4 permissionRole / status are independent — this reads both.
// 'removed' players are not part of the live roster (a host's snapshot can carry
// moderation history); only active/out members render. The caller's own row is
// floated to the front (so they're #1 in whichever section they land in, even
// above the host); everyone else keeps the server order (joined_at, host first;
// rpc-contracts.md §13.1).

import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];
type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];
type PlayerStatus = Database['public']['Enums']['player_status'];
type GraceMode = Database['public']['Enums']['grace_mode'];

// Display states the roster renders. 'active' / 'out' come straight from the
// player_status enum; 'left' is a display-only state for a member who voluntarily
// left the game (left_at stamped, not removed) — distinct from being eliminated.
export type RosterEntryStatus = Extract<PlayerStatus, 'active' | 'out'> | 'left';

export interface TimerRosterEntry {
  id: string;
  displayName: string;
  status: RosterEntryStatus;
  shotsCompleted: number;
  isHost: boolean;
  isSelf: boolean;
  // True when the player still has a grace to spend: unlimited mode always, or
  // enabled mode while they haven't used theirs. The roster shows a "Grace" tag.
  graceAvailable: boolean;
  // For an out player: whether Reinstate reads at normal weight (true) vs. dimmed
  // (false). Dimmed ONLY while the player is out from their OWN "I'm Out" tap in
  // the CURRENT round — the host shouldn't instantly reverse a just-made choice.
  // Full weight in every other case: a self-out in a PRIOR round, a host mark-out,
  // a left-and-rejoined player, and any miss / exhausted-grace elimination
  // (including grace-used-then-missed) — the host can undo those, and reinstating a
  // missed_after_grace player even restores their grace (game-rules §6.1, §9.6).
  reinstatable: boolean;
}

function isVisible(player: PlayerRow): boolean {
  return player.status === 'active' || player.status === 'out';
}

/**
 * Roster rows for the timer screen, in server order (host first). `userId` is the
 * caller's auth id, used to flag their own row so the host's controls can hide on
 * it (a host can't mark out / remove themselves; §11.2/§11.3). `graceMode` is the
 * party setting, used to derive each player's remaining-grace flag.
 *
 * `currentRoundOutcomes` lets the roster show a still-`active` player who has
 * self_out this round as Out *now*, rather than waiting for finalization to flip
 * their party_players.status — so a mid-game Leave Party (which records a self_out)
 * reflects promptly on every device.
 *
 * A player who voluntarily left (mark_self_left → left_at) displays as 'left',
 * taking precedence over the self_out 'out' display. "Left" holds only while
 * left_at is more recent than last_seen_at — join_party's reconnect bumps
 * last_seen_at, so a rejoin clears the label without any server change here.
 */
export function deriveTimerRoster(
  players: PlayerRow[],
  userId: string | null,
  graceMode: GraceMode,
  currentRoundOutcomes: OutcomeRow[] = [],
  // The session's current round, used to decide whether a finalized self-out's
  // Reinstate is dimmed (same round they tapped I'm Out) or full weight (a prior
  // round). When null, a finalized self-out can't be placed in the current round so
  // it reads full weight; a pending self-out still dims via its current-round
  // outcome (selfOutThisRound).
  currentRoundNumber: number | null = null,
): TimerRosterEntry[] {
  const selfOutPlayerIds = new Set(
    currentRoundOutcomes
      .filter((outcome) => outcome.player_action === 'self_out')
      .map((outcome) => outcome.party_player_id),
  );

  const entries = players.filter(isVisible).map((player) => {
    const displayStatus = displayStatusFor(player, selfOutPlayerIds);

    return {
      id: player.id,
      displayName: player.display_name,
      status: displayStatus,
      shotsCompleted: player.total_shots_completed,
      isHost: player.permission_role === 'host',
      isSelf: userId !== null && player.user_id === userId,
      graceAvailable:
        graceMode === 'unlimited' || (graceMode === 'enabled' && !player.used_grace),
      // Only meaningful for an out player (the Reinstate button only shows then) —
      // false otherwise so an active/left row never reads as "reinstatable".
      reinstatable:
        displayStatus === 'out' &&
        isReinstatable(player, currentRoundNumber, selfOutPlayerIds.has(player.id)),
    };
  });

  // Float the caller's own entry to the front, preserving server order otherwise
  // (stable partition rather than Array.sort, which isn't guaranteed stable). The
  // RosterSheet filters this into per-status sections, so self ends up first in
  // whichever section they're in — above the host.
  return [...entries.filter((entry) => entry.isSelf), ...entries.filter((entry) => !entry.isSelf)];
}

// Whether the host's Reinstate reads at normal weight for this out player. Full
// weight by default — the only dimmed case is a player out from their OWN "I'm Out"
// tap in the CURRENT round (the host shouldn't instantly reverse a just-made
// choice). `selfOutThisRound` is true when the current round carries a self_out
// outcome for them — the pending/unfinalized shape, where the player row is still
// active (status 'out' is a display-only override). The finalized shape is
// out_reason 'self_opted_out' with out_round_number == the current round.
//
// Everything else is full weight: a self-out in a PRIOR round (out_round_number !=
// current — the round advances at finalization), a host mark-out, a left-and-
// rejoined player (D039 — reinstatable from any round), and every miss / exhausted-
// grace elimination including grace-used-then-missed (out_reason missed_after_grace,
// not a self-out — full weight even in the round it happened).
function isReinstatable(
  player: PlayerRow,
  currentRoundNumber: number | null,
  selfOutThisRound: boolean,
): boolean {
  // A left-and-rejoined player is the host's to reinstate from any round (D039),
  // even over a same-round self-out.
  if (
    player.rejoined_at !== null &&
    player.out_at !== null &&
    Date.parse(player.rejoined_at) > Date.parse(player.out_at)
  ) {
    return true;
  }
  const selfOutCurrentRound =
    selfOutThisRound ||
    (player.out_reason === 'self_opted_out' &&
      currentRoundNumber !== null &&
      player.out_round_number === currentRoundNumber);
  return !selfOutCurrentRound;
}

// True once a player has left and not been seen since (a rejoin bumps
// last_seen_at past left_at). Null-safe on both timestamps.
function hasLeft(player: PlayerRow): boolean {
  if (player.left_at === null) return false;
  if (player.last_seen_at === null) return true;
  return Date.parse(player.left_at) > Date.parse(player.last_seen_at);
}

// isVisible guarantees active/out as the base status. 'left' wins over the
// self_out → 'out' override (someone who left isn't just "out").
function displayStatusFor(player: PlayerRow, selfOutPlayerIds: Set<string>): RosterEntryStatus {
  if (hasLeft(player)) return 'left';
  if (player.status === 'active' && selfOutPlayerIds.has(player.id)) return 'out';
  return player.status as Extract<typeof player.status, 'active' | 'out'>;
}
