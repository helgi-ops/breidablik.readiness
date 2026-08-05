/**
 * /api/coach/match-insights
 *
 * GET — descriptive match analytics that read GPS/IMA movement against match
 * RESULTS and advanced season stats (xG):
 *   • Wins-vs-losses movement: per-match team movement aggregates grouped by
 *     W/D/L, with effect sizes (Cohen's d) per metric.
 *   • Result correlation: each movement metric vs the result (W=1/D=0.5/L=0).
 *   • Season-xG correlation: each player's season xG-per-90 vs his movement norm.
 *
 * Reuses the Match Movement engine (per-match + per-player movement fingerprints,
 * variant-aware, contamination-gated, paginated) so no new GPS pipeline. Results
 * come from match_schedule.goals_*; season xG from player_season_stats.
 *
 * Descriptive/context ONLY — association, never causation or prediction, and it
 * never touches the readiness colour or the daily decision. Honest empty states:
 * no graded matches → no win/loss verdict; per-match xG stays blocked until the
 * Wyscout Data API is connected (player_match_stats empty).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeMatchMovement } from "@/lib/micropulse/matchMovement";
import { movementDimensions } from "@/lib/micropulse/matchMovement/types";
import { winLossMovement, type MatchMetricRow, type MatchResult } from "@/lib/micropulse/matchInsights/winLoss";
import { pearson } from "@/lib/micropulse/matchInsights/correlation";
import { EXTENDED_METRIC_KEYS, extendedMetricsForRow, type ExtMetricKey } from "@/lib/micropulse/matchInsights/extendedMetrics";
import { fetchAllPages } from "@/lib/supabasePaginate";

export const runtime = "nodejs";

function resultOf(gf: number | null, ga: number | null): MatchResult | null {
  if (gf == null || ga == null) return null;
  return gf > ga ? "W" : gf < ga ? "L" : "D";
}
const RESULT_SCORE: Record<MatchResult, number> = { W: 1, D: 0.5, L: 0 };
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;

  const mm = await computeMatchMovement({ teamId });
  const dimKeys = movementDimensions(mm.variant).map((d) => d.key);

  // ── Results from match_schedule (goals → W/D/L). ──────────────────────────────
  const { data: schedRows } = await supabase
    .from("match_schedule")
    .select("match_date, opponent, goals_for, goals_against")
    .eq("team_id", teamId)
    .not("goals_for", "is", null)
    .not("goals_against", "is", null);
  const resultByDate = new Map<string, { result: MatchResult; opponent: string | null }>();
  for (const r of (schedRows ?? []) as Array<{ match_date: string; opponent: string | null; goals_for: number | null; goals_against: number | null }>) {
    const res = resultOf(r.goals_for, r.goals_against);
    if (res) resultByDate.set(r.match_date, { result: res, opponent: r.opponent });
  }

  // ── Extended metrics (richer GPS + detailed IMA the fingerprint doesn't carry).
  // Reuse mm's minutes + contamination gate; pull the raw columns per player-match
  // and compute per-minute. Paged past the 1000-row cap.
  const playerIds = mm.players.map((p) => p.player_id);
  const extCols =
    "player_id, date, total_distance, high_speed_distance, velocity_band6_total_distance, sprint_distance, " +
    "max_velocity, high_metabolic_load_distance_m, ima_band3_decel_count, ima_cod_left_high, ima_cod_right_high, " +
    "ima_fr_band8_stride_count, fmp_running_high_s, fmp_total_duration_s, jumps";
  const rawRows = mm.matchDates.length && playerIds.length
    ? await fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase.from("player_external_load_daily").select(extCols)
          .eq("team_id", teamId).eq("source", "catapult")
          .in("date", mm.matchDates).in("player_id", playerIds)
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>)
    : [];
  const rawByKey = new Map<string, Record<string, unknown>>();
  for (const r of rawRows) rawByKey.set(`${r.player_id}|${r.date}`, r);

  const extByDate = new Map<string, Partial<Record<ExtMetricKey, number[]>>>();
  const extByPlayer = new Map<string, Partial<Record<ExtMetricKey, number[]>>>();
  for (const row of mm.rows) {
    if (row.contaminated || !(row.minutes > 0)) continue;
    const raw = rawByKey.get(`${row.player_id}|${row.match_date}`);
    if (!raw) continue;
    const ext = extendedMetricsForRow(raw, row.minutes);
    const d = extByDate.get(row.match_date) ?? {}; extByDate.set(row.match_date, d);
    const p = extByPlayer.get(row.player_id) ?? {}; extByPlayer.set(row.player_id, p);
    for (const k of EXTENDED_METRIC_KEYS) {
      const v = ext[k];
      if (v != null) { (d[k] ??= []).push(v); (p[k] ??= []).push(v); }
    }
  }
  const extPlayerMean = new Map<string, Partial<Record<ExtMetricKey, number>>>();
  for (const [pid, acc] of extByPlayer) {
    const o: Partial<Record<ExtMetricKey, number>> = {};
    for (const k of EXTENDED_METRIC_KEYS) if (acc[k]?.length) o[k] = mean(acc[k]!);
    extPlayerMean.set(pid, o);
  }

  // Full metric universe = fingerprint dims + extended (drop keys already in the variant).
  const extKeys = EXTENDED_METRIC_KEYS.filter((k) => !(dimKeys as string[]).includes(k));
  const metricKeys = [...dimKeys, ...extKeys];

  // ── Per-match team aggregate over the full set (exclude contaminated rows). ────
  const byDate = new Map<string, Record<string, number[]>>();
  for (const row of mm.rows) {
    if (row.contaminated) continue;
    const acc = byDate.get(row.match_date) ?? {}; byDate.set(row.match_date, acc);
    for (const k of dimKeys) {
      const v = row.fingerprint[k];
      if (typeof v === "number" && Number.isFinite(v)) (acc[k] ??= []).push(v);
    }
  }
  const perMatch = Array.from(byDate.entries()).map(([sessionDate, acc]) => {
    const ext = extByDate.get(sessionDate) ?? {};
    const values: Record<string, number | null> = {};
    for (const k of dimKeys) values[k] = acc[k]?.length ? mean(acc[k]!) : null;
    for (const k of extKeys) values[k] = ext[k]?.length ? mean(ext[k]!) : null;
    return { sessionDate, values };
  });

  // Graded matches (have a result) → win/loss + result correlation.
  const gradedRows: MatchMetricRow[] = perMatch
    .filter((m) => resultByDate.has(m.sessionDate))
    .map((m) => ({ sessionDate: m.sessionDate, result: resultByDate.get(m.sessionDate)!.result, values: m.values }));
  const winLoss = winLossMovement(gradedRows, metricKeys);

  const resultCorrelations = metricKeys
    .map((k) => {
      const xs = gradedRows.map((r) => r.values[k] ?? null);
      const ys = gradedRows.map((r) => RESULT_SCORE[r.result]);
      const r = pearson(xs, ys);
      return r ? { key: k, r: r.r, n: r.n, strength: r.strength, direction: r.direction } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b!.r) - Math.abs(a!.r))
    .slice(0, 8);

  // ── Season xG × movement norm (across players). ───────────────────────────────
  const { data: seasonRows } = await supabase
    .from("player_season_stats")
    .select("player_id, xg, minutes")
    .eq("team_id", teamId)
    .not("player_id", "is", null)
    .not("xg", "is", null);
  // One xG-per-90 per player (pick the season row with the most minutes).
  const xgPer90 = new Map<string, number>();
  const bestMin = new Map<string, number>();
  for (const r of (seasonRows ?? []) as Array<{ player_id: string; xg: number | null; minutes: number | null }>) {
    const mins = typeof r.minutes === "number" ? r.minutes : 0;
    if (mins <= 0 || r.xg == null) continue;
    if ((bestMin.get(r.player_id) ?? -1) >= mins) continue;
    bestMin.set(r.player_id, mins);
    xgPer90.set(r.player_id, r.xg / (mins / 90));
  }
  const playersWithXg = Array.from(xgPer90.keys()).filter((pid) => mm.playerAverages[pid] || extPlayerMean.get(pid));
  // Combined per-player movement value: fingerprint norm for dims, extended mean otherwise.
  const playerVal = (pid: string, k: string): number | null =>
    (dimKeys as string[]).includes(k) ? (mm.playerAverages[pid]?.[k] ?? null) : (extPlayerMean.get(pid)?.[k as ExtMetricKey] ?? null);
  const seasonXgCorrelations = metricKeys
    .map((k) => {
      const xs = playersWithXg.map((pid) => xgPer90.get(pid)!);
      const ys = playersWithXg.map((pid) => playerVal(pid, k));
      const r = pearson(xs, ys);
      return r ? { key: k, r: r.r, n: r.n, strength: r.strength, direction: r.direction } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b!.r) - Math.abs(a!.r))
    .slice(0, 8);

  return NextResponse.json({
    variant: mm.variant,
    dimKeys: metricKeys,
    counts: { matchesWithLoad: perMatch.length, gradedMatches: gradedRows.length, playersWithXg: playersWithXg.length },
    winLoss,
    resultCorrelations,
    seasonXg: { available: seasonXgCorrelations.length > 0, correlations: seasonXgCorrelations },
    // Per-match xG (per-match stat × movement) is blocked until the Wyscout Data
    // API is connected — honest empty state, never fabricated.
    perMatchXg: { available: false, reason: "Per-match football stats need the Wyscout Data API (not yet connected)." },
  });
}
