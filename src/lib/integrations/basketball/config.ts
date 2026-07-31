import "server-only";

/**
 * Basketball data-feed credentials — read from Supabase/Vercel secrets ONLY,
 * never hardcoded and never returned to the client. The scheduled sync is the
 * only reader. The exact base URL + auth scheme come from the chosen clean feed
 * (Hudl InStat Basketball, a Genius Sports / baskethotel data API, …); this
 * reader stays generic (bearer or basic) so filling in the real endpoints later
 * is a contained change.
 *
 * Env:
 *   BASKETBALL_API_BASE   — API base URL (from the feed's docs)
 *   BASKETBALL_API_TOKEN  — bearer token, OR
 *   BASKETBALL_API_USER + BASKETBALL_API_PASS — HTTP basic auth
 */

export type BasketballApiConfig = {
  baseUrl: string;
  authHeader: string; // "Bearer <token>" or "Basic <base64>"
};

export function isBasketballApiConfigured(): boolean {
  const base = process.env.BASKETBALL_API_BASE?.trim();
  if (!base) return false;
  const hasToken = !!process.env.BASKETBALL_API_TOKEN?.trim();
  const hasBasic = !!(process.env.BASKETBALL_API_USER?.trim() && process.env.BASKETBALL_API_PASS?.trim());
  return hasToken || hasBasic;
}

export function getBasketballApiConfig(): BasketballApiConfig {
  const baseUrl = process.env.BASKETBALL_API_BASE?.trim();
  if (!baseUrl) throw new Error("Missing BASKETBALL_API_BASE");
  const token = process.env.BASKETBALL_API_TOKEN?.trim();
  if (token) return { baseUrl, authHeader: `Bearer ${token}` };
  const user = process.env.BASKETBALL_API_USER?.trim();
  const pass = process.env.BASKETBALL_API_PASS?.trim();
  if (user && pass) {
    return { baseUrl, authHeader: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
  }
  throw new Error("Missing basketball API credentials (set BASKETBALL_API_TOKEN or BASKETBALL_API_USER/BASKETBALL_API_PASS)");
}
