// Pure derivation of the Final Summary view-model from the end-of-game roster.
// UI-free so it unit-tests without rendering — the summary screen
// (app/party/[partyId]/summary.tsx) consumes it.
//
// The summary is a WHOLE-GAME overview, not a repeat of the last round's Round
// Results (deriveRoundResults already covers per-round). It ranks everyone by
// cumulative shots taken across the game.
//
// Ranking axis: total_shots_completed (party_players, server-maintained at every
// round finalization). NOT survival — a player who went out late but took the
// most shots still leads. total_pardons_received is post-MVP and never surfaced.
//
// Hero ("who won"): the player(s) tied for the most shots.
//   - 1–3 leaders → show each by name with a trophy (heroMode 'names').
//   - 4+ leaders  → "<title> — X people at N shots", no names (heroMode 'count').
//   - 0 shots taken by anyone → no winner to crown (heroMode 'none').
// Title is "Last Standing" with elimination on, "Top Shots" with it off (nobody
// is eliminated in that mode, so "last standing" would be a misnomer).
//
// Removed players (kicked by the host) are listed at the bottom, visually
// distinct, and are never eligible for the trophy or the hero — being removed
// isn't a finish. Everyone else (active / out / left) ranks normally; "left" is
// treated as an ordinary participant with whatever shots they took.

import type { Database } from '@/types/db.generated';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];

const HERO_TITLE_ELIMINATION = 'Last Standing';
const HERO_TITLE_NO_ELIMINATION = 'Top Shots';
// Show individual names in the hero up to this many tied leaders; beyond it the
// hero collapses to a count ("X people at N shots").
const MAX_HERO_NAMES = 3;

export type HeroMode = 'names' | 'count' | 'none';

// A tied-for-top player surfaced in the hero section.
export interface SummaryLeader {
  playerId: string;
  displayName: string;
  isYou: boolean;
  shotCount: number;
}

// One row in the ranked Final Standings list.
export interface SummaryStanding {
  playerId: string;
  displayName: string;
  isYou: boolean;
  shotCount: number;
  // Tied for the top shot count (and someone actually took a shot). Drives the
  // per-row trophy — independent of heroMode, so all leaders are trophied in the
  // list even when 4+ collapse the hero to a count.
  isLeader: boolean;
  // Kicked by the host: rendered at the bottom, greyed, never a leader.
  isRemoved: boolean;
}

export interface PartySummaryView {
  partyName: string;
  totalRounds: number;
  eliminationEnabled: boolean;
  heroTitle: string;
  heroMode: HeroMode;
  // The top shot count among eligible (non-removed) players; 0 when no shots were
  // taken (then heroMode is 'none').
  topShotCount: number;
  // How many players tied for the top — the "X people" in the 'count' hero copy.
  leaderCount: number;
  // The leaders. 1–3 entries when heroMode is 'names', all of them when 'count',
  // empty when 'none'. Sorted by name for stable display.
  leaders: SummaryLeader[];
  // All players ranked by shots desc (tie broken by name); removed players appended
  // at the bottom, also shots-desc among themselves.
  standings: SummaryStanding[];
}

// Shots desc, then name asc — deterministic ordering for ties.
function byShotsThenName(
  a: { shotCount: number; displayName: string },
  b: { shotCount: number; displayName: string },
): number {
  return b.shotCount - a.shotCount || a.displayName.localeCompare(b.displayName);
}

export function derivePartySummary(
  players: PlayerRow[],
  myPlayerId: string | null,
  options: { partyName: string; totalRounds: number; eliminationEnabled: boolean },
): PartySummaryView {
  const isYou = (player: PlayerRow): boolean =>
    myPlayerId !== null && player.id === myPlayerId;

  const eligible = players.filter((player) => player.status !== 'removed');
  const removed = players.filter((player) => player.status === 'removed');

  // Top shot count among eligible players; 0 when nobody took a shot (or there are
  // no eligible players), in which case there's no winner to crown.
  const topShotCount = eligible.reduce(
    (max, player) => Math.max(max, player.total_shots_completed),
    0,
  );
  const hasLeaders = topShotCount > 0;
  const leaderRows = hasLeaders
    ? eligible.filter((player) => player.total_shots_completed === topShotCount)
    : [];

  const leaders: SummaryLeader[] = leaderRows
    .map((player) => ({
      playerId: player.id,
      displayName: player.display_name,
      isYou: isYou(player),
      shotCount: player.total_shots_completed,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  let heroMode: HeroMode;
  if (!hasLeaders) {
    heroMode = 'none';
  } else if (leaderRows.length <= MAX_HERO_NAMES) {
    heroMode = 'names';
  } else {
    heroMode = 'count';
  }

  const toStanding = (player: PlayerRow, isRemoved: boolean): SummaryStanding => ({
    playerId: player.id,
    displayName: player.display_name,
    isYou: isYou(player),
    shotCount: player.total_shots_completed,
    isLeader: !isRemoved && hasLeaders && player.total_shots_completed === topShotCount,
    isRemoved,
  });

  const standings: SummaryStanding[] = [
    ...eligible.map((player) => toStanding(player, false)).sort(byShotsThenName),
    ...removed.map((player) => toStanding(player, true)).sort(byShotsThenName),
  ];

  return {
    partyName: options.partyName,
    totalRounds: options.totalRounds,
    eliminationEnabled: options.eliminationEnabled,
    heroTitle: options.eliminationEnabled ? HERO_TITLE_ELIMINATION : HERO_TITLE_NO_ELIMINATION,
    heroMode,
    topShotCount,
    leaderCount: leaderRows.length,
    leaders,
    standings,
  };
}
