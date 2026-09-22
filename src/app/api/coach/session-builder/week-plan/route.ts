export const runtime = "nodejs";

/**
 * GET /api/coach/session-builder/week-plan?date=YYYY-MM-DD
 *
 * Lets "build session" read the WEEK PLAN (Week Setup) and lay out the week's sessions:
 * for each training day, the recommended stimulus type (mechanical / locomotive / mixed /
 * technical) from its theme + target load, plus a few drills from the library that express
 * that day's blend. Advisory — the coach still builds each session; descriptive planning
 * aid, never the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { recommendWeekSessions, pickDrillsForBlend, type WeekPlanDayInput, type ClassifiedDrill } from "@/lib/micropulse/weekSetup/weekSessionPlan";
import { classifyDrillStimulus } from "@/lib/drill-stimulus";

type PlanRow = { day_date: string; week_start: string | null; day_type: string | null; focus: string | null; day_intent: string | null };
type DrillRow = { id: string; drill_name: string; vel_b5: number | null; vel_b6: number | null; accel_b23: number | null; decel_b23: number | null };

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

  const refDate = new URL(req.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const lo = (() => { const d = new Date(`${refDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 13); return d.toISOString().slice(0, 10); })();
  const hi = (() => { const d = new Date(`${refDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 13); return d.toISOString().slice(0, 10); })();

  // The coach's saved week plan lives in week_plans (team_id + week_start), one row per day:
  // day_type (TRAIN/RECOVERY/OFF/GAME) + focus (the stimulus theme, e.g. "Mechanical"/"Locomotive"/
  // ACTIVATION / …) + day_intent (the MD tag the Meso writes, e.g. "MD-3"). That triple is exactly
  // what the mapper reads. (v_week_plan_grid is the match-anchored auto view — all "OTHER" on a
  // no-match week — so it is NOT the source here.)
  const { data: plans } = await sb.from("week_plans")
    .select("day_date, week_start, day_type, focus, day_intent")
    .eq("team_id", teamId).gte("day_date", lo).lte("day_date", hi).order("day_date", { ascending: true });
  const rows = (plans ?? []) as PlanRow[];
  if (!rows.length) return NextResponse.json({ ok: true, weekStart: null, days: [] });

  // Pick the week (by week_start) containing refDate, else the earliest upcoming week.
  const byWeek = new Map<string, PlanRow[]>();
  for (const r of rows) { const k = r.week_start ?? r.day_date; const a = byWeek.get(k) ?? []; a.push(r); byWeek.set(k, a); }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const containing = weeks.find(([, rs]) => rs.some((r) => r.day_date <= refDate) && rs.some((r) => r.day_date >= refDate));
  const upcoming = weeks.find(([ws]) => ws >= refDate);
  const [weekStart, weekRows] = containing ?? upcoming ?? weeks[weeks.length - 1];

  const mdToken = (s: string | null): string | null => s?.match(/MD\s*[+-]?\s*\d+/i)?.[0]?.replace(/\s+/g, "").toUpperCase() ?? null;
  const days: WeekPlanDayInput[] = weekRows.map((r) => ({
    date: r.day_date,
    // The MD day is the Meso's day_intent ("MD-3") — the day-truth. Fall back to an MD token that
    // may sit in focus ("MD+1 RECOVERY"), then let the mapper derive it from day_type as a last resort.
    mdDay: mdToken(r.day_intent) ?? mdToken(r.focus),
    // focus carries the stimulus theme (Mechanical / Locomotive / Mixed / ACTIVATION / …); day_type
    // carries TRAIN/RECOVERY/OFF/GAME. Both feed the stimulus + MD-tier resolution.
    dayType: [r.focus, r.day_type].filter(Boolean).join(" ") || null,
    targetPl: null,
  }));
  const recs = recommendWeekSessions(days);

  // Declared team breaks own their days — a day inside a break is FRÍ (no session),
  // overriding whatever week_plans still holds (mirrors the Week Setup grid lock:
  // start_date <= date <= end_date, inclusive). This is why a break day must not show
  // ACTIVATION/POLISH etc from the stale auto layout.
  const { data: breakRows } = await sb.from("team_breaks")
    .select("start_date, end_date").eq("team_id", teamId).gte("end_date", weekStart ?? lo);
  const breaks = ((breakRows ?? []) as Array<{ start_date: string; end_date: string }>);
  const isBreak = (d: string) => breaks.some((b) => b.start_date <= d && d <= b.end_date);

  // Classify the team's drills once, then pick a blend per training day.
  const { data: drillData } = await sb.from("drill_library")
    .select("id, drill_name, vel_b5, vel_b6, accel_b23, decel_b23")
    .or(`and(owner_type.eq.team,team_id.eq.${teamId}),owner_type.eq.public`).is("deleted_at", null).limit(500);
  const classified: ClassifiedDrill[] = ((drillData ?? []) as DrillRow[]).map((d) => ({
    id: d.id, name: d.drill_name,
    stimulus: classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23)?.type ?? null,
  }));

  const out = recs.map((r) => {
    if (isBreak(r.date)) {
      return { ...r, sessionType: null, mdDay: "Frí", blend: {}, drills: [], note: { en: "Team break — no session (locked).", is: "Skráð frí — engin æfing (læst)." } };
    }
    return { ...r, drills: r.sessionType ? pickDrillsForBlend(classified, r.blend).map((d) => ({ id: d.id, name: d.name, stimulus: d.stimulus })) : [] };
  });

  return NextResponse.json({ ok: true, weekStart, days: out });
}
