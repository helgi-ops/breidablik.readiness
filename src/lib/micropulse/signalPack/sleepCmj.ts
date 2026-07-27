/**
 * Sleep quality + CMJ jump height / asymmetry as first-read "why" contributors.
 *
 * On the closest 25-player analogue, sleep quality was the #1 injury-associated variable
 * and CMJ jump height top-3 (Haller 2023). All read on the player's OWN norm; no-data
 * (no check-in / no CMJ that window) → no signal, never a fabricated 0.
 */

import { coverageConfidence, type Bi, type SignalContributor, type Voice } from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface SleepInput {
  /** Recent sleep-quality (1–5, 5 = best) — e.g. last few nights' mean. */
  recent: number | null;
  /** The player's own baseline mean/SD of sleep quality. */
  baselineMean: number | null;
  baselineSd: number | null;
  coverageDays: number;
  /** Audience voice for the why/counterfactual (default "coach"). */
  voice?: Voice;
}

/** Sleep contributor — a dip BELOW his own usual sleep. Null when no recent sleep data. */
export function sleepContributor(input: SleepInput): SignalContributor | null {
  const { recent, baselineMean, baselineSd, coverageDays } = input;
  if (recent == null) return null;
  const z = baselineMean != null && baselineSd != null && baselineSd > 0.2 ? (recent - baselineMean) / baselineSd : 0;
  const flagged = z <= -1;
  const severity = clamp01(-z / 2); // −1σ→0.5, −2σ→1
  const usual = baselineMean != null ? baselineMean.toFixed(1) : null;
  const player = (input.voice ?? "coach") === "player"; // "svefn" masculine → "þinn"

  const why: Bi = flagged
    ? player
      ? { en: `Your sleep has been below your usual lately.`, is: `Svefn þinn hefur verið undir venju þinni undanfarið.` }
      : { en: `His sleep has been below his usual lately.`, is: `Svefn hans hefur verið undir hans venju undanfarið.` }
    : z >= 1
      ? player
        ? { en: `You're sleeping better than your usual.`, is: `Þú sefur betur en venjulega.` }
        : { en: `He's sleeping better than his usual.`, is: `Hann sefur betur en venjulega.` }
      : player
        ? { en: `Your sleep is around your usual.`, is: `Svefn þinn er um venju þína.` }
        : { en: `His sleep is around his usual.`, is: `Svefn hans er um hans venju.` };

  const counterfactual: Bi | null = flagged && usual
    ? player
      ? { en: `If your sleep were back to your usual (~${usual}/5) → this clears.`, is: `Ef svefn þinn væri aftur á venju þinni (~${usual}/5) → þetta hreinsast.` }
      : { en: `If his sleep were back to his usual (~${usual}/5) → this clears.`, is: `Ef svefn hans væri aftur á hans venju (~${usual}/5) → þetta hreinsast.` }
    : null;

  return {
    key: "sleep",
    label: { en: "Sleep quality", is: "Svefngæði" },
    why, counterfactual,
    citation: "Haller 2023",
    confidence: coverageConfidence(coverageDays),
    severity, flagged,
    detail: {
      en: `Sleep quality ${recent.toFixed(1)}/5 vs his own norm ${usual ?? "—"} (z ${z.toFixed(1)}). Flag ≤ −1σ. Own-norm; self-reported.`,
      is: `Svefngæði ${recent.toFixed(1)}/5 vs eigin venja ${usual ?? "—"} (z ${z.toFixed(1)}). Flagg ≤ −1σ. Eigin-norm; sjálfsmat.`,
    },
  };
}

export interface CmjJumpInput {
  /** Latest CMJ jump height (cm). */
  latest: number | null;
  /** Player's own baseline mean/SD of jump height (cm). */
  baselineMean: number | null;
  baselineSd: number | null;
  /** Number of CMJ tests in the baseline window (for confidence). */
  testCount: number;
  /** Audience voice for the why/counterfactual (default "coach"). */
  voice?: Voice;
}

