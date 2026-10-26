/**
 * Planned KPI volume — how much load a MICRO cycle (week) and a MESO cycle (block) should carry, anchored
 * to MATCH demand, PER KPI. Pure, cited, IO-free.
 *
 * Evidence base:
 *  - The match is the reference unit; weekly load is expressed as a MULTIPLE of a match, per KPI
 *    (Martín-García et al. 2018 — weekly totals ≈ 3–5× a single match).
 *  - The within-week shape (MD-day %s) is Buchheit 2024's microcycle periodization, reused from
 *    `planSessionLoad` (MD-3 peak 85%, MD-4 68%, MD-2 50%, MD-1 32%).
 *  - CRITICAL per-KPI nuance: high-intensity metrics (HSR, sprint distance, high stride bands) are
 *    CONCENTRATED on the high days (MD-4/MD-3) and taper to near-zero on MD-2/MD-1 — so their WEEKLY
 *    accumulation is a SMALLER multiple of a match than total distance / PlayerLoad (volume) is
 *    (Martín-García 2018; Oliva-Lozano 2020/2021 — session intensity distribution). Modelled with a
 *    per-KPI taper exponent `e`: each day contributes `f^e` of its match value (f = the day's load
 *    fraction); e=1 for volume, e>1 for high-intensity (steeper taper on low-load days).
 *  - The block (meso) progresses with a ramp + a deload week (3:1 / progressive overload, Gabbett 2016).
 *  - Pre-season has no matches → anchor to the TARGET match unit and ramp toward it (preseasonStart.ts).
 */

import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

/** The canonical TRAINING-day MD labels for a week with `matches` matches (MD-7 structure). The match
 *  day(s) are excluded — they ARE the unit. Fewer training days as the fixture congestion rises. */
export function standardTrainingDays(matches: number): string[] {
  if (matches <= 0) return ["MD-5", "MD-4", "MD-3", "MD-2", "MD-1"]; // a full no-match training week
  if (matches === 1) return ["MD-4", "MD-3", "MD-2", "MD-1"];
  if (matches === 2) return ["MD-3", "MD-2", "MD-1"];                // ~3 training days across two games
  return ["MD-2", "MD-1"];                                           // 3 games → minimal training
}

/** Matches falling in each week-window of a block: week i = [startISO + 7·(i−1), startISO + 7·i). Pure ISO
 *  date arithmetic. Lets the weekly TOTAL load be congestion-aware PER week (Anderson 2016) rather than
 *  assuming one match every week across the whole meso. */
export function matchesPerWeek(startISO: string, numWeeks: number, fixtures: string[]): number[] {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const n = Math.max(0, Math.round(numWeeks));
  const out: number[] = new Array(n).fill(0);
  if (!Number.isFinite(start)) return out;
  for (const f of fixtures) {
    const t = Date.parse(`${f}T00:00:00Z`);
    if (!Number.isFinite(t)) continue;
    const wk = Math.floor((t - start) / (7 * 86_400_000));
    if (wk >= 0 && wk < n) out[wk] += 1;
  }
  return out;
}

/** Per-KPI taper exponent — how a KPI's weekly accumulation relates to the day's load. `e=1` scales
 *  ~linearly with the day (volume); `e>1` tapers HARDER on low-load days (smaller weekly ×match); `e<1`
 *  accumulates MORE than the day's volume. Calibrated to measured training:match (T:M) ratios:
 *   - accel/decel COUNTS accumulate ≥ distance over a week (T:M ~2.0–4.45× vs TD ~1.86–2.8×) — training
 *     (SSGs/drills) is accel/decel-dense even when distance is modest → `e<1` (share >1).
 *   - HSR and especially sprint accumulate LESS (HSR ~0.2–2.6×, sprint ~0.03–1.3×) → steep `e>1`.
 *   - distance / PlayerLoad are the volume anchors (`e=1`).
 *  Within-week concentration still follows Martín-García 2018 / Oliva-Lozano 2020; the magnitudes are
 *  anchored on the full-season T:M study (PMC6747517), Anderson 2016 and Casamichana 2022. `e=1` if unknown.
 *  NB: HSR/sprint kept higher than the in-season T:M floor because the pre-season ramp (which also uses
 *  this) deliberately builds speed capacity when there are no matches to stay fresh for. */
