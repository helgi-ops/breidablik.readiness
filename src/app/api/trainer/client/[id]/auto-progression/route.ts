/**
 * /api/trainer/client/[id]/auto-progression
 *
 * The trainer's view of the auto-progression engine for one client: per lift,
 * the working 1RM the programme prescribes against (tested anchor, raised by
 * corroborated logged performance within guardrails), whether it auto-raised,
 * and whether a retest is flagged. Same engine the client's session uses.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import { buildOneRmMap, canonicalLift, type LvTest } from "@/lib/client/oneRepMax";
import { computeWorkingOneRm, type SetLogRow } from "@/lib/client/workingOneRm";
import { e1rmEvidence } from "@/lib/client/oneRepMaxFormulas";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function isoDaysAgo(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

async function requireTrainerForClient(req: Request, clientId: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;
  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
    if (!clientRow) return { error: "Client not found", status: 404 } as const;
    const clientTeamId = (clientRow as { team_id?: string | null }).team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const sb = a.sb;

  const { data: lvRows } = await sb
    .from("lv_profile_tests")
    .select("exercise_label, est_one_rm, test_date")
    .eq("client_id", clientId)
    .order("test_date", { ascending: false })
    .limit(100);
  const lvTests = (lvRows ?? []) as LvTest[];
  const tested = buildOneRmMap(lvTests);

  const since28 = isoDaysAgo(28);
  const { data: setLogRows } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps, rpe")
    .eq("player_id", clientId)
    .gte("session_date", since28);
  const setLogs = (setLogRows ?? []) as SetLogRow[];
  const working = computeWorkingOneRm(lvTests, setLogs);

  // Most recent logged top set per canonical lift (for context).
  const lastLog = new Map<string, { date: string; weight: number; reps: number; e1rm: number }>();
  for (const s of setLogs) {
    if (s.weight_kg == null || s.reps == null) continue;
    const lift = canonicalLift(s.exercise_name);
    if (!lift) continue;
    const e = e1rmEvidence(s.weight_kg, s.reps, s.rpe);
    const cur = lastLog.get(lift);
    if (!cur || s.session_date > cur.date || (s.session_date === cur.date && e > cur.e1rm)) {
      lastLog.set(lift, { date: s.session_date, weight: s.weight_kg, reps: s.reps, e1rm: Math.round(e * 10) / 10 });
    }
  }

  const lifts = Array.from(working.entries()).map(([lift, w]) => ({
    lift,
    working_one_rm: w.one_rm,
    source: w.source,                 // "tested" | "auto" | "logged"
    tested: w.tested,
    needs_retest: w.needs_retest,
    pct_vs_tested: w.tested != null && w.tested > 0 ? Math.round(((w.one_rm / w.tested) - 1) * 100) : null,
    test_date: tested.get(lift)?.testDate ?? null,
    last_log: lastLog.get(lift) ?? null,
  })).sort((x, y) => y.working_one_rm - x.working_one_rm);

  const autoRaised = lifts.filter((l) => l.source === "auto").length;
  const retests = lifts.filter((l) => l.needs_retest).length;
  const loggedOnly = lifts.filter((l) => l.source === "logged").length;

  return NextResponse.json({
    ok: true,
    summary: { total: lifts.length, autoRaised, retests, loggedOnly },
    lifts,
  });
}
