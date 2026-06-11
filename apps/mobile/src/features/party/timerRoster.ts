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

// Only active/out are present, current members. Narrowed from PlayerStatus so the
// UI can switch exhaustively on the two live states.
export type RosterEntryStatus = Extract<PlayerStatus, 'active' | 'out'>;

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
    // isVisible guarantees active/out; treat an active player who self_out this
    // round as Out for display. The filter doesn't narrow the field, so assert the
    // two-state subtype the UI switches on.
    const displayStatus: RosterEntryStatus =
      player.status === 'active' && selfOutPlayerIds.has(player.id)
        ? 'out'
        : (player.status as RosterEntryStatus);

    return {
      id: player.id,
      displayName: player.display_name,
      status: displayStatus,
      shotsCompleted: player.total_shots_completed,
      isHost: player.permission_role === 'host',
      isSelf: userId !== null && player.user_id === userId,
      graceAvailable:
        graceMode === 'unlimited' || (graceMode === 'enabled' && !player.used_grace),
    };
  });
}
