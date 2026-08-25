/**
 * VALD assessment benchmarks — population reference bands + how-to-improve tips.
 *
 * Puts a player's CMJ / limb-strength numbers in CONTEXT against published
 * senior-male-football / team-sport reference values, the same way peakBenchmark
 * grades running output against Ju 2022. This is deliberately POPULATION context,
 * NOT the verdict: the system's decision layer stays personal-norm (Neyroud 2016 —
 * a universal threshold is largely an averaging artifact). We show "where he sits
 * vs his peers" as a shareable, cited read, and a plain "to improve" tip per
 * quality — never as a pass/fail. Descriptive only; never touches the readiness
 * colour.
 *
 * Population = SENIOR MALE FOOTBALL / team sport. Norms are sex-, sport-, age- and
 * method-specific, so a women's or basketball or youth player needs its own band
 * set (structured here so those can be added). Each band carries its citation.
 *
 * Sources:
 *  - Jump height: elite male soccer S&C review (Bui/Ferrauti 2024, systematic
 *    review); Hungarian elite juniors ~36-39 cm (Toth 2019).
 *  - RSI-modified: NCAA D1 reference scale — Lower <0.30 / Moderate 0.30-0.45 /
 *    Upper >0.45 (Suchomel, Sports 2018;6(4):133).
 *  - Nordic eccentric-hamstring peak force (NordBord): senior male soccer ~277-404
 *    N/limb across studies (Read 2022; van Dyk / normative reviews).
 *  - Relative CMJ peak power: indicative team-sport ~45-60 W/kg (national-team CMJ
 *    framework, Petrigna 2019) — flagged indicative, not a hard grade.
 *  - Inter-limb asymmetry: <10% ok / 10-15% watch / >15% concern (Bishop 2020).
 */

export type BenchBand = "elite" | "good" | "average" | "below" | "context" | "na";

export type Bi = { en: string; is: string };

export type BenchmarkRead = {
  band: BenchBand;
  /** Short band word for the chip. */
  bandLabel: Bi;
  /** The reference range text (population norm). */
  ref: Bi;
  citation: string;
  /** Plain how-to-improve tip — present when the band is below "good". */
  improve: Bi | null;
  /** Indicative = evidence is thin/heterogeneous; soften the language. */
  indicative?: boolean;
};

const BAND_LABEL: Record<Exclude<BenchBand, "na">, Bi> = {
  elite: { en: "Elite", is: "Afburða" },
  good: { en: "Above average", is: "Yfir meðallagi" },
  average: { en: "Average", is: "Meðallag" },
  below: { en: "Below average", is: "Undir meðallagi" },
  context: { en: "Context", is: "Samhengi" },
};

/** Higher-is-better cut points (elite >= e, good >= g, average >= a, else below). */
type HiSpec = { dir: "higher"; e: number; g: number; a: number };
/** Lower-is-better (asymmetry): good < g, average < a, else below. No "elite". */
type LoSpec = { dir: "lower"; g: number; a: number };
/** Context-only: a typical range, shown but never graded. */
type CtxSpec = { dir: "context" };

type MetricSpec = {
  spec: HiSpec | LoSpec | CtxSpec;
  ref: Bi;
  citation: string;
  improve: Bi | null;
  indicative?: boolean;
};

const POWER_TIP: Bi = {
  en: "Heavy lower-body strength (squat / trap-bar) paired with ballistic jump-squats — strength underpins power (Cormie 2011).",
  is: "Þung fótaæfing (hnébeygja / trap-bar) með kraft-stökkum — styrkur er undirstaða afls (Cormie 2011).",
};
const REACTIVE_TIP: Bi = {
  en: "Plyometrics with short, stiff ground contacts — pogos, hops, drop jumps (Flanagan & Comyns 2008).",
  is: "Plyometrics með stuttri, stífri jarðsnertingu — pogos, hopp, drop jumps (Flanagan & Comyns 2008).",
};
const HAMSTRING_TIP: Bi = {
  en: "Nordic hamstring curls, progressive eccentric volume — roughly halves hamstring-injury risk (van Dyk 2019; Petersen 2011).",
  is: "Nordic hamstring, stigvaxandi eccentric magn — nær helmingar hamstring-meiðslahættu (van Dyk 2019; Petersen 2011).",
};
const GROIN_TIP: Bi = {
  en: "Copenhagen Adduction progression, short to long lever (Harøy 2019; Ishøi 2016).",
  is: "Copenhagen Adduction stigvaxandi, stutt í langan arm (Harøy 2019; Ishøi 2016).",
};
const ASYMMETRY_TIP: Bi = {
  en: "Single-leg strength + power on the weaker side to even out limb contribution (Bishop 2018).",
  is: "Einfætt styrkur + afl á veikari hlið til að jafna framlag útlima (Bishop 2018).",
};

/**
 * Metric benchmark table (senior male football / team sport). Keys map to the
 * assessment metric they grade.
 */
