/**
 * Cron / script auth for the Catapult sync. Accepts the route's own CATAPULT_CRON_SECRET OR the shared
 * CRON_SECRET, which is what Vercel cron sends (`Authorization: Bearer <CRON_SECRET>`); before Nov 2026 the
 * 02:00 cron sent only that header and never got in. Also reads `x-cron-secret` and `?secret=` for manual
 * scripts. No secret configured → open only outside production (local dev). A coach's own login token is
 * checked separately by the route.
 */
export function isCatapultCronAuthorized(
  request: Request,
  env: { CATAPULT_CRON_SECRET?: string; CRON_SECRET?: string; NODE_ENV?: string } = process.env,
): boolean {
  const accepted = [env.CATAPULT_CRON_SECRET, env.CRON_SECRET].map((s) => (s ?? "").trim()).filter(Boolean);
  if (accepted.length === 0) return env.NODE_ENV !== "production";
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const candidates = [bearer, request.headers.get("x-cron-secret") || "", url.searchParams.get("secret") || ""];
  return candidates.some((p) => p !== "" && accepted.includes(p));
}
