/**
 * /api/coach/progressive-overload?date=YYYY-MM-DD&weeks=N
 *
 * GET — a preparation-phase progressive-overload projection for the coach's
 * team: a safe week-by-week ramp per load KPI (ACWR-capped, ceilinged at match
 * demand, differentiated rates) plus a per-player build summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildProgressiveOverload, type LoadKpi } from "@/lib/micropulse/progressiveOverload";
import { type LoadRow } from "@/lib/micropulse/loadPlan";

export const runtime = "nodejs";


const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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

  let teamName: string | null = null;
  try {
    const { data: team } = await sb.from("teams").select("name").eq("id", teamId).maybeSingle();
    teamName = (team as { name: string | null } | null)?.name ?? null;
  } catch { /* cosmetic */ }

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = url.searchParams.get("date");
  const sessionDate = dateParam && isIso(dateParam) ? dateParam : today;
  const weeksParam = Number(url.searchParams.get("weeks"));
  const weeks = Number.isFinite(weeksParam) && weeksParam >= 1 && weeksParam <= 12 ? Math.round(weeksParam) : 5;

  // Optional per-player focus + weakness-bias (from the hub's Total Player Analysis steer). `player` is a
  // uuid; `emph` is a compact "kpi:mult,kpi:mult" list. Both are advisory — the engine's ACWR + match-
  // ceiling caps still bound the result, so the bias can steer but never spike.
  const focusPlayerId = (url.searchParams.get("player") ?? "").trim() || undefined;
  const KPI_KEYS = new Set<LoadKpi>(["totalDistance", "playerLoad", "hsr", "sprint", "accel", "decel", "efforts", "ima", "imaAccel", "imaDecel", "imaCod", "jumps"]);
  const emphasis: Partial<Record<LoadKpi, number>> = {};
  for (const part of (url.searchParams.get("emph") ?? "").split(",")) {
    const [k, v] = part.split(":");
    const key = (k ?? "").trim() as LoadKpi; const mult = Number(v);
    if (KPI_KEYS.has(key) && Number.isFinite(mult) && mult > 0 && mult <= 1.5) emphasis[key] = mult;
  }

  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const playerIds = (players ?? []).map((p) => String((p as { id: string }).id));
  const nameById = new Map<string, string>();
  for (const p of (players ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(String(p.id), (p.full_name ?? "—").trim());
  if (playerIds.length === 0) return NextResponse.json({ error: "No players" }, { status: 400 });

  // GPS over 120 days, paged past the 1000-row PostgREST cap.
  const from = addDaysISO(sessionDate, -120);
  const SELECT = "player_id, date, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band58_total_distance, ima_accel, ima_decel, jumps, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, high_speed_distance, sprint_distance, accel_decel_efforts";
  const PAGE = 1000;
  const loadRows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error } = await sb
      .from("player_external_load_daily")
      .select(SELECT)
      .in("source", ["catapult", "manual"])
      .in("player_id", playerIds)
      .gte("date", from)
      .lte("date", sessionDate)
      .order("date")
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!page || page.length === 0) break;
    loadRows.push(...(page as Array<Record<string, unknown>>));
    if (page.length < PAGE) break;
  }

  const plan = buildProgressiveOverload({
    sessionDate,
    weeks,
    rows: loadRows as unknown as LoadRow[],
    nameById,
    focusPlayerId,
    emphasis: Object.keys(emphasis).length ? emphasis : undefined,
  });

  // Light KPI label map for the client (avoid importing the lib there).
  const labels: Record<LoadKpi, string> = {
    totalDistance: "Total distance (m)", playerLoad: "Player Load", hsr: "High-speed distance (m)",
    sprint: "Sprint distance (m)", accel: "Accelerations (B2-3)", decel: "Decelerations (B2-3)",
    efforts: "Hard efforts (accel+decel)", ima: "IMA high-intensity (m)",
    imaAccel: "IMA accelerations", imaDecel: "IMA decelerations", imaCod: "Change of direction", jumps: "Jumps",
  };

  return NextResponse.json({ plan: { ...plan, teamName }, labels });
}
