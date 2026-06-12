// Reads one round's timeframe (countdown_started_at .. completed_at) so the Round
// Results screen can scope its Left / Kicked groups to the round they happened in.
//
// Direct table read (like getActiveParty): the rounds SELECT policy (rls-rules.md
// §5.1) scopes rows to active/out members, so a non-member gets nothing. On any
// error or a missing row we return an empty window — deriveRoundResults then simply
// omits Left / Kicked rather than mis-scoping them.

import { supabase } from '@/lib/supabase';
import type { RoundWindow } from '@/features/game/roundResults';

const EMPTY: RoundWindow = { startedAt: null, completedAt: null };

export async function getRoundWindow(roundId: string): Promise<RoundWindow> {
  const { data, error } = await supabase
    .from('rounds')
    .select('countdown_started_at, completed_at')
    .eq('id', roundId)
    .maybeSingle();

  if (error || !data) return EMPTY;
  return { startedAt: data.countdown_started_at, completedAt: data.completed_at };
}
