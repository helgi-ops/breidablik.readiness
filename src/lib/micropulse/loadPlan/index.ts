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
  | "totalDistance" | "playerLoad" | "hsr" | "sprint" | "accel" | "decel" | "ima"
  // Core/Lite have only the combined Gen2 effort count (no accel/decel split, no
  // IMA) — `efforts` carries the braking dimension for them. availableKpis hides
  // whichever the club lacks, so each tier shows only the metrics it has.
  | "efforts"
  // Genuine IMA event metrics (Pro / Vector Pro S7 only) — the explosive movement
  // load Pro clubs uniquely capture. Hidden on Lite by availableKpis.
  | "imaAccel" | "imaDecel" | "imaCod" | "jumps";

export const LOAD_KPIS: LoadKpi[] = ["totalDistance", "playerLoad", "hsr", "sprint", "accel", "decel", "efforts", "ima", "imaAccel", "imaDecel", "imaCod", "jumps"];

export const KPI_LABEL: Record<LoadKpi, string> = {
  totalDistance: "Total distance (m)",
  playerLoad: "Player Load",
  hsr: "High-speed distance (m)",
  sprint: "Sprint distance (m)",
  accel: "Accelerations (B2-3)",
  decel: "Decelerations (B2-3)",
  efforts: "Hard efforts (accel+decel)",
  ima: "IMA high-intensity (m)",
  imaAccel: "IMA accelerations",
  imaDecel: "IMA decelerations",
  imaCod: "Change of direction",
  jumps: "Jumps",
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
  // Genuine IMA event columns (Pro only).
  ima_accel: number | null;
  ima_decel: number | null;
  jumps: number | null;
  ima_cod_left_high: number | null;
  ima_cod_left_medium: number | null;
  ima_cod_left_low: number | null;
  ima_cod_right_high: number | null;
  ima_cod_right_medium: number | null;
  ima_cod_right_low: number | null;
  // Lite/Core fallbacks (these are the columns lower-tier exports actually carry).
  high_speed_distance: number | null;
  sprint_distance: number | null;
  accel_decel_efforts: number | null;
};