export const KPI_TAPER_EXPONENT: Partial<Record<WeeklyLoadMetricKey, number>> = {
  totalDistance: 1.0, totalPlayerLoad: 1.0,
  velocityBand5: 1.5, velocityBand6: 2.2,     // HSR, sprint distance — taper hardest (sprint lowest T:M)
  accelB23: 0.9, decelB23: 1.0,               // accel/decel COUNTS accumulate ≥ distance (training-dense)
  fmpDynamicHigh: 1.5, fmpDynamicMedium: 1.1, fmpRunningHigh: 1.5,
  imaTotal: 1.1, imaAccel: 0.9, imaDecel: 1.0, imaCod: 1.1,
  imaStrideBand6: 1.5, imaStrideBand7: 1.7, imaStrideBand8: 2.2,
};

/**
 * Two load-adaptation PATHWAYS (Vanrenterghem, Nedergaard, Robinson & Drust 2017, *Sports Medicine*).
 * A session loads the body along two distinct routes with DIFFERENT adaptation rates, so they must be
 * progressed differently across a cycle:
 *  - `physiological` — metabolic / cardiovascular stress. Accelerations carry a high METABOLIC cost but
 *    modest mechanical cost (di Prampero; Harper & McBurnie 2021). Adapts relatively fast → ramp linearly.
 *  - `biomechanical` — musculoskeletal TISSUE stress (braking forces, eccentric demand). DECELERATIONS
 *    produce the highest ground-reaction forces / loading rates (Harper & McBurnie 2021); HSR & sprint
 *    drive hamstring injury risk and matter speed-specifically, not as total load (Duhig 2016; Malone).
 *    Adapts slower and is injury-sensitive → ramp CONSERVATIVELY (convex, stays low early, rises late).
 *  - `volume` — the headline anchors (total distance, PlayerLoad): ramp linearly, carry the ×match bar.
 * This is WHY (e.g.) sprint and deceleration should not share the same progression as total distance.
 */
export type LoadPathway = "volume" | "physiological" | "biomechanical";

export const KPI_PATHWAY: Partial<Record<WeeklyLoadMetricKey, LoadPathway>> = {
  totalDistance: "volume", totalPlayerLoad: "volume",
  // metabolic-dominant (accelerations are orderly concentric work — high energy, lower tissue cost)
  accelB23: "physiological", imaAccel: "physiological", imaTotal: "physiological", fmpDynamicMedium: "physiological",
  // tissue-dominant (braking, eccentric, top-end speed) — injury-sensitive, slower adaptation
  decelB23: "biomechanical", imaDecel: "biomechanical", imaCod: "biomechanical",
  velocityBand5: "biomechanical", velocityBand6: "biomechanical",
  fmpDynamicHigh: "biomechanical", fmpRunningHigh: "biomechanical",
  imaStrideBand6: "biomechanical", imaStrideBand7: "biomechanical", imaStrideBand8: "biomechanical",
};

/** Ramp-progression exponent per pathway, applied to the pre-season ramp fraction (0→1): 1 = linear;
 *  >1 = convex (the metric stays low through the early/mid weeks and rises late — a conservative,
 *  tissue-protective build to the same end-of-pre-season destination). Vanrenterghem 2017. */
export const PATHWAY_RAMP_GAMMA: Record<LoadPathway, number> = {
  volume: 1, physiological: 1, biomechanical: 1.7,
};

/** The dominant load pathway for a KPI (unknown → physiological/linear, i.e. no extra caution). */
export function kpiPathway(key: string): LoadPathway {
  return KPI_PATHWAY[key as WeeklyLoadMetricKey] ?? "physiological";
}

/**
 * Research reference range for a KPI's WEEKLY accumulation as a ×match multiple (training:match ratio) —
 * the "impact-weighted" read that shows each variable's own weight: in raw metres HSR looks tiny next to
 * total distance, but as ×match it is far closer (HSR ~1–2.3× vs TD ~1.8–3.1×). Ranges from measured T:M:
 * TD 1.8–3.1 (Dutch 3.1; full-season ~1.8), HSR 0.2–2.3, sprint 0.03–1.3, accel 1.6–3.9, decel 0.6–3.3
 * (full-season T:M study PMC6747517; Dutch 2-season; HSR/sprint systematic review PMC9968809). In-season
 * figures — the pre-season ramp may sit at/above the upper bound by design (capacity building, no matches).
 */
