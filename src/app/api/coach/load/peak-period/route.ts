/**
 * GET /api/coach/load/peak-period?player=<uuid>
 *
 * The player's power curve: the peak (worst) rolling window at each length (1/3/5 min …)
 * per metric, from `player_load_peak_period` (populated by the peak-period upload). Returns
 * the latest session's curves overlaid on the player's season-best curve, benchmarked vs
 * squad — computed by the pure lib `computePeakPeriod`. Descriptive load context only — it
 * never touches the readiness colour, the load target, or the daily decision.
 *
 * If the peak-period table has no rows yet (the export hasn't been imported), the read is
 * empty and `dataCoverage.sessions === 0` — the caller should fall back to the peak-intensity
 * proxy (`/api/coach/player/[id]/peak-demands`).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { computePeakPeriod, type PeakPeriodRow, type PowerCurve } from "@/lib/micropulse/load/peakPeriod";
import { classifyCurveShape, type CurveShapeRead } from "@/lib/micropulse/load/curveShape";
import { computeCriticalSpeedCombined, type CsTestEffort } from "@/lib/micropulse/load/criticalSpeed";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";

export const runtime = "nodejs";

type Row = {
  date: string;
  window_min: number | null;
  metric: string | null;
  value: number | null;
  unit: string | null;
};

export async function GET(req: NextRequest) {
  const playerId = new URL(req.url).searchParams.get("player");
  if (!playerId) return NextResponse.json({ error: "Missing player" }, { status: 400 });

  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ error: "Coach not linked to a team" }, { status: 400 });

  // The player must belong to the coach's team.
  const { data: player } = await sb.from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  if (!player || (player as { team_id?: string }).team_id !== teamId) {
    return NextResponse.json({ error: "Player not on your team" }, { status: 404 });
  }

  const raw = await fetchAllPages<Row>((from, to) =>
    sb
      .from("player_load_peak_period")
      .select("date, window_min, metric, value, unit")
      .eq("player_id", playerId)
      .order("date", { ascending: true })
      .range(from, to),
  );

  const rows: PeakPeriodRow[] = (raw ?? [])
    .filter((r) => r && typeof r.date === "string" && typeof r.metric === "string" && r.window_min != null)
    .map((r) => ({
      date: r.date,
      windowMin: Number(r.window_min),
      metric: String(r.metric),
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null,
      unit: r.unit ?? null,
    }));

  const read = computePeakPeriod(rows);

  // Squad distribution → the percentiles that let "Under-conditioned" fire (a low ceiling
  // at BOTH the short and long window vs teammates). Team-scoped; season-best per player.
  const squadRaw = await fetchAllPages<{ player_id: string; metric: string | null; window_min: number | null; value: number | null }>((from, to) =>
    sb.from("player_load_peak_period").select("player_id, metric, window_min, value").eq("team_id", teamId).range(from, to));
  const squadBest = new Map<string, number>(); // `${player}|${metric}|${window}` → season-best value
  for (const r of squadRaw ?? []) {
    const v = Number(r.value);
    if (!Number.isFinite(v) || r.metric == null || r.window_min == null) continue;
    const k = `${r.player_id}|${r.metric}|${Number(r.window_min)}`;
    const prev = squadBest.get(k);
    if (prev == null || v > prev) squadBest.set(k, v);
  }
  /** Squad season-best values at a metric's shortest and longest window (for percentile rank). */
  function squadArrays(metric: string): { short: number[]; long: number[] } {
    const wins = new Set<number>();
    const playersForMetric = new Set<string>();
    for (const k of squadBest.keys()) {
      const [pid, m, w] = k.split("|");
      if (m === metric) { wins.add(Number(w)); playersForMetric.add(pid); }
    }
    if (!wins.size) return { short: [], long: [] };
    const shortWin = Math.min(...wins), longWin = Math.max(...wins);
    const short: number[] = [], long: number[] = [];
    for (const pid of playersForMetric) {
      const s = squadBest.get(`${pid}|${metric}|${shortWin}`); if (s != null) short.push(s);
      const l = squadBest.get(`${pid}|${metric}|${longWin}`); if (l != null) long.push(l);
    }
    return { short, long };
  }

  // Per-metric curve shape (Explosive / Engine / Under-conditioned) off the season-best curve.
  const shapes: Record<string, CurveShapeRead> = {};
  for (const curve of read.seasonBest) {
    const sq = squadArrays(curve.metric);
    shapes[curve.metric] = classifyCurveShape(curve, { squadShort: sq.short, squadLong: sq.long });
  }

  // Maximal running-test anchors (player_running_test) — the trusted CS/D′ input. Combined
  // with the guardrailed MII distance curve; the test is far better than incidental peaks.
  const runTests = await fetchAllPages<{ player_id: string; duration_s: number | string | null; distance_m: number | string | null }>((from, to) =>
    sb.from("player_running_test").select("player_id, duration_s, distance_m").eq("team_id", teamId).range(from, to));
  const testsByPlayer = new Map<string, CsTestEffort[]>();
  for (const r of runTests ?? []) {
    const t = Number(r.duration_s) / 60, d = Number(r.distance_m);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(d) || d <= 0) continue;
    const arr = testsByPlayer.get(r.player_id) ?? [];
    arr.push({ durationMin: t, distanceM: d });
    testsByPlayer.set(r.player_id, arr);
  }

  // Squad CS/D′ for percentiles — like-for-like: only players who ALSO have a maximal test
  // anchor enter the pool (combined fits), so the benchmark compares tested athletes.
  const squadCs: Array<number | null> = [];
  const squadDPrime: Array<number | null> = [];
  {
    const miiByPlayer = new Map<string, PowerCurve["points"]>();
    for (const [k, v] of squadBest) {
      const [pid, m, w] = k.split("|");
      if (m !== "distance") continue;
      const pts = miiByPlayer.get(pid) ?? [];
      pts.push({ windowMin: Number(w), value: v, index: null });
      miiByPlayer.set(pid, pts);
    }
    for (const [pid, efforts] of testsByPlayer) {
      const cs = computeCriticalSpeedCombined(
        { metric: "distance", unit: "m/min", points: miiByPlayer.get(pid) ?? [] },
        efforts,
      );
      if (cs.csMetresPerMin != null) squadCs.push(cs.csMetresPerMin);
      if (cs.dPrimeM != null) squadDPrime.push(cs.dPrimeM);
    }
  }
  const distanceCurve = read.seasonBest.find((c) => c.metric === "distance") ?? null;
  const criticalSpeed = computeCriticalSpeedCombined(distanceCurve, testsByPlayer.get(playerId) ?? [], {
    sessions: read.dataCoverage.sessions,
    squadCs: squadCs.length >= 2 ? squadCs : undefined,
    squadDPrime: squadDPrime.length >= 2 ? squadDPrime : undefined,
  });

  // Latest match's above-CS distance (≈ HSR band 5+6, manual-override aware) for the anaerobic
  // "tank" read — how many times he spent & refilled D′ that match. Descriptive.
  let latestMatch: { date: string; minutes: number | null; aboveCsDistanceM: number | null } | null = null;
  {
    const { data: mm } = await sb.from("match_player_minutes")
      .select("match_date, minutes_played").eq("player_id", playerId).eq("team_id", teamId)
      .gt("minutes_played", 0).order("match_date", { ascending: false }).limit(1);
    const mrow = (mm ?? [])[0] as { match_date?: string; minutes_played?: number } | undefined;
    if (mrow?.match_date) {
      const { data: lr } = await sb.from("player_external_load_daily")
        .select("date, source, velocity_band5_total_distance, velocity_band6_total_distance, high_speed_distance")
        .eq("player_id", playerId).eq("date", mrow.match_date);
      const eff = oneRowPerDate((lr ?? []).map((r) => ({ ...r, date: String(r.date) })))[0] as
        | { velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null; high_speed_distance: number | null }
        | undefined;
      let above: number | null = null;
      if (eff) {
        const b5 = Number(eff.velocity_band5_total_distance), b6 = Number(eff.velocity_band6_total_distance);
        if (Number.isFinite(b5) || Number.isFinite(b6)) above = (Number.isFinite(b5) ? b5 : 0) + (Number.isFinite(b6) ? b6 : 0);
        else if (Number.isFinite(Number(eff.high_speed_distance))) above = Number(eff.high_speed_distance);
      }
      latestMatch = { date: mrow.match_date, minutes: mrow.minutes_played ?? null, aboveCsDistanceM: above };
    }
  }

  return NextResponse.json({
    ok: true,
    hasData: read.dataCoverage.sessions > 0 && read.seasonBest.length > 0,
    name: (player as { full_name?: string | null }).full_name ?? null,
    peakPeriod: read,
    shapes,
    criticalSpeed,
    latestMatch,
  });
}
