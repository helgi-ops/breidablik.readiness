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

type PlanRow = { day_date: string; week_start_date: string | null; md_day: string | null; day_type_final: string | null; dose_final: string | null };
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

  // The week grid (v_week_plan_grid) keys on week_setup_id, not team — resolve the team's
  // week-setup rows near refDate, then pick the week that contains it (else the next one).
  const { data: setups } = await sb.from("coach_week_setup")
    .select("id, week_start_date").eq("team_id", teamId).gte("week_start_date", lo).lte("week_start_date", hi)
    .order("week_start_date", { ascending: true });
  const setupRows = (setups ?? []) as Array<{ id: string; week_start_date: string }>;
  if (!setupRows.length) return NextResponse.json({ ok: true, weekStart: null, days: [] });
  const containing = setupRows.find((s) => { const end = new Date(`${s.week_start_date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6); return s.week_start_date <= refDate && end.toISOString().slice(0, 10) >= refDate; });
  const upcoming = setupRows.find((s) => s.week_start_date >= refDate);
  const chosen = containing ?? upcoming ?? setupRows[setupRows.length - 1];
  const weekStart = chosen.week_start_date;

  const { data: plans } = await sb.from("v_week_plan_grid")
    .select("day_date, week_start_date, md_day, day_type_final, dose_final")
    .eq("week_setup_id", chosen.id).order("day_date", { ascending: true });
  const weekRows = (plans ?? []) as PlanRow[];
  if (!weekRows.length) return NextResponse.json({ ok: true, weekStart, days: [] });

  const days: WeekPlanDayInput[] = weekRows.map((r) => ({
    date: r.day_date,
    mdDay: r.md_day,
    // The theme lives in dose_final (FORCE/NEURAL_VELOCITY/…); day_type_final carries GAME/OFF/RECOVERY.
    dayType: [r.dose_final, r.day_type_final].filter(Boolean).join(" ") || null,
    targetPl: null,
  }));
  const recs = recommendWeekSessions(days);

  // Classify the team's drills once, then pick a blend per training day.
  const { data: drillData } = await sb.from("drill_library")
    .select("id, drill_name, vel_b5, vel_b6, accel_b23, decel_b23")
    .or(`and(owner_type.eq.team,team_id.eq.${teamId}),owner_type.eq.public`).is("deleted_at", null).limit(500);
  const classified: ClassifiedDrill[] = ((drillData ?? []) as DrillRow[]).map((d) => ({
    id: d.id, name: d.drill_name,
    stimulus: classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23)?.type ?? null,
  }));

  const out = recs.map((r) => ({
    ...r,
    drills: r.sessionType ? pickDrillsForBlend(classified, r.blend).map((d) => ({ id: d.id, name: d.name, stimulus: d.stimulus })) : [],
  }));

  return NextResponse.json({ ok: true, weekStart, days: out });
}
