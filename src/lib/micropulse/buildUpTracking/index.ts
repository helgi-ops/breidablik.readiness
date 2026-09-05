/**
 * Build-up tracking — actual accrued weekly TRAINING load vs the periodization
 * plan, gated on chronic-baseline maturity.
 *
 * Descriptive planning only. This engine READS the plan (a `CalendarBlock`) and
 * the player's actual GPS/IMA weekly totals; it NEVER reads or writes the
 * readiness colour (CLAUDE.md principle #1 / canonical verdict source).
 *
 * The cold-start problem it solves: when a player returns from a break, the
 * 7:28 rolling average / ACWR has no chronic base, so "how does this compare to
 * his usual?" is blind or misleading (chronic ≈ 0 → the ratio explodes or is
 * undefined). During that window we compare to the PLAN instead — which is
 * itself cold-start-safe, because the hub's per-player block falls back to the
 * squad match unit when the player has no history. Only as the chronic base
 * matures do we fold the rolling / ACWR read back in:
 *
 *   Phase 1  plan_relative  (< 8 load-days in the trailing 28d)  — vs plan only
 *   Phase 2  blended        (8–20 load-days)                      — plan + emerging ACWR
 *   Phase 3  rolling        (≥ 21 load-days)                      — ACWR trusted, plan still shown
 *
 * The 8-day floor mirrors `playerLoadAcwr` (MIN_CHRONIC_DAYS_OBSERVED); the
 * 21-day mark is `coverageConfidence`'s "high". The transition is gated on
 * baseline maturity (visible as confidence), never hidden behind a threshold.
 *
 * Safety ceiling on the ACTUAL climb reuses the RTT / Gabbett (JOSPT 2020) ramp
 * cap: a week whose actual load jumps > ×1.10 over the prior week is flagged as
 * climbing faster than the safe +10%/week, independent of the plan.
 */
import type { Bi, CalendarBlock } from "@/lib/micropulse/periodization";

/** The six KPIs the plan (`CalDay`) and the actuals feed share 1:1. */
export type BuildUpKpi = "dist" | "hsr" | "load" | "accHiEff" | "decHiEff" | "stride";
export const BUILD_UP_KPIS: readonly BuildUpKpi[] = ["dist", "hsr", "load", "accHiEff", "decHiEff", "stride"];
export const KPI_LABEL: Record<BuildUpKpi, Bi> = {
  dist: { en: "Distance", is: "Vegalengd" },
  hsr: { en: "High-speed", is: "Háhraði" },
  load: { en: "Player load", is: "Player load" },
  accHiEff: { en: "Accel B2–3", is: "Hröðun B2–3" },
  decHiEff: { en: "Decel B2–3", is: "Hemlun B2–3" },
  stride: { en: "Top strides", is: "Topp-skref" },
};

export type Confidence = "high" | "moderate" | "low";

/** IMA driver KPIs the PLAN doesn't prescribe a per-week target for, so they are
 *  tracked as context (actual + trend), never scored against a plan. CoD is a
 *  countable volume (events/wk → sum, +10% climb cap applies); metabolic power is
 *  an intensity (W/kg mean → trend only, no accumulation spike). */
export type DriverKpi = "cod" | "metPower";
export const DRIVER_KPIS: readonly DriverKpi[] = ["cod", "metPower"];
export const DRIVER_LABEL: Record<DriverKpi, Bi> = {
  cod: { en: "Change of direction", is: "Stefnubreytingar" },
  metPower: { en: "Metabolic power", is: "Efnaskiptaafl" },
};
export const DRIVER_MODE: Record<DriverKpi, "volume" | "intensity"> = { cod: "volume", metPower: "intensity" };
export const DRIVER_UNIT: Record<DriverKpi, Bi> = {
  cod: { en: "events/wk", is: "atvik/viku" },
  metPower: { en: "W/kg avg", is: "W/kg með." },
};

/** Actual accrued TRAINING load for one Monday-anchored week (match days excluded). */
export interface WeekActual {
  weekStart: string; // ISO Monday
  trainingDays: number;
  byKpi: Partial<Record<BuildUpKpi, number>>;
  /** IMA driver context — cod is a weekly SUM, metPower a weekly MEAN. */
  drivers?: Partial<Record<DriverKpi, number>>;
}

/** Player-load ACWR echo (from playerLoadAcwr) — only surfaced from phase 2 on. */
export interface BuildUpAcwr {
  ratio: number | null;
  band: string;
  daysObserved: number;
}

