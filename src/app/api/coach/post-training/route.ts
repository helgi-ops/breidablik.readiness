/**
 * /api/coach/post-training?date=YYYY-MM-DD
 *
 * GET — the on-screen Post-Training comparison for the coach's team: the
 * pre-session PLAN vs what was actually captured (planned-vs-actual per KPI,
 * team + per player), plus the session RPE. Mirrors what the Post-Training PDF
 * download assembles, but as data for the in-app page (so a coach who has the
 * system doesn't have to download anything; the PDF stays for consulting/send).
 *
 * "Planned" side is reused from /api/coach/load-plan (no duplication of the
 * plan engine); "actual" side is the session-date player_external_load_daily
 * rows. buildPlannedVsActual does the deterministic diff.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildPlannedVsActual, type ActualKpis, type PlanForCompare } from "@/lib/micropulse/loadPlan/plannedVsActual";

export const runtime = "nodejs";

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = url.searchParams.get("date");
  const pickedDate = dateParam && isIso(dateParam) ? dateParam : today;

  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const playerIds = (players ?? []).map((p) => String((p as { id: string }).id));
  if (playerIds.length === 0) return NextResponse.json({ ok: true, sessionDate: null, plannedVsActual: null, rpe: null });

  // Resolve the actual session date: most recent captured day at/before the pick.
  const { data: lastRow } = await sb
    .from("player_external_load_daily")
    .select("date")
    .in("player_id", playerIds)
    .in("source", ["catapult", "manual"])
    .lte("date", pickedDate)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sessionDate = (lastRow as { date?: string } | null)?.date ?? null;
  if (!sessionDate) return NextResponse.json({ ok: true, sessionDate: null, plannedVsActual: null, rpe: null });

  // Actual KPIs per player for that session date.
  const { data: gpsRows } = await sb
    .from("player_external_load_daily")
    .select("player_id, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band58_total_distance, high_speed_distance, sprint_distance, accel_decel_efforts")
    .in("player_id", playerIds)
    .eq("date", sessionDate);
  const actualById = new Map<string, ActualKpis>();
  for (const r of (gpsRows ?? []) as Array<Record<string, unknown>>) {
    actualById.set(String(r.player_id), {
      totalDistance: num(r.total_distance), playerLoad: num(r.total_player_load),
      // HSR/Sprint fall back to the Lite columns; efforts = combined Gen2 count (Lite/Core).
      hsr: num(r.velocity_band5_total_distance) || num(r.high_speed_distance),
      sprint: num(r.velocity_band6_total_distance) || num(r.sprint_distance),
      accel: num(r.accel_b2_3_tot_effs_gen2), decel: num(r.decel_b2_3_tot_effs_gen2),
      efforts: num(r.accel_decel_efforts),
      ima: num(r.ima_fr_band58_total_distance),
    });
  }
  const mean = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null && x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const vals = Array.from(actualById.values());
  const teamActual: ActualKpis = {
    totalDistance: mean(vals.map((v) => v.totalDistance)), playerLoad: mean(vals.map((v) => v.playerLoad)),
    hsr: mean(vals.map((v) => v.hsr)), sprint: mean(vals.map((v) => v.sprint)),
    accel: mean(vals.map((v) => v.accel)), decel: mean(vals.map((v) => v.decel)),
    efforts: mean(vals.map((v) => v.efforts)), ima: mean(vals.map((v) => v.ima)),
  };

  // Planned side — reuse the load-plan endpoint for the same session date.
  let plan: PlanForCompare | null = null;
  let teamName: string | null = null;
  try {
    const planRes = await fetch(`${url.origin}/api/coach/load-plan?date=${sessionDate}`, { headers: { Authorization: `Bearer ${token}` } });
    if (planRes.ok) {
      const j = await planRes.json();
      plan = (j?.plan ?? null) as PlanForCompare | null;
      teamName = (j?.plan as { teamName?: string } | null)?.teamName ?? null;
    }
  } catch { /* fall through → comparison reports no-plan */ }

  const plannedVsActual = buildPlannedVsActual(plan, teamActual, actualById);

  // Session RPE (Foster) — team mean for the day.
  const { data: rpeRows } = await sb
    .from("session_rpe_entries")
    .select("rpe, session_load, duration_minutes")
    .in("player_id", playerIds)
    .eq("session_date", sessionDate);
  const rpes = ((rpeRows ?? []) as Array<{ rpe: number | null; session_load: number | null; duration_minutes: number | null }>);
  const avg = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null; };
  const rpe = rpes.length
    ? { rpe: avg(rpes.map((r) => r.rpe)), sessionLoad: avg(rpes.map((r) => r.session_load)), durationMin: avg(rpes.map((r) => r.duration_minutes)), n: rpes.length }
    : null;

  return NextResponse.json({ ok: true, sessionDate, teamName, plannedVsActual, rpe, playersCaptured: actualById.size });
}
