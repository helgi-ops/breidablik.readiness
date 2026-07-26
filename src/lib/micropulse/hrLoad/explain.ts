/**
 * Shared, pure explainability helpers for the HR-vs-sRPE cross-check — used by BOTH
 * the Heart Rate Intelligence page and the Load & RPE tab's HrLoadCrossCheckCard, so
 * the counterfactual and confidence wording can never drift between them.
 */

import { DIVERGENCE_GAP, MIN_MATURE_HR_SESSIONS, type Bi, type HrLoadSession, type HrLoadRead } from "./index";

/**
 * The manifesto's mandatory counterfactual for a flagged session: what would have to
 * change for it to read as aligned. Derived straight from the signed gap and the ±25
 * divergence line — no invented numbers. `excess` = how far past the line it sits.
 */
export function counterfactual(s: HrLoadSession | null | undefined): Bi | null {
  if (!s || s.gap == null) return null;
  const excess = Math.round(Math.abs(s.gap) - DIVERGENCE_GAP);
  if (excess <= 0) return null;
  if (s.alignment === "hidden_load") {
    return {
      en: `If his HR load had come in ~${excess} index points lower — or he'd rated the session that much harder — the gap would sit inside ±${DIVERGENCE_GAP} and this would read aligned.`,
      is: `Ef HR-álagið hefði verið ~${excess} vísitölustigum lægra — eða hann metið lotuna sem því erfiðari — færi bilið inn fyrir ±${DIVERGENCE_GAP} og læsist samræmt.`,
    };
  }
  if (s.alignment === "low_cardio_response") {
    return {
      en: `If his effort rating had been ~${excess} index points lower — or his heart had worked that much harder — the gap would sit inside ±${DIVERGENCE_GAP} and this would read aligned.`,
      is: `Ef áreynslumatið hefði verið ~${excess} vísitölustigum lægra — eða hjartað unnið því meira — færi bilið inn fyrir ±${DIVERGENCE_GAP} og læsist samræmt.`,
    };
  }
  return null;
}

/** Plain-language reason for the confidence level — the real gate, not just a chip. */
export function confidenceReason(read: HrLoadRead): Bi {
  const n = read.baseline.hrSessions;
  if (n < MIN_MATURE_HR_SESSIONS) {
    return {
      en: `${n} belt session${n === 1 ? "" : "s"} — needs ${MIN_MATURE_HR_SESSIONS} before his HR baseline is trustworthy`,
      is: `${n} beltis-lot${n === 1 ? "a" : "ur"} — þarf ${MIN_MATURE_HR_SESSIONS} áður en HR-viðmiðun er áreiðanleg`,
    };
  }
  if (!read.dataCoverage.hasPctMax) {
    return {
      en: `${n} belt sessions, but HRmax isn't set — intensity is read as ordinal bands only`,
      is: `${n} beltis-lotur, en HRmax er ekki stillt — ákefð lesin sem raðbönd eingöngu`,
    };
  }
  return read.confidence === "high"
    ? { en: `${n} belt sessions with %HRmax — mature baseline`, is: `${n} beltis-lotur með %HRmax — þroskuð viðmiðun` }
    : { en: `${n} belt sessions with %HRmax`, is: `${n} beltis-lotur með %HRmax` };
}
