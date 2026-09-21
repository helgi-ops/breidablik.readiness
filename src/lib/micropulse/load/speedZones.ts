/**
 * Individualised speed zones — a player's OWN high-speed-running (HSR) and sprint thresholds,
 * derived from his MAS (any endurance test) + MSS (measured max sprint / GPS top speed). This is
 * the running counterpart of `criticalSpeed.ts`: where that fits the distance power curve, this
 * turns MAS + MSS into personal speed lines so "high-speed" and "sprint" are measured against HIS
 * capacity, not one league number for everyone.
 *
 * The ASR maths (ASR = MSS − MAS, %ASR anchors, the MSS>MAS>0 guard, the squad percentile) already
 * lives in `criticalSpeed.ts::computeAnaerobicSpeedReserve` — we REUSE it and never recompute ASR.
 * The floors are computed directly (`mas + pct·asr`), NOT snapped to the five discrete %ASR anchors
 * (0.30 isn't one of them).
 *
 * Descriptive conditioning context ONLY. Like `peakPeriod.ts` / `criticalSpeed.ts` it must NEVER
 * feed the readiness colour, the load target, or the daily decision. Pure, no I/O.
 *
 * Cite: Sandford 2019 (%ASR tiering) · Mendez-Villanueva & Buchheit 2013 (anaerobic speed reserve)
 *       · Abt & Lovell 2009 · Hunter et al. 2015 (individualised vs fixed thresholds).
 */

import type { Bi, Confidence } from "./peakPeriod";
import { computeAnaerobicSpeedReserve } from "./criticalSpeed";

export type MasSource = "vameval" | "msft" | "run_4min" | "vift_shrunk" | "cs_backcalc";
export type MssSource = "sprint_test" | "gps_season_max";

/** MAS sources that are a direct incremental/field test (not a shrunk or back-calculated proxy). */
const MAS_DIRECT: ReadonlySet<MasSource> = new Set<MasSource>(["vameval", "msft", "run_4min"]);
/** MAS sources that are proxies — always drop confidence to low. */
const MAS_PROXY: ReadonlySet<MasSource> = new Set<MasSource>(["vift_shrunk", "cs_backcalc"]);

/** A GPS season-max needs enough exposure to be a credible flying max (Buchheit — a single session
 *  can catch a one-off artefact). Below this the GPS MSS is treated as single-session → low. */
export const MIN_MSS_SESSIONS = 5;

export const DEFAULT_HSR_PCT_ASR = 0;      // HSR floor defaults to MAS (Abt & Lovell 2009; Hunter 2015)
export const DEFAULT_SPRINT_PCT_ASR = 0.30; // sprint floor defaults to MAS + 0.30·ASR (Sandford 2019)

/** The fixed, league/squad-comparable HSR threshold (Ju 2022) — shown ALONGSIDE the individualised
 *  floor, never instead of it, so a coach can still compare across players. */
export const LEAGUE_HSR_KMH = 19.8;

export interface SpeedZones {
  masKmh: number; mssKmh: number; asrKmh: number;
  hsrFloorKmh: number; sprintFloorKmh: number;
  hsrFloorMPerMin: number; sprintFloorMPerMin: number;   // × / 0.06 helpers for band maths
  hsrPctAsr: number; sprintPctAsr: number;               // the fractions used (provenance)
  masSource: MasSource; mssSource: MssSource;
  confidence: Confidence;   // measured MSS + direct MAS = high; VIFT/CS-backcalc or 1-session GPS max = low
  citation: string; caveat: Bi;
}

const CITATION = "Sandford 2019 (%ASR tiering) · Mendez-Villanueva & Buchheit 2013 (ASR) · Abt & Lovell 2009 · Hunter 2015 (individualised thresholds)";

