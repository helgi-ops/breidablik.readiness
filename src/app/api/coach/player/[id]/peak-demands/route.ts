/**
 * /api/coach/player/[id]/peak-demands
 *
 * GET — the player's peak-intensity and mechanical-power reads over the season,
 * computed from player_external_load_daily session summaries. The "peak demands"
 * of his most intense sessions (PlayerLoad/min, peak metabolic power, high-speed
 * rate, high-intensity efforts/min) vs his own typical, plus his mechanical-load
 * intensity (the cost of cuts and decelerations). Descriptive load context only —
 * it never touches the readiness colour, the load target, or the daily decision.
 *
 * Phase 1: this is a peak-intensity FINGERPRINT from session summaries, not a true
 * rolling peak period (that needs the per-interval Catapult export — Phase 2). The
 * response is labelled as a proxy so the coach reads it honestly.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { computePeakIntensity, type PeakRow } from "@/lib/micropulse/load/peakIntensity";
import { computeMechanicalPower, type MechRow } from "@/lib/micropulse/load/mechanicalPower";
import { computePeakBenchmark } from "@/lib/micropulse/load/peakBenchmark";
import { loadPeakDistanceWindows } from "@/lib/micropulse/load/loadPeakDistanceWindows";
import { loadPeakHirWindows } from "@/lib/micropulse/load/loadPeakHirWindows";
import { computePlayerGameReport } from "@/lib/micropulse/playerGameReport";
import { computePeakMovementSignature, sumClocks } from "@/lib/micropulse/peakMovementSignature";
import type { ClockGrid } from "@/lib/micropulse/directionalSignature";

export const runtime = "nodejs";

type LoadRow = {
  date: string;
  source: string | null;
  player_load_per_minute: number | null;
  metabolic_power: number | null;
  metabolic_power_peak: number | null;
  velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
  ima_clock_gen2: ClockGrid | null;
  session_duration_minutes: number | null;
  total_player_load: number | null;
  rhie_bouts: number | null;
  rhie_efforts_per_bout_mean: number | null;
  rhie_effort_recovery_mean_s: number | null;
};

/** Sum the high-intensity tier across the 12-direction ima_clock_gen2 grid. Null if absent. */
function imaHighCount(grid: ClockGrid | null): number | null {
  if (!grid || typeof grid !== "object") return null;
  let total = 0, any = false;
  for (const cell of Object.values(grid)) {
    const h = cell?.high;
    if (typeof h === "number" && Number.isFinite(h)) { total += h; any = true; }
  }
  return any ? total : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
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

  const { data: player } = await sb.from("players").select("id, full_name, position, sport").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null; position: string | null; sport: string | null };

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.parse(today + "T00:00:00Z") - 180 * 86_400_000).toISOString().slice(0, 10);

  // Both catapult + manual rows; oneRowPerDate resolves a manual correction over catapult.
  const raw = await fetchAllPages<LoadRow>((from, to) => sb
    .from("player_external_load_daily")
    .select("date, source, player_load_per_minute, metabolic_power, metabolic_power_peak, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_clock_gen2, session_duration_minutes, total_player_load, rhie_bouts, rhie_efforts_per_bout_mean, rhie_effort_recovery_mean_s")
    .eq("player_id", playerId)
    .in("source", ["catapult", "manual"])
    .gte("date", windowStart)
    .lte("date", today)
    .range(from, to));

  const rows = oneRowPerDate(raw ?? []);

  const peakRows: PeakRow[] = rows.map((r) => ({
    date: r.date,
    loadPerMin: r.player_load_per_minute,
    metabolicPeak: r.metabolic_power_peak,
    hsrBand6: r.velocity_band6_total_distance,
    accelEfforts: r.accel_b2_3_tot_effs_gen2,
    decelEfforts: r.decel_b2_3_tot_effs_gen2,
    durationMin: r.session_duration_minutes,
    playerLoad: r.total_player_load,
  }));
  const mechRows: MechRow[] = rows.map((r) => ({
    date: r.date,
    imaHigh: imaHighCount(r.ima_clock_gen2),
    accelEfforts: r.accel_b2_3_tot_effs_gen2,
    decelEfforts: r.decel_b2_3_tot_effs_gen2,
    metabolicPeak: r.metabolic_power_peak,
    metabolicAvg: r.metabolic_power,
    durationMin: r.session_duration_minutes,
    playerLoad: r.total_player_load,
    loadPerMin: r.player_load_per_minute,
  }));

  const peak = computePeakIntensity(peakRows);
  const mech = computeMechanicalPower(mechRows);
  const hasData = peak.dataCoverage.sessions > 0 && peak.dataCoverage.proxies > 0;

  // Research benchmark — game-total top speed / HSR / sprint (per-90) vs Ju et al.
  // (2022) elite position reference. Reuses the season game-report engine for the
  // match-scoped totals; falls back to the previous season if the current one has
  // no GPS matches yet. Football only (the reference is EPL outfield positions).
  // The peak-period HIR-per-window track is HARD-GATED: the load table holds only
  // total-distance / PlayerLoad per window (no >19.8 km/h fraction), so we pass no
  // per-window HIR and the engine refuses to grade it against Table 2.
  let benchmark: ReturnType<typeof computePeakBenchmark> | null = null;
  let topSpeedKmh: number | null = null;
  let peakHirW1: number | null = null;
  let peakDistW1: number | null = null;
  if (String(p.sport ?? "").toLowerCase() !== "basketball") {
    const year = Number(today.slice(0, 4));
    let gr = await computePlayerGameReport(sb, teamId, playerId, year);
    if (gr.ok && gr.report.summary.matches_with_gps === 0) {
      const prev = await computePlayerGameReport(sb, teamId, playerId, year - 1);
      if (prev.ok && prev.report.summary.matches_with_gps > 0) gr = prev;
    }
    if (gr.ok) {
      const s = gr.report.summary;
      const nz = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : null);
      // Peak-period fall-off SHAPE — best TOTAL-distance rate (m/min) at each window from the
      // MII peak-period feed. Context only (total distance, not HIR); the engine never grades it.
      const peakDistanceShape = await loadPeakDistanceWindows(sb, playerId);
      // Peak-period HIR per window (m/min) from the Catapult CTR feed — opens the Ju Table-2 track
      // when present; null (no CTR ingested) keeps it honestly hard-gated.
      const peakHir = await loadPeakHirWindows(sb, playerId);
      topSpeedKmh = nz(s.best_top_speed_kmh);
      peakHirW1 = peakHir?.perMin?.w1 ?? null;
      peakDistW1 = peakDistanceShape?.w1 ?? null;
      benchmark = computePeakBenchmark({
        position: p.position,
        sport: p.sport,
        bestTopSpeedKmh: topSpeedKmh,
        hsrPer90: nz(s.per90_avg?.hsr),
        sprintPer90: nz(s.per90_avg?.sprint),
        matchCount: s.matches_with_gps,
        peakHirPerMin: peakHir?.perMin ?? null,
        hsrThresholdKmh: peakHir?.thresholdKmh ?? null,
        peakDistanceShape,
      });
    }
  }

  // Peak-window MOVEMENT SIGNATURE (Catapult-only flagship): what his peak
  // intensity is MADE OF — forward attacking vs backward recovery vs
  // multidirectional vs low — from the aggregated IMA directional clock + the
  // window's high-speed rate. Sport-agnostic on the clock; honest empty state
  // when no clock exists. Descriptive movement read, never the Ju taxonomy.
  // RHIE (repetition axis): the player's typical per-session repeated-sprint load —
  // mean over sessions that report it. Null until the RHIE export lands.
  const meanOf = (vals: Array<number | null>): number | null => {
    const xs = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const rhieRows = rows.filter((r) => typeof r.rhie_bouts === "number" && (r.rhie_bouts ?? 0) > 0);
  const movementSignature = computePeakMovementSignature({
    clock: sumClocks(rows.map((r) => r.ima_clock_gen2)),
    hsrPerMin: peakHirW1,
    peakDistancePerMin: peakDistW1,
    topSpeedKmh,
    rhieBouts: meanOf(rhieRows.map((r) => r.rhie_bouts)),
    rhieEffortsPerBoutMean: meanOf(rhieRows.map((r) => r.rhie_efforts_per_bout_mean)),
    rhieEffortRecoveryMeanS: meanOf(rhieRows.map((r) => r.rhie_effort_recovery_mean_s)),
  });

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    position: p.position,
    hasData,
    peak,
    mechanical: mech,
    benchmark,
    movementSignature,
    note: "Peak-intensity fingerprint + mechanical-load intensity from session summaries (a proxy, not a true rolling peak period). Descriptive load context — it never changes the readiness verdict or the daily plan.",
  });
}
