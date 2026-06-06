/**
 * src/lib/micropulse/loadPlan
 *
 * Pre-session load PLAN (forward-looking, deterministic). Answers "what should
 * today's load be?" by anchoring the microcycle target to the squad's own match
 * demand:
 *
 *   target[kpi] = (matchPct / 100) × matchRef[kpi] × emphasis(sessionType, kpi)
 *
 *   - matchPct + sessionType come from `planSessionLoad` (the MD-day position in
 *     the microcycle: MD-4 mechanical, MD-3 locomotive peak, MD-2 primer, …).
 *   - matchRef[kpi] = the squad's average per-player value on its match-level
 *     days (the highest-load days) over the lookback window — a transparent,
 *     data-driven match reference.
 *   - emphasis re-weights KPIs by session type so a "mechanical" day targets
 *     more accel/decel and less high-speed running, and a "locomotive" day the
 *     reverse (Stevens 2017 — match demands differ by KPI by microcycle day).
 *
 * Recent load (acute:chronic, Gabbett 2016) and squad readiness are surfaced as
 * context/modifiers, not baked into the base number. Rules decide; the numbers
 * carry their own provenance.
 */

import { planSessionLoad, type PlannedSessionLoad, type SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";

export type LoadKpi =
  | "totalDistance" | "playerLoad" | "hsr" | "sprint" | "accel" | "decel" | "ima";

export const LOAD_KPIS: LoadKpi[] = ["totalDistance", "playerLoad", "hsr", "sprint", "accel", "decel", "ima"];

export const KPI_LABEL: Record<LoadKpi, string> = {
  totalDistance: "Total distance (m)",
  playerLoad: "Player Load",
  hsr: "High-speed distance (m)",
  sprint: "Sprint distance (m)",
  accel: "Accelerations (B2-3)",
  decel: "Decelerations (B2-3)",
  ima: "IMA high-intensity (m)",
};

export type LoadRow = {
  player_id: string;
  date: string;
  total_distance: number | null;
  total_player_load: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
  ima_fr_band58_total_distance: number | null;
};

const VAL: Record<LoadKpi, (r: LoadRow) => number> = {
  totalDistance: (r) => num(r.total_distance),
  playerLoad: (r) => num(r.total_player_load),
  hsr: (r) => num(r.velocity_band5_total_distance),
  sprint: (r) => num(r.velocity_band6_total_distance),
  accel: (r) => num(r.accel_b2_3_tot_effs_gen2),
  decel: (r) => num(r.decel_b2_3_tot_effs_gen2),
  ima: (r) => num(r.ima_fr_band58_total_distance),
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** KPI emphasis by session type — re-weights the per-KPI target. */
const EMPHASIS: Record<SessionLoadType, Partial<Record<LoadKpi, number>>> = {
  mechanical: { accel: 1.15, decel: 1.15, hsr: 0.85, sprint: 0.8 },
  locomotive: { hsr: 1.15, sprint: 1.2, ima: 1.1, accel: 0.9, decel: 0.9 },
  mixed: {},
};

export type KpiTarget = {
  kpi: LoadKpi;
  target: number | null;       // per-player target
  matchRef: number | null;     // per-player match average (anchor)
  pctOfMatch: number | null;   // target as % of match
};

export type PlayerPlan = {
  player_id: string;
  name: string;
  /** Per-player target for the headline KPIs (distance, player load, IMA). */
  totalDistance: number | null;
  playerLoad: number | null;
  ima: number | null;
  /** Acute:chronic for this player (player load). */
  acwr: number | null;
  /** "reduce" when already loaded (ACWR ≥ 1.3) — trim their individual target. */
  flag: "ok" | "reduce" | "build";
  flagReason: string | null;
};

export type LoadPlan = {
  sessionDate: string;
  planned: PlannedSessionLoad;       // type, band, sRPE, matchPct, rationale
  applicable: boolean;
  /** Team-level per-player KPI targets. */
  targets: KpiTarget[];
  /** Number of match-level days used to build the reference. */
  matchDaysUsed: number;
  /** Team acute:chronic on player load (Gabbett sweet-spot 0.8–1.3). */
  teamAcwr: number | null;
  acutePL: number | null;
  chronicPL: number | null;
  /** Suggested ± adjustment from squad readiness (e.g. −15% on a heavy-red day). */
  readinessAdjustPct: number;
  readinessNote: string | null;
  perPlayer: PlayerPlan[];
};

export type BuildLoadPlanInput = {
  sessionDate: string;            // ISO
  mdDay: string | number | null;
  dayType: string | null;
  focus: string | null;
  daysSincePrev?: number | null;
  daysToNext?: number | null;
  rows: LoadRow[];                // per-player-per-day over the lookback window
  nameById: Map<string, string>;
  /** Today's squad readiness zone counts (optional check-in modifier). */
  readiness?: { green: number; yellow: number; red: number } | null;
};

/** Mean of finite, positive numbers (null when empty). */
function mean(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function buildLoadPlan(input: BuildLoadPlanInput): LoadPlan {
  const planned = planSessionLoad({
    mdDay: input.mdDay,
    dayType: input.dayType,
    focus: input.focus,
    daysSincePrev: input.daysSincePrev,
    daysToNext: input.daysToNext,
  });

  // Per-date, per-player rows grouped.
  const byDate = new Map<string, LoadRow[]>();
  for (const r of input.rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  // Per-date mean-per-player for each KPI.
  const dateMeans = new Map<string, Partial<Record<LoadKpi, number>>>();
  for (const [date, rs] of byDate) {
    const m: Partial<Record<LoadKpi, number>> = {};
    for (const k of LOAD_KPIS) {
      const mv = mean(rs.map((r) => VAL[k](r)));
      if (mv != null) m[k] = mv;
    }
    dateMeans.set(date, m);
  }

  // Identify "match-level" days = the highest mean-per-player Player Load days.
  const plDays = Array.from(dateMeans.entries())
    .map(([d, m]) => ({ d, pl: m.playerLoad ?? 0 }))
    .filter((x) => x.pl > 0)
    .sort((a, b) => b.pl - a.pl);
  const peakPL = plDays[0]?.pl ?? 0;
  const matchDays = plDays.filter((x) => x.pl >= 0.8 * peakPL).slice(0, 8).map((x) => x.d);

  // Per-KPI match reference = mean of the per-player day-means over match days.
  const matchRef: Partial<Record<LoadKpi, number | null>> = {};
  for (const k of LOAD_KPIS) {
    matchRef[k] = mean(matchDays.map((d) => dateMeans.get(d)?.[k] ?? 0));
  }

  const matchPct = planned.applicable ? planned.matchPct : 0;
  const emph = EMPHASIS[planned.loadType] ?? {};
  const targets: KpiTarget[] = LOAD_KPIS.map((k) => {
    const ref = matchRef[k] ?? null;
    const e = emph[k] ?? 1;
    const target = ref != null && planned.applicable ? Math.round(ref * (matchPct / 100) * e) : null;
    return {
      kpi: k,
      target,
      matchRef: ref != null ? Math.round(ref) : null,
      pctOfMatch: ref != null && ref > 0 && target != null ? Math.round((target / ref) * 100) : null,
    };
  });

  // Team acute:chronic on Player Load (mean-per-player daily series).
  const teamPlByDate = new Map<string, number>();
  for (const [d, m] of dateMeans) if (m.playerLoad != null) teamPlByDate.set(d, m.playerLoad);
  const acuteFrom = addDays(input.sessionDate, -6);
  const chronicFrom = addDays(input.sessionDate, -27);
  const acutePL = mean(Array.from(teamPlByDate.entries()).filter(([d]) => d >= acuteFrom && d <= input.sessionDate).map(([, v]) => v));
  const chronicPL = mean(Array.from(teamPlByDate.entries()).filter(([d]) => d >= chronicFrom && d <= input.sessionDate).map(([, v]) => v));
  const teamAcwr = acutePL != null && chronicPL != null && chronicPL > 0 ? acutePL / chronicPL : null;

  // Readiness modifier (optional check-in input). Heavy yellow/red → trim.
  let readinessAdjustPct = 0;
  let readinessNote: string | null = null;
  if (input.readiness) {
    const total = input.readiness.green + input.readiness.yellow + input.readiness.red;
    if (total > 0) {
      const redShare = input.readiness.red / total;
      const amberShare = input.readiness.yellow / total;
      if (redShare >= 0.25) { readinessAdjustPct = -20; readinessNote = "Squad readiness is heavy-red today — trim the target ~20%."; }
      else if (redShare >= 0.1 || amberShare >= 0.4) { readinessAdjustPct = -10; readinessNote = "Several players below par — consider trimming ~10%."; }
      else { readinessNote = "Squad readiness is broadly green — full target is appropriate."; }
    }
  }

  // Per-player targets + flags (their own match average × matchPct).
  const byPlayer = new Map<string, LoadRow[]>();
  for (const r of input.rows) {
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }
  const perPlayer: PlayerPlan[] = Array.from(byPlayer.entries()).map(([pid, rs]) => {
    const onMatch = rs.filter((r) => matchDays.includes(r.date));
    const pTD = planned.applicable ? scale(mean(onMatch.map((r) => VAL.totalDistance(r))), matchPct, emph.totalDistance) : null;
    const pPL = planned.applicable ? scale(mean(onMatch.map((r) => VAL.playerLoad(r))), matchPct, emph.playerLoad) : null;
    const pIMA = planned.applicable ? scale(mean(onMatch.map((r) => VAL.ima(r))), matchPct, emph.ima) : null;
    // Player ACWR on player load.
    const acute = mean(rs.filter((r) => r.date >= acuteFrom).map((r) => VAL.playerLoad(r)));
    const chronic = mean(rs.filter((r) => r.date >= chronicFrom).map((r) => VAL.playerLoad(r)));
    const acwr = acute != null && chronic != null && chronic > 0 ? acute / chronic : null;
    let flag: PlayerPlan["flag"] = "ok";
    let flagReason: string | null = null;
    if (acwr != null && acwr >= 1.5) { flag = "reduce"; flagReason = `ACWR ${acwr.toFixed(2)} — already spiking, hold them back`; }
    else if (acwr != null && acwr >= 1.3) { flag = "reduce"; flagReason = `ACWR ${acwr.toFixed(2)} — above the sweet spot`; }
    else if (acwr != null && acwr < 0.8) { flag = "build"; flagReason = `ACWR ${acwr.toFixed(2)} — undertrained, room to build`; }
    return {
      player_id: pid,
      name: input.nameById.get(pid) ?? pid.slice(0, 6),
      totalDistance: pTD,
      playerLoad: pPL,
      ima: pIMA,
      acwr: acwr != null ? Math.round(acwr * 100) / 100 : null,
      flag,
      flagReason,
    };
  }).sort((a, b) => (b.playerLoad ?? 0) - (a.playerLoad ?? 0));

  return {
    sessionDate: input.sessionDate,
    planned,
    applicable: planned.applicable,
    targets,
    matchDaysUsed: matchDays.length,
    teamAcwr: teamAcwr != null ? Math.round(teamAcwr * 100) / 100 : null,
    acutePL: acutePL != null ? Math.round(acutePL) : null,
    chronicPL: chronicPL != null ? Math.round(chronicPL) : null,
    readinessAdjustPct,
    readinessNote,
    perPlayer,
  };
}

function scale(ref: number | null, matchPct: number, e?: number): number | null {
  if (ref == null) return null;
  return Math.round(ref * (matchPct / 100) * (e ?? 1));
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
