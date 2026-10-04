import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Only for trusted server code
 * (auth admin API, the scheduler, the email outbox). Never pass user input
 * to it without checking the caller's permissions first.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
