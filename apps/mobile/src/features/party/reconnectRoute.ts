// Pure mapping from a party's current phase to the screen a reconnecting player
// should land on. Kept import-free (type-only) so it unit-tests without pulling in
// the supabase client. See useActiveParty for how the target is resolved on launch.

import type { Database } from '@/types/db.generated';

type PartyPhase = Database['public']['Enums']['party_phase'];

export type PartyRouteSegment = 'lobby' | 'timer' | 'shot-oclock' | 'results' | 'summary';

export function routeForPhase(phase: PartyPhase): PartyRouteSegment {
  switch (phase) {
    case 'countdown':
      return 'timer';
    case 'shot_window':
      return 'shot-oclock';
    case 'round_complete':
      return 'results';
    case 'ended':
      return 'summary';
    case 'lobby':
    default:
      // lobby, plus the reserved post-MVP phases (referee_confirmation, host_review)
      // which never occur in MVP — fall back to the safe lobby screen.
      return 'lobby';
  }
}

// How fresh a countdown must be for a reconnecting player to land on the previous
// round's recap instead of the live timer. If they re-enter within this window of
// the round starting, they likely just missed the recap of the round that ended.
export const RECAP_REENTRY_WINDOW_MS = 30_000;

/**
 * On reconnect, whether to show the previous round's recap rather than going straight
 * to the timer. Only true during a fresh countdown (started < RECAP_REENTRY_WINDOW_MS
 * ago) that has a prior round to recap (round >= 2). Every other phase routes by
 * routeForPhase unchanged. Pure (no clock) — the caller passes `nowMs`.
 */
export function shouldRecapOnReentry(
  phase: PartyPhase,
  currentRoundNumber: number,
  phaseStartedAt: string | null,
  nowMs: number,
): boolean {
  if (phase !== 'countdown') return false;
  if (currentRoundNumber < 2) return false; // round 1 has no previous round
  if (phaseStartedAt === null) return false;
  const startedMs = Date.parse(phaseStartedAt);
  if (Number.isNaN(startedMs)) return false;
  return nowMs - startedMs < RECAP_REENTRY_WINDOW_MS;
}
