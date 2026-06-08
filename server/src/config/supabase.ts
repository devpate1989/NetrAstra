import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Service-role client — full DB/storage access, bypasses RLS.
 * Use only in trusted server-side code (never expose this key to clients).
 */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Anon client — respects RLS, mirrors what a client app would use.
 * Useful for verifying user JWTs issued by Supabase Auth.
 */
export const supabaseAnon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
