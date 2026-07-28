/**
 * "Is this verdict estimated?" — the rule, kept out of the component so it is
 * testable and so every surface answers it identically.
 *
 * BACKGROUND
 * ----------
 * When a player does not check in, the system writes an IMPUTED readiness entry
 * (currently `rolling_10d_median`). The mp_apply_hybrid_readiness trigger still
 * computes a colour and a training_action for that row — which is reasonable, an
 * estimate beats a blank card — and it correctly EXCLUDES imputed rows from the
 * player's 28-day personal baseline, so the norm itself stays clean.
 *
 * What was missing is provenance at the point of decision. An imputed row is a
 * claim about the DATA ("he did not answer"), not about the ATHLETE, and until
 * v_coach_readiness_today_v8 exposed `is_imputed` (migration 20260721090000) no
 * surface could tell the two apart. On 2026-07-20, 21 of 24 verdicts on one
 * club's dashboard were estimates presented identically to real answers.
 *
 * This is the same null-vs-zero discipline the ingestion layer applies to a
 * missing GPS lock: show the number, but never let an estimate impersonate a
 * measurement.
 */

export type Lang = "EN" | "IS";

/** Minimal shape needed to judge provenance — any view row satisfies it. */
export type ImputableRow = {
  is_imputed?: boolean | null;
  imputed_method?: string | null;
};

/**
 * True when the verdict on this row was computed from an estimated check-in
 * rather than a real one. Absent/null is treated as NOT imputed: rows written
 * before the flag existed were real check-ins, and defaulting the other way
 * would mark historical data as estimated.
 */
export function isEstimatedVerdict(row: ImputableRow | null | undefined): boolean {
  return row?.is_imputed === true;
}

export type EstimatedMarkerCopy = { label: string; tip: string };

/**
 * Bilingual copy for the marker. Deliberately plain — no "imputed", no
 * "rolling median" in the label itself; the method belongs in the tooltip where
 * a curious coach can find it, per the layered-read rule.
 */
export function estimatedMarkerCopy(lang: Lang = "EN"): EstimatedMarkerCopy {
  return lang === "IS"
    ? {
        label: "áætlað",
        tip:
          "Leikmaðurinn skráði sig ekki í dag. Tölurnar hér að neðan eru áætlaðar út frá " +
          "miðgildi síðustu 10 daga. Áætlaðar færslur telja ekki inn í persónulega grunnlínu hans.",
      }
    : {
        label: "estimated",
        tip:
          "This player did not check in today. The scores below are estimated from his last " +
          "10 days (rolling median). Estimated entries are excluded from his personal baseline.",
      };
}

/**
 * Share of verdicts in a set that are estimates, 0-1. Used to decide whether a
 * squad-level surface should caveat itself ("most of today's picture is
 * estimated") rather than leaving the coach to count badges.
 */
export function estimatedShare(rows: ReadonlyArray<ImputableRow>): number {
  if (rows.length === 0) return 0;
  return rows.filter(isEstimatedVerdict).length / rows.length;
}
