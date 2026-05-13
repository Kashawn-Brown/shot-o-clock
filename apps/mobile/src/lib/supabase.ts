// Supabase client singleton.
//
// Phase 3 deliverable pulled forward into Phase 2 Batch A1 by dependency
// (the RPC wrapper in `rpcClient.ts` cannot type-check without a typed
// supabase client). See docs/KNOWN_ISSUES.md #D010 (5).
//
// Phase 3 will replace the inline env reads below with a typed loader at
// `src/lib/env.ts` that validates required variables at app startup.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db.generated';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in env. ' +
      'Copy .env.example to .env and fill in the values printed by `supabase start`.',
  );
}

export const supabase = createClient<Database>(url, anonKey);
