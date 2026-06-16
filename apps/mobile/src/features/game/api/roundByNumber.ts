// Resolves a round's id from its number within a party. Used when a screen knows
// which round it wants to show (e.g. the previous round, current - 1) but not its
// id — the recap routing and the timer's "Round N Results" button after a reconnect,
// where no roundId was handed over via navigation.
//
// Direct table read (like getRoundWindow): the rounds SELECT policy (rls-rules.md
// §5.1) scopes rows to active/out members, so a non-member gets nothing. Returns null
// on any error / missing row — the caller degrades to showing no outcomes.

import { supabase } from '@/lib/supabase';

export async function getRoundIdByNumber(
  partyId: string,
  roundNumber: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id')
    .eq('party_session_id', partyId)
    .eq('round_number', roundNumber)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}