const VAL: Record<LoadKpi, (r: LoadRow) => number> = {
  totalDistance: (r) => num(r.total_distance),
  playerLoad: (r) => num(r.total_player_load),
  // HSR/Sprint: prefer the Full velocity-band distance, fall back to the Lite
  // high_speed_distance / sprint_distance (same concept, lower-tier column).
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** KPI emphasis by session type — re-weights the per-KPI target. */
const EMPHASIS: Record<SessionLoadType, Partial<Record<LoadKpi, number>>> = {
  mechanical: { accel: 1.15, decel: 1.15, efforts: 1.15, hsr: 0.85, sprint: 0.8 },
  locomotive: { hsr: 1.15, sprint: 1.2, ima: 1.1, accel: 0.9, decel: 0.9, efforts: 0.9 },
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
  /** Per-player target for every KPI. */
  totalDistance: number | null;
  playerLoad: number | null;
  hsr: number | null;       // velocity band 5 (high-speed running)
  sprint: number | null;    // velocity band 6 (sprint)
  accel: number | null;     // accel band 2-3 efforts
  decel: number | null;     // decel band 2-3 efforts
  efforts: number | null;   // combined accel+decel efforts (Lite/Core)
  ima: number | null;       // IMA high-intensity / change-of-direction distance
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
  /** "microcycle" = MD-anchored; "recent_baseline" = last-4-week fallback (no
   *  Week setup); "unavailable" = match/off day (no training target). */
  mode: "microcycle" | "recent_baseline" | "unavailable";
  hasTargets: boolean;
  baselineNote: string | null;
  /** Team-level per-player KPI targets. */
  targets: KpiTarget[];
  /** KPIs the club has data for (capability-aware) — surfaces iterate this. */
  availableKpis: LoadKpi[];
  /** Number of match-level days used to build the reference. */
  matchDaysUsed: number;
  /** Team acute:chronic on player load (Gabbett sweet-spot 0.8–1.3). */
  teamAcwr: number | null;
  acutePL: number | null;
  chronicPL: number | null;
  /** Suggested ± adjustment from squad readiness (e.g. −15% on a heavy-red day). */
  readinessAdjustPct: number;
  readinessNote: string | null;
  /** Target internal load (session-RPE). Microcycle prescribes it; baseline
   *  estimates it from the squad's recent RPE submissions. */
  targetRpe: number | null;
  targetDurationMin: number | null;
  targetSrpe: number | null;
  srpeSource: "microcycle" | "recent" | "none";
  /** The squad's last few training sessions leading into today (oldest→newest),
   *  so the coach sees the trajectory the target sits on top of. */
  recentSessions: Array<{ date: string; totalDistance: number | null; playerLoad: number | null; hsr: number | null; isPeak: boolean }>;
  perPlayer: PlayerPlan[];
  /** Raw recent training-day baseline per KPI (pre-ACWR, the "usual" reference). */
  recentAvg: Partial<Record<LoadKpi, number | null>>;
  /** Targets after the readiness modifier is applied (what to actually prescribe). */
  adjustedTargets: KpiTarget[];
  /** How much signal the verdict rests on — drives the confidence statement. */
  coverage: {
    trainingDays: number;
    matchDays: number;
    distinctDates: number;
    playersWithHistory: number;
    totalPlayers: number;
    windowDays: number;
  };
  /** What the squad's recent work has leaned toward (force vs running). */
  recentLean: {
    mechIdx: number | null;
    locoIdx: number | null;
    lean: "mechanical" | "locomotive" | "balanced" | null;
    note: string | null;
  };
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
  /** Squad's recent RPE submissions (last ~4 weeks) — used to estimate a
   *  target session-RPE when there is no microcycle (MD) prescription. */
  recentRpe?: { avgRpe: number | null; avgDuration: number | null; n: number } | null;
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

  // Team acute:chronic on Player Load (mean-per-player daily series) — computed
  // first so it can modulate the recent-baseline targets.
  const teamPlByDate = new Map<string, number>();
  for (const [d, m] of dateMeans) if (m.playerLoad != null) teamPlByDate.set(d, m.playerLoad);
  const acuteFrom = addDays(input.sessionDate, -6);
  const chronicFrom = addDays(input.sessionDate, -27);
  const acutePL = mean(Array.from(teamPlByDate.entries()).filter(([d]) => d >= acuteFrom && d <= input.sessionDate).map(([, v]) => v));
  const chronicPL = mean(Array.from(teamPlByDate.entries()).filter(([d]) => d >= chronicFrom && d <= input.sessionDate).map(([, v]) => v));
  const teamAcwr = acutePL != null && chronicPL != null && chronicPL > 0 ? acutePL / chronicPL : null;

  // Recent training-day baseline per KPI (last 28d, EXCLUDING match days) — the
  // "maintain" reference used when there is no microcycle (MD) context.
  const trainingDates = Array.from(dateMeans.keys()).filter((d) => d >= chronicFrom && d <= input.sessionDate && !matchDays.includes(d));
  const trainingAvg: Partial<Record<LoadKpi, number | null>> = {};
  for (const k of LOAD_KPIS) trainingAvg[k] = mean(trainingDates.map((d) => dateMeans.get(d)?.[k] ?? 0));

  // Capability-aware: which KPIs the club actually has data for (any non-zero,
  // match or training). Lite/Core get {distance, PL, hsr, sprint, efforts}; Full
  // get {…, accel, decel, ima}. Surfaces filter by this so neither tier sees a
  // column of zeros for metrics its Catapult plan doesn't expose.
  // Existing KPIs keep their original "any non-zero (match or training)" rule.
  // The genuine IMA EVENT metrics (Pro only) additionally require a MEANINGFUL
  // day share (>= 25%) so a handful of stray rows on a Lite club (e.g. one player
  // who once used a Pro pod, ~13% of days) can't surface a dead IMA metric. The
  // event counts separate cleanly (Pro ~55-100% of days vs Lite ~13%); the lumped
  // IMA-band metric is sparse even on Pro, so it is NOT subject to the strict gate.
  const allDates = Array.from(dateMeans.keys());
  const dayShare = (k: LoadKpi) => (allDates.length ? allDates.filter((d) => (dateMeans.get(d)?.[k] ?? 0) > 0).length / allDates.length : 0);
  const STRICT_IMA = new Set<LoadKpi>(["imaAccel", "imaDecel", "imaCod", "jumps"]);
  const availableKpis: LoadKpi[] = LOAD_KPIS.filter((k) =>
    STRICT_IMA.has(k) ? dayShare(k) >= 0.25 : ((matchRef[k] ?? 0) > 0 || (trainingAvg[k] ?? 0) > 0),
  );

  // Targeting mode: microcycle when an MD context exists; otherwise fall back to
  // a recent-load baseline so the report is useful without Week setup. Match/off
  // days carry no training target.
  const mode: "microcycle" | "recent_baseline" | "unavailable" =
    planned.applicable ? "microcycle" : planned.reason === "no_md" ? "recent_baseline" : "unavailable";
  const acwrFactor = teamAcwr == null ? 1 : teamAcwr > 1.3 ? 0.85 : teamAcwr < 0.8 ? 1.1 : 1.0;

  const matchPct = planned.applicable ? planned.matchPct : 0;
  const emph = EMPHASIS[planned.loadType] ?? {};
  const targets: KpiTarget[] = LOAD_KPIS.map((k) => {
    const ref = matchRef[k] ?? null;
    let target: number | null = null;
    if (mode === "microcycle") {
      const e = emph[k] ?? 1;
      target = ref != null ? Math.round(ref * (matchPct / 100) * e) : null;
    } else if (mode === "recent_baseline") {
      const base = trainingAvg[k] ?? null;
      target = base != null ? Math.round(base * acwrFactor) : null;
    }
    return {
      kpi: k,
      target,
      matchRef: ref != null ? Math.round(ref) : null,
      pctOfMatch: ref != null && ref > 0 && target != null ? Math.round((target / ref) * 100) : null,
    };
  });
  const baselineNote = mode === "recent_baseline"
    ? `No match-week (MD) context set — targets use the last-4-week training baseline${teamAcwr != null ? (acwrFactor === 1 ? ", held at maintenance" : acwrFactor < 1 ? ", trimmed (acute:chronic is high)" : ", nudged up (room to build)") : ""}. Set up Week setup for microcycle-specific (mechanical / locomotive) targeting.`
    : null;

  // Target internal load (session-RPE). Microcycle prescribes it from the MD
  // day; otherwise estimate it from the squad's recent RPE submissions so the
  // pre-session report still states an expected RPE (and the post-session report
  // can later check planned vs actual internal load).
  let targetRpe: number | null = null;
  let targetDurationMin: number | null = null;
  let targetSrpe: number | null = null;
  let srpeSource: "microcycle" | "recent" | "none" = "none";
  if (planned.applicable && planned.sessionLoad > 0) {
    targetRpe = planned.rpe;
    targetDurationMin = planned.durationMin;
    targetSrpe = planned.sessionLoad;
    srpeSource = "microcycle";
  } else if (input.recentRpe && input.recentRpe.avgRpe != null && input.recentRpe.n > 0) {
    const dur = input.recentRpe.avgDuration ?? 70;
    targetRpe = Math.round(input.recentRpe.avgRpe * 10) / 10;
    targetDurationMin = Math.round(dur);
    targetSrpe = Math.round(input.recentRpe.avgRpe * dur);
    srpeSource = "recent";
  }

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

  // Readiness-adjusted targets — what to actually prescribe once the squad's
  // check-in modifier is applied (the headline targets stay "clean").
  const adjFactor = 1 + readinessAdjustPct / 100;
  const adjustedTargets: KpiTarget[] = targets.map((t) => ({
    ...t,
    target: t.target != null ? Math.round(t.target * adjFactor) : null,
    pctOfMatch: t.matchRef != null && t.matchRef > 0 && t.target != null ? Math.round(((t.target * adjFactor) / t.matchRef) * 100) : null,
  }));

  // What has the squad's recent work leaned toward — force (accel/decel) vs
  // running (HSR/sprint)? Indexed against the match reference so "1.0" = a
  // match-like share. Lets the baseline report still say something about TYPE.
  const ratioTo = (k: LoadKpi): number | null => {
    const r = matchRef[k]; const b = trainingAvg[k];
    return r != null && r > 0 && b != null ? b / r : null;
  };
  const meanOf = (xs: Array<number | null>): number | null => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const mechIdx = meanOf([ratioTo("accel"), ratioTo("decel")]);
  const locoIdx = meanOf([ratioTo("hsr"), ratioTo("sprint")]);
  let lean: "mechanical" | "locomotive" | "balanced" | null = null;
  let leanNote: string | null = null;
  if (mechIdx != null && locoIdx != null) {
    if (mechIdx > locoIdx * 1.15) { lean = "mechanical"; leanNote = "Recent sessions have leaned mechanical (accel/decel-heavy) relative to high-speed running — today is a good day to add some locomotor (speed) work to keep the squad balanced."; }
    else if (locoIdx > mechIdx * 1.15) { lean = "locomotive"; leanNote = "Recent sessions have leaned locomotive (high-speed running) relative to force work — today is a good day to fold in some mechanical (accel/decel) emphasis."; }
    else { lean = "balanced"; leanNote = "Recent force (accel/decel) and running (HSR/sprint) load have been balanced relative to match demand — a mixed session keeps that balance."; }
  }
  const recentLean = { mechIdx: mechIdx != null ? Math.round(mechIdx * 100) / 100 : null, locoIdx: locoIdx != null ? Math.round(locoIdx * 100) / 100 : null, lean, note: leanNote };

  // Last few sessions LEADING INTO today (before the session date), oldest→newest.
  const recentSessions = Array.from(dateMeans.entries())
    .filter(([d]) => d < input.sessionDate)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-5)
    .map(([d, m]) => ({
      date: d,
      totalDistance: m.totalDistance != null ? Math.round(m.totalDistance) : null,
      playerLoad: m.playerLoad != null ? Math.round(m.playerLoad) : null,
      hsr: m.hsr != null ? Math.round(m.hsr) : null,
      isPeak: matchDays.includes(d),
    }));

  // Per-player targets + flags (their own match average × matchPct).
  const byPlayer = new Map<string, LoadRow[]>();
  for (const r of input.rows) {
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }
  const perPlayer: PlayerPlan[] = Array.from(byPlayer.entries()).map(([pid, rs]) => {
    const onMatch = rs.filter((r) => matchDays.includes(r.date));
    const onTraining = rs.filter((r) => r.date >= chronicFrom && !matchDays.includes(r.date));
    // Player ACWR on player load (drives the per-player baseline factor + flag).
    const acute = mean(rs.filter((r) => r.date >= acuteFrom).map((r) => VAL.playerLoad(r)));
    const chronic = mean(rs.filter((r) => r.date >= chronicFrom).map((r) => VAL.playerLoad(r)));
    const acwr = acute != null && chronic != null && chronic > 0 ? acute / chronic : null;
    const pAf = acwr == null ? acwrFactor : acwr > 1.3 ? 0.85 : acwr < 0.8 ? 1.1 : 1.0;
    const ptFor = (get: (r: LoadRow) => number, e?: number): number | null => {
      if (mode === "microcycle") return scale(mean(onMatch.map(get)), matchPct, e);
      if (mode === "recent_baseline") { const b = mean(onTraining.map(get)); return b != null ? Math.round(b * pAf) : null; }
      return null;
    };
    const pTD = ptFor((r) => VAL.totalDistance(r), emph.totalDistance);
    const pPL = ptFor((r) => VAL.playerLoad(r), emph.playerLoad);
    const pHSR = ptFor((r) => VAL.hsr(r), emph.hsr);
    const pSprint = ptFor((r) => VAL.sprint(r), emph.sprint);
    const pAccel = ptFor((r) => VAL.accel(r), emph.accel);
    const pDecel = ptFor((r) => VAL.decel(r), emph.decel);
    const pEfforts = ptFor((r) => VAL.efforts(r), emph.efforts);
    const pIMA = ptFor((r) => VAL.ima(r), emph.ima);
    let flag: PlayerPlan["flag"] = "ok";
    let flagReason: string | null = null;
    if (acwr != null && acwr >= 1.5) { flag = "reduce"; flagReason = `ACWR ${acwr.toFixed(2)} — already spiking, hold them back`; }
    else if (acwr != null && acwr >= 1.3) { flag = "reduce"; flagReason = `ACWR ${acwr.toFixed(2)} — above the familiar range`; }
    else if (acwr != null && acwr < 0.8) { flag = "build"; flagReason = `ACWR ${acwr.toFixed(2)} — undertrained, room to build`; }
    return {
      player_id: pid,
      name: input.nameById.get(pid) ?? pid.slice(0, 6),
      totalDistance: pTD,
      playerLoad: pPL,
      hsr: pHSR,
      sprint: pSprint,
      accel: pAccel,
      decel: pDecel,
      efforts: pEfforts,
      ima: pIMA,
      acwr: acwr != null ? Math.round(acwr * 100) / 100 : null,
      flag,
      flagReason,
    };
  }).sort((a, b) => (b.playerLoad ?? 0) - (a.playerLoad ?? 0));

  const hasTargets = targets.some((t) => t.target != null);
  return {
    sessionDate: input.sessionDate,
    planned,
    applicable: planned.applicable,
    mode,
    hasTargets,
    baselineNote,
    targets,
    availableKpis,
    matchDaysUsed: matchDays.length,
    teamAcwr: teamAcwr != null ? Math.round(teamAcwr * 100) / 100 : null,
    acutePL: acutePL != null ? Math.round(acutePL) : null,
    chronicPL: chronicPL != null ? Math.round(chronicPL) : null,
    readinessAdjustPct,
    readinessNote,
    targetRpe,
    targetDurationMin,
    targetSrpe,
    srpeSource,
    recentSessions,
    perPlayer,
    recentAvg: trainingAvg,
    adjustedTargets,
    coverage: {
      trainingDays: trainingDates.length,
      matchDays: matchDays.length,
      distinctDates: dateMeans.size,
      playersWithHistory: byPlayer.size,
      totalPlayers: input.nameById.size,
      windowDays: 120,
    },
    recentLean,
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
