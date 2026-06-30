/**
 * src/lib/micropulse/progressiveOverload
 *
 * Progressive-overload planner for the PREPARATION (pre-season) phase. Projects
 * a safe week-by-week ramp for each load KPI from the squad's current baseline
 * toward match demand — the multi-week macro layer above the single-day load
 * plan.
 *
 * Three principles, baked in (so it never becomes "just add 10% to everything"):
 *
 *  1. KPIs progress at DIFFERENT rates. Volume (distance, Player Load) ramps
 *     faster; high-speed running and especially sprint ramp slower with tighter
 *     ceilings (hamstring exposure — Malone 2017, Gabbett 2016); mechanical
 *     (accel/decel) sits in between.
 *  2. ACWR guardrail. Each week's value is capped so the projected acute:chronic
 *     ratio stays <= 1.3 (Gabbett sweet spot), never spiking. The rolling 4-week
 *     mean is simulated forward so the cap tracks the rising chronic base.
 *  3. Ceiling = match demand. A single session is never ramped past the squad's
 *     own match reference for that KPI — we build TO match load, not beyond.
 *
 * Deterministic. Every weekly target carries which rule bound it (rate, ACWR
 * cap, or match ceiling) so the plan explains itself.
 */

import { LOAD_KPIS, KPI_LABEL, type LoadKpi, type LoadRow } from "@/lib/micropulse/loadPlan";

export { LOAD_KPIS, KPI_LABEL };
export type { LoadKpi };

/** Weekly progression rate per KPI during a build block (fraction). */
const WEEKLY_RATE: Record<LoadKpi, number> = {
  totalDistance: 0.08,
  playerLoad: 0.08,
  accel: 0.07,
  decel: 0.07,
  efforts: 0.07,
  ima: 0.06,
  imaAccel: 0.07,
  imaDecel: 0.07,
  imaCod: 0.06,
  jumps: 0.06,
  hsr: 0.05,
  sprint: 0.04,
};

const ACWR_CEILING = 1.3; // Gabbett sweet-spot upper bound.

