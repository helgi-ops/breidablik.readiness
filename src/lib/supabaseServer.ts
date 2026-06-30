import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The single canonical server-side Supabase client (service role).
 *
 * SECURITY: this client bypasses Row-Level Security, so it must run ONLY in
 * server code (API routes, server actions) and NEVER be shipped to the browser.
 *
 * It FAILS LOUDLY if the service-role key is missing. The previous per-route
 * pattern silently fell back to the anon key (and then to an empty string),
 * which meant a misconfigured environment would degrade to anon-level access
 * without erroring — privileged queries would quietly run with the wrong
 * permissions instead of failing. Centralising here removes that hole.
 *
 * Both historical env-var spellings are accepted so this is a safe drop-in for
 * the routes that used either name:
 *   URL  ← NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 *   KEY  ← SUPABASE_SERVICE_ROLE_KEY | SUPABASE_SERVICE_ROLE
 * The anon key is intentionally NOT a fallback — a route that wants anon /
 * user-context access must build that client explicitly.
 */
export function getSupabaseServer(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!url) {
    throw new Error(
      "Supabase URL is not configured (set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL).",
    );
  }
  if (!serviceKey) {
    throw new Error(
      "Supabase service-role key is not configured (set SUPABASE_SERVICE_ROLE_KEY). " +
        "Refusing to fall back to the anon key for a server client.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
