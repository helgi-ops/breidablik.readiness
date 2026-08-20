/**
 * Form vs State — Readiness-Adjusted Tactical Output (differentiator #2). Pure, IO-free.
 *
 * Separates the two things coaches confuse: "he's out of form" vs "he was physically
 * compromised." It reads a player's recent tactical output (OBV / xG per-90) against his
 * READINESS colour on each match date and the match CONTEXT (home/away, opponent level),
 * and tags the trend as a genuine form change or a state/context artifact.
 *
 * ADVISORY / DESCRIPTIVE ONLY. It reads PAST output against PAST readiness — it never
 * reads-as or writes the readiness colour, the load target, or the daily decision. It is an
 * analysis lens layered BESIDE the canonical verdict, never a new verdict.
 *
 * MVP = pure transparent tagging (no model): rules count the coincidences; the per-match
 * table is always shown; a verdict is only emitted with enough graded matches.
 *
 * Cite: Robertson et al. (Red/Amber/Green — decision-support for contextualised monitoring);
 *       Modric et al. 2019 (running ↔ game performance, position-specific); microcycle
 *       contextual variables (opponent level + location condition output); Saw et al.
 *       (subjective readiness is a sensitive, valid marker — the right variable to adjust by).
 */

export type Bi = { en: string; is: string };
export type Confidence = "high" | "moderate" | "low";
export type FormTier = "genuine_dip" | "explained_by_state" | "overperforming_compromised" | "steady" | "unknown";
export type ColorClass = "green" | "amber" | "red";
export type OpponentLevel = "high" | "med" | "low";

export const T = {
  minVerdict: 4,        // graded matches (output + readiness) below which we don't judge a trend
  dipPct: 0.15,         // window mean this far below the player's norm = a dip
  overPct: 0.10,        // this far above = over-performing
  atNormPct: 0.08,      // clean-match mean within +/- this of norm = "at his norm"
  compromisedShare: 0.5,// fraction of the window that must be compromised to call over-perf "while compromised"
  minConfidentN: 6,     // graded matches for high confidence
  minBaseline: 0.05,    // a norm this close to zero makes a %-of-norm read meaningless → unknown
};

export const CITATIONS = [
  "Robertson et al. — Red/Amber/Green: decision-support for contextualised athlete monitoring",
  "Modric et al. 2019 (IJERPH) — running ↔ game performance, position-specific",
  "Microcycle contextual variables — opponent level & match location condition output",
  "Saw et al. — subjective readiness is a sensitive, valid training-response marker",
];

export type TaggedMatch = {
  date: string;
  opponent: string | null;
  output: number | null;        // raw primary output for the match (e.g. OBV)
  outputPer90: number | null;   // minute-normalised (the comparison basis)
  minutes: number | null;
  readinessColor: string | null;
  readinessImputed: boolean;
  homeAway: "home" | "away" | null;
  result: "W" | "D" | "L" | null;
  opponentLevel: OpponentLevel | null;
};

export type FormInput = {
  playerId: string;
  name: string;
  position: string | null;
  primaryMetric: { key: string; label: Bi };
  baselinePer90: number | null;  // his own norm (season output per-90), or null when unknown
  matches: TaggedMatch[];        // most-recent-first or any order; the engine sorts
};

