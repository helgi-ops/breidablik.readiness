/**
 * RTP clearance criteria — RULES, not AI.
 *
 * Each criterion evaluates a computed value against a cited threshold and
 * returns PASS / CAUTION / FLAG + met:boolean. The AI narrative only rephrases
 * these; it never sets a status (manifesto: rules decide, AI explains).
 *
 * PHASE 0 evaluates the criteria we have real data for (CMJ power, CMJ limb
 * asymmetry, change-of-direction high-intensity asymmetry). PHASE 2 adds the
 * force-plate battery criteria (IMTP N/kg, SLDJ RSI asymmetry, active-stiffness
 * asymmetry, unilateral iso asymmetry) once those tests are ingested.
 *
 * Thresholds: Bishop 2020 (asymmetry ≥10% concern), Aspetar RTP consensus
 * (bilateral jump ≥ pre-injury / >40 cm rough floor). Pure + unit-testable.
 */

import type { RtpCriterion, RtpStatus } from "./types";

/** Asymmetry status: <10% PASS, 10–15% CAUTION, >15% FLAG (Bishop 2020). */
export function asymmetryStatus(pct: number | null): RtpStatus {
  if (pct == null) return "NO_DATA";
  if (pct > 15) return "FLAG";
  if (pct >= 10) return "CAUTION";
  return "PASS";
}

const fmtPct = (p: number | null) => (p == null ? "—" : `${p.toFixed(1)}%`);
const fmtCm = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} cm`);

/** Build the Phase-0 clearance criteria from the values we can measure today. */
export function buildPhase0Criteria(input: {
  cmjJumpHeightCm: number | null;
  cmjAsymmetryPct: number | null;
  codHighAsymPct: number | null;
}): RtpCriterion[] {
  const criteria: RtpCriterion[] = [];

  // Bilateral explosive power — a rough readiness floor (Aspetar-style).
  if (input.cmjJumpHeightCm != null) {
    const met = input.cmjJumpHeightCm >= 40;
    criteria.push({
      key: "cmj_height",
      label: "Bilateral jump height (CMJ)",
      target: "> 40 cm",
      current: fmtCm(input.cmjJumpHeightCm),
      status: met ? "PASS" : "CAUTION",
      met,
      cite: "Aspetar RTP consensus (rough floor)",
    });
  }

  // CMJ limb asymmetry (VALD concentric/takeoff force L vs R).
  if (input.cmjAsymmetryPct != null) {
    const status = asymmetryStatus(input.cmjAsymmetryPct);
    criteria.push({
      key: "cmj_asymmetry",
      label: "CMJ limb asymmetry",
      target: "< 10%",
      current: fmtPct(input.cmjAsymmetryPct),
      status,
      met: status === "PASS",
      cite: "Bishop 2020",
    });
  }

  // Change-of-direction high-intensity L/R asymmetry.
  if (input.codHighAsymPct != null) {
    const status = asymmetryStatus(input.codHighAsymPct);
    criteria.push({
      key: "cod_high_asymmetry",
      label: "Change-of-direction asymmetry (high intensity)",
      target: "< 10%",
      current: fmtPct(input.codHighAsymPct),
      status,
      met: status === "PASS",
      cite: "Bishop 2020",
    });
  }

  return criteria;
}

/** Overall decision string from the evaluated criteria + injury state. */
export function rtpDecision(criteria: RtpCriterion[], currentlyInjured: boolean): string {
  const evaluable = criteria.filter((c) => c.status !== "NO_DATA");
  const flags = evaluable.filter((c) => c.status === "FLAG").length;
  const cautions = evaluable.filter((c) => c.status === "CAUTION").length;
  if (!evaluable.length) return "INSUFFICIENT DATA — extend the test battery before a clearance decision.";
  if (currentlyInjured || flags > 0) {
    return "NOT YET CLEARED — one or more criteria are flagged; continue targeted work and re-test.";
  }
  if (cautions > 0) {
    return "PROGRESSING — no red flags, but caution items remain; clear for graded return with monitoring.";
  }
  return "MEETS MEASURED CRITERIA — all evaluated criteria pass (note: partial battery — see coverage).";
}
