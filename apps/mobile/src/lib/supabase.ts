// Supabase client singleton.
//
// Originally pulled forward into Phase 2 Batch A1 by dependency (the RPC
// wrapper in `rpcClient.ts` cannot type-check without a typed supabase
// client). See D010 (5).
//
// Env reads now go through the typed loader in `src/lib/env.ts`, which
// validates required variables at startup (completes the Phase 3 plan noted
// in the original version of this file).

import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from '@/types/db.generated';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