/** CMJ jump-height contributor — a drop BELOW his own norm (neuromuscular fatigue). */
export function cmjJumpContributor(input: CmjJumpInput): SignalContributor | null {
  const { latest, baselineMean, baselineSd, testCount } = input;
  if (latest == null) return null;
  const z = baselineMean != null && baselineSd != null && baselineSd > 0.3 ? (latest - baselineMean) / baselineSd : 0;
  const flagged = z <= -1;
  const severity = clamp01(-z / 2);
  const usual = baselineMean != null ? `${baselineMean.toFixed(1)} cm` : null;
  const player = (input.voice ?? "coach") === "player"; // "stökkhæð" feminine → "þín"

  const why: Bi = flagged
    ? player
      ? { en: `Your jump height is down vs your own baseline — possible neuromuscular fatigue.`, is: `Stökkhæð þín er niðri vs eigin grunnlínu — hugsanleg tauga-vöðva þreyta.` }
      : { en: `His jump height is down vs his own baseline — possible neuromuscular fatigue.`, is: `Stökkhæð hans er niðri vs eigin grunnlínu — hugsanleg tauga-vöðva þreyta.` }
    : player
      ? { en: `Your jump height is at or above your own baseline.`, is: `Stökkhæð þín er á eða yfir eigin grunnlínu.` }
      : { en: `His jump height is at or above his own baseline.`, is: `Stökkhæð hans er á eða yfir eigin grunnlínu.` };

  const counterfactual: Bi | null = flagged && usual
    ? player
      ? { en: `If your jump returned to your baseline (~${usual}) → this clears.`, is: `Ef stökkið færi aftur á grunnlínu þína (~${usual}) → þetta hreinsast.` }
      : { en: `If his jump returned to his baseline (~${usual}) → this clears.`, is: `Ef stökkið færi aftur á grunnlínu (~${usual}) → þetta hreinsast.` }
    : null;

  return {
    key: "cmj_jump",
    label: { en: "Jump height", is: "Stökkhæð" },
    why, counterfactual,
    citation: "Haller 2023",
    confidence: testCount >= 6 ? "high" : testCount >= 3 ? "moderate" : "low",
    severity, flagged,
    detail: {
      en: `CMJ jump ${latest.toFixed(1)} cm vs his baseline ${usual ?? "—"} (z ${z.toFixed(1)}, n=${testCount}). Flag ≤ −1σ. Own-norm.`,
      is: `CMJ stökk ${latest.toFixed(1)} cm vs grunnlína ${usual ?? "—"} (z ${z.toFixed(1)}, n=${testCount}). Flagg ≤ −1σ. Eigin-norm.`,
    },
  };
}

export interface CmjAsymInput {
  /** Latest CMJ L/R asymmetry (%). */
  asymPct: number | null;
  testCount: number;
  /** Absolute flag threshold (default 10%). */
  flagAt?: number;
}

/** CMJ asymmetry contributor — an inherently within-player L/R imbalance (own-norm by nature). */
export function cmjAsymContributor(input: CmjAsymInput): SignalContributor | null {
  const { asymPct, testCount } = input;
  if (asymPct == null) return null;
  const flagAt = input.flagAt ?? 10;
  const a = Math.abs(asymPct);
  const flagged = a > flagAt;
  const severity = Math.max(0, Math.min(1, (a - 5) / 15)); // 5%→0, 20%→1

  const why: Bi = flagged
    ? { en: `Left–right jump asymmetry is elevated (${a.toFixed(0)}%).`, is: `Vinstri–hægri ósamhverfa í stökki er hækkuð (${a.toFixed(0)}%).` }
    : { en: `Left–right jump balance is within range (${a.toFixed(0)}%).`, is: `Vinstri–hægri jafnvægi í stökki er innan marka (${a.toFixed(0)}%).` };

  const counterfactual: Bi | null = flagged
    ? { en: `If asymmetry were ≤${flagAt}% → this clears.`, is: `Ef ósamhverfan væri ≤${flagAt}% → þetta hreinsast.` }
    : null;

  return {
    key: "cmj_asym",
    label: { en: "Jump asymmetry", is: "Stökk-ósamhverfa" },
    why, counterfactual,
    citation: "Haller 2023",
    confidence: testCount >= 3 ? "high" : testCount >= 1 ? "moderate" : "low",
    severity, flagged,
    detail: {
      en: `CMJ L/R asymmetry ${a.toFixed(0)}% (n=${testCount}). Flag > ${flagAt}%. A within-player L/R comparison.`,
      is: `CMJ V/H ósamhverfa ${a.toFixed(0)}% (n=${testCount}). Flagg > ${flagAt}%. Samanburður innan leikmanns (V/H).`,
    },
  };
}
