/**
 * In-flight GET de-duplication for coach cards.
 *
 * Several per-player cards on the Power Curve page fetch the SAME endpoint on mount — e.g.
 * PhysicalStoryCard re-requests role-demand-fit / peak-period / season-trends / movement-style that
 * its sibling cards already fetch (season-trends was hit 3×). They all mount in the same tick, so a
 * shared in-flight promise keyed by URL collapses those concurrent duplicates into ONE request.
 *
 * In-flight ONLY — the entry is dropped as soon as the request settles, so a later (re)load always
 * re-fetches fresh. No TTL, no stale data across player switches or after an upload. Session-stable
 * auth token, so the URL alone is the key.
 */

// fetch().json() is inherently `any` and every caller treats the body loosely (and casts to its own
// Resp type). Keep a single intentional `any` at this boundary so call sites don't each need a cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResult = { ok: boolean; status: number; json: any };

const inflight = new Map<string, Promise<JsonResult>>();

export function getJsonCached(url: string, token: string | null | undefined): Promise<JsonResult> {
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async (): Promise<JsonResult> => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ""}` }, cache: "no-store" });
    let json: unknown = null;
    try { json = r.ok ? await r.json() : null; } catch { json = null; }
    return { ok: r.ok, status: r.status, json };
  })();

  inflight.set(url, p);
  void p.finally(() => inflight.delete(url));
  return p;
}