export interface BuildUpInput {
  block: CalendarBlock;
  actualWeeks: WeekActual[];
  /** Today (YYYY-MM-DD) — decides which block weeks have elapsed. */
  asOf: string;
  /** Load-days (>0) in the trailing 28d — the chronic-baseline maturity gate. */
  daysObserved: number;
  /** The plan's own confidence (own match unit vs squad-baseline fallback). */
  planConfidence: Confidence | "medium";
  acwr?: BuildUpAcwr | null;
  /** Safe week-over-week climb ceiling; default 1.10 (Gabbett JOSPT 2020). */
  rampRate?: number;
}

export type AdherenceStatus = "behind" | "on" | "ahead" | "no_data";
export interface KpiWeek {
  kpi: BuildUpKpi;
  planned: number | null;
  actual: number | null;
  pct: number | null;
  status: AdherenceStatus;
  spike: boolean;
}
/** A driver KPI's week (context — no plan target). Volume drivers carry a spike
 *  flag (climb > safe +10%/wk); intensity drivers carry trend only. */
export interface DriverWeek {
  kpi: DriverKpi;
  mode: "volume" | "intensity";
  value: number | null;
  prev: number | null;
  deltaPct: number | null;
  trend: "up" | "down" | "flat" | null;
  spike: boolean;
}
export interface BuildUpWeek {
  index: number;
  weekStart: string;
  elapsed: boolean;
  pctOverall: number | null;
  status: AdherenceStatus;
  spike: boolean;
  kpis: KpiWeek[];
  drivers: DriverWeek[];
}
export type BuildUpPhase = "plan_relative" | "blended" | "rolling";
export interface BuildUpAdherence {
  phase: BuildUpPhase;
  confidence: Confidence;
  weeks: BuildUpWeek[];
  latestWeekIndex: number | null;
  verdict: Bi;
  facts: Bi[];
  provenance: string[];
  acwr: BuildUpAcwr | null;
}

const RAMP = 1.1; // Gabbett, JOSPT 2020 — safe +10%/week climb
const ON_LO = 0.85; // adherence band, mirrors loadPlan/plannedVsActual.statusOf
const ON_HI = 1.15;
const MIN_MATURE = 8; // playerLoadAcwr MIN_CHRONIC_DAYS_OBSERVED
const ROLLING_MATURE = 21; // coverageConfidence "high"

function normConf(c: Confidence | "medium"): Confidence {
  return c === "medium" ? "moderate" : c;
}
const RANK: Record<Confidence, number> = { low: 0, moderate: 1, high: 2 };
function minConf(a: Confidence, b: Confidence): Confidence {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Sum a block week's TRAINING days per KPI (match + rest days excluded — the
 *  same convention the hub uses for its pct-of-match roll-ups). Returns only
 *  KPIs the plan actually prescribes (a null every day → the KPI is absent, so
 *  a presence-gated field the feed never carries is never scored). */
function plannedWeekTotals(block: CalendarBlock, weekIndex: number): Partial<Record<BuildUpKpi, number>> {
  const wk = block.weeks[weekIndex];
  const out: Partial<Record<BuildUpKpi, number>> = {};
  const present: Record<BuildUpKpi, boolean> = {
    dist: false, hsr: false, load: false, accHiEff: false, decHiEff: false, stride: false,
  };
  for (const day of wk.days) {
    if (day.type === "match" || day.type === "rest") continue;
    for (const kpi of BUILD_UP_KPIS) {
      const v = day[kpi];
      if (v != null) {
        out[kpi] = (out[kpi] ?? 0) + v;
        present[kpi] = true;
      }
    }
  }
  // Drop KPIs that never appeared (keeps `present` meaningful vs a genuine 0).
  for (const kpi of BUILD_UP_KPIS) if (!present[kpi]) delete out[kpi];
  return out;
}

function statusOf(pct: number | null): AdherenceStatus {
  if (pct == null) return "no_data";
  if (pct < ON_LO) return "behind";
  if (pct > ON_HI) return "ahead";
  return "on";
}

