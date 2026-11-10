import { NextResponse, type NextRequest } from "next/server";
import { ruleFor, secondsUntilAllowed } from "@/lib/security/rateLimit";
import { TWO_STEP_REQUIRED_MESSAGE, accessTokensFromCookies, tokenNeedsCode } from "@/lib/auth/twoStep";
import { isFreeLockedRequest } from "@/lib/security/freeLockApi";
import { PRO_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";

/**
 * Runs on every API route, in two parts:
 *  1. Two-step sign-in (src/lib/auth/twoStep.ts): an account that must enter a code is refused until its session
 *     has one. Decoding only, no network call, so ordinary requests pay almost nothing.
 *  2. FREE lock (src/lib/security/freeLockApi.ts): a FREE club team gets 402 on AI, sends, uploads and syncs.
 *     One cached database lookup, only on the paths listed there.
 *  3. Request limits (src/lib/security/rateLimit.ts), only on the paths listed there.
 */
export async function proxy(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const isCron = [process.env.CRON_SECRET, process.env.REMINDER_CRON_SECRET].some((s) => s && auth === `Bearer ${s}`);
  if (isCron) return NextResponse.next();

  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const tokens = [token, ...accessTokensFromCookies(req.cookies.getAll())];
  if (tokens.some(tokenNeedsCode)) {
    return NextResponse.json({ ok: false, code: "mfa_required", error: TWO_STEP_REQUIRED_MESSAGE }, { status: 401 });
  }

  if (await isFreeLockedRequest({ pathname: req.nextUrl.pathname, method: req.method, tokens })) {
    return NextResponse.json({ ok: false, ...PRO_REQUIRED_RESPONSE.body }, { status: PRO_REQUIRED_RESPONSE.status });
  }

  const rule = ruleFor(req.nextUrl.pathname, req.method);
  if (!rule) return NextResponse.next();
  // Vercel sets x-real-ip itself, so a caller cannot change it to dodge the limit.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const retryAfter = await secondsUntilAllowed(rule, { token, ip });
  if (retryAfter == null) return NextResponse.next();

  console.error(`[rate-limit] ${rule.name} over limit on ${req.method} ${req.nextUrl.pathname}`);
  return NextResponse.json(
    { ok: false, error: "Too many requests. Please try again in a few minutes." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export const config = {
  // Every API route: the two-step check needs them all. The request limits still apply only to the paths listed in
  // src/lib/security/rateLimit.ts.
  matcher: ["/api/:path*"],
};
