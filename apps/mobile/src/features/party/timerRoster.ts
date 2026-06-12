// Pure derivation of the in-game roster (the timer screen's Roster sheet) from a
// get_party_state snapshot. UI-free so it unit-tests without rendering, matching
// deriveLobbyView's split.
//
// Per CLAUDE.md §2.4 permissionRole / status are independent — this reads both.
// 'removed' players are not part of the live roster (a host's snapshot can carry
// moderation history); only active/out members render. Order is preserved from
// the server (joined_at, so the host appears first; rpc-contracts.md §13.1).

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
  // For an out player: whether Reinstate is a meaningful action (shown at normal
  // weight) vs. dimmed. True when the host marked them out (the host can undo it)
  // or they left and rejoined (reinstatable from any round, per the server fix);
  // a player's own voluntary self-out is dimmed since it isn't the host's to undo.
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
): TimerRosterEntry[] {
  const selfOutPlayerIds = new Set(
    currentRoundOutcomes
      .filter((outcome) => outcome.player_action === 'self_out')
      .map((outcome) => outcome.party_player_id),
  );

  return players.filter(isVisible).map((player) => {
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
      reinstatable: isReinstatable(player),
    };
  });
}

// Whether the host's Reinstate is the meaningful action (normal weight) for this
// player: host_marked_out (the host can undo their own action) or a player who
// rejoined after going out (left and came back — reinstatable from any round). A
// plain self-out / miss is not the host's to undo, so it reads dimmed.
function isReinstatable(player: PlayerRow): boolean {
  if (player.out_reason === 'host_marked_out') return true;
  if (player.rejoined_at !== null && player.out_at !== null) {
    return Date.parse(player.rejoined_at) > Date.parse(player.out_at);
  }
  return false;
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
