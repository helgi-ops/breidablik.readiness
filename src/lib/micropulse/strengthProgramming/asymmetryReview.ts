/**
 * A left/right asymmetry goes to the coach / physio first; the lift changes only after the coach confirms
 * (strength-day-rules brief §4b, 2026-11-23). Pure.
 *
 * Before: two rules swapped the main lift on their own: the CoD rule (≥ 15% → Bulgarian split squat) and the team
 * list's symmetry choice (CoD or VALD ≥ 10% → the one-leg lift). An asymmetry has many causes (an old injury, the
 * kicking leg, a bad test), and the brief asks for a person to look before the session changes.
 *
 * Now:
 *  - At ≥ 10% (CoD or VALD, the same line the team list used) the session keeps the two-leg lift and logs
 *    ASYMMETRY_REVIEW: the numbers, and that one tap from the coach swaps it.
 *  - The coach's tap (asymmetry_reviews, newest row) holds for 28 days: "swap" lets both rules swap as before;
 *    "keep" keeps the two-leg lift and says so (ASYMMETRY_KEPT). After 28 days a still-asymmetric player is up for
 *    review again. The 28 days (about one training block) are MicroPulse's rule, not a study's.
 *
 * Never the readiness colour.
 */

import type { AppliedAdaptation, PlayerStrengthSnapshot } from "./types";
import { reasonLabel } from "./coachReasons";

export const ASYMMETRY_REVIEW = "ASYMMETRY_REVIEW";
export const ASYMMETRY_KEPT = "ASYMMETRY_KEPT";
/** The line where a left/right gap goes to review (the team list's unilateral line, VALD panel's watch line). */
export const ASYMMETRY_REVIEW_PCT = 10;
/** How long the coach's decision holds. */
export const ASYMMETRY_REVIEW_DAYS = 28;

export type AsymmetryDecision = "swap" | "keep";
export type AsymmetryReview = {
  decision: AsymmetryDecision;
  /** ISO timestamp or date of the coach's tap. */
  decidedAt: string;
  /** The % the coach saw when deciding. */
  asymPct?: number | null;
  reason?: string | null;
};

const DAY = 86_400_000;
const r0 = (n: number) => Math.round(n);

/** The player's largest gap and where it comes from (CoD from the GPS unit, VALD from NordBord / ForceFrame). */
export function asymmetryRead(snap: Pick<PlayerStrengthSnapshot, "codAsymmetryPct" | "valdAsymmetryPct" | "codWeakerSide" | "valdWeakerSide">):
  { pct: number; source: "VALD" | "IMA CoD"; weaker: "L" | "R" | null } | null {
  const cod = snap.codAsymmetryPct ?? null;
  const vald = snap.valdAsymmetryPct ?? null;
  if (cod == null && vald == null) return null;
  const valdLeads = vald != null && (cod == null || vald >= cod);
  return valdLeads
    ? { pct: vald!, source: "VALD", weaker: snap.valdWeakerSide ?? null }
    : { pct: cod!, source: "IMA CoD", weaker: snap.codWeakerSide ?? null };
}

/** The coach's decision, when it is still in force today. */
export function activeReview(snap: Pick<PlayerStrengthSnapshot, "asymmetryReview" | "todayIso">): AsymmetryReview | null {
  const r = snap.asymmetryReview;
  if (!r) return null;
  const age = (Date.parse(`${snap.todayIso}T00:00:00Z`) - Date.parse(`${r.decidedAt.slice(0, 10)}T00:00:00Z`)) / DAY;
  return age >= 0 && age <= ASYMMETRY_REVIEW_DAYS ? r : null;
}

/** True only when the coach confirmed the swap within the last 28 days. */
export function asymmetrySwapAllowed(snap: Pick<PlayerStrengthSnapshot, "asymmetryReview" | "todayIso">): boolean {
  return activeReview(snap)?.decision === "swap";
}

/** Suffix for the swap rules' action line: who decided and when. */
export function confirmedNote(snap: Pick<PlayerStrengthSnapshot, "asymmetryReview" | "todayIso">): { en: string; is: string } {
  const r = activeReview(snap);
  if (r?.decision !== "swap") return { en: "", is: "" };
  const d = r.decidedAt.slice(0, 10);
  const en = reasonLabel("asym_swap", r.reason, false);
  const is = reasonLabel("asym_swap", r.reason, true);
  return { en: ` Coach confirmed the swap on ${d}${en ? ` (${en})` : ""}.`, is: ` Þjálfari staðfesti skiptin ${d}${is ? ` (${is})` : ""}.` };
}

/**
 * The audit line for a gap at or over the review line that is NOT confirmed: up for review (no decision, or an old
 * one) or kept by the coach. Null below the line or when the swap is confirmed.
 */
export function asymmetryReviewAudit(snap: PlayerStrengthSnapshot): AppliedAdaptation | null {
  const a = asymmetryRead(snap);
  if (!a || a.pct < ASYMMETRY_REVIEW_PCT) return null;
  const r = activeReview(snap);
  if (r?.decision === "swap") return null;
  const side = a.weaker ? { en: ` (weaker: ${a.weaker === "L" ? "left" : "right"})`, is: ` (veikari: ${a.weaker === "L" ? "vinstri" : "hægri"})` } : { en: "", is: "" };
  const triggerEN = `Left/right gap ${r0(a.pct)}% (${a.source})${side.en}, at or over ${ASYMMETRY_REVIEW_PCT}%`;
  const triggerIS = `Munur vinstri/hægri ${r0(a.pct)}% (${a.source})${side.is}, ${ASYMMETRY_REVIEW_PCT}% eða meira`;
  const evidence = "Bishop 2020: an inter-limb gap of about 10–15% can matter for performance and injury, and one-leg work targets the weaker side. That the coach or physio looks first, and the decision holds 28 days, is MicroPulse's rule (brief 2026-11-23).";
  if (r?.decision === "keep") {
    const d = r.decidedAt.slice(0, 10);
    const en = reasonLabel("asym_keep", r.reason, false);
    const is = reasonLabel("asym_keep", r.reason, true);
    return { ruleId: ASYMMETRY_KEPT, triggerEN, triggerIS,
      actionEN: `Kept the two-leg lift: the coach looked at it on ${d}${en ? ` (${en})` : ""}. Up for review again after ${ASYMMETRY_REVIEW_DAYS} days.`,
      actionIS: `Tveggja fóta lyftan helst: þjálfari fór yfir þetta ${d}${is ? ` (${is})` : ""}. Aftur til yfirferðar eftir ${ASYMMETRY_REVIEW_DAYS} daga.`,
      evidence };
  }
  return { ruleId: ASYMMETRY_REVIEW, triggerEN, triggerIS,
    actionEN: "Flagged for the coach / physio to review. The lift stays as planned until the coach confirms the swap to one leg at a time (one tap on Strength).",
    actionIS: "Merkt til yfirferðar hjá þjálfara / sjúkraþjálfara. Lyftan helst eins og hún var plönuð þar til þjálfari staðfestir skipti yfir í einn fót í einu (einn smellur á Styrkur).",
    evidence };
}
