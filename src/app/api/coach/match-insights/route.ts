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
import { EXTENDED_METRIC_KEYS, GPS_LOCOMOTOR_KEYS, extendedMetricsForRow, type ExtMetricKey } from "@/lib/micropulse/matchInsights/extendedMetrics";
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

  // ── Per-match TEAM stats (Wyscout export). Read here (before win/loss) because
  // its goals for BOTH sides let us grade EVERY match with movement data, not only
  // the ones a coach scored by hand on Fixtures. ────────────────────────────────
  type OwnStat = {
    match_date: string; opponent_name: string | null; created_at: string;
    goals: number | null; xg: number | null; shots: number | null; shots_on_target: number | null;
    passes: number | null; passes_accurate: number | null; possession_pct: number | null;
    duels: number | null; duels_won: number | null; recoveries: number | null;
    ppda: number | null; def_duels_won_pct: number | null;
    raw: Record<string, unknown> | null;
  };
  const { data: tmsOwn } = await supabase
    .from("team_match_stats")
    .select("match_date, opponent_name, created_at, goals, xg, shots, shots_on_target, passes, passes_accurate, possession_pct, duels, duels_won, recoveries, ppda, def_duels_won_pct, raw")
    .eq("team_id", teamId).eq("is_opponent", false);
  const { data: tmsOpp } = await supabase
    .from("team_match_stats")
    .select("match_date, xg, goals, shots")
    .eq("team_id", teamId).eq("is_opponent", true);

  const ownByDate = new Map<string, OwnStat>();
  let tmsLastImport: string | null = null;
  for (const r of (tmsOwn ?? []) as OwnStat[]) {
    ownByDate.set(r.match_date, r);
    if (!tmsLastImport || r.created_at > tmsLastImport) tmsLastImport = r.created_at;
  }
  const xgAgainstByDate = new Map<string, number>();
  const oppGoalsByDate = new Map<string, number>();
  const shotsAgainstByDate = new Map<string, number>();
  for (const r of (tmsOpp ?? []) as Array<{ match_date: string; xg: number | null; goals: number | null; shots: number | null }>) {
    if (r.xg != null) xgAgainstByDate.set(r.match_date, Number(r.xg));
    if (r.goals != null) oppGoalsByDate.set(r.match_date, Number(r.goals));
    if (r.shots != null) shotsAgainstByDate.set(r.match_date, Number(r.shots));
  }
  // A match's result: the hand-entered Fixtures score wins, else derived from the
  // Wyscout goals (own vs opponent). One resolver used everywhere for consistency.
  const resolveResult = (date: string): MatchResult | null => {
    const sched = resultByDate.get(date);
    if (sched) return sched.result;
    const gf = ownByDate.get(date)?.goals, ga = oppGoalsByDate.get(date);
    return gf == null || ga == null ? null : Number(gf) > ga ? "W" : Number(gf) < ga ? "L" : "D";
  };

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

  // Graded matches (have a result from Fixtures OR Wyscout goals) → win/loss + result correlation.
  const gradedRows: MatchMetricRow[] = perMatch
    .map((m) => ({ m, result: resolveResult(m.sessionDate) }))
    .filter((x): x is { m: (typeof perMatch)[number]; result: MatchResult } => x.result != null)
    .map(({ m, result }) => ({ sessionDate: m.sessionDate, result, values: m.values }));
  const winLoss = winLossMovement(gradedRows, metricKeys);

  const allResultCorr = metricKeys
    .map((k) => {
      const xs = gradedRows.map((r) => r.values[k] ?? null);
      const ys = gradedRows.map((r) => RESULT_SCORE[r.result]);
      const r = pearson(xs, ys);
      return r ? { key: k, r: r.r, n: r.n, strength: r.strength, direction: r.direction } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c != null)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  // Top 8 by |r|, but always keep the GPS locomotor read (never let a strong IMA
  // set push distance / high-speed running / sprint / top speed off the list).
  const resultKeep = new Set([...allResultCorr.slice(0, 8).map((c) => c.key), ...GPS_LOCOMOTOR_KEYS]);
  const resultCorrelations = allResultCorr.filter((c) => resultKeep.has(c.key));

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

  // ── Per-match TEAM stats (Wyscout Team → Stats export) × movement. ─────────────
  // team_match_stats (fetched above) carries all of goals, shots, passes,
  // possession, duels, recoveries per match. Correlate the tactical core with
  // movement and expose the full per-match line. No Wyscout Data API needed.
  const toNum = (v: number | null | undefined): number | null => (v == null ? null : Number(v));
  const ratioPct = (a: number | null | undefined, b: number | null | undefined): number | null =>
    a != null && b != null && Number(b) > 0 ? Math.round((Number(a) / Number(b)) * 1000) / 10 : null;
  // Losses/Recoveries carry a Low/Medium/High (by pitch zone) split in the raw
  // export as blank sub-columns the parser kept as "<parent> [2|3|4]" (2=Low,
  // 3=Medium, 4=High). Read them defensively so the pitch-zone breakdown surfaces.
  const rawSub = (raw: OwnStat["raw"], needle: string, suffix: "[2]" | "[3]" | "[4]"): number | null => {
    if (!raw) return null;
    for (const [k, v] of Object.entries(raw)) {
      const nk = k.toLowerCase();
      if (nk.includes(needle) && nk.replace(/\s+/g, "").endsWith(suffix)) return v == null || v === "" ? null : Number(v);
    }
    return null;
  };

  // Every team stat we can read per match, keyed. `corr` = surface a movement
  // correlation panel for it (the tactical core); the rest still show in the table.
  const STAT_DEFS: Array<{ key: string; corr: boolean; val: (o: OwnStat | undefined, d: string) => number | null }> = [
    { key: "xgFor", corr: true, val: (o) => toNum(o?.xg) },
    { key: "xgAgainst", corr: true, val: (_o, d) => xgAgainstByDate.get(d) ?? null },
    { key: "shots", corr: true, val: (o) => toNum(o?.shots) },
    { key: "possession", corr: true, val: (o) => toNum(o?.possession_pct) },
    { key: "passAccuracyPct", corr: true, val: (o) => ratioPct(o?.passes_accurate, o?.passes) },
    { key: "duelsWonPct", corr: true, val: (o) => ratioPct(o?.duels_won, o?.duels) },
    { key: "goals", corr: false, val: (o) => toNum(o?.goals) },
    { key: "shotsOnTargetPct", corr: false, val: (o) => ratioPct(o?.shots_on_target, o?.shots) },
    { key: "recoveries", corr: false, val: (o) => toNum(o?.recoveries) },
  ];

  // Correlate one per-match team-stat map against every movement metric (association only).
  const corrForStat = (byDate: Map<string, number>) =>
    metricKeys
      .map((k) => {
        const withStat = perMatch.filter((m) => byDate.has(m.sessionDate));
        const xs = withStat.map((m) => byDate.get(m.sessionDate)!);
        const ys = withStat.map((m) => m.values[k] ?? null);
        const r = pearson(xs, ys);
        return r ? { key: k, r: r.r, n: r.n, strength: r.strength, direction: r.direction } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b!.r) - Math.abs(a!.r))
      .slice(0, 3);
  const statMap = (def: (typeof STAT_DEFS)[number]) => {
    const m = new Map<string, number>();
    for (const pm of perMatch) {
      const v = def.val(ownByDate.get(pm.sessionDate), pm.sessionDate);
      if (v != null) m.set(pm.sessionDate, v);
    }
    return m;
  };
  const stats = STAT_DEFS.filter((d) => d.corr).map((def) => ({ key: def.key, corr: corrForStat(statMap(def)) }));

  const nMatchesJoined = perMatch.filter((m) => ownByDate.has(m.sessionDate)).length;
  // Full per-match table the coach asked for (all stats, not just xG), joined to
  // one headline movement metric + the result.
  const seriesMetricKeys = dimKeys.slice(0, 1);
  const perMatchSeries = perMatch
    .filter((m) => ownByDate.has(m.sessionDate))
    .map((m) => {
      const o = ownByDate.get(m.sessionDate)!;
      return {
        date: m.sessionDate,
        opponent: o.opponent_name ?? resultByDate.get(m.sessionDate)?.opponent ?? null,
        result: resolveResult(m.sessionDate),
        goals: toNum(o.goals),
        xgFor: toNum(o.xg),
        xgAgainst: xgAgainstByDate.get(m.sessionDate) ?? null,
        shots: toNum(o.shots),
        shotsOnTargetPct: ratioPct(o.shots_on_target, o.shots),
        possession: toNum(o.possession_pct),
        passAccuracyPct: ratioPct(o.passes_accurate, o.passes),
        duelsWonPct: ratioPct(o.duels_won, o.duels),
        recoveries: toNum(o.recoveries),
        // Pitch-zone breakdown (Low / Medium / High) from the raw export.
        lossLow: rawSub(o.raw, "loss", "[2]"), lossMed: rawSub(o.raw, "loss", "[3]"), lossHigh: rawSub(o.raw, "loss", "[4]"),
        recLow: rawSub(o.raw, "recover", "[2]"), recMed: rawSub(o.raw, "recover", "[3]"), recHigh: rawSub(o.raw, "recover", "[4]"),
        metrics: Object.fromEntries(seriesMetricKeys.map((k) => [k, m.values[k] ?? null])),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // ── Wins vs losses on the team stats, this season. ────────────────────────────
  // Independent of GPS coverage: every ingested match in the current season with a
  // known result feeds it. Reuses winLossMovement (means per W/L group + Cohen's d),
  // so the biggest win/loss separators surface first. Descriptive context only.
  const ownRows = Array.from(ownByDate.keys());
  const seasonYear = ownRows.length ? Math.max(...ownRows.map((d) => Number(d.slice(0, 4)))) : null;
  const WL_STAT_KEYS = ["xgAgainst", "shotsAgainst", "xgFor", "shots", "possession", "ppda", "duelsWonPct", "defDuelsWonPct"];
  const wlRows: MatchMetricRow[] = [];
  for (const [date, o] of ownByDate) {
    if (seasonYear == null || Number(date.slice(0, 4)) !== seasonYear) continue;
    const result = resolveResult(date);
    if (!result) continue;
    wlRows.push({
      sessionDate: date,
      result,
      values: {
        xgFor: toNum(o.xg),
        xgAgainst: xgAgainstByDate.get(date) ?? null,
        shots: toNum(o.shots),
        shotsAgainst: shotsAgainstByDate.get(date) ?? null,
        possession: toNum(o.possession_pct),
        ppda: toNum(o.ppda),
        duelsWonPct: ratioPct(o.duels_won, o.duels),
        defDuelsWonPct: toNum(o.def_duels_won_pct),
      },
    });
  }
  const wlDates = wlRows.map((r) => r.sessionDate).sort();
  const winLossStats = {
    available: wlRows.length > 0,
    season: seasonYear,
    matches: wlRows.length,
    dateFrom: wlDates[0] ?? null,
    dateTo: wlDates[wlDates.length - 1] ?? null,
    ...winLossMovement(wlRows, WL_STAT_KEYS),
    source: "Wyscout team stats (per match)",
    lastImport: tmsLastImport,
  };

  return NextResponse.json({
    variant: mm.variant,
    dimKeys: metricKeys,
    counts: { matchesWithLoad: perMatch.length, gradedMatches: gradedRows.length, playersWithXg: playersWithXg.length },
    winLoss,
    winLossStats,
    resultCorrelations,
    seasonXg: { available: seasonXgCorrelations.length > 0, correlations: seasonXgCorrelations },
    // Per-match team stats — real when a Wyscout Team-Stats export has been
    // ingested (team_match_stats), honest empty state otherwise. Association only.
    perMatchStats: {
      available: nMatchesJoined > 0,
      reason: nMatchesJoined > 0
        ? undefined
        : "No per-match team stats ingested yet — export Wyscout Team → Stats (General, Show opponents) to Excel and run the ingest.",
      matches: nMatchesJoined,
      stats,
      series: perMatchSeries,
      seriesMetricKeys,
      source: "Wyscout team stats (per match)",
      lastImport: tmsLastImport,
    },
  });
}
