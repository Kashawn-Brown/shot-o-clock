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
