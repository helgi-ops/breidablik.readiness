import { NextResponse, type NextRequest } from "next/server";
import { ruleFor, secondsUntilAllowed } from "@/lib/security/rateLimit";

/**
 * Request limits, see src/lib/security/rateLimit.ts. Runs only on the paths in the matcher, so ordinary coach
 * and player reads never pay for it, and Next only buffers request bodies for these routes.
 */
export async function proxy(req: NextRequest) {
  const rule = ruleFor(req.nextUrl.pathname, req.method);
  if (!rule) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  const isCron = [process.env.CRON_SECRET, process.env.REMINDER_CRON_SECRET].some((s) => s && auth === `Bearer ${s}`);
  if (isCron) return NextResponse.next();

  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
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
  // Next reads this statically, so it has to be a plain list. A test keeps it in step with rateLimit.ts.
  matcher: [
    "/api/public/demo-request",
    "/api/client-invites/:path*",
    "/api/coach-invites/:path*",
    "/api/exec-invites/:path*",
    "/api/team-invites/:path*",
    "/api/coach/basketball-fiba",
    "/api/coach/basketball-film-clip",
    "/api/coach/basketball-game-summary",
    "/api/coach/basketball-match-insights",
    "/api/coach/basketball-opponent-scout",
    "/api/coach/basketball-player-analysis",
    "/api/coach/basketball-season-summary",
    "/api/coach/basketball-total-player-analysis",
    "/api/coach/best-matches/ai-summary",
    "/api/coach/clinical-reports/:id/extract",
    "/api/coach/custom-templates/analyze",
    "/api/coach/drill-library/link-read",
    "/api/coach/drill-library/video-read",
    "/api/coach/goalkeeper-analysis",
    "/api/coach/ksi-report/ai",
    "/api/coach/library/meetings/read-pdf",
    "/api/coach/load-verdict/explain",
    "/api/coach/match-minutes/read-lineup",
    "/api/coach/match-movement/narrative",
    "/api/coach/match-report-read",
    "/api/coach/match-review",
    "/api/coach/movement-analysis",
    "/api/coach/notifications/:id/player-message",
    "/api/coach/opponent-player-analysis",
    "/api/coach/player-analysis",
    "/api/coach/player-game-report/narrative",
    "/api/coach/player-stats/narrative",
    "/api/coach/player/:id/ai-strength-refinement",
    "/api/coach/player/:id/ask",
    "/api/coach/player/:id/decel-summary",
    "/api/coach/player/:id/summary",
    "/api/coach/position-comparison/narrative",
    "/api/coach/rtp/narrative",
    "/api/coach/sb-team-match-report/narrative",
    "/api/coach/scouting/play-diagrams/draft-coverage",
    "/api/coach/scouting/play-diagrams/reconstruct-from-image",
    "/api/coach/season-report",
    "/api/coach/team-analysis",
    "/api/coach/team-season-report",
    "/api/coach/transfer-report/:id",
    "/api/coach/weekly-story",
    "/api/player/basketball-ai-summary",
    "/api/player/game-report/narrative",
    "/api/player/match-movement/narrative",
    "/api/player/why-flagged-ai",
    "/api/pt/reports/:id/extract",
    "/api/trainer/client/:id/corrective",
    "/api/client/ai-coach",
    "/api/coach/scouting/opponent",
    "/api/coach/total-player-analysis",
    "/api/trainer/client/:id/summary",
    "/api/coach/basketball-opponent-scout/import",
    "/api/coach/basketball-stats/upload",
    "/api/coach/load/peak-period/upload",
    "/api/coach/load/peak-window/upload",
    "/api/coach/match-report/upload",
    "/api/coach/pass-network/upload",
    "/api/coach/player-stats/upload",
    "/api/coach/sb-match-summary/upload",
    "/api/coach/sb-team-stats-file/upload",
    "/api/coach/scouting/players-import",
    "/api/coach/scouting/upload",
    "/api/coach/stats/smart-import",
    "/api/coach/team-match-stats/upload",
  ],
};
