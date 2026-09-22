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
import { recommendWeekSessions, type WeekPlanDayInput } from "@/lib/micropulse/weekSetup/weekSessionPlan";
import { classifyDrillStimulus } from "@/lib/drill-stimulus";
import { pickDrillsForDay, type DrillPickInput, type DaySessionType } from "@/lib/micropulse/pitchSession/dayDrillPicker";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";

type PlanRow = { day_date: string; week_start: string | null; day_type: string | null; focus: string | null; day_intent: string | null };
// Full drill row (drill_library.*) — enough to drop straight into the session builder.
type DrillRow = Record<string, unknown> & {
  id: string; drill_name: string; category: string | null;
  vel_b5: number | null; vel_b6: number | null; accel_b23: number | null; decel_b23: number | null;
  area_per_player_m2: number | null; total_players: number | null;
};

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

  // Load the team's drills once (FULL rows, sport-isolated), classify stimulus + keep pitch size, then
  // pick an AREA-AWARE set per training day — a locomotive day wants large/open drills, a mechanical day
  // tight ones (dayDrillPicker). Full rows are returned so the builder can add the drill straight in.
  const teamSport = await resolveTeamSport(sb, teamId);
  const { data: drillData } = await sb.from("drill_library")
    .select("*").eq("sport", teamSport)
    .or(`and(owner_type.eq.team,team_id.eq.${teamId}),owner_type.eq.public`).is("deleted_at", null).limit(500);
  const drillRows = (drillData ?? []) as DrillRow[];
  const byId = new Map(drillRows.map((d) => [d.id, d]));
  const pool: DrillPickInput[] = drillRows.map((d) => ({
    id: d.id, name: d.drill_name, category: d.category,
    stimulus: (classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23)?.type ?? null) as DaySessionType | null,
    areaPerPlayerM2: d.area_per_player_m2, totalPlayers: d.total_players,
  }));

  // MD+1 TOP-UP squad split: players who played < 60 min in the LAST match (and DNPs) get the top-up
  // (loaded toward match demand); those who played ≥ 60 min recover. Injured/rehab players are excluded.
  const TOPUP_MIN = 60;
  const INJURED = new Set(["injured", "rehabilitation", "rtp_training"]);
  const recoveryDates = recs.filter((r) => (r as { recovery?: boolean }).recovery && !isBreak(r.date)).map((r) => r.date).sort();
  type Split = { topUp: Array<{ name: string; minutes: number }>; recovery: Array<{ name: string; minutes: number }>; prevMatch: string };
  const splitByDate: Record<string, Split> = {};
  if (recoveryDates.length) {
    const daysBack = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    const [{ data: fx }, { data: roster }, { data: injRows }] = await Promise.all([
      sb.from("match_schedule").select("match_date").eq("team_id", teamId).lt("match_date", recoveryDates[recoveryDates.length - 1]).gte("match_date", daysBack(recoveryDates[0], 10)).order("match_date", { ascending: false }),
      sb.from("players").select("id, full_name").eq("team_id", teamId).or("is_active.is.null,is_active.eq.true"),
      sb.from("player_injuries").select("player_id, status, updated_at").eq("team_id", teamId).order("updated_at", { ascending: false }),
    ]);
    const fxDates = ((fx ?? []) as Array<{ match_date: string }>).map((f) => f.match_date);
    const injured = new Set<string>(); const seen = new Set<string>();
    for (const r of (injRows ?? []) as Array<{ player_id: string; status: string }>) { const pid = String(r.player_id ?? ""); if (!pid || seen.has(pid)) continue; seen.add(pid); if (INJURED.has(String(r.status ?? "").toLowerCase())) injured.add(pid); }
    const active = ((roster ?? []) as Array<{ id: string; full_name: string | null }>).filter((p) => !injured.has(p.id));
    for (const recDate of recoveryDates) {
      const prevMatch = fxDates.find((d) => d < recDate);
      if (!prevMatch) continue;
      const { data: mins } = await sb.from("match_player_minutes").select("player_id, minutes_played").eq("team_id", teamId).eq("match_date", prevMatch);
      const minMap = new Map<string, number>();
      for (const m of (mins ?? []) as Array<{ player_id: string; minutes_played: number | null }>) minMap.set(m.player_id, m.minutes_played ?? 0);
      const topUp: Array<{ name: string; minutes: number }> = [], recovery: Array<{ name: string; minutes: number }> = [];
      for (const p of active) { const mn = minMap.get(p.id) ?? 0; const e = { name: p.full_name ?? "—", minutes: mn }; if (mn < TOPUP_MIN) topUp.push(e); else recovery.push(e); }
      topUp.sort((a, b) => a.minutes - b.minutes); recovery.sort((a, b) => b.minutes - a.minutes);
      splitByDate[recDate] = { topUp, recovery, prevMatch };
    }
  }

  const out = recs.map((r) => {
    if (isBreak(r.date)) {
      return { ...r, sessionType: null, mdDay: "Frí", blend: {}, drills: [], note: { en: "Team break — no session (locked).", is: "Skráð frí — engin æfing (læst)." } };
    }
    // Top-up (MD+1) must cover BOTH loads → blend the best locomotive (HSR, open) + mechanical
    // (accel/decel, tight) + a match-like block, instead of one stimulus. Other days: single stimulus.
    const pickMerged = (types: DaySessionType[], perType: number, cap: number) => {
      const seen = new Set<string>(); const acc: ReturnType<typeof pickDrillsForDay> = [];
      for (const t of types) for (const p of pickDrillsForDay(pool, t, { limit: perType })) { if (!seen.has(p.id)) { seen.add(p.id); acc.push(p); } }
      return acc.slice(0, cap);
    };
    const picks = (r as { recovery?: boolean }).recovery
      ? pickMerged(["locomotive", "mechanical", "mixed"], 2, 6)
      : r.sessionType ? pickDrillsForDay(pool, r.sessionType as DaySessionType, { limit: 6 }) : [];
    // Return the FULL drill row + the pick's area grading, so "Use this day" drops complete drills in.
    // areaPerPlayerEff / areaEstimated let the UI show the estimated size (flagged) when no pitch is set.
    const drills = picks.map((p) => ({ ...(byId.get(p.id) ?? {}), stimulus: p.stimulus, areaFit: p.areaFit, areaWhy: p.why, areaPerPlayerEff: p.areaPerPlayerM2, areaEstimated: p.areaEstimated }));
    const split = splitByDate[r.date] ?? null;
    return { ...r, drills, topUpPlayers: split?.topUp ?? null, recoveryPlayers: split?.recovery ?? null, prevMatch: split?.prevMatch ?? null };
  });

  return NextResponse.json({ ok: true, weekStart, days: out });
}
