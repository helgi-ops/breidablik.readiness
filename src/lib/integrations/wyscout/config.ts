import "server-only";

/**
 * Wyscout Data API credentials — read from Supabase/Vercel secrets ONLY, never
 * hardcoded and never returned to the client. Adapter B (the scheduled sync) is
 * the only reader. The exact base URL + auth scheme come from the club's Wyscout
 * Data API docs; this reader stays generic (basic or bearer token) so filling in
 * the real endpoints later is a contained change.
 *
 * Env:
 *   WYSCOUT_API_BASE   — API base URL (from the club's Wyscout Data API docs)
 *   WYSCOUT_API_TOKEN  — bearer token, OR
 *   WYSCOUT_API_USER + WYSCOUT_API_PASS — HTTP basic auth
 */

export type WyscoutApiConfig = {
  baseUrl: string;
  authHeader: string; // "Bearer <token>" or "Basic <base64>"
};

export function isWyscoutApiConfigured(): boolean {
  const base = process.env.WYSCOUT_API_BASE?.trim();
  if (!base) return false;
  const hasToken = !!process.env.WYSCOUT_API_TOKEN?.trim();
  const hasBasic = !!(process.env.WYSCOUT_API_USER?.trim() && process.env.WYSCOUT_API_PASS?.trim());
  return hasToken || hasBasic;
}

export function getWyscoutApiConfig(): WyscoutApiConfig {
  const baseUrl = process.env.WYSCOUT_API_BASE?.trim();
  if (!baseUrl) throw new Error("Missing WYSCOUT_API_BASE");
  const token = process.env.WYSCOUT_API_TOKEN?.trim();
  if (token) return { baseUrl, authHeader: `Bearer ${token}` };
  const user = process.env.WYSCOUT_API_USER?.trim();
  const pass = process.env.WYSCOUT_API_PASS?.trim();
  if (user && pass) {
    return { baseUrl, authHeader: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
  }
  throw new Error("Missing Wyscout API credentials (set WYSCOUT_API_TOKEN or WYSCOUT_API_USER/WYSCOUT_API_PASS)");
}
