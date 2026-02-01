import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(url, anon);
}

let _client: SupabaseClient | null = null;

/**
 * Notað í client components.
 * Býr aðeins til client þegar kallað er á supabase (lazy), ekki við import í build.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) _client = createBrowserClient();
    // @ts-expect-error - proxy forward
    return _client[prop];
  },
}) as SupabaseClient;

/** Ef þú vilt líka hafa function (gott fyrir useMemo) */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) _client = createBrowserClient();
  return _client;
}
