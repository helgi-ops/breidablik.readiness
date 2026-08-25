/**
 * VALD assessment benchmarks — population reference bands + how-to-improve tips.
 *
 * Puts a player's CMJ / IMTP / limb-strength numbers in CONTEXT against published
 * reference values for HIS population, the same way peakBenchmark grades running
 * output against Ju 2022. Deliberately POPULATION context, NOT the verdict: the
 * decision layer stays personal-norm (Neyroud 2016 — a universal threshold is
 * largely an averaging artifact). We show "where he sits vs his peers" as a
 * shareable, cited read plus a plain "to improve" tip — never a pass/fail.
 *
 * MAGNITUDE metrics (jump height, RSI-mod, forces) are sex- and sport-specific,
 * so they are keyed by population. ASYMMETRY (<10% Bishop) and the context-only
 * metrics are population-independent. Populations without a cited band set (e.g.
 * basketball) grade only the universal metrics and are labelled honestly — we
 * never show male-football bands to a women's or basketball player.
 *
 * Sources:
 *  - Male football CMJ: elite male soccer S&C review 2024; Toth 2019 (juniors).
 *  - Female football CMJ ~28.9 cm, IMTP ~21.6 N/kg: pro female soccer norms
 *    (Seraphin/Edson 2024).
 *  - RSI-mod scale: NCAA D1 (Sports 2018) — males 0.208-0.704, females 0.135-0.553.
 *  - Male football IMTP ~28-40 N/kg: EFL force-plate norms 2025; Aspetar RTP floor >20.
 *  - Nordic eccentric-hamstring (NordBord) male soccer ~277-404 N/limb (Read 2022).
 *  - Inter-limb asymmetry: <10% ok / 10-15% watch / >15% concern (Bishop 2020).
 *  - IMTP early force + RFD reference values: Beckham 2013 (n=12 weightlifters —
 *    F100 ~2672 N, F200 ~4044 N, rel F200 ~45 N/kg, RFD 0-100/0-200 ~14300/14000
 *    N/s). Absolute early-force + RFD scale with body mass and are highly
 *    sampling/onset/filter-dependent (Comfort 2019 standardization) — surfaced as
 *    CONTEXT reference, never a pass/fail; only the body-mass-normalized rel. force
 *    @200ms is graded.
 */

export type BenchBand = "elite" | "good" | "average" | "below" | "context" | "na";
export type Bi = { en: string; is: string };

export type PopKey = "male_football" | "female_football" | "male_basketball" | "female_basketball" | "other";

export type BenchmarkRead = {
  band: BenchBand;
  bandLabel: Bi;
  ref: Bi;
  citation: string;
  improve: Bi | null;
  indicative?: boolean;
};

const BAND_LABEL: Record<Exclude<BenchBand, "na">, Bi> = {
  elite: { en: "Elite", is: "Afburða" },
  good: { en: "Above average", is: "Yfir meðallagi" },
  average: { en: "Average", is: "Meðallag" },
  below: { en: "Below average", is: "Undir meðallagi" },
  context: { en: "Context", is: "Samhengi" },
};

type HiSpec = { dir: "higher"; e: number; g: number; a: number };
type LoSpec = { dir: "lower"; g: number; a: number };
type CtxSpec = { dir: "context" };

type MetricSpec = {
  spec: HiSpec | LoSpec | CtxSpec;
  ref: Bi;
  citation: string;
  improve: Bi | null;
  indicative?: boolean;
};

