/**
 * Submaximal HR (HRex) aerobic-fitness trend — pure, side-effect free.
 *
 * A standardized fixed-load submaximal run (e.g. 4-5 min at 9 km/h) tracks
 * cardiorespiratory-fitness change WITHOUT a maximal test (Buchheit's "maximizing
 * the submaximal" framework):
 *   - HRex = mean HR over the last 30-60 s of the run. LOWER at the same load = fitter.
 *   - HRR (optional) = HR drop over the first 60 s of recovery. HIGHER = better recovery.
 *
 * Thresholds (smallest worthwhile change): HRex ≈ 1%, HRR ≈ 7% (Buchheit; Frontiers
 * 2018 framework). A change ≥ SWC is meaningful; below is noise. Directional
 * ambiguity guardrail (Frontiers): an HR change is ambiguous ALONE — always read
 * alongside the training phase / load context and wellness; never a standalone
 * verdict. Descriptive/advisory — never the readiness colour.
 *
 * Cite: Buchheit et al. 2011 (PubMed 21656232) · Frontiers 2018 (HR team-sport framework).
 */

export type Bi = { en: string; is: string };

export interface HrExTest {
  date: string;                 // ISO yyyy-mm-dd
  hrexBpm: number;              // mean HR last 30-60 s (bpm)
  hrrBpm: number | null;        // HR drop first 60 s recovery (bpm), optional
  speedKmh: number | null;      // the fixed load — for provenance / comparability
}

export type HrExTrend = "improving" | "declining" | "stable" | "mixed" | "insufficient";
export type Confidence = "low" | "medium" | "high";

/** Smallest worthwhile change: HRex 1%, HRR 7% (Buchheit / Frontiers 2018). */
export const HREX_SWC_PCT = 1;
export const HRR_SWC_PCT = 7;
export const HREX_CITATION = "Buchheit 2011 (submaximal HR, SWC ≈1% HRex / ≈7% HRR; PubMed 21656232) · Frontiers 2018";

export interface HrExRead {
  latest: HrExTest | null;
  /** Reference = mean of tests in the first ~2 weeks of the series (or the first test). */
  baseline: { hrexBpm: number; hrrBpm: number | null; from: string } | null;
  hrexDeltaPct: number | null;  // (latest − baseline)/baseline × 100. NEGATIVE = fitter (lower HR).
  hrrDeltaPct: number | null;   // POSITIVE = better recovery.
  hrexMeaningful: boolean;      // |ΔHRex| ≥ 1%
  hrrMeaningful: boolean;       // |ΔHRR| ≥ 7%
  trend: HrExTrend;
  verdict: Bi;
  confidence: Confidence;
  nTests: number;
  citation: string;
  caveat: Bi;
}

