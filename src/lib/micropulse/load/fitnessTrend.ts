/**
 * Fitness retest trend — is a player's engine (MAS / CS / VO₂ / Yo-Yo distance) rising or falling
 * across retests of the SAME test? Pure computation over the fitness-test history already fetched;
 * no I/O, no new table.
 *
 * Honest rules baked in:
 *  - Compare like with like: the primary read trends WITHIN one test_type (a Yo-Yo distance and a
 *    VAMEVAL MAS are different scales). A secondary MAS-across-tests trend is offered only when the
 *    protocols actually differ, and carries a visible "different protocols — indicative" caveat.
 *  - Meaningful vs noise: only a change beyond the test's smallest worthwhile change (SWC) counts as
 *    up/down; inside the band is "stable (within test error)".
 *  - Interpretation is open: a drop can be detraining, incomplete recovery, fatigue OR measurement
 *    error — it says "retest / investigate", never a verdict.
 *  - Needs ≥ 2 comparable tests; one test = "baseline only".
 *
 * Descriptive monitoring ONLY — it never touches the readiness colour, the load target, or the daily
 * decision. Cite: Buchheit 2014 (30-15 IFT reliability), Bangsbo 2008 (Yo-Yo) for the SWC bands.
 */

import type { Bi } from "./peakPeriod";
import { FITNESS_TESTS, isFitnessTestType } from "./fitnessTests";

export const SWC_MAS_PCT = 3;   // smallest worthwhile change — MAS / CS / speed (km/h scale)
export const SWC_FIELD_PCT = 5; // Yo-Yo / beep field distance/level (lower reliability)

export type TrendDir = "up" | "down" | "stable" | "insufficient";

export interface FitnessTrendPoint { date: string; value: number; unit: string; testType: string; derivedMas?: number | null }
export interface FitnessTrendRead {
  metricLabel: Bi;
  points: FitnessTrendPoint[];     // oldest→newest, one test_type (or MAS-across-tests)
  latest: number | null; previous: number | null;
  deltaPct: number | null;         // latest vs previous step
  seasonDeltaPct: number | null;   // latest vs first in window (drives dir)
  dir: TrendDir;
  swcPct: number;
  indicative: boolean;             // true for the cross-protocol MAS read
  verdict: Bi;
  caveat: Bi;
}

// Field-test scale (5% SWC) vs the tighter MAS/speed scale (3%).
const FIELD_TYPES = new Set(["yo_yo_ir1", "yo_yo_ir2", "msft_beep"]);
// Time-based tests where a LOWER value is the better result (orient dir to performance).
const LOWER_IS_BETTER = new Set(["line_drill", "suicide_17s"]);

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const monthOf = (iso: string, is: boolean) => { const m = Number(iso.slice(5, 7)) - 1; return (is ? MONTHS_IS : MONTHS_EN)[m] ?? ""; };

const CAVEAT_SINGLE: Bi = {
  en: "Trend within one test type. A change beyond the test's typical error (SWC) counts as up/down; inside it is stable. A drop can be detraining, incomplete recovery, fatigue OR measurement error — worth a retest, not a verdict. Descriptive — never touches readiness.",
  is: "Þróun innan einnar prófgerðar. Breyting umfram dæmigerða skekkju prófsins (SWC) telst upp/niður; innan hennar er stöðugt. Lækkun getur verið afþjálfun, ófullkomin endurheimt, þreyta EÐA mæliskekkja — verð endurprófs, ekki dómur. Lýsandi — snertir aldrei readiness.",
};
const CAVEAT_ACROSS: Bi = {
  en: "MAS pooled across DIFFERENT protocols (VAMEVAL / 4-min run / beep / 30-15) — indicative only, not like-for-like; a within-test trend is more reliable. Descriptive — never touches readiness.",
  is: "MAS sameinað þvert á ÓLÍKAR prófgerðir (VAMEVAL / 4-mín / bíp / 30-15) — aðeins til viðmiðunar, ekki sambærilegt; þróun innan sömu prófgerðar er áreiðanlegri. Lýsandi — snertir aldrei readiness.",
};