export const KPI_TM_REF_RANGE: Partial<Record<WeeklyLoadMetricKey, [number, number]>> = {
  totalDistance: [1.8, 3.5], totalPlayerLoad: [1.8, 3.1],
  velocityBand5: [0.2, 2.3], velocityBand6: [0.03, 1.5],
  accelB23: [1.6, 3.9], decelB23: [0.6, 3.3],
  imaTotal: [1.6, 3.9], imaAccel: [1.6, 3.9], imaDecel: [0.6, 3.3], imaCod: [0.6, 3.3],
  fmpDynamicHigh: [0.2, 2.3], fmpDynamicMedium: [1.0, 2.5], fmpRunningHigh: [0.2, 2.3],
  imaStrideBand6: [0.2, 2.3], imaStrideBand7: [0.1, 1.5], imaStrideBand8: [0.03, 1.5],
};

/** The research T:M reference range for a KPI's weekly ×match multiple, or null if none. */
export function kpiTmRefRange(key: string): [number, number] | null {
  return KPI_TM_REF_RANGE[key as WeeklyLoadMetricKey] ?? null;
}

/**
 * Pre-season WEEK-1 re-entry FLOOR per KPI, as a fraction of that KPI's peak ×match. The generic week-1
 * re-entry (the coach's `week1MatchMultiple`) is a controlled fraction of a match for the WHOLE load — but
 * aerobic VOLUME is the safe, low-injury base you build HIGH and EARLY in pre-season, so distance (and, to a
 * lesser degree, HSR — the aerobic-power base) should NOT drop as far at re-entry as sprint/mechanical do
 * (Jeong 2011; Teixeira 2021; Buchheit — build the engine first). An absent KPI uses the generic re-entry
 * floor (= week1/peak), so only the overridden KPIs start higher; the floor never pulls a KPI BELOW the
 * coach's week-1 multiple (see `max(..)` in preseasonStart). High-speed/mechanical metrics are deliberately
 * omitted so they keep their conservative, injury-safe re-entry.
 */
export const KPI_REENTRY_FLOOR: Partial<Record<WeeklyLoadMetricKey, number>> = {
  totalDistance: 0.80,   // aerobic volume — load high & early (~5.5 km/session re-entry at 4 sessions)
  velocityBand5: 0.65,   // HSR — load the aerobic-power base early (coach priority), but below distance
  imaStrideBand6: 0.62,  // IMA HSR-equivalent cadence band
  fmpRunningHigh: 0.62,  // FMP high-speed running
  // Accel/decel are training-dense from day one (SSGs/drills) → start higher than the generic re-entry.
  // Decel a touch lower than accel — it carries the highest tissue load (Harper & McBurnie 2021).
  accelB23: 0.62, imaAccel: 0.62,
  decelB23: 0.58, imaDecel: 0.58, imaCod: 0.58,
};

/** A KPI's pre-season week-1 re-entry floor (fraction of peak), or 0 when it uses the generic re-entry. */
export function kpiReentryFloor(key: string): number {
  return KPI_REENTRY_FLOOR[key as WeeklyLoadMetricKey] ?? 0;
}

/** The ramp-progression exponent (γ) for a KPI's pathway — see `PATHWAY_RAMP_GAMMA`. */
export function pathwayRampGamma(key: string): number {
  return PATHWAY_RAMP_GAMMA[kpiPathway(key)];
}

/** The per-day match-fractions (matchPct/100) for a set of MD-days (Buchheit 2024 via planSessionLoad). */
export function dayFractions(mdDays: string[]): number[] {
  const out: number[] = [];
  for (const d of mdDays) { const p = planSessionLoad({ mdDay: d, dayType: null, focus: null }); if (p.applicable) out.push(p.matchPct / 100); }
  return out;
}

/** Weekly multiple for a taper exponent: Σ f^e over the training days. e=1 → the volume multiple. */
export function weeklyMultiple(fractions: number[], exponent = 1): number {
  return Math.round(fractions.reduce((s, f) => s + Math.pow(f, Math.max(0.1, exponent)), 0) * 100) / 100;
}

