import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * fetch() for our own API routes that sends the signed-in user's token.
 * The browser session lives in localStorage, not cookies, so a route that checks who is
 * calling only sees the user when the Authorization header is set.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data } = await getSupabaseClient().auth.getSession();
  const headers = new Headers(init.headers);
  const token = data?.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
