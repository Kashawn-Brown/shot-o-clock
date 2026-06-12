// Host override actions logged against a round (admin_action_logs), for the Round
// Results screen's Kicked / Reinstated groups.
//
// admin_action_logs is host-only (rls-rules.md §7.1): a guest's RLS-filtered read
// returns [], so those groups simply don't appear for them — which is consistent
// with guests not seeing removed players at all. We fetch only the two action
// types the results screen surfaces.

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/db.generated';

export type AdminActionRow = Database['public']['Tables']['admin_action_logs']['Row'];

export async function getRoundAdminActions(roundId: string): Promise<AdminActionRow[]> {
  const { data, error } = await supabase
    .from('admin_action_logs')
    .select('*')
    .eq('round_id', roundId)
    .in('action_type', ['remove_player', 'mark_player_active']);

  if (error) throw error;
  return data ?? [];
}