/** Weekly TRAINING volume multiple (e=1) — the headline "×match". */
export function weeklyTrainingMultiple(mdDays: string[]): number { return weeklyMultiple(dayFractions(mdDays), 1); }

/** One KPI's tapered weekly multiple. */
export function weeklyKpiMultiple(mdDays: string[], key: WeeklyLoadMetricKey): number {
  return weeklyMultiple(dayFractions(mdDays), KPI_TAPER_EXPONENT[key] ?? 1);
}

/** A KPI's SHARE of the volume multiple over a representative (full, 5-day) training week: the discount
 *  that makes high-intensity KPIs accumulate a SMALLER weekly ×match than volume (sprint < HSR < acc/dec
 *  < distance). 1.0 for volume metrics / unknown KPIs. Used where a single week multiple is spread across
 *  KPIs (e.g. the pre-season ramp) so each metric tapers by its own exponent, not uniformly. */
export function kpiTaperShare(key: string): number {
  const fr = dayFractions(standardTrainingDays(0)); // the full no-match pre-season training-week shape
  const vol = weeklyMultiple(fr, 1);
  if (vol <= 0) return 1;
  const share = weeklyMultiple(fr, KPI_TAPER_EXPONENT[key as WeeklyLoadMetricKey] ?? 1) / vol;
  return Math.round(share * 1000) / 1000;
}

export type KpiVolume = { key: WeeklyLoadMetricKey; label: { en: string; is: string }; unit: string; matchValue: number; weeklyValue: number; multiple: number };

/** Per-KPI planned weekly volume = each KPI's match value × its OWN tapered weekly multiple (so HSR/sprint
 *  come out as a lower ×match than total distance). */
export function kpiVolumes(matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>, mdDays: string[]): KpiVolume[] {
  const fr = dayFractions(mdDays);
  const out: KpiVolume[] = [];
  for (const key of Object.keys(matchKpiAvg) as WeeklyLoadMetricKey[]) {
    const mv = matchKpiAvg[key];
    if (mv == null || !Number.isFinite(mv)) continue;
    const mult = weeklyMultiple(fr, KPI_TAPER_EXPONENT[key] ?? 1);
    const lab = WEEKLY_LOAD_LABELS[key];
    out.push({ key, label: { en: lab.en, is: lab.is }, unit: lab.unit, matchValue: mv, weeklyValue: Math.round(mv * mult), multiple: mult });
  }
  return out;
}

export type MesoWeek = { weekIndex: number; multiple: number; isDeload: boolean };

/** Per-week training multiple across a meso block. Loading weeks ramp from `baseMultiple` by `stepPct`
 *  each; the deload week (default = the last week) drops to ~60% of base (3:1 block, Gabbett 2016). */
export function mesoWeeklyMultiples(opts: { numWeeks: number; baseMultiple: number; stepPct: number; deloadWeek?: number }): MesoWeek[] {
  const n = Math.max(1, Math.round(opts.numWeeks));
  const deload = Math.min(n, Math.max(1, opts.deloadWeek ?? n));
  const rows: MesoWeek[] = [];
  let loadIdx = 0;
  for (let w = 1; w <= n; w++) {
    if (w === deload && n > 1) { rows.push({ weekIndex: w, multiple: Math.round(opts.baseMultiple * 0.6 * 100) / 100, isDeload: true }); continue; }
    const mult = opts.baseMultiple * (1 + (Math.max(0, opts.stepPct) / 100) * loadIdx);
    rows.push({ weekIndex: w, multiple: Math.round(mult * 100) / 100, isDeload: false });
    loadIdx++;
  }
  return rows;
}

/** Block total multiple (sum of all weeks) — the meso's total planned training volume as ×match. */
export const mesoTotalMultiple = (weeks: MesoWeek[]): number => Math.round(weeks.reduce((s, w) => s + w.multiple, 0) * 100) / 100;

