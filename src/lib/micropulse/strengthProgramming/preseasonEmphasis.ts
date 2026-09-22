/**
 * Per-player PRE-SEASON strength emphasis recommender — pure, side-effect free.
 *
 * Given a player's own numbers (relative strength + power percentiles, body composition, ledger
 * deficits, position), recommend which pre-season block he should START on and where to spend the
 * extra weeks: build tissue first (hypertrophy), raise the force ceiling (max strength), convert to
 * fast force (power), recondition (strength-endurance), or an injury-prevention overlay.
 *
 * Body composition is the discriminator between "needs mass" and "needs force" — so when it's
 * missing we say so (`needsBodyComp`) and return a low-confidence default rather than guessing.
 *
 * Everyone still progresses hypertrophy → max strength → power; this only sets the starting block
 * and the emphasis. Advisory — the coach confirms/overrides. Descriptive: never reads or writes the
 * readiness colour, the load target, or the daily decision.
 *
 * Cite: Cormie/Suchomel 2011/2016 (strength underpins power; stronger athletes respond better);
 *       Mujika & Padilla 2000 (reconditioning); Pareja-Blanco 2017 (velocity autoregulation).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type PreseasonEmphasis =
  | "hypertrophy" | "max_strength" | "power" | "strength_endurance" | "injury_prevention_priority";

export interface PreseasonInputs {
  maxStrengthPctl?: number | null;      // athleteProfile max_strength (or VALD IMTP band → percentile)
  powerPctl?: number | null;            // vbt_power / reactive_power
  bodyFatPct?: number | null;
  leanMassKg?: number | null;
  massKg?: number | null;               // bodyComposition — the mass-vs-force discriminator
  deficitEmphases?: string[];           // from unifiedDeficits ledger (eccentric/unilateral/hamstring/…)
  position?: string | null;
}

export interface PreseasonEmphasisRead {
  emphasis: PreseasonEmphasis;
  why: Bi;
  secondary: PreseasonEmphasis | null;  // injury-prevention overlay is usually the secondary
  confidence: "high" | "moderate" | "low";
  needsBodyComp: boolean;               // true when body comp is missing → prompt, don't guess
  cite: string;
}

/** Tunable thresholds (percentiles + body-fat), a coaching convention not a law. */
export interface PreseasonThresholds {
  lowPctl: number;   // below → "low" for that quality
  highPctl: number;  // at/above → "high"
  highBodyFatPct: number; // at/above (for an outfielder) → carrying fat, build lean / lose first
}
export const DEFAULT_PRESEASON_THRESHOLDS: PreseasonThresholds = { lowPctl: 35, highPctl: 65, highBodyFatPct: 15 };

const CITE = "Cormie/Suchomel 2011/2016; Mujika & Padilla 2000; Pareja-Blanco 2017";

// Ledger-deficit KEYWORDS that flip on the year-round injury-prevention overlay (substring match, so
// it catches "eccentric_hamstring", "adductor_strength", "asymmetry_…" from the unified quality keys).
const INJURY_KEYWORDS = ["eccentric", "unilateral", "asymmetr", "hamstring", "adductor", "groin", "calf"];

const isGk = (pos: string | null | undefined) => /GK|MARK|KEEP/i.test(pos ?? "");