// ── Improve tips (cited training methods) ────────────────────────────────────
const STRENGTH_TIP: Bi = {
  en: "Heavy multi-joint strength — squat, trap-bar deadlift, isometric pulls near the sticking point (Suchomel 2016 — strength is the foundation).",
  is: "Þung fjölliða styrktarvinna — hnébeygja, trap-bar réttstöðulyfta, ísómetrísk tog nálægt festupunkti (Suchomel 2016 — styrkur er undirstaðan).",
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

// Early relative strength (IMTP force at 200 ms / body mass). Norms are thin /
// protocol-specific, so flagged indicative; relative strength is fairly sport-
// agnostic, so male/female values are reused across football + basketball.
const IMTP_REL200_MALE: MetricSpec = {
  spec: { dir: "higher", e: 30, g: 25, a: 20 },
  ref: { en: "male: early relative strength ~20-30 N/kg (elite lifters ~45; indicative)", is: "karlar: snemm-hlutfallslegur styrkur ~20-30 N/kg (afburða lyftarar ~45; leiðbeinandi)" },
  citation: "IMTP F200/BM; Beckham 2013 anchor - indicative", improve: STRENGTH_TIP, indicative: true,
};
const IMTP_REL200_FEMALE: MetricSpec = {
  spec: { dir: "higher", e: 23, g: 19, a: 15 },
  ref: { en: "women: early relative strength ~15-23 N/kg (indicative)", is: "konur: snemm-hlutfallslegur styrkur ~15-23 N/kg (leiðbeinandi)" },
  citation: "IMTP F200/BM; Beckham 2013 anchor - indicative", improve: STRENGTH_TIP, indicative: true,
};

// ── Magnitude benchmarks, keyed by population ────────────────────────────────
const MALE_FOOTBALL: Record<string, MetricSpec> = {
  imtpRelForce200Nkg: IMTP_REL200_MALE,
  imtpRelForceNkg: {
    spec: { dir: "higher", e: 40, g: 34, a: 28 },
    ref: { en: "male football: avg ~28-34, elite >=40 N/kg (>20 = RTP floor)", is: "karla-fótbolti: meðal ~28-34, afburða >=40 N/kg (>20 = RTP gólf)" },
    citation: "EFL soccer force-plate norms 2025; Aspetar RTP floor", improve: STRENGTH_TIP,
  },
  cmjJumpHeightCm: {
    spec: { dir: "higher", e: 44, g: 39, a: 33 },
    ref: { en: "male football: avg ~34-39, elite >=44 cm", is: "karla-fótbolti: meðal ~34-39, afburða >=44 cm" },
    citation: "Elite male soccer S&C review 2024; Toth 2019", improve: POWER_TIP,
  },
  cmjRsiMod: {
    spec: { dir: "higher", e: 0.6, g: 0.45, a: 0.3 },
    ref: { en: "scale: <0.30 low, 0.30-0.45 moderate, >0.45 high", is: "kvarði: <0.30 lágt, 0.30-0.45 miðlungs, >0.45 hátt" },
    citation: "RSI-mod NCAA D1 male (Sports 2018)", improve: REACTIVE_TIP,
  },
  cmjRelPeakPowerWkg: {
    spec: { dir: "higher", e: 58, g: 52, a: 45 },
    ref: { en: "indicative male team sport: ~45-60 W/kg", is: "leiðbeinandi karla-hópíþrótt: ~45-60 W/kg" },
    citation: "Team-sport CMJ power (Petrigna 2019) - indicative", improve: POWER_TIP, indicative: true,
  },
  nordbordForceN: {
    spec: { dir: "higher", e: 400, g: 340, a: 280 },
    ref: { en: "male football: ~280-400 N per limb", is: "karla-fótbolti: ~280-400 N per fót" },
    citation: "NordBord senior male soccer norms (Read 2022)", improve: HAMSTRING_TIP,
  },
};

const FEMALE_FOOTBALL: Record<string, MetricSpec> = {
  imtpRelForce200Nkg: IMTP_REL200_FEMALE,
  imtpRelForceNkg: {
    spec: { dir: "higher", e: 28, g: 24, a: 19 },
    ref: { en: "women's football: avg ~19-24, elite >=28 N/kg", is: "kvenna-fótbolti: meðal ~19-24, afburða >=28 N/kg" },
    citation: "Pro female soccer norms (Seraphin 2024)", improve: STRENGTH_TIP,
  },
  cmjJumpHeightCm: {
    spec: { dir: "higher", e: 36, g: 31, a: 25 },
    ref: { en: "women's football: avg ~25-31, elite >=36 cm", is: "kvenna-fótbolti: meðal ~25-31, afburða >=36 cm" },
    citation: "Pro female soccer norms (Seraphin 2024)", improve: POWER_TIP,
  },
  cmjRsiMod: {
    spec: { dir: "higher", e: 0.5, g: 0.38, a: 0.25 },
    ref: { en: "female scale: <0.25 low, 0.25-0.38 moderate, >0.38 high", is: "kvenna-kvarði: <0.25 lágt, 0.25-0.38 miðlungs, >0.38 hátt" },
    citation: "RSI-mod NCAA D1 female (Sports 2018)", improve: REACTIVE_TIP,
  },
  cmjRelPeakPowerWkg: {
    spec: { dir: "higher", e: 50, g: 44, a: 38 },
    ref: { en: "indicative women's team sport: ~38-50 W/kg", is: "leiðbeinandi kvenna-hópíþrótt: ~38-50 W/kg" },
    citation: "Female team-sport CMJ power - indicative", improve: POWER_TIP, indicative: true,
  },
  // Female NordBord norms are thinner than male — show the value in context, don't grade.
  nordbordForceN: {
    spec: { dir: "context" },
    ref: { en: "women's football typically lower than male (~200-290 N/limb) - reference band not set", is: "kvenna-fótbolti oftast lægri en karla (~200-290 N/fót) - viðmiðsband ekki sett" },
    citation: "context", improve: null,
  },
};

// Basketball is jump-specialised, so CMJ / mRSI / power run HIGHER than football.
// Male values are from the NCAA D1 Power-Five normative study (Merrigan/IJSC 2024:
// JH ~41-44 cm, mRSI ~0.60-0.65, peak relative propulsive power ~60-63 W/kg).
const MALE_BASKETBALL: Record<string, MetricSpec> = {
  imtpRelForce200Nkg: IMTP_REL200_MALE,
  cmjJumpHeightCm: {
    spec: { dir: "higher", e: 50, g: 44, a: 36 },
    ref: { en: "male basketball: avg ~41-44, elite >=50 cm", is: "karla-körfubolti: meðal ~41-44, afburða >=50 cm" },
    citation: "NCAA D1 men's basketball norms (IJSC 2024)", improve: POWER_TIP,
  },
  cmjRsiMod: {
    spec: { dir: "higher", e: 0.72, g: 0.6, a: 0.45 },
    ref: { en: "male basketball: avg ~0.60-0.65", is: "karla-körfubolti: meðal ~0.60-0.65" },
    citation: "NCAA D1 men's basketball norms (IJSC 2024)", improve: REACTIVE_TIP,
  },
  cmjRelPeakPowerWkg: {
    spec: { dir: "higher", e: 70, g: 64, a: 55 },
    ref: { en: "male basketball: avg ~60-63 W/kg", is: "karla-körfubolti: meðal ~60-63 W/kg" },
    citation: "NCAA D1 men's basketball norms (IJSC 2024)", improve: POWER_TIP,
  },
  imtpRelForceNkg: {
    spec: { dir: "higher", e: 40, g: 34, a: 28 },
    ref: { en: "male team sport: avg ~28-34, elite >=40 N/kg (relative strength ~sport-agnostic)", is: "karla-hópíþrótt: meðal ~28-34, afburða >=40 N/kg (hlutfallslegur styrkur ~íþrótta-óháður)" },
    citation: "team-sport IMTP relative strength", improve: STRENGTH_TIP, indicative: true,
  },
  nordbordForceN: {
    spec: { dir: "context" },
    ref: { en: "basketball hamstring norms thin - reference band not set", is: "körfubolta hamstring viðmið fá - viðmiðsband ekki sett" },
    citation: "context", improve: null,
  },
};

// Female basketball: mRSI on the NCAA D1 female scale (solid); jump height + power
// approximate (thinner literature) so flagged indicative; IMTP reuses the female
// team-sport relative-strength band.
const FEMALE_BASKETBALL: Record<string, MetricSpec> = {
  imtpRelForce200Nkg: IMTP_REL200_FEMALE,
  cmjJumpHeightCm: {
    spec: { dir: "higher", e: 41, g: 35, a: 28 },
    ref: { en: "women's basketball: ~28-40 cm (approx)", is: "kvenna-körfubolti: ~28-40 cm (u.þ.b.)" },
    citation: "women's basketball force-plate studies - approx", improve: POWER_TIP, indicative: true,
  },
  cmjRsiMod: {
    spec: { dir: "higher", e: 0.5, g: 0.38, a: 0.25 },
    ref: { en: "female scale: <0.25 low, 0.25-0.38 moderate, >0.38 high", is: "kvenna-kvarði: <0.25 lágt, 0.25-0.38 miðlungs, >0.38 hátt" },
    citation: "RSI-mod NCAA D1 female (Sports 2018)", improve: REACTIVE_TIP,
  },
  cmjRelPeakPowerWkg: {
    spec: { dir: "higher", e: 52, g: 46, a: 40 },
    ref: { en: "indicative women's basketball: ~40-52 W/kg", is: "leiðbeinandi kvenna-körfubolti: ~40-52 W/kg" },
    citation: "women's basketball CMJ power - indicative", improve: POWER_TIP, indicative: true,
  },
  imtpRelForceNkg: {
    spec: { dir: "higher", e: 28, g: 24, a: 19 },
    ref: { en: "women's team sport: avg ~19-24, elite >=28 N/kg", is: "kvenna-hópíþrótt: meðal ~19-24, afburða >=28 N/kg" },
    citation: "female team-sport IMTP relative strength", improve: STRENGTH_TIP, indicative: true,
  },
  nordbordForceN: {
    spec: { dir: "context" },
    ref: { en: "basketball hamstring norms thin - reference band not set", is: "körfubolta hamstring viðmið fá - viðmiðsband ekki sett" },
    citation: "context", improve: null,
  },
};

const POP_BENCHMARKS: Record<PopKey, Record<string, MetricSpec>> = {
  male_football: MALE_FOOTBALL,
  female_football: FEMALE_FOOTBALL,
  male_basketball: MALE_BASKETBALL,
  female_basketball: FEMALE_BASKETBALL,
  other: {},
};

// ── Population-independent metrics ───────────────────────────────────────────
const UNIVERSAL: Record<string, MetricSpec> = {
  asymmetry: {
    spec: { dir: "lower", g: 10, a: 15 },
    ref: { en: "<10% ok, 10-15% watch, >15% concern", is: "<10% í lagi, 10-15% fylgstu með, >15% áhyggjuefni" },
    citation: "Bishop 2020", improve: ASYMMETRY_TIP,
  },
  groinAsymmetry: {
    spec: { dir: "lower", g: 10, a: 15 },
    ref: { en: "<10% ok, 10-15% watch, >15% concern", is: "<10% í lagi, 10-15% fylgstu með, >15% áhyggjuefni" },
    citation: "Bishop 2020; Esteve 2018", improve: GROIN_TIP,
  },
  // Limb Symmetry Index (involved / uninvolved x 100). The classic return-to-sport
  // gate is >=90%; it needs a known injured side, so it only shows in an RTP context.
  lsi: {
    spec: { dir: "higher", e: 100, g: 90, a: 80 },
    ref: { en: "RTP gate: >=90% cleared, 80-90% caution, <80% not ready (involved/uninvolved)", is: "RTP-viðmið: >=90% klárt, 80-90% varúð, <80% ekki tilbúið (veik/heil hlið)" },
    citation: "Grindem 2016; Kyritsis 2016", improve: HAMSTRING_TIP,
  },
  cmjContractionTimeMs: {
    spec: { dir: "context" },
    ref: { en: "typical CMJ contraction ~700-900 ms; longer = a slower, grindier jump", is: "dæmigerð CMJ samdráttur ~700-900 ms; lengra = hægara, þyngra stökk" },
    citation: "Gathercole 2015 (context)", improve: null,
  },
  cmjConcentricPeakVelocityMS: {
    spec: { dir: "context" },
    ref: { en: "typical trained ~2.8-3.3 m/s", is: "dæmigert þjálfað ~2.8-3.3 m/s" },
    citation: "context", improve: null,
  },
  cmjConcentricRfdNS: {
    spec: { dir: "context" },
    ref: { en: "highly variable rep-to-rep - read the trend, not one value", is: "mjög breytilegt milli endurtekninga - lestu þróunina, ekki eitt gildi" },
    citation: "context", improve: null,
  },
  // Drop-jump reactive strength index. Thresholds are for RSI = jump height /
  // contact time and are drop-height + surface dependent, so flagged indicative.
  djRsi: {
    spec: { dir: "higher", e: 2.5, g: 2.0, a: 1.5 },
    ref: { en: "drop-jump RSI: <1.5 low, 1.5-2.0 moderate, 2.0-2.5 established, >2.5 high (JH/contact; drop-height & surface dependent)", is: "drop-jump RSI: <1.5 lágt, 1.5-2.0 miðlungs, 2.0-2.5 gott, >2.5 hátt (stökkhæð/snerting; háð fallhæð & undirlagi)" },
    citation: "Plyometric RSI thresholds (overview) - indicative", improve: REACTIVE_TIP, indicative: true,
  },
  // IMTP early force + RFD: reference values scale with body mass and are highly
  // method/sampling-dependent, so we show them as CONTEXT (never a pass/fail).
  // The body-mass-normalized rel. force @200ms is the graded early-strength metric.
  imtpForce100N: {
    spec: { dir: "context" },
    ref: { en: "reference ~2670 N (strong lifters); scales with body mass - read rel. strength + trend", is: "viðmið ~2670 N (sterkir lyftarar); fer eftir líkamsþyngd - lestu hlutf. styrk + þróun" },
    citation: "Beckham 2013 (context)", improve: null,
  },
  imtpForce200N: {
    spec: { dir: "context" },
    ref: { en: "reference ~4040 N (strong lifters); body-mass dependent - see rel. force @200ms", is: "viðmið ~4040 N (sterkir lyftarar); fer eftir líkamsþyngd - sjá hlutf. kraft @200ms" },
    citation: "Beckham 2013 (context)", improve: null,
  },
  imtpRfd0100Ns: {
    spec: { dir: "context" },
    ref: { en: "reference ~14300 N/s (strong lifters); very sampling/onset-dependent - read the trend", is: "viðmið ~14300 N/s (sterkir lyftarar); mjög háð söfnun/upphafi - lestu þróunina" },
    citation: "Beckham 2013; Comfort 2019 (context)", improve: null,
  },
  imtpRfd0200Ns: {
    spec: { dir: "context" },
    ref: { en: "reference ~14000 N/s (strong lifters); method-sensitive - read the trend", is: "viðmið ~14000 N/s (sterkir lyftarar); aðferðar-næmt - lestu þróunina" },
    citation: "Beckham 2013; Comfort 2019 (context)", improve: null,
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
  if (value < spec.g) return "good";
  if (value < spec.a) return "average";
  return "below";
}

export function resolveBenchmarkPop(gender: string | null | undefined, sport: string | null | undefined): PopKey {
  const g = String(gender ?? "").trim().toLowerCase();
  const s = String(sport ?? "").trim().toLowerCase();
  const male = g === "m" || g === "male";
  const female = g === "f" || g === "female";
  if (s === "football" || s === "soccer") { if (male) return "male_football"; if (female) return "female_football"; }
  if (s === "basketball") { if (male) return "male_basketball"; if (female) return "female_basketball"; }
  return "other";
}

/** True when this population has cited MAGNITUDE bands (not just the universal ones). */
export function hasPopBands(pop: PopKey): boolean {
  return Object.keys(POP_BENCHMARKS[pop] ?? {}).length > 0;
}

export const POP_LABEL: Record<PopKey, Bi> = {
  male_football: { en: "senior male football", is: "karla-fótbolti" },
  female_football: { en: "women's football", is: "kvenna-fótbolti" },
  male_basketball: { en: "male basketball", is: "karla-körfubolti" },
  female_basketball: { en: "women's basketball", is: "kvenna-körfubolti" },
  other: { en: "this population", is: "þetta þýði" },
};

/**
 * Grade one metric value against the reference for the player's POPULATION.
 * Universal metrics (asymmetry, context) grade for any population; magnitude
 * metrics grade only when the population has a cited band set. Null = not graded
 * (no fabricated band) — the caller shows the value plain.
 */
export function classifyValdMetric(metricKey: string, value: number | null | undefined, pop: PopKey = "male_football"): BenchmarkRead | null {
  if (value == null || !Number.isFinite(value)) return null;
  const m = UNIVERSAL[metricKey] ?? POP_BENCHMARKS[pop]?.[metricKey];
  if (!m) return null;
  const band = classify(value, m.spec);
  const showImprove = band === "average" || band === "below";
  return {
    band,
    bandLabel: band === "na" ? { en: "-", is: "-" } : BAND_LABEL[band],
    ref: m.ref,
    citation: m.citation,
    improve: showImprove ? m.improve : null,
    indicative: m.indicative,
  };
}

/** Honest population caveat for the panel header. */
export function benchmarkPopulationNote(pop: PopKey): Bi {
  const p = POP_LABEL[pop];
  if (hasPopBands(pop)) {
    return {
      en: `Reference: ${p.en}. Population norm, not a verdict — his own baseline still leads.`,
      is: `Viðmið: ${p.is}. Hóp-viðmið, ekki dómur — hans eigin grunnlína ræður áfram.`,
    };
  }
  return {
    en: `No population reference bands set for ${p.en} yet — showing values, with only asymmetry graded (Bishop 2020).`,
    is: `Engin hóp-viðmiðsbönd sett fyrir ${p.is} enn — sýni gildi, aðeins ósamhverfa metin (Bishop 2020).`,
  };
}
