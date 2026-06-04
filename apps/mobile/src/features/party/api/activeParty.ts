// Finds the guest's reconnectable party on launch.
//
// Server-authoritative: the party_sessions SELECT policy (rls-rules.md §2) already
// scopes rows to sessions where the caller is an active/out member, so simply
// selecting non-terminal sessions returns the caller's current party — no user_id
// filter needed, and removed players are excluded by RLS. Used by useActiveParty to
// route a returning guest back into an in-progress party (plan.md Phase 4).

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/db.generated';

type PartyPhase = Database['public']['Enums']['party_phase'];
type PartyStatus = Database['public']['Enums']['party_status'];

// Non-terminal session statuses — a party you can still rejoin (lobby/active/paused).
const RECONNECTABLE_STATUSES: PartyStatus[] = ['lobby', 'active', 'paused'];

export interface ActiveParty {
  partyId: string;
  phase: PartyPhase;
}

export async function getActiveParty(): Promise<ActiveParty | null> {
  const { data, error } = await supabase
    .from('party_sessions')
    .select('id, current_phase')
    .in('status', RECONNECTABLE_STATUSES)
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  return row ? { partyId: row.id, phase: row.current_phase } : null;
}