export type FormRead = {
  playerId: string;
  name: string;
  primaryMetric: { key: string; label: Bi };
  verdict: FormTier;
  headline: Bi;
  facts: Bi[];
  confidence: Confidence;
  counterfactual: Bi | null;
  baselinePer90: number | null;
  windowMean: number | null;
  cleanMean: number | null;
  compromisedMean: number | null;
  gradedN: number;
  perMatch: TaggedMatch[];       // sorted newest-first, for the details table
  citations: string[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const mean = (xs: Array<number | null>): number | null => { const v = xs.filter(has); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const nd = (v: number | null, d = 2): string => (v == null ? "—" : v.toFixed(d));
const pctTxt = (v: number): string => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;

export function colorClassOf(color: string | null): ColorClass | null {
  const c = (color ?? "").toUpperCase();
  if (c === "GREEN" || c === "GREEN_PLUS") return "green";
  if (c === "YELLOW") return "amber";
  if (c === "RED") return "red";
  return null;
}
/** Compromised = amber/red readiness, OR away to a top-level side. Clean = green AND not away-to-top. */
const isGraded = (m: TaggedMatch) => has(m.outputPer90) && colorClassOf(m.readinessColor) != null;
const isCompromised = (m: TaggedMatch) => { const c = colorClassOf(m.readinessColor); return c === "amber" || c === "red" || (m.homeAway === "away" && m.opponentLevel === "high"); };
const isClean = (m: TaggedMatch) => colorClassOf(m.readinessColor) === "green" && !(m.homeAway === "away" && m.opponentLevel === "high");

/** The four-layer form-vs-state read for one player. Pure — every number is traceable. */
export function computeFormVsState(input: FormInput): FormRead {
  const { playerId, name, primaryMetric, baselinePer90 } = input;
  const perMatch = [...input.matches].filter((m) => m.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const graded = perMatch.filter(isGraded);
  const gradedN = graded.length;
  const windowMean = mean(graded.map((m) => m.outputPer90));
  const cleanList = graded.filter(isClean), compromisedList = graded.filter(isCompromised);
  const cleanMean = mean(cleanList.map((m) => m.outputPer90));
  const compromisedMean = mean(compromisedList.map((m) => m.outputPer90));

  const base: FormRead = {
    playerId, name, primaryMetric, verdict: "unknown", headline: { en: "", is: "" }, facts: [],
    confidence: "low", counterfactual: null, baselinePer90, windowMean, cleanMean, compromisedMean,
    gradedN, perMatch, citations: CITATIONS,
  };

  const label = primaryMetric.label;
  const lbl = (l: "en" | "is") => label[l];

  // Not enough to separate form from state — show the tagged history, never guess a verdict.
  if (gradedN < T.minVerdict || !has(baselinePer90) || baselinePer90 < T.minBaseline || !has(windowMean)) {
    return { ...base, verdict: "unknown",
      headline: { en: `${name} — not enough matches to separate form from state.`, is: `${name} — ekki nógu margir leikir til að greina form frá ástandi.` },
      facts: gradedN > 0
        ? [{ en: `Only ${gradedN} match${gradedN === 1 ? "" : "es"} with ${lbl("en")} + readiness so far — the tagged history is below.`, is: `Aðeins ${gradedN} leik${gradedN === 1 ? "ur" : "ir"} með ${lbl("is")} + readiness enn — merkta sagan er að neðan.` }]
        : [{ en: `No matches with both ${lbl("en")} and a readiness colour yet.`, is: `Engir leikir enn með bæði ${lbl("is")} og readiness-lit.` }] };
  }

  const recentDelta = (windowMean - baselinePer90) / baselinePer90;
  const dip = recentDelta <= -T.dipPct;
  const over = recentDelta >= T.overPct;
  const compromisedShare = gradedN ? compromisedList.length / gradedN : 0;
  const cleanAtNorm = has(cleanMean) && cleanMean >= baselinePer90 * (1 - T.atNormPct);

  let verdict: FormTier = "steady";
  if (dip) verdict = cleanAtNorm ? "explained_by_state" : "genuine_dip";
  else if (over && compromisedShare >= T.compromisedShare) verdict = "overperforming_compromised";

  // Readiness + context mix (for the facts).
  const g = graded.filter((m) => colorClassOf(m.readinessColor) === "green").length;
  const a = graded.filter((m) => colorClassOf(m.readinessColor) === "amber").length;
  const r = graded.filter((m) => colorClassOf(m.readinessColor) === "red").length;
  const awayN = graded.filter((m) => m.homeAway === "away").length;
  const topN = graded.filter((m) => m.opponentLevel === "high").length;
  const imputedShare = gradedN ? graded.filter((m) => m.readinessImputed).length / gradedN : 0;

  const facts: Bi[] = [
    { en: `${lbl("en")}/90 is ${nd(windowMean)} over his last ${gradedN} vs his norm ${nd(baselinePer90)} (${pctTxt(recentDelta)}).`,
      is: `${lbl("is")}/90 er ${nd(windowMean)} síðustu ${gradedN} vs venja ${nd(baselinePer90)} (${pctTxt(recentDelta)}).` },
    { en: `Readiness over these: ${g} green, ${a} amber, ${r} red${imputedShare > 0.5 ? " (mostly estimated)" : ""}.`,
      is: `Readiness þessa leiki: ${g} grænir, ${a} gulir, ${r} rauðir${imputedShare > 0.5 ? " (aðallega áætlað)" : ""}.` },
    { en: `Context: ${awayN} away${topN ? `, ${topN} vs top-4 sides` : ""}.`, is: `Samhengi: ${awayN} útileikir${topN ? `, ${topN} gegn topp-4 liðum` : ""}.` },
  ];

  let counterfactual: Bi | null = null;
  if (verdict === "explained_by_state") counterfactual = { en: `On his ${cleanList.length} clean (green, not away-to-top) matches, ${lbl("en")}/90 is ${nd(cleanMean)} — at his norm. The dip is state, not form.`, is: `Í ${cleanList.length} hreinum leikjum (grænn, ekki úti-gegn-toppi) er ${lbl("is")}/90 ${nd(cleanMean)} — við venju. Dýfan er ástand, ekki form.` };
  else if (verdict === "genuine_dip") counterfactual = { en: `Even on his ${cleanList.length} clean matches ${lbl("en")}/90 is ${nd(cleanMean)} — below his norm. The dip holds regardless of state.`, is: `Jafnvel í ${cleanList.length} hreinum leikjum er ${lbl("is")}/90 ${nd(cleanMean)} — undir venju. Dýfan heldur óháð ástandi.` };
  else if (verdict === "overperforming_compromised") counterfactual = { en: `He's above his norm despite ${compromisedList.length} compromised matches — genuinely excellent, not a soft schedule.`, is: `Hann er yfir venju þrátt fyrir ${compromisedList.length} skerta leiki — raunverulega frábært, ekki léttur leikjaprógramm.` };

  const V: Record<FormTier, Bi> = {
    genuine_dip: { en: "genuine form dip", is: "raunveruleg form-dýfa" },
    explained_by_state: { en: "explained by state — not a form flag", is: "skýrist af ástandi — ekki form-merki" },
    overperforming_compromised: { en: "over-performing while compromised", is: "yfir-frammistaða þrátt fyrir skert ástand" },
    steady: { en: "steady", is: "stöðugt" },
    unknown: { en: "unknown", is: "óvíst" },
  };

  const confidence: Confidence = (imputedShare > 0.5) ? "low"
    : (gradedN >= T.minConfidentN && imputedShare === 0) ? "high" : "moderate";

  return { ...base, verdict, confidence, counterfactual, facts,
    headline: { en: `${name} — ${V[verdict].en}.`, is: `${name} — ${V[verdict].is}.` } };
}