function buildRead(metricLabel: Bi, pts: FitnessTrendPoint[], swcPct: number, opts: { lowerIsBetter?: boolean; indicative?: boolean }): FitnessTrendRead {
  const indicative = !!opts.indicative;
  const caveat = indicative ? CAVEAT_ACROSS : CAVEAT_SINGLE;
  if (pts.length < 2) {
    return {
      metricLabel, points: pts, latest: pts[0]?.value ?? null, previous: null, deltaPct: null, seasonDeltaPct: null,
      dir: "insufficient", swcPct, indicative,
      verdict: { en: "Baseline only — retest to trend.", is: "Aðeins grunnmæling — endurprófaðu til að sjá þróun." }, caveat,
    };
  }
  const first = pts[0].value, previous = pts[pts.length - 2].value, latest = pts[pts.length - 1].value;
  const deltaPct = previous > 0 ? r1(((latest - previous) / previous) * 100) : null;
  const seasonDeltaPct = first > 0 ? r1(((latest - first) / first) * 100) : null;

  // Orient to PERFORMANCE (rising = better) so time-based tests read correctly, then band on SWC.
  const perf = seasonDeltaPct == null ? 0 : (opts.lowerIsBetter ? -seasonDeltaPct : seasonDeltaPct);
  const dir: TrendDir = seasonDeltaPct == null ? "insufficient" : perf > swcPct ? "up" : perf < -swcPct ? "down" : "stable";

  const unit = pts[pts.length - 1].unit;
  const n = pts.length;
  const signed = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : ""}${v}%`);
  const label = (is: boolean) => (is ? metricLabel.is : metricLabel.en);
  const mo = (is: boolean) => monthOf(pts[0].date, is);
  const verdict: Bi = dir === "stable"
    ? { en: `${label(false)} stable — within test error over ${n} tests (${signed(seasonDeltaPct)}).`,
        is: `${label(true)} stöðugt — innan mæliskekkju yfir ${n} próf (${signed(seasonDeltaPct)}).` }
    : dir === "up"
      ? { en: `${label(false)} rising — ${first}→${latest} ${unit} over ${n} tests since ${mo(false)} (${signed(seasonDeltaPct)}).`,
          is: `${label(true)} hækkar — ${first}→${latest} ${unit} yfir ${n} próf frá ${mo(true)} (${signed(seasonDeltaPct)}).` }
      : { en: `${label(false)} down — ${first}→${latest} ${unit} over ${n} tests since ${mo(false)} (${signed(seasonDeltaPct)}) — worth a retest / investigate.`,
          is: `${label(true)} lækkar — ${first}→${latest} ${unit} yfir ${n} próf frá ${mo(true)} (${signed(seasonDeltaPct)}) — verð endurprófs / skoða nánar.` };

  return { metricLabel, points: pts, latest, previous, deltaPct, seasonDeltaPct, dir, swcPct, indicative, verdict, caveat };
}

const labelOf = (testType: string): Bi => (isFitnessTestType(testType) ? FITNESS_TESTS[testType].label : { en: testType, is: testType });

/**
 * Build the fitness retest trends from a player's history (any order; newest-first is fine — sorted
 * inside). Primary: one read per test_type. Secondary: a MAS-across-protocols read, only when the
 * MAS points span ≥2 distinct protocols (else the within-test read already covers it). Pure.
 */
export function buildFitnessTrends(history: Array<{
  test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null;
}>): { byTestType: FitnessTrendRead[]; masAcross: FitnessTrendRead | null } {
  const rows = (history ?? []).filter((h) => h && typeof h.test_date === "string" && typeof h.test_type === "string");

  // ── Primary: within each test_type, oldest→newest ──
  const groups = new Map<string, FitnessTrendPoint[]>();
  for (const h of rows) {
    const v = num(h.result_value); if (v === null) continue;
    const pt: FitnessTrendPoint = { date: h.test_date, value: v, unit: h.result_unit ?? "", testType: h.test_type, derivedMas: num(h.mas_kmh) };
    const arr = groups.get(h.test_type) ?? []; arr.push(pt); groups.set(h.test_type, arr);
  }
  const byTestType: FitnessTrendRead[] = [];
  for (const [type, pts] of groups) {
    pts.sort((a, b) => a.date.localeCompare(b.date));
    const swc = FIELD_TYPES.has(type) ? SWC_FIELD_PCT : SWC_MAS_PCT;
    byTestType.push(buildRead(labelOf(type), pts, swc, { lowerIsBetter: LOWER_IS_BETTER.has(type) }));
  }
  // Sort: most tests first, then those with a non-stable trend surfaced.
  byTestType.sort((a, b) => b.points.length - a.points.length);

  // ── Secondary: MAS across protocols (only when protocols actually differ) ──
  const masPts: FitnessTrendPoint[] = rows
    .map((h) => ({ h, mas: num(h.mas_kmh) }))
    .filter((x): x is { h: typeof rows[number]; mas: number } => x.mas !== null && x.mas > 0)
    .map(({ h, mas }) => ({ date: h.test_date, value: r1(mas), unit: "km/h", testType: h.test_type, derivedMas: r1(mas) }));
  masPts.sort((a, b) => a.date.localeCompare(b.date));
  const distinctProtocols = new Set(masPts.map((p) => p.testType)).size;
  const masAcross = masPts.length >= 2 && distinctProtocols >= 2
    ? buildRead({ en: "MAS (across tests)", is: "MAS (þvert á próf)" }, masPts, SWC_MAS_PCT, { indicative: true })
    : null;

  return { byTestType, masAcross };
}
