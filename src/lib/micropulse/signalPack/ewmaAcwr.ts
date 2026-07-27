/**
 * EWMA acute:chronic ratio + the trigger primitive shared by every ACWR-style signal
 * (internal sRPE load, deceleration load, high-speed running).
 *
 * EWMA weights recent load and reduces the rolling-average ACWR's known bias
 * (Williams 2017; Majumdar 2022). It's a LENS on the player's own load history, never an
 * independent "risk score". A trigger fires only when the player's OWN ratio exceeds his
 * threshold, and carries the mandatory counterfactual (Saberisani 2025 for the GPS ones).
 */

import { coverageConfidence, type Bi, type SignalContributor, type Voice } from "./types";

/** EWMA at the last point of a daily series (oldest → newest). λ = 2/(span+1). Null if empty. */
export function ewma(daily: number[], span: number): number | null {
  if (!daily.length) return null;
  const alpha = 2 / (span + 1);
  let e = daily[0];
  for (let i = 1; i < daily.length; i++) e = alpha * daily[i] + (1 - alpha) * e;
  return e;
}

export interface EwmaAcwr {
  acute: number | null;
  chronic: number | null;
  /** acute ÷ chronic, or null when chronic is 0/absent (no-data, never fabricated). */
  ratio: number | null;
}

/** EWMA acute:chronic from a 0-filled daily load series (rest days count as 0). */
export function ewmaAcwr(daily: number[], acuteSpan = 7, chronicSpan = 28): EwmaAcwr {
  const acute = ewma(daily, acuteSpan);
  const chronic = ewma(daily, chronicSpan);
  const ratio = acute != null && chronic != null && chronic > 0 ? acute / chronic : null;
  return { acute, chronic, ratio };
}

export interface AcwrContributorInput {
  key: string;
  /** Plain metric name — "training load", "deceleration load", "high-speed running". */
  metric: Bi;
  acwr: EwmaAcwr;
  /** Days of load observed (for confidence). */
  coverageDays: number;
  /** Ratio at/above which the signal flags (default 1.5 — Gabbett danger zone). */
  flagAt?: number;
  /** Ratio at/below which it would clear (default 1.3). */
  clearAt?: number;
  /** Optional label for the acute:chronic windows in the detail string (default "7d:28d"). */
  acuteSpanLabel?: string;
  citation: string;
  /** Audience voice for the why/counterfactual (default "coach"). */
  voice?: Voice;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Build an ACWR "why" contributor. Returns null when the ratio can't be computed (no
 * chronic base yet → no-data, not a fabricated zero). Flags only above the player's own
 * threshold; the counterfactual is a real "if ≤clearAt× → clears".
 */
export function acwrContributor(input: AcwrContributorInput): SignalContributor | null {
  const { key, metric, acwr, coverageDays, citation } = input;
  const flagAt = input.flagAt ?? 1.5;
  const clearAt = input.clearAt ?? 1.3;
  if (acwr.ratio == null) return null;
  const r = acwr.ratio;
  const flagged = r >= flagAt;
  // Severity ramps from the clear line to well past the flag line (ranking only).
  const severity = clamp01((r - clearAt) / (flagAt + 0.4 - clearAt));
  const rx = `${r.toFixed(1)}×`;

  // All three ACWR metrics (æfingaálag, hemlunar-álag, háhraðahlaup) are neuter → "þitt".
  const player = (input.voice ?? "coach") === "player";
  const metricEn = metric.en, metricIs = metric.is;
  const why: Bi = flagged
    ? player
      ? { en: `Your ${metricEn} is running ${rx} your recent norm — a sharp spike.`, is: `${cap(metricIs)} þitt er ${rx} nýlegri venju þinni — snöggt stökk.` }
      : { en: `His ${metricEn} is running ${rx} his recent norm — a sharp spike.`, is: `${cap(metricIs)} hans er ${rx} nýlega venju — snöggt stökk.` }
    : r <= 0.85
      ? player
        ? { en: `Your ${metricEn} is well below your recent norm (${rx}).`, is: `${cap(metricIs)} þitt er vel undir nýlegri venju þinni (${rx}).` }
        : { en: `His ${metricEn} is well below his recent norm (${rx}).`, is: `${cap(metricIs)} hans er vel undir nýlegri venju (${rx}).` }
      : player
        ? { en: `Your ${metricEn} is in line with your recent norm (${rx}).`, is: `${cap(metricIs)} þitt er í takt við nýlega venju þína (${rx}).` }
        : { en: `His ${metricEn} is in line with his recent norm (${rx}).`, is: `${cap(metricIs)} hans er í takt við nýlega venju (${rx}).` };

  const counterfactual: Bi | null = flagged
    ? player
      ? { en: `Your ${metricEn} ran ${rx} your 4-week norm → flagged; ≤${clearAt.toFixed(1)}× → clears.`, is: `${cap(metricIs)} þitt var ${rx} 4-vikna venju þinni → flagg; ≤${clearAt.toFixed(1)}× → hreinsast.` }
      : { en: `${cap(metricEn)} ran ${rx} his 4-week norm → flag; had it been ≤${clearAt.toFixed(1)}× → clears.`, is: `${cap(metricIs)} var ${rx} 4-vikna venju → flagg; hefði það verið ≤${clearAt.toFixed(1)}× → hreinsast.` }
    : null;

  const detail: Bi = {
    en: `EWMA acute:chronic (${input.acuteSpanLabel ?? "7d:28d"}) = ${acwr.acute?.toFixed(0) ?? "—"} ÷ ${acwr.chronic?.toFixed(0) ?? "—"} = ${rx}. Flag ≥${flagAt.toFixed(1)}×, clear ≤${clearAt.toFixed(1)}×. Own-norm; a lens, not a risk score.`,
    is: `EWMA bráð:langvinnt (${input.acuteSpanLabel ?? "7d:28d"}) = ${acwr.acute?.toFixed(0) ?? "—"} ÷ ${acwr.chronic?.toFixed(0) ?? "—"} = ${rx}. Flagg ≥${flagAt.toFixed(1)}×, hreinsast ≤${clearAt.toFixed(1)}×. Eigin-norm; linsa, ekki áhættutala.`,
  };

  return {
    key,
    label: { en: `${cap(metricEn)} spike`, is: `${cap(metricIs)} stökk` },
    why, counterfactual, citation,
    confidence: coverageConfidence(coverageDays),
    severity,
    flagged,
    detail,
  };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
