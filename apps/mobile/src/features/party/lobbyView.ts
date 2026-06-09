// Pure derivation of the lobby's view-model from a get_party_state snapshot.
// UI-free so it can be unit-tested without rendering — the lobby screen
// (app/party/[partyId]/lobby.tsx) and the useLobby hook both consume it.
//
// "Host vs player" is read off the caller's OWN party_players row
// (permission_role === 'host'), not the session's host_player_id: the roster
// already carries the role, and the caller's own row is always visible to them
// (rls-rules.md §4.2). Per CLAUDE.md §2.4, permissionRole / status / duty are
// independent concepts — this reads only permission_role and status.

import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];
type PlayerStatus = Database['public']['Enums']['player_status'];

export interface LobbyRosterEntry {
  id: string;
  displayName: string;
  status: PlayerStatus;
  isHost: boolean;
  isSelf: boolean;
}

export interface LobbyView {
  // The caller's own roster row, or null if they are not in the snapshot.
  me: PlayerRow | null;
  // True when the caller holds the host permission role.
  isHost: boolean;
  // Players that count toward the "can we start?" threshold (status = active).
  activePlayerCount: number;
  // Roster to render: current members only. get_party_state can include
  // 'removed' rows (a host sees moderation history; a self-left player sees
  // their own row), but they are not part of the live lobby roster. Order is
  // preserved from the server, which sorts by joined_at — so the host, who
  // joined at session creation, appears first (rpc-contracts.md §13.1).
  roster: LobbyRosterEntry[];
}

// Statuses that represent a current, present lobby member.
const VISIBLE_STATUSES: readonly PlayerStatus[] = ['active', 'out'];

export function deriveLobbyView(players: PlayerRow[], userId: string | null): LobbyView {
  const me = userId ? (players.find((player) => player.user_id === userId) ?? null) : null;
  const isHost = me?.permission_role === 'host';

  const activePlayerCount = players.filter((player) => player.status === 'active').length;

  const roster: LobbyRosterEntry[] = players
    .filter((player) => VISIBLE_STATUSES.includes(player.status))
    .map((player) => ({
      id: player.id,
      displayName: player.display_name,
      status: player.status,
      isHost: player.permission_role === 'host',
      isSelf: me !== null && player.id === me.id,
    }));

  return { me, isHost, activePlayerCount, roster };
}