function pctText(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct * 100)}%`;
}

/**
 * Compare actual accrued weekly training load to the periodization plan, phase-
 * gated on chronic maturity. Pure — no DB, no colour.
 */
export function computeBuildUpAdherence(inp: BuildUpInput): BuildUpAdherence {
  const rampRate = inp.rampRate ?? RAMP;
  const phase: BuildUpPhase =
    inp.daysObserved >= ROLLING_MATURE ? "rolling" : inp.daysObserved >= MIN_MATURE ? "blended" : "plan_relative";
  const covConf: Confidence = inp.daysObserved >= 21 ? "high" : inp.daysObserved >= 10 ? "moderate" : "low";
  const confidence = minConf(covConf, normConf(inp.planConfidence));

  const actualByWeek = new Map(inp.actualWeeks.map((w) => [w.weekStart, w]));
  const weeks: BuildUpWeek[] = [];
  let prevActual: Partial<Record<BuildUpKpi, number>> | null = null;
  let prevDrivers: Partial<Record<DriverKpi, number>> | null = null;

  inp.block.weeks.forEach((cw, wi) => {
    const elapsed = cw.weekStart <= inp.asOf;
    const planned = plannedWeekTotals(inp.block, wi);
    const act = actualByWeek.get(cw.weekStart) ?? null;
    const kpis: KpiWeek[] = [];
    for (const kpi of BUILD_UP_KPIS) {
      const p = planned[kpi];
      if (p == null || p <= 0) continue; // plan doesn't prescribe this KPI
      const a = act?.byKpi[kpi];
      const hasData = elapsed && act != null && a != null;
      const actual = hasData ? (a as number) : elapsed && act != null ? 0 : null;
      const pct = hasData ? (a as number) / p : null;
      const prev = prevActual?.[kpi];
      const spike = hasData && prev != null && prev > 0 ? (a as number) > prev * rampRate : false;
      kpis.push({ kpi, planned: p, actual, pct, status: statusOf(pct), spike });
    }
    // IMA drivers — context only (no plan target). Emitted for elapsed weeks that
    // carry the field; a volume driver (CoD) flags an unsafe climb, an intensity
    // driver (metabolic power) tracks trend only.
    const drivers: DriverWeek[] = [];
    for (const dk of DRIVER_KPIS) {
      const v = elapsed ? act?.drivers?.[dk] ?? null : null;
      if (v == null && (prevDrivers?.[dk] ?? null) == null) continue; // never seen → not tracked
      const prev = prevDrivers?.[dk] ?? null;
      const deltaPct = v != null && prev != null && prev > 0 ? (v - prev) / prev : null;
      const trend: DriverWeek["trend"] =
        deltaPct == null ? null : deltaPct > 0.05 ? "up" : deltaPct < -0.05 ? "down" : "flat";
      const spike = DRIVER_MODE[dk] === "volume" && v != null && prev != null && prev > 0 ? v > prev * rampRate : false;
      drivers.push({ kpi: dk, mode: DRIVER_MODE[dk], value: v, prev, deltaPct, trend, spike });
    }
    const withData = kpis.filter((k) => k.pct != null);
    const pctOverall = withData.length ? withData.reduce((s, k) => s + (k.pct as number), 0) / withData.length : null;
    const spike = kpis.some((k) => k.spike);
    weeks.push({ index: wi, weekStart: cw.weekStart, elapsed, pctOverall, status: statusOf(pctOverall), spike, kpis, drivers });
    if (act) {
      prevActual = act.byKpi;
      if (act.drivers) prevDrivers = { ...prevDrivers, ...act.drivers };
    }
  });

  const elapsedWithData = weeks.filter((w) => w.elapsed && w.pctOverall != null);
  const latest = elapsedWithData.length ? elapsedWithData[elapsedWithData.length - 1] : null;
  const latestWeekIndex = latest ? latest.index : null;

  const acwr = phase === "plan_relative" ? null : inp.acwr ?? null;
  const { verdict, facts } = narrate(inp, phase, latest);
  const provenance = [
    "Plan: periodization block from the player's match unit / squad baseline (Martin-García 2018 taper).",
    "Adherence band 85–115% of plan (planned-vs-actual).",
    "Safe climb +10%/week (Gabbett, JOSPT 2020 — How Much? How Fast?).",
    "ACWR 7:28 rolling (Hulin 2014 / Impellizzeri 2020 — load change, not an injury score).",
    "Drivers (context, no plan target): CoD volume (McBurnie 2022), metabolic power intensity (di Prampero 2015).",
  ];

  return { phase, confidence, weeks, latestWeekIndex, verdict, facts, provenance, acwr };
}

function narrate(
  inp: BuildUpInput,
  phase: BuildUpPhase,
  latest: BuildUpWeek | null,
): { verdict: Bi; facts: Bi[] } {
  if (!latest) {
    return {
      verdict: {
        en: "Build-up not logged yet — no training sessions recorded for this block.",
        is: "Uppbygging ekki skráð enn — engar æfingar skráðar í þessari lotu.",
      },
      facts: [
        {
          en: "As sessions are logged, actual load is compared to the planned build-up ramp week by week.",
          is: "Þegar æfingar eru skráðar er raun-álag borið saman við planaðan uppbyggingar-rampinn viku fyrir viku.",
        },
        phaseFact(inp, phase),
      ],
    };
  }

  const n = latest.index + 1;
  const pct = pctText(latest.pctOverall);
  let verdict: Bi;
  if (latest.status === "behind") {
    verdict = {
      en: `Behind the build-up — week ${n} at ${pct} of plan.`,
      is: `Á eftir uppbyggingu — vika ${n} í ${pct} af plani.`,
    };
  } else if (latest.status === "ahead") {
    verdict = latest.spike
      ? {
          en: `Ahead of plan — week ${n} at ${pct}, climbing faster than the safe +10%/wk.`,
          is: `Á undan plani — vika ${n} í ${pct}, klifrar hraðar en örugg +10%/viku.`,
        }
      : { en: `Ahead of plan — week ${n} at ${pct}.`, is: `Á undan plani — vika ${n} í ${pct}.` };
  } else {
    verdict = { en: `On the build-up — week ${n} at ${pct} of plan.`, is: `Á áætlun — vika ${n} í ${pct} af plani.` };
  }

  const facts: Bi[] = [];

  // Fact 1 — named KPIs that are off-plan.
  const behind = latest.kpis.filter((k) => k.status === "behind");
  const ahead = latest.kpis.filter((k) => k.status === "ahead");
  if (behind.length) {
    const names = behind.map((k) => `${KPI_LABEL[k.kpi].en} ${pctText(k.pct)}`);
    const namesIs = behind.map((k) => `${KPI_LABEL[k.kpi].is} ${pctText(k.pct)}`);
    facts.push({
      en: `Under the ramp: ${names.join(", ")}.`,
      is: `Undir rampi: ${namesIs.join(", ")}.`,
    });
  } else if (ahead.length) {
    const names = ahead.map((k) => `${KPI_LABEL[k.kpi].en} ${pctText(k.pct)}`);
    const namesIs = ahead.map((k) => `${KPI_LABEL[k.kpi].is} ${pctText(k.pct)}`);
    facts.push({ en: `Over the ramp: ${names.join(", ")}.`, is: `Yfir rampi: ${namesIs.join(", ")}.` });
  } else {
    facts.push({
      en: "Every tracked KPI is within 85–115% of the planned ramp.",
      is: "Öll rakin KPI eru innan 85–115% af planaða rampanum.",
    });
  }

  // Fact 2 — the safe-climb read (plan KPIs + the CoD volume driver).
  const spikeNamesEn = latest.kpis.filter((k) => k.spike).map((k) => KPI_LABEL[k.kpi].en);
  const spikeNamesIs = latest.kpis.filter((k) => k.spike).map((k) => KPI_LABEL[k.kpi].is);
  for (const d of latest.drivers) {
    if (d.spike) {
      spikeNamesEn.push(DRIVER_LABEL[d.kpi].en);
      spikeNamesIs.push(DRIVER_LABEL[d.kpi].is);
    }
  }
  if (spikeNamesEn.length) {
    facts.push({
      en: `${spikeNamesEn.join(" + ")} jumped more than the safe +10% over last week — ease the next step (Gabbett).`,
      is: `${spikeNamesIs.join(" + ")} stökk meira en örugg +10% frá síðustu viku — hægðu á næsta skrefi (Gabbett).`,
    });
  } else if (latest.status === "behind") {
    facts.push({
      en: "Trailing the planned climb — the next session can add up to the safe +10%.",
      is: "Á eftir planaða klifrinu — næsta æfing má bæta við allt að öruggum +10%.",
    });
  } else {
    facts.push({
      en: "Week-over-week climb stayed within the safe +10%/wk.",
      is: "Vikuklifrið hélst innan öruggra +10%/viku.",
    });
  }

  // Fact 3 — phase / maturity.
  facts.push(phaseFact(inp, phase));

  return { verdict, facts };
}

function phaseFact(inp: BuildUpInput, phase: BuildUpPhase): Bi {
  const d = inp.daysObserved;
  if (phase === "plan_relative") {
    return {
      en: `Chronic baseline still building (${d}/28 load-days) — compared to the plan, not to history yet.`,
      is: `Grunnlína enn að byggjast upp (${d}/28 álagsdagar) — borið saman við planið, ekki söguna enn.`,
    };
  }
  if (phase === "blended") {
    const r = inp.acwr?.ratio;
    const rt = r != null ? ` (ACWR ${r.toFixed(2)})` : "";
    return {
      en: `Baseline maturing (${d}/28 load-days) — the rolling read is now shown alongside the plan${rt}.`,
      is: `Grunnlína að þroskast (${d}/28 álagsdagar) — rúllandi lesturinn er nú sýndur með planinu${rt}.`,
    };
  }
  const r = inp.acwr?.ratio;
  const rt = r != null ? ` (ACWR ${r.toFixed(2)})` : "";
  return {
    en: `Baseline mature (${d}/28 load-days) — the rolling / ACWR read is trusted${rt}; the plan stays the build-up reference.`,
    is: `Grunnlína þroskuð (${d}/28 álagsdagar) — rúllandi / ACWR lesturinn er áreiðanlegur${rt}; planið er áfram uppbyggingar-viðmiðið.`,
  };
}