export type PlannedVolumeKpiCell = { key: WeeklyLoadMetricKey; multiple: number; value: number };
export type PlannedVolume = {
  weekVolumeMultiple: number;                 // TRAINING-only ×match (volume, e=1) — falls as matches rise
  matches: number;                             // matches in the week (each = 1× a match by definition)
  weekTotalMultiple: number;                   // training + matches = the TOTAL week load as ×match. RISES
                                               // with congestion even as training falls (Anderson 2016).
  weekKpis: KpiVolume[];                       // per-KPI weekly target (each tapered)
  headKpis: WeeklyLoadMetricKey[];             // the KPIs shown as meso columns
  meso: Array<{ weekIndex: number; isDeload: boolean; volMultiple: number; trainingMultiple: number; matches?: number; totalMultiple?: number; kpi: PlannedVolumeKpiCell[] }>;
  mesoTotal: { volMultiple: number; kpi: PlannedVolumeKpiCell[] };
};

/** One call that assembles the whole planned-KPI-volume read (week + meso), per-KPI tapered + ramped —
 *  shared by the Hub card and the PDF so they never diverge. Returns null when there's no match unit. */
export function buildPlannedVolume(opts: {
  matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>;
  numWeeks: number; stepPct: number; deloadWeek?: number; matches?: number; headKpiCount?: number;
  /** Matches per meso week (length numWeeks), e.g. from `matchesPerWeek(blockStart, numWeeks, fixtures)`.
   *  When given, each week's training multiple is recomputed for THAT week's game count and the total adds
   *  the games — a congested week reads HIGHER. When absent, every week uses the single `matches`. */
  matchesByWeek?: number[];
}): PlannedVolume | null {
  const matches = Math.max(0, Math.round(opts.matches ?? 1));
  const days = standardTrainingDays(matches);
  const weekKpis = kpiVolumes(opts.matchKpiAvg, days);
  if (weekKpis.length === 0) return null;
  const wkMult = weeklyTrainingMultiple(days);
  const meso = mesoWeeklyMultiples({ numWeeks: opts.numWeeks, baseMultiple: wkMult, stepPct: opts.stepPct, deloadWeek: opts.deloadWeek });
  const headKpis = (Object.keys(opts.matchKpiAvg) as WeeklyLoadMetricKey[]).filter((k) => opts.matchKpiAvg[k] != null).slice(0, opts.headKpiCount ?? 2);
  const factor = (w: MesoWeek) => (wkMult > 0 ? w.multiple / wkMult : 0);
  const cell = (k: WeeklyLoadMetricKey, w: MesoWeek): PlannedVolumeKpiCell => {
    const mv = opts.matchKpiAvg[k] ?? 0, m = weeklyKpiMultiple(days, k);
    return { key: k, multiple: Math.round(m * factor(w) * 100) / 100, value: Math.round(mv * m * factor(w)) };
  };
  // Per-week congestion: when matchesByWeek is given, re-cost each week's TRAINING for that week's game
  // count (fewer training days ⇒ lower training multiple) and add the games for the TOTAL. KPI cells stay
  // on the typical-week shape (per-KPI congestion is a secondary effect — the headline is the total).
  const mesoRows = meso.map((w) => {
    const mi = opts.matchesByWeek?.[w.weekIndex - 1];
    const factor = wkMult > 0 ? w.multiple / wkMult : 0; // this week's progression (ramp/deload) factor
    const trainingMultiple = mi != null
      ? Math.round(weeklyTrainingMultiple(standardTrainingDays(mi)) * factor * 100) / 100
      : w.multiple;
    const totalMultiple = mi != null ? Math.round((trainingMultiple + mi) * 100) / 100 : undefined;
    return { weekIndex: w.weekIndex, isDeload: w.isDeload, volMultiple: w.multiple, trainingMultiple, matches: mi, totalMultiple, kpi: headKpis.map((k) => cell(k, w)) };
  });
  return {
    weekVolumeMultiple: wkMult, matches, weekTotalMultiple: Math.round((wkMult + matches) * 100) / 100, weekKpis, headKpis,
    meso: mesoRows,
    mesoTotal: {
      volMultiple: mesoTotalMultiple(meso),
      kpi: headKpis.map((k) => ({ key: k, multiple: Math.round(meso.reduce((s, w) => s + cell(k, w).multiple, 0) * 100) / 100, value: meso.reduce((s, w) => s + cell(k, w).value, 0) })),
    },
  };
}
