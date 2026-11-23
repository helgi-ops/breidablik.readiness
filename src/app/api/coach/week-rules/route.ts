export const runtime = "nodejs";

/**
 * /api/coach/week-rules (brief §5)
 *
 * GET  ?team_id=&week=YYYY-MM-DD → the saved week's in-season check (never three training days in a row), the days
 *      around it and the fixtures (so Week setup can check the unsaved grid live), and the coach's keep if any.
 * POST { team_id, week_start, reason } → the coach keeps the saved week as planned. Logged with the reason in
 *      session_fit_override_log (model_source "week_rule"). Advice only: nothing is ever blocked.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { mondayOf } from "@/lib/micropulse/goalPlan/today";
import { loadWeekRuleRead, logWeekRuleKeep } from "@/lib/micropulse/weekSetup/weekRulesServer";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function access(req: Request, teamId: string | null) {
  const sb = getSupabase();
  try {
    const a = await requireCoachAccessForTeam(sb, req, teamId);
    if (!a.teamId) return { res: NextResponse.json({ error: "Team context is required" }, { status: 400 }) } as const;
    return { sb, teamId: a.teamId, userId: a.coachUserId } as const;
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return { res: auth } as const;
    throw err;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const week = url.searchParams.get("week") ?? "";
  if (!ISO.test(week)) return NextResponse.json({ error: "week=YYYY-MM-DD required" }, { status: 400 });
  const a = await access(req, url.searchParams.get("team_id"));
  if ("res" in a) return a.res;
  const read = await loadWeekRuleRead(a.sb, a.teamId, mondayOf(week));
  return NextResponse.json({ ok: true, ...read });
}

export async function POST(req: Request) {
  let body: { team_id?: string; week_start?: string; reason?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const week = String(body.week_start ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!ISO.test(week)) return NextResponse.json({ error: "week_start=YYYY-MM-DD required" }, { status: 400 });
  if (reason.length < 3) return NextResponse.json({ error: "A reason is required to keep the plan." }, { status: 400 });
  const a = await access(req, body.team_id ?? null);
  if ("res" in a) return a.res;
  const weekStart = mondayOf(week);
  const read = await loadWeekRuleRead(a.sb, a.teamId, weekStart);
  if (read.check.ok) return NextResponse.json({ ok: true, ...read, note: "Nothing to keep: the saved week has no three days in a row." });
  const { error } = await logWeekRuleKeep(a.sb, { teamId: a.teamId, weekStart, check: read.check, reason, userId: a.userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await loadWeekRuleRead(a.sb, a.teamId, weekStart)) });
}