const CAVEAT: Bi = {
  en: "A submaximal-HR change is ambiguous on its own — lower HRex usually means fitter, but heat, sleep, hydration and accumulated fatigue all move it. Read the trend (not one test) alongside the training phase, load and wellness. Descriptive — never the readiness colour.",
  is: "Breyting í undirhámarks-HR er tvíræð ein og sér — lægra HRex þýðir yfirleitt betra þrek, en hiti, svefn, vökvun og uppsöfnuð þreyta hreyfa það líka. Lestu þróunina (ekki eina mælingu) samhliða æfingafasa, álagi og líðan. Lýsandi — aldrei readiness-liturinn.",
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Compute the HRex aerobic-fitness trend from a player's submaximal tests.
 * Feed the full series (any order). Baseline = mean of tests within 14 days of
 * the earliest test; latest = most recent. Pure — no I/O.
 */
export function computeHrExTrend(testsIn: HrExTest[]): HrExRead {
  const tests = [...(testsIn ?? [])]
    .filter((t) => t && typeof t.date === "string" && isNum(t.hrexBpm) && t.hrexBpm > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const base: HrExRead = {
    latest: null, baseline: null, hrexDeltaPct: null, hrrDeltaPct: null,
    hrexMeaningful: false, hrrMeaningful: false, trend: "insufficient",
    verdict: { en: "", is: "" }, confidence: "low", nTests: tests.length,
    citation: HREX_CITATION, caveat: CAVEAT,
  };

  if (tests.length === 0) {
    return { ...base, verdict: { en: "No submaximal-HR tests recorded yet.", is: "Engin undirhámarks-HR próf skráð enn." } };
  }
  const latest = tests[tests.length - 1];
  if (tests.length < 2) {
    return { ...base, latest, verdict: { en: "First test logged — record another in a few weeks to read the trend.", is: "Fyrsta próf skráð — skráðu annað eftir nokkrar vikur til að lesa þróun." } };
  }

  // Baseline = mean of tests within 14 days of the earliest (a stable reference).
  const firstDate = tests[0].date;
  const twoWeeks = (() => { const d = new Date(`${firstDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 14); return d.toISOString().slice(0, 10); })();
  const baselineTests = tests.filter((t) => t.date <= twoWeeks);
  const baseHrex = mean(baselineTests.map((t) => t.hrexBpm))!;
  const baseHrrVals = baselineTests.map((t) => t.hrrBpm).filter(isNum);
  const baseHrr = baseHrrVals.length ? mean(baseHrrVals) : null;

  const hrexDeltaPct = r1(((latest.hrexBpm - baseHrex) / baseHrex) * 100);
  const hrexMeaningful = Math.abs(hrexDeltaPct) >= HREX_SWC_PCT;
  const hrrDeltaPct = isNum(latest.hrrBpm) && baseHrr != null && baseHrr > 0 ? r1(((latest.hrrBpm - baseHrr) / baseHrr) * 100) : null;
  const hrrMeaningful = hrrDeltaPct != null && Math.abs(hrrDeltaPct) >= HRR_SWC_PCT;

  // Direction: +1 = fitter, −1 = worse, 0 = within noise. HRex lower is better;
  // HRR higher is better.
  const hrexDir = hrexMeaningful ? (hrexDeltaPct < 0 ? 1 : -1) : 0;
  const hrrDir = hrrMeaningful ? (hrrDeltaPct! > 0 ? 1 : -1) : 0;

  let trend: HrExTrend;
  if (hrexDir === 0 && hrrDir === 0) trend = "stable";
  else if (hrexDir >= 0 && hrrDir >= 0 && (hrexDir > 0 || hrrDir > 0)) trend = "improving";
  else if (hrexDir <= 0 && hrrDir <= 0 && (hrexDir < 0 || hrrDir < 0)) trend = "declining";
  else trend = "mixed"; // HRex and HRR disagree — genuinely ambiguous

  const dHrex = `${hrexDeltaPct > 0 ? "+" : ""}${hrexDeltaPct}%`;
  const verdict: Bi =
    trend === "improving"
      ? { en: `Aerobic fitness trending up — HRex ${dHrex} at the same run${hrrMeaningful ? ", recovery quicker too" : ""}. Read alongside the training phase.`,
          is: `Þrek að batna — HRex ${dHrex} við sama hlaup${hrrMeaningful ? ", endurheimt hraðari líka" : ""}. Lestu með æfingafasa.` }
      : trend === "declining"
      ? { en: `HRex is up ${dHrex} at the same run — declining fitness or accumulated fatigue. Check against phase + wellness before acting.`,
          is: `HRex hækkað ${dHrex} við sama hlaup — minnkandi þrek eða uppsöfnuð þreyta. Berðu saman við fasa + líðan áður en brugðist er við.` }
      : trend === "mixed"
      ? { en: `Mixed signal — HRex ${dHrex} but recovery moved the other way. Ambiguous alone; read with phase, load and wellness.`,
          is: `Blandað merki — HRex ${dHrex} en endurheimt fór hina áttina. Tvírætt eitt og sér; lestu með fasa, álagi og líðan.` }
      : { en: `Stable — HRex within its worthwhile-change band (${dHrex}). No meaningful fitness change yet.`,
          is: `Stöðugt — HRex innan marktæks bils (${dHrex}). Engin marktæk þrekbreyting enn.` };

  const confidence: Confidence = tests.length >= 4 && trend !== "mixed" ? "high" : tests.length >= 3 ? "medium" : "low";

  return {
    latest, baseline: { hrexBpm: r1(baseHrex), hrrBpm: baseHrr == null ? null : r1(baseHrr), from: firstDate },
    hrexDeltaPct, hrrDeltaPct, hrexMeaningful, hrrMeaningful, trend, verdict, confidence,
    nTests: tests.length, citation: HREX_CITATION, caveat: CAVEAT,
  };
}