const VAL: Record<LoadKpi, (r: LoadRow) => number> = {
  totalDistance: (r) => num(r.total_distance),
  playerLoad: (r) => num(r.total_player_load),
  // HSR/Sprint fall back to the Lite columns (same concept, lower-tier export).
  hsr: (r) => num(r.velocity_band5_total_distance) || num(r.high_speed_distance),
  sprint: (r) => num(r.velocity_band6_total_distance) || num(r.sprint_distance),
  accel: (r) => num(r.accel_b2_3_tot_effs_gen2),
  decel: (r) => num(r.decel_b2_3_tot_effs_gen2),
  efforts: (r) => num(r.accel_decel_efforts),
  ima: (r) => num(r.ima_fr_band58_total_distance),
  imaAccel: (r) => num(r.ima_accel),
  imaDecel: (r) => num(r.ima_decel),
  imaCod: (r) => num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) + num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low),
  jumps: (r) => num(r.jumps),
};
function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function mean(xs: number[]): number | null { const v = xs.filter((x) => Number.isFinite(x) && x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
function addDays(iso: string, n: number): string { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export type CapReason = "rate" | "acwr" | "ceiling";

export type WeekTarget = {
  week: number;            // 1..N
  target: number | null;   // per-session per-player target for this KPI
  pctStep: number | null;  // % increase vs previous week
  pctOfBaseline: number | null;
  pctOfMatch: number | null;
  projAcwr: number | null;
  cap: CapReason | null;   // which rule bound this week's value
};

export type KpiRamp = {
  kpi: LoadKpi;
  baseline: number | null;   // current recent training-day mean (start point)
  matchRef: number | null;   // match-demand ceiling
  ratePct: number;           // the weekly rate used
  weeks: WeekTarget[];
};

export type PlayerRamp = {
  player_id: string;
  name: string;
  baselinePL: number | null;
  acwr: number | null;
  /** Can this player ramp now, or hold (already loaded)? */
  status: "build" | "progress" | "hold";
  statusReason: string;
  week1PL: number | null;
  finalPL: number | null;
  week1Dist: number | null;
  finalDist: number | null;
};

export type ProgressiveOverloadPlan = {
  weeks: number;
  hasData: boolean;
  teamAcwr: number | null;
  startWeekOf: string;       // ISO date of the first projected week
  ramps: KpiRamp[];
  perPlayer: PlayerRamp[];
  coverage: { trainingDays: number; matchDays: number; playersWithHistory: number; totalPlayers: number };
  note: string;
};

export type BuildProgressiveOverloadInput = {
  sessionDate: string;     // anchor "today"
  weeks?: number;          // projection length (default 5)
  rows: LoadRow[];         // per-player-per-day GPS over the lookback window
  nameById: Map<string, string>;
};

/** Simulate one KPI's weekly ramp with rate, ACWR cap and match ceiling. */
function simulateRamp(kpi: LoadKpi, baseline: number | null, matchRef: number | null, weeks: number): KpiRamp {
  const rate = WEEKLY_RATE[kpi];
  const out: WeekTarget[] = [];
  if (baseline == null || baseline <= 0) {
    return { kpi, baseline, matchRef, ratePct: Math.round(rate * 100), weeks: [] };
  }
  const ceiling = matchRef != null && matchRef > 0 ? matchRef : baseline * 1.6;
  // Rolling 4-week chronic window seeded at the baseline.
  const chronic: number[] = [baseline, baseline, baseline, baseline];
  let prev = baseline;
  for (let w = 1; w <= weeks; w++) {
    const chronicMean = chronic.reduce((s, x) => s + x, 0) / chronic.length;
    const desired = prev * (1 + rate);
    const acwrCap = ACWR_CEILING * chronicMean;
    let target = desired;
    let cap: CapReason = "rate";
    if (target > acwrCap) { target = acwrCap; cap = "acwr"; }
    if (target > ceiling) { target = ceiling; cap = "ceiling"; }
    target = Math.round(target);
    const projAcwr = chronicMean > 0 ? Math.round((target / chronicMean) * 100) / 100 : null;
    out.push({
      week: w,
      target,
      pctStep: prev > 0 ? Math.round((target / prev - 1) * 100) : null,
      pctOfBaseline: Math.round((target / baseline) * 100),
      pctOfMatch: matchRef != null && matchRef > 0 ? Math.round((target / matchRef) * 100) : null,
      projAcwr,
      cap,
    });
    chronic.push(target); chronic.shift();
    prev = target;
  }
  return { kpi, baseline: Math.round(baseline), matchRef: matchRef != null ? Math.round(matchRef) : null, ratePct: Math.round(rate * 100), weeks: out };
}

export function buildProgressiveOverload(input: BuildProgressiveOverloadInput): ProgressiveOverloadPlan {
  const weeks = Math.max(1, Math.min(12, input.weeks ?? 5));
  const startWeekOf = addDays(input.sessionDate, 1);

  // Per-date team means.
  const byDate = new Map<string, LoadRow[]>();
  for (const r of input.rows) { const l = byDate.get(r.date) ?? []; l.push(r); byDate.set(r.date, l); }
  const dateMeans = new Map<string, Partial<Record<LoadKpi, number>>>();
  for (const [d, rs] of byDate) {
    const m: Partial<Record<LoadKpi, number>> = {};
    for (const k of LOAD_KPIS) { const mv = mean(rs.map((r) => VAL[k](r))); if (mv != null) m[k] = mv; }
    dateMeans.set(d, m);
  }

  // Match-level days = highest mean Player Load days → per-KPI match reference.
  const plDays = Array.from(dateMeans.entries()).map(([d, m]) => ({ d, pl: m.playerLoad ?? 0 })).filter((x) => x.pl > 0).sort((a, b) => b.pl - a.pl);
  const peakPL = plDays[0]?.pl ?? 0;
  const matchDays = plDays.filter((x) => x.pl >= 0.8 * peakPL).slice(0, 8).map((x) => x.d);
  const matchRef: Partial<Record<LoadKpi, number | null>> = {};
  for (const k of LOAD_KPIS) matchRef[k] = mean(matchDays.map((d) => dateMeans.get(d)?.[k] ?? 0));

  // Current baseline per KPI = mean over the last 28d training (non-match) days.
  const chronicFrom = addDays(input.sessionDate, -27);
  const trainingDates = Array.from(dateMeans.keys()).filter((d) => d >= chronicFrom && d <= input.sessionDate && !matchDays.includes(d));
  const baseline: Partial<Record<LoadKpi, number | null>> = {};
  for (const k of LOAD_KPIS) baseline[k] = mean(trainingDates.map((d) => dateMeans.get(d)?.[k] ?? 0));

  // Team acute:chronic on Player Load.
  const teamPlByDate = new Map<string, number>();
  for (const [d, m] of dateMeans) if (m.playerLoad != null) teamPlByDate.set(d, m.playerLoad);
  const acuteFrom = addDays(input.sessionDate, -6);
  const acutePL = mean(Array.from(teamPlByDate.entries()).filter(([d]) => d >= acuteFrom && d <= input.sessionDate).map(([, v]) => v));
  const chronicPL = mean(Array.from(teamPlByDate.entries()).filter(([d]) => d >= chronicFrom && d <= input.sessionDate).map(([, v]) => v));
  const teamAcwr = acutePL != null && chronicPL != null && chronicPL > 0 ? Math.round((acutePL / chronicPL) * 100) / 100 : null;

  // Existing KPIs ramp as before (empty ramps drop out downstream). The genuine
  // IMA EVENT metrics (Pro only) are gated on a meaningful day share (>= 25%) so
  // a handful of stray rows on a Lite club (~13% of days) don't produce a dead
  // IMA ramp. Pro carries them on ~55-100% of days; Lite never does.
  const allDates = Array.from(dateMeans.keys());
  const dayShare = (k: LoadKpi) => (allDates.length ? allDates.filter((d) => (dateMeans.get(d)?.[k] ?? 0) > 0).length / allDates.length : 0);
  const STRICT_IMA = new Set<LoadKpi>(["imaAccel", "imaDecel", "imaCod", "jumps"]);
  const availableKpis = LOAD_KPIS.filter((k) => !STRICT_IMA.has(k) || dayShare(k) >= 0.25);
  const ramps = availableKpis.map((k) => simulateRamp(k, baseline[k] ?? null, matchRef[k] ?? null, weeks));
  const hasData = ramps.some((r) => r.weeks.length > 0);

  // Per-player ramp summary (their own baseline + ACWR → can they progress?).
  const byPlayer = new Map<string, LoadRow[]>();
  for (const r of input.rows) { const l = byPlayer.get(r.player_id) ?? []; l.push(r); byPlayer.set(r.player_id, l); }
  const perPlayer: PlayerRamp[] = Array.from(byPlayer.entries()).map(([pid, rs]) => {
    const trainingRs = rs.filter((r) => r.date >= chronicFrom && !matchDays.includes(r.date));
    const basePL = mean(trainingRs.map((r) => VAL.playerLoad(r)));
    const baseDist = mean(trainingRs.map((r) => VAL.totalDistance(r)));
    const acute = mean(rs.filter((r) => r.date >= acuteFrom).map((r) => VAL.playerLoad(r)));
    const chronic = mean(rs.filter((r) => r.date >= chronicFrom).map((r) => VAL.playerLoad(r)));
    const acwr = acute != null && chronic != null && chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null;
    let status: PlayerRamp["status"] = "progress";
    let statusReason = "On track — ramp with the squad.";
    if (acwr != null && acwr >= 1.3) { status = "hold"; statusReason = `Already loaded (ACWR ${acwr.toFixed(2)}) — hold, let chronic catch up before adding.`; }
    else if (acwr != null && acwr < 0.8) { status = "build"; statusReason = `Undertrained (ACWR ${acwr.toFixed(2)}) — room to build a little faster.`; }
    const rampOne = (b: number | null) => {
      if (b == null) return { w1: null as number | null, fin: null as number | null };
      const r = WEEKLY_RATE.playerLoad;
      const w1 = Math.round(b * (1 + r));
      const fin = Math.round(b * Math.pow(1 + r, weeks));
      return { w1, fin };
    };
    const pl = rampOne(basePL);
    const dist = rampOne(baseDist);
    return {
      player_id: pid,
      name: input.nameById.get(pid) ?? pid.slice(0, 6),
      baselinePL: basePL != null ? Math.round(basePL) : null,
      acwr,
      status, statusReason,
      week1PL: status === "hold" ? (basePL != null ? Math.round(basePL) : null) : pl.w1,
      finalPL: status === "hold" ? (basePL != null ? Math.round(basePL) : null) : pl.fin,
      week1Dist: status === "hold" ? (baseDist != null ? Math.round(baseDist) : null) : dist.w1,
      finalDist: status === "hold" ? (baseDist != null ? Math.round(baseDist) : null) : dist.fin,
    };
  }).sort((a, b) => (b.baselinePL ?? 0) - (a.baselinePL ?? 0));

  const note = hasData
    ? `Volume (distance, Player Load) ramps fastest; high-speed and sprint ramp slowest with the tightest ceilings. Every week is capped so the projected acute:chronic ratio stays at or below ${ACWR_CEILING}, and no session is pushed past the squad's match reference.`
    : "Not enough GPS history to project a build. Capture more training days first.";

  return {
    weeks,
    hasData,
    teamAcwr,
    startWeekOf,
    ramps,
    perPlayer,
    coverage: { trainingDays: trainingDates.length, matchDays: matchDays.length, playersWithHistory: byPlayer.size, totalPlayers: input.nameById.size },
    note,
  };
}