/** Recommend the starting pre-season emphasis for one player. Pure + deterministic. */
export function recommendPreseasonEmphasis(inp: PreseasonInputs, thr: PreseasonThresholds = DEFAULT_PRESEASON_THRESHOLDS): PreseasonEmphasisRead {
  const str = num(inp.maxStrengthPctl);
  const pow = num(inp.powerPctl);
  const bf = num(inp.bodyFatPct);
  const lean = num(inp.leanMassKg);
  const hasBodyComp = bf != null || lean != null;
  const needsBodyComp = !hasBodyComp;

  // Injury-prevention overlay — runs year-round; secondary to whatever the primary block is.
  const deficits = (inp.deficitEmphases ?? []).map((d) => d.toLowerCase());
  const injuryOverlay = deficits.some((d) => INJURY_KEYWORDS.some((k) => d.includes(k)));
  const secondary: PreseasonEmphasis | null = injuryOverlay ? "injury_prevention_priority" : null;
  const injuryNote = injuryOverlay
    ? { en: " Injury-prevention overlay (eccentric / unilateral) runs alongside — from the deficit ledger.", is: " Meiðslavarnar-lag (sérvirkt/einhliða) fylgir með — úr hallaskrá." }
    : { en: "", is: "" };

  const lowStr = str != null && str < thr.lowPctl;
  const highStr = str != null && str >= thr.highPctl;
  const lowPow = pow != null && pow < thr.lowPctl;
  const highBF = bf != null && bf >= thr.highBodyFatPct;
  const adequateComp = hasBodyComp && !highBF; // has the tissue / not carrying fat

  let emphasis: PreseasonEmphasis;
  let whyEn: string, whyIs: string;

  if (lowStr && needsBodyComp) {
    // Low strength but we can't tell mass-vs-force without body comp → safe reconditioning default + prompt.
    emphasis = "strength_endurance";
    whyEn = "Low relative strength, but body composition isn't recorded — start with reconditioning / strength-endurance and record body comp to split \"build tissue\" vs \"raise the ceiling\".";
    whyIs = "Lágur hlutfallslegur styrkur, en líkamsástand er ekki skráð — byrjaðu á enduruppbyggingu / styrktar-þoli og skráðu líkamsástand til að greina „byggja vef\" frá „hækka þakið\".";
  } else if (lowStr && highBF) {
    emphasis = "hypertrophy";
    whyEn = `Low relative strength (${pctl(str)}) with a high body-fat for the position (${Math.round(bf!)}%) — build cross-sectional area / lean tissue first; stronger tissue responds better to the later blocks.`;
    whyIs = `Lágur hlutfallslegur styrkur (${pctl(str)}) og hátt fituhlutfall fyrir stöðuna (${Math.round(bf!)}%) — byggðu þverskurðarflatarmál / vöðvamassa fyrst; sterkari vefur svarar betur seinni blokkunum.`;
  } else if (lowStr && adequateComp) {
    emphasis = "max_strength";
    whyEn = `Adequate body composition but low max strength (${pctl(str)}) — has the tissue, lacks the ceiling: load heavy, low-rep, velocity-/RPE-autoregulated.`;
    whyIs = `Nægur vöðvamassi en lágur hámarksstyrkur (${pctl(str)}) — hefur vefinn, vantar þakið: þung, fá-endurtekninga vinna, hraða-/RPE-stýrð.`;
  } else if (lowStr) {
    emphasis = "hypertrophy";
    whyEn = `Low relative strength (${pctl(str)}) — build a tissue + force-production base before loading heavy.`;
    whyIs = `Lágur hlutfallslegur styrkur (${pctl(str)}) — byggðu vef- og kraftgrunn áður en þung vinna hefst.`;
  } else if (lowPow && (highStr || str != null)) {
    emphasis = "power";
    whyEn = `Strength base in place (${pctl(str)}) but low power / RFD (${pctl(pow)}) — convert strength to fast force: ballistic, contrast/complex, plyometric.`;
    whyIs = `Styrkgrunnur til staðar (${pctl(str)}) en lágt afl / RFD (${pctl(pow)}) — breyttu styrk í hraðan kraft: ballistískt, contrast/complex, plyometrics.`;
  } else if (str == null && pow == null) {
    emphasis = "strength_endurance";
    whyEn = "No strength/power test data yet — start with reconditioning / strength-endurance and screen (force plates, VBT) to set individual targets.";
    whyIs = "Engin styrk-/aflgögn enn — byrjaðu á enduruppbyggingu / styrktar-þoli og skimaðu (kraftplötur, VBT) til að setja einstaklingsmarkmið.";
  } else {
    // Balanced / no clear deficit → the standard off→pre reconditioning start, then progress the sequence.
    emphasis = "strength_endurance";
    whyEn = "Strength and power are broadly on-level for the position — start the standard reconditioning block, then progress hypertrophy → max strength → power.";
    whyIs = "Styrkur og afl eru í grófum dráttum á pari fyrir stöðuna — byrjaðu á venjulegri enduruppbyggingu, svo hypertrophy → hámarksstyrkur → afl.";
  }

  // Light position weighting: a wide/attacking player with a strength base leans toward power; keepers
  // never get an outfield body-fat penalty (kept in the why, not a hard override).
  if (emphasis === "hypertrophy" && isGk(inp.position) && !highBF) {
    emphasis = "max_strength";
    whyEn = "Goalkeeper — reactive/explosive priority; with adequate composition, raise the force ceiling rather than chase mass.";
    whyIs = "Markmaður — viðbragð/sprengikraftur í forgangi; með nægan massa, hækkaðu kraftþakið frekar en að elta massa.";
  }

  const confidence: PreseasonEmphasisRead["confidence"] =
    needsBodyComp || (str == null && pow == null) ? "low"
      : str != null && pow != null && hasBodyComp ? "high"
        : "moderate";

  return {
    emphasis,
    why: { en: whyEn + injuryNote.en, is: whyIs + injuryNote.is },
    secondary,
    confidence,
    needsBodyComp,
    cite: CITE,
  };
}

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
function pctl(p: number | null): string {
  return p == null ? "n/a" : `${Math.round(p)}th pct`;
}
