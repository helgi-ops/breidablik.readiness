/**
 * Training monotony vs the player's OWN average (Rico-González 2023's Rossi rule; Foster).
 * Monotony = weekly mean ÷ SD of daily load — high = every day the same = risk. Expressed
 * relative to the player's own rolling monotony, in Rossi's IF-THEN style.
 */

import { coverageConfidence, type Bi, type SignalContributor, type Voice } from "./types";

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
}

/** Foster monotony of a week's daily loads: mean ÷ SD, capped (a flat week → very samey). */
export function weeklyMonotony(weekLoads: number[]): number | null {
  if (weekLoads.length < 3) return null;
  const m = mean(weekLoads);
  const sd = stdev(weekLoads);
  if (m == null || m <= 0) return null;
  if (sd == null || sd < 1) return 3; // ~no variation → maximally monotonous (Foster caps high)
  return Math.min(3, m / sd);
}

export interface MonotonyInput {
  /** This week's daily loads (rest days included as 0). */
  weekLoads: number[];
  /** The player's own average weekly monotony (from prior weeks), or null if unknown. */
  monotonyNorm: number | null;
  coverageDays: number;
  citation?: string;
  /** Audience voice for the why string (default "coach"). */
  voice?: Voice;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Monotony contributor. Null when the week is too thin to compute. Flags when this week is
 * markedly more monotonous than the player's usual (≥1.5× his norm) or high in absolute
 * Foster terms (≥2). Counterfactual: restore his usual day-to-day variation.
 */
export function monotonyContributor(input: MonotonyInput): SignalContributor | null {
  const monotony = weeklyMonotony(input.weekLoads);
  if (monotony == null) return null;
  const norm = input.monotonyNorm;
  const ratio = norm && norm > 0 ? monotony / norm : null;
  const flagged = (ratio != null && ratio >= 1.5) || monotony >= 2;
  const severity = clamp01((monotony - 1) / 1.5); // 1→0 … 2.5→1
  const mStr = monotony.toFixed(1);
  const rStr = ratio != null ? `${ratio.toFixed(1)}×` : null;

  // "vika" is feminine → "þín"; "æfingar" feminine plural → "þínar".
  const player = (input.voice ?? "coach") === "player";
  const why: Bi = flagged
    ? rStr
      ? player
        ? { en: `Your week is ${rStr} as samey as usual — little hard/easy variation.`, is: `Vikan þín er ${rStr} eins-leit og venjulega — lítil hörð/létt tilbreyting.` }
        : { en: `His week is ${rStr} as samey as usual — little hard/easy variation.`, is: `Vikan hans er ${rStr} eins-leit og venjulega — lítil hörð/létt tilbreyting.` }
      : player
        ? { en: `Your training is very samey this week — little hard/easy variation.`, is: `Æfingar þínar eru mjög eins-leitar þessa viku — lítil hörð/létt tilbreyting.` }
        : { en: `His training is very samey this week — little hard/easy variation.`, is: `Æfingar hans eru mjög eins-leitar þessa viku — lítil hörð/létt tilbreyting.` }
    : player
      ? { en: `Your week has healthy hard/easy variation.`, is: `Vikan þín hefur heilbrigða hörð/létt tilbreytingu.` }
      : { en: `His week has healthy hard/easy variation.`, is: `Vikan hans hefur heilbrigða hörð/létt tilbreytingu.` };

  const counterfactual: Bi | null = flagged
    ? { en: `Add day-to-day variation (one clearly hard + one easy day) → monotony drops back toward his usual and this clears.`, is: `Bættu við tilbreytingu (einn skýrt harður + einn léttur dagur) → einsleitni fellur að hans venju og þetta hreinsast.` }
    : null;

  const detail: Bi = {
    en: `Weekly monotony = mean ÷ SD of daily load = ${mStr}${norm ? ` (his usual ≈ ${norm.toFixed(1)})` : ""}. Flag ≥1.5× own norm or ≥2 absolute (Foster). Own-norm; a lens, not a risk score.`,
    is: `Vikuleg einsleitni = meðaltal ÷ staðalfrávik dagálags = ${mStr}${norm ? ` (venja ≈ ${norm.toFixed(1)})` : ""}. Flagg ≥1.5× eigin venju eða ≥2 algilt (Foster). Eigin-norm; linsa, ekki áhættutala.`,
  };

  return {
    key: "monotony",
    label: { en: "Training monotony", is: "Æfinga-einsleitni" },
    why, counterfactual,
    citation: input.citation ?? "Rico-González 2023 · Foster 1998",
    confidence: coverageConfidence(input.coverageDays),
    severity, flagged, detail,
  };
}