export const VALD_BENCHMARKS: Record<string, MetricSpec> = {
  cmjJumpHeightCm: {
    spec: { dir: "higher", e: 44, g: 39, a: 33 },
    ref: { en: "senior male football: avg ~34-39, elite >=44 cm", is: "karla-fótbolti: meðal ~34-39, afburða >=44 cm" },
    citation: "Elite male soccer S&C review 2024; Toth 2019",
    improve: POWER_TIP,
  },
  cmjRsiMod: {
    spec: { dir: "higher", e: 0.6, g: 0.45, a: 0.3 },
    ref: { en: "reference scale: <0.30 low, 0.30-0.45 moderate, >0.45 high", is: "viðmið: <0.30 lágt, 0.30-0.45 miðlungs, >0.45 hátt" },
    citation: "RSI-mod reference scale, NCAA D1 (Sports 2018)",
    improve: REACTIVE_TIP,
  },
  cmjRelPeakPowerWkg: {
    spec: { dir: "higher", e: 58, g: 52, a: 45 },
    ref: { en: "indicative team sport: ~45-60 W/kg", is: "leiðbeinandi hópíþrótt: ~45-60 W/kg" },
    citation: "Team-sport CMJ power (Petrigna 2019) - indicative",
    improve: POWER_TIP,
    indicative: true,
  },
  nordbordForceN: {
    spec: { dir: "higher", e: 400, g: 340, a: 280 },
    ref: { en: "senior male football: ~280-400 N per limb", is: "karla-fótbolti: ~280-400 N per fót" },
    citation: "NordBord senior male soccer norms (Read 2022)",
    improve: HAMSTRING_TIP,
  },
  asymmetry: {
    spec: { dir: "lower", g: 10, a: 15 },
    ref: { en: "<10% ok, 10-15% watch, >15% concern", is: "<10% í lagi, 10-15% fylgstu með, >15% áhyggjuefni" },
    citation: "Bishop 2020",
    improve: ASYMMETRY_TIP,
  },
  groinAsymmetry: {
    spec: { dir: "lower", g: 10, a: 15 },
    ref: { en: "<10% ok, 10-15% watch, >15% concern", is: "<10% í lagi, 10-15% fylgstu með, >15% áhyggjuefni" },
    citation: "Bishop 2020; Esteve 2018",
    improve: GROIN_TIP,
  },
  // Context-only — shown as a typical range, never graded (method-specific / noisy).
  cmjContractionTimeMs: {
    spec: { dir: "context" },
    ref: { en: "typical CMJ contraction ~700-900 ms; longer = a slower, grindier jump", is: "dæmigerð CMJ samdráttur ~700-900 ms; lengra = hægara, þyngra stökk" },
    citation: "Gathercole 2015 (context)",
    improve: null,
  },
  cmjConcentricPeakVelocityMS: {
    spec: { dir: "context" },
    ref: { en: "typical trained ~2.8-3.3 m/s", is: "dæmigert þjálfað ~2.8-3.3 m/s" },
    citation: "context",
    improve: null,
  },
  cmjConcentricRfdNS: {
    spec: { dir: "context" },
    ref: { en: "highly variable rep-to-rep - read the trend, not one value", is: "mjög breytilegt milli endurtekninga - lestu þróunina, ekki eitt gildi" },
    citation: "context",
    improve: null,
  },
};

function classify(value: number, spec: HiSpec | LoSpec | CtxSpec): BenchBand {
  if (spec.dir === "context") return "context";
  if (spec.dir === "higher") {
    if (value >= spec.e) return "elite";
    if (value >= spec.g) return "good";
    if (value >= spec.a) return "average";
    return "below";
  }
  // lower-is-better (asymmetry)
  if (value < spec.g) return "good";
  if (value < spec.a) return "average";
  return "below";
}

/**
 * Grade one metric value against the population reference. Returns null when the
 * metric is unknown or the value is missing (no fabricated band).
 */
export function classifyValdMetric(metricKey: string, value: number | null | undefined): BenchmarkRead | null {
  const m = VALD_BENCHMARKS[metricKey];
  if (!m || value == null || !Number.isFinite(value)) return null;
  const band = classify(value, m.spec);
  const graded = band !== "context" && band !== "na";
  // Show the improve tip only when he's below "good" on a graded metric.
  const showImprove = graded && (band === "average" || band === "below");
  return {
    band,
    bandLabel: band === "na" ? { en: "-", is: "-" } : BAND_LABEL[band],
    ref: m.ref,
    citation: m.citation,
    improve: showImprove ? m.improve : null,
    indicative: m.indicative,
  };
}

/** Population label for the whole benchmark set (shown once, honestly). */
export const BENCHMARK_POPULATION: Bi = {
  en: "Reference: senior male football / team sport. Population norm, not a verdict - his own baseline still leads.",
  is: "Viðmið: karla-fótbolti / hópíþrótt. Hóp-viðmið, ekki dómur - hans eigin grunnlína ræður áfram.",
};
