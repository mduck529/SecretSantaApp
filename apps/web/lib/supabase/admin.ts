import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "../env";

/**
 * Service-role client: bypasses Row Level Security.
 * Only for match-blind server code (see lib/draw-service.ts). Never return
 * assignment rows from code that uses this client to an organizer's screen.
 */
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
