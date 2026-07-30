/**
 * Fetch ALL rows of a Supabase/PostgREST query, paging past the 1000-row cap.
 *
 * This project's PostgREST returns at most 1000 rows per request, and a client
 * `.limit(n)` with n > 1000 does NOT raise that ceiling — verified empirically
 * (a no-limit select, `.limit(20000)`, and `.range(0,4999)` all returned exactly
 * 1000). So any team-wide / multi-day query that then aggregates in JS MUST page
 * with `.range(from, to)` or it silently truncates and computes wrong totals.
 *
 * Pass a builder that applies `.range(from, to)` to your query for each page;
 * this loops until a page comes back short. Keep page size at 1000 (the cap).
 */
export const SUPABASE_PAGE = 1000;

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE) {
    const { data, error } = await build(from, from + SUPABASE_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < SUPABASE_PAGE) break;
  }
  return out;
}