const CAVEAT: Bi = {
  en: "His own high-speed and sprint lines, individualised from his maximal aerobic speed (MAS) plus his maximal sprint speed (MSS): HSR starts at MAS, sprinting at MAS + 30 % of his speed reserve (Sandford 2019). MSS is measured — a max sprint or GPS top speed — never estimated from an endurance test. The fixed 19.8 km/h line is kept alongside for league comparability. Descriptive conditioning context — it never touches the readiness verdict, the load target or the daily plan.",
  is: "Hans eigin há­hraða- og sprett­línur, einstaklingsmiðaðar úr hámarks loftháðum hraða (MAS) og hámarks­spretthraða (MSS): há­hraði byrjar við MAS, sprettur við MAS + 30 % af hraðaforðanum (Sandford 2019). MSS er mælt — hámarkssprettur eða GPS-topphraði — aldrei metið úr þolprófi. Fasta 19,8 km/klst línan fylgir með til samanburðar við deildina. Lýsandi samhengi — snertir aldrei readiness-dóminn, álagsmarkið eða dagsáætlunina.",
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const toMPerMin = (kmh: number) => Math.round(kmh / 0.06);

/**
 * Grade the zone's confidence from its provenance.
 * - low: MAS is a proxy (VIFT-shrunk / CS-back-calc), OR MSS is a GPS season-max without enough
 *   session exposure (single-session risk).
 * - high: a measured MSS (a dedicated sprint test, or a well-exposed GPS max) AND a direct MAS test.
 * - medium: anything in between (a defensive fallback; unreachable with today's source enums).
 */
function gradeConfidence(masSource: MasSource, mssSource: MssSource, mssSessions: number | undefined): Confidence {
  if (MAS_PROXY.has(masSource)) return "low";
  const mssStrong =
    mssSource === "sprint_test" ||
    (mssSource === "gps_season_max" && (mssSessions ?? 0) >= MIN_MSS_SESSIONS);
  if (!mssStrong) return "low"; // single-session / unknown-exposure GPS max
  if (MAS_DIRECT.has(masSource)) return "high";
  return "medium";
}

/**
 * Build a player's individualised speed zones from his MAS + MSS. Pure.
 * Returns `null` whenever `computeAnaerobicSpeedReserve` returns null (MSS ≤ MAS, or either missing)
 * — the caller renders an honest "needs a max sprint + an endurance test" empty state, never a
 * fabricated zone. `mssSessions` (optional) lets the data layer prove GPS-max exposure for the
 * confidence grade; omitted, a GPS-max MSS is treated conservatively as single-session.
 */
export function buildSpeedZones(opts: {
  masKmh: number | null | undefined; masSource: MasSource;
  mssKmh: number | null | undefined; mssSource: MssSource;
  hsrPctAsr?: number;    // default 0   → HSR floor = MAS
  sprintPctAsr?: number; // default 0.30 → sprint floor = MAS + 0.30·ASR
  squadAsr?: Array<number | null>;
  mssSessions?: number;
}): SpeedZones | null {
  // Reuse the existing ASR routine for the ASR value + the MSS>MAS>0 null-guard. Do NOT recompute.
  const asrRead = computeAnaerobicSpeedReserve({ masKmh: opts.masKmh, mssKmh: opts.mssKmh, squadAsr: opts.squadAsr });
  if (!asrRead) return null;

  const mas = asrRead.masKmh, mss = asrRead.mssKmh, asr = asrRead.asrKmh;
  const hsrPctAsr = num(opts.hsrPctAsr) ?? DEFAULT_HSR_PCT_ASR;
  const sprintPctAsr = num(opts.sprintPctAsr) ?? DEFAULT_SPRINT_PCT_ASR;

  // Compute the floors directly — never snap to the 5 discrete %ASR anchors.
  const hsrFloorKmh = r1(mas + hsrPctAsr * asr);
  const sprintFloorKmh = r1(mas + sprintPctAsr * asr);

  return {
    masKmh: mas, mssKmh: mss, asrKmh: asr,
    hsrFloorKmh, sprintFloorKmh,
    hsrFloorMPerMin: toMPerMin(hsrFloorKmh), sprintFloorMPerMin: toMPerMin(sprintFloorKmh),
    hsrPctAsr, sprintPctAsr,
    masSource: opts.masSource, mssSource: opts.mssSource,
    confidence: gradeConfidence(opts.masSource, opts.mssSource, opts.mssSessions),
    citation: CITATION, caveat: CAVEAT,
  };
}

const NOTE_ZONES: Bi = {
  en: "A velocity band counts toward a zone only when the band's whole range sits at or above the zone floor (its lower edge ≥ the floor). A band straddling the floor is not split, so this is a conservative floor — his real individualised HSR/sprint is a little higher.",
  is: "Hraðaband telst með í svæði aðeins þegar allt bandið liggur við eða yfir svæðisgólfinu (neðri brún ≥ gólfinu). Band sem liggur yfir gólfið er ekki klofið, svo þetta er varkárt lágmark — raunverulegur einstaklingsmiðaður há­hraði/sprettur er ögn hærri.",
};

/**
 * Reclassify already-exported velocity-band distances into the player's OWN zones. Pure.
 * Honest partial coverage: a band contributes only when its LOWER edge ≥ the zone floor (bands
 * straddling the floor are excluded, not pro-rated) — so the totals are a conservative floor. A
 * band above the sprint floor is above the HSR floor too, so it counts toward BOTH per the rule.
 */
export function classifyBandsToZones(
  bands: Array<{ lowerEdgeKmh: number; distanceM: number }>,
  zones: SpeedZones,
): { individualisedHsrM: number; individualisedSprintM: number; note: Bi } {
  let hsr = 0, sprint = 0;
  for (const b of bands ?? []) {
    const edge = num(b.lowerEdgeKmh), dist = num(b.distanceM);
    if (edge === null || dist === null || dist <= 0) continue;
    if (edge >= zones.hsrFloorKmh) hsr += dist;
    if (edge >= zones.sprintFloorKmh) sprint += dist;
  }
  return { individualisedHsrM: Math.round(hsr), individualisedSprintM: Math.round(sprint), note: NOTE_ZONES };
}

/**
 * Match HSR as a share of the player's OWN ceiling — his season-best individualised HSR (his own
 * observed max), not a fitness-predicted number. Mirrors the Power-Curve latest-vs-best read. Pure.
 * Returns `{ pct: null }` when either input is missing or the ceiling is ≤ 0.
 */
export function matchHsrVsCapacity(opts: {
  matchHsrM: number | null | undefined; seasonBestHsrM: number | null | undefined;
}): { pct: number | null } {
  const match = num(opts.matchHsrM), best = num(opts.seasonBestHsrM);
  if (match === null || best === null || best <= 0) return { pct: null };
  return { pct: Math.round((match / best) * 100) };
}
