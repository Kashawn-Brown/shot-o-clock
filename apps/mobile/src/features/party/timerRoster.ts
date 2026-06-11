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
type PlayerStatus = Database['public']['Enums']['player_status'];

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
}

function isVisible(player: PlayerRow): boolean {
  return player.status === 'active' || player.status === 'out';
}

/**
 * Roster rows for the timer screen, in server order (host first). `userId` is the
 * caller's auth id, used to flag their own row so the host's controls can hide on
 * it (a host can't mark out / remove themselves; §11.2/§11.3).
 */
export function deriveTimerRoster(players: PlayerRow[], userId: string | null): TimerRosterEntry[] {
  return players.filter(isVisible).map((player) => ({
    id: player.id,
    displayName: player.display_name,
    // isVisible guarantees active/out, but the filter doesn't narrow the field —
    // assert the two-state subtype the UI switches on.
    status: player.status as RosterEntryStatus,
    shotsCompleted: player.total_shots_completed,
    isHost: player.permission_role === 'host',
    isSelf: userId !== null && player.user_id === userId,
  }));
}
