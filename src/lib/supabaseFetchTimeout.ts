/**
 * Fetch for the server-side Supabase clients that gives up on a stuck request.
 *
 * supabase-js has no timeout of its own, and Node's fetch only gives up on missing
 * response headers after 300 s, the same as the Vercel function limit. So when the
 * database stops answering, a route waits out the whole limit and the coach watches
 * a spinner for five minutes (2026-11-06: Postgres was down 10:35–11:01 UTC and four
 * coach routes hit "Task timed out after 300 seconds" with nothing else in the logs).
 * With this the call fails after 30 s and the route's normal error handling runs.
 *
 * Only PostgREST and Auth are timed. A healthy call there is bounded by the database's
 * 8 s statement timeout, so 30 s leaves plenty of room for working requests. Storage
 * transfers and Edge Functions can legitimately run longer, so they pass through untouched.
 */
export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

const TIMED_PATHS = ["/rest/v1/", "/auth/v1/"];

export function createFetchWithTimeout(
  timeoutMs: number,
  baseFetch: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!TIMED_PATHS.some((path) => url.includes(path))) return baseFetch(input, init);

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return baseFetch(input, { ...init, signal }).catch((err: unknown) => {
      // Log the path without the query string, which can carry long lists of player ids.
      if (timeout.aborted) console.error(`[supabase] no response after ${timeoutMs} ms: ${new URL(url).pathname}`);
      throw err;
    });
  };
}

export const supabaseFetchWithTimeout = createFetchWithTimeout(SUPABASE_REQUEST_TIMEOUT_MS);
