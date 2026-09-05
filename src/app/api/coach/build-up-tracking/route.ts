/**
 * GET /api/coach/build-up-tracking?playerId=…&from=YYYY-MM-DD&to=YYYY-MM-DD&matchDates=csv
 *
 * Actuals side of the Periodization Hub build-up tracker: actual accrued weekly
 * training load per KPI over a block window, plus the chronic-baseline maturity
 * (daysObserved) and the ACWR echo. The client already holds the plan
 * (CalendarBlock) and runs the pure `computeBuildUpAdherence` against this.
 *
 * Descriptive — reads load only, never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadBuildUpActuals } from "@/lib/micropulse/buildUpTracking/loader";

export const runtime = "nodejs";

async function authCoachTeam(req: Request): Promise<{ sb: ReturnType<typeof getSupabaseAdmin>; teamId: string }> {
  const sb = getSupabaseAdmin();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) throw new Error("No team context");
  return { sb, teamId };
}

const errStatus = (m: string) => (/forbidden/i.test(m) ? 403 : /team/i.test(m) ? 400 : 401);
const isIso = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await authCoachTeam(req);
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ ok: false, error: m }, { status: errStatus(m) });
  }

  const sp = new URL(req.url).searchParams;
  const playerId = sp.get("playerId");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });
  if (!isIso(from) || !isIso(to)) return NextResponse.json({ ok: false, error: "from/to must be YYYY-MM-DD" }, { status: 400 });

  const matchDates = (sp.get("matchDates") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  try {
    const result = await loadBuildUpActuals(ctx.sb, { playerId, teamId: ctx.teamId, from, to, matchDates });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: m }, { status: 500 });
  }
}
