/**
 * RTP clearance ENGINE — RULES, not AI.
 *
 * Each criterion evaluates a computed value against a cited threshold →
 * PASS / CAUTION / FLAG + met:boolean, tagged with a clinical DOMAIN. Domains
 * roll up (worst criterion wins) into the domain status table; the criteria
 * form the clearance checklist; the decision is derived from both. The AI
 * narrative only rephrases these (manifesto: rules decide, AI explains).
 *
 * Thresholds cited inline: Bishop 2020 (limb asymmetry ≥10% concern / ≥15% high),
 * Aspetar RTP consensus (bilateral strength / jump floors). Pure + unit-testable.
 */

import type { RtpCriterion, RtpDomain, RtpStatus } from "./types";

export const RTP_DOMAINS = [
  "Bilateral Strength",
  "Unilateral Strength",
  "Bilateral Jump",
  "Bilateral Reactive",
  "Unilateral Reactive",
  "Movement Control",
] as const;

/** Asymmetry status: <10% PASS, 10–15% CAUTION, >15% FLAG (Bishop 2020). */
export function asymmetryStatus(pct: number | null): RtpStatus {
  if (pct == null) return "NO_DATA";
  if (pct > 15) return "FLAG";
  if (pct >= 10) return "CAUTION";
  return "PASS";
}

const fmtPct = (p: number | null) => (p == null ? "—" : `${p.toFixed(1)}%`);
const fmtCm = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} cm`);

/** Build the full RTP clearance criteria from whatever values are present. */
export function buildRtpCriteria(input: {
  cmjJumpHeightCm: number | null;
  cmjAsymmetryPct: number | null;
  codHighAsymPct: number | null;
  imtpRelNkg?: number | null;
  imtpAsymPct?: number | null;
  djRsi?: number | null;
  sldjRsiAsymPct?: number | null;
  sldjStiffnessAsymPct?: number | null;
  sldjJumpHeightAsymPct?: number | null;
  unilateralIsoAsymPct?: number | null;
  valgusSeverity?: "none" | "mild" | "moderate" | "severe" | null;
}): RtpCriterion[] {
  const c: RtpCriterion[] = [];

  // ── Bilateral Strength (IMTP) ──────────────────────────────────────────────
  if (input.imtpRelNkg != null) {
    const met = input.imtpRelNkg >= 20;
    c.push({ key: "imtp_strength", domain: "Bilateral Strength", label: "Bilateral isometric strength (IMTP)", target: "> 20 N/kg", current: `${input.imtpRelNkg.toFixed(1)} N/kg`, status: met ? "PASS" : "CAUTION", met, cite: "Aspetar RTP consensus" });
  }
  if (input.imtpAsymPct != null) {
    const s = asymmetryStatus(input.imtpAsymPct);
    c.push({ key: "imtp_asymmetry", domain: "Bilateral Strength", label: "IMTP limb asymmetry", target: "< 10%", current: fmtPct(input.imtpAsymPct), status: s, met: s === "PASS", cite: "Bishop 2020" });
  }

  // ── Unilateral Strength (SLISOSQT) ─────────────────────────────────────────
  if (input.unilateralIsoAsymPct != null) {
    const s = asymmetryStatus(input.unilateralIsoAsymPct);
    c.push({ key: "unilateral_iso_asymmetry", domain: "Unilateral Strength", label: "Unilateral isometric strength asymmetry", target: "< 10%", current: fmtPct(input.unilateralIsoAsymPct), status: s, met: s === "PASS", cite: "Bishop 2020" });
  }

  // ── Bilateral Jump (CMJ) ───────────────────────────────────────────────────
  if (input.cmjJumpHeightCm != null) {
    const met = input.cmjJumpHeightCm >= 40;
    c.push({ key: "cmj_height", domain: "Bilateral Jump", label: "Bilateral jump height (CMJ)", target: "> 40 cm", current: fmtCm(input.cmjJumpHeightCm), status: met ? "PASS" : "CAUTION", met, cite: "Aspetar RTP consensus (rough floor)" });
  }
  if (input.cmjAsymmetryPct != null) {
    const s = asymmetryStatus(input.cmjAsymmetryPct);
    c.push({ key: "cmj_asymmetry", domain: "Bilateral Jump", label: "CMJ limb asymmetry", target: "< 10%", current: fmtPct(input.cmjAsymmetryPct), status: s, met: s === "PASS", cite: "Bishop 2020" });
  }

  // ── Bilateral Reactive (DJ) ────────────────────────────────────────────────
  if (input.djRsi != null) {
    const met = input.djRsi >= 2.0;
    c.push({ key: "dj_rsi", domain: "Bilateral Reactive", label: "Bilateral reactive strength (DJ RSI)", target: "> 2.0", current: input.djRsi.toFixed(2), status: met ? "PASS" : "CAUTION", met, cite: "Aspetar RTP consensus (rough floor)" });
  }

  // ── Unilateral Reactive (SLDJ) — highest clinical weight ───────────────────
  if (input.sldjRsiAsymPct != null) {
    const s = asymmetryStatus(input.sldjRsiAsymPct);
    c.push({ key: "sldj_rsi_asymmetry", domain: "Unilateral Reactive", label: "SLDJ reactive strength asymmetry", target: "< 10%", current: fmtPct(input.sldjRsiAsymPct), status: s, met: s === "PASS", cite: "Bishop 2020" });
  }
  if (input.sldjJumpHeightAsymPct != null) {
    const s = asymmetryStatus(input.sldjJumpHeightAsymPct);
    c.push({ key: "sldj_jumpheight_asymmetry", domain: "Unilateral Reactive", label: "SLDJ jump-height asymmetry", target: "< 10%", current: fmtPct(input.sldjJumpHeightAsymPct), status: s, met: s === "PASS", cite: "Bishop 2020" });
  }
  if (input.sldjStiffnessAsymPct != null) {
    const s = input.sldjStiffnessAsymPct;
    const status: RtpStatus = s > 20 ? "FLAG" : s >= 15 ? "CAUTION" : "PASS";
    c.push({ key: "sldj_stiffness_asymmetry", domain: "Unilateral Reactive", label: "SLDJ active-stiffness asymmetry", target: "< 15%", current: fmtPct(s), status, met: status === "PASS", cite: "RTP consensus" });
  }

  // ── Movement Control (change of direction + dynamic valgus) ────────────────
  if (input.codHighAsymPct != null) {
    const s = asymmetryStatus(input.codHighAsymPct);
    c.push({ key: "cod_high_asymmetry", domain: "Movement Control", label: "Change-of-direction asymmetry (high intensity)", target: "< 10%", current: fmtPct(input.codHighAsymPct), status: s, met: s === "PASS", cite: "Bishop 2020" });
  }
  if (input.valgusSeverity) {
    const sev = input.valgusSeverity;
    const status: RtpStatus = sev === "none" ? "PASS" : sev === "mild" ? "CAUTION" : "FLAG";
    c.push({ key: "dynamic_valgus", domain: "Movement Control", label: "Dynamic valgus (single-leg, coach-assessed)", target: "Minimal / none", current: sev, status, met: status === "PASS", cite: "Coach video assessment" });
  }

  return c;
}

/** Rule-derived, cited recommendations from the flagged/caution criteria. */
const REC_MAP: Record<string, string> = {
  imtp_strength: "Progress bilateral maximal-strength loading and re-test IMTP.",
  imtp_asymmetry: "Unilateral heavy strength on the weaker limb to close the IMTP gap.",
  unilateral_iso_asymmetry: "Progressive unilateral loading (split squat, single-leg press/RDL), emphasis on the involved limb.",
  cmj_height: "Bilateral power development (jump squats, trap-bar jumps) to raise CMJ output.",
  cmj_asymmetry: "Unilateral power work to balance limb contribution in bilateral jumping.",
  dj_rsi: "Reactive-strength / stiffness progression (low-amplitude hops → drop jumps) to raise DJ RSI.",
  sldj_rsi_asymmetry: "Graduated single-leg plyometrics (hops → drop jumps from increasing height); quality of ground contact on the involved limb.",
  sldj_jumpheight_asymmetry: "Single-leg power + landing volume on the involved limb.",
  sldj_stiffness_asymmetry: "Encourage a compliant (not guarded) single-leg landing; perturbation + tendon-stiffness work.",
  cod_high_asymmetry: "Controlled change-of-direction and deceleration drills with balanced L/R exposure and knee-over-toe alignment.",
  dynamic_valgus: "Hip abductor / external-rotator strength + single-leg control with visual feedback; progress to sport-specific cutting with knee-over-toe cueing.",
};

export function buildRtpRecommendations(criteria: RtpCriterion[], currentlyInjured: boolean): string[] {
  const flags = criteria.filter((c) => c.status === "FLAG");
  const cautions = criteria.filter((c) => c.status === "CAUTION");
  const recs: string[] = [];
  for (const c of [...flags, ...cautions]) {
    const r = REC_MAP[c.key];
    if (r) {
      const line = `${c.status === "FLAG" ? "High" : "Moderate"} priority — ${r}`;
      if (!recs.includes(line)) recs.push(line);
    }
  }
  if (currentlyInjured) recs.push("Continue medical-led rehab; re-test the full battery in 2–3 weeks before progressing sport exposure.");
  if (!recs.length) recs.push("All evaluated criteria pass — progress sport exposure with monitoring; re-test to confirm.");
  return recs;
}

const RANK: Record<RtpStatus, number> = { FLAG: 3, CAUTION: 2, PASS: 1, NO_DATA: 0 };

/** Roll criteria up into per-domain status (worst criterion wins) + key finding. */
export function buildRtpDomains(criteria: RtpCriterion[]): RtpDomain[] {
  const byDomain = new Map<string, RtpCriterion[]>();
  for (const cr of criteria) {
    if (!cr.domain) continue;
    const list = byDomain.get(cr.domain) ?? [];
    list.push(cr);
    byDomain.set(cr.domain, list);
  }
  const out: RtpDomain[] = [];
  for (const domain of RTP_DOMAINS) {
    const cs = byDomain.get(domain);
    if (!cs || !cs.length) continue;
    const worst = cs.reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a));
    out.push({ domain, status: worst.status, keyFinding: `${worst.label}: ${worst.current}` });
  }
  return out;
}

/**
 * Overall decision/summary. RTP mode (injured/returning) uses clearance
 * language; ASSESSMENT mode (healthy profile) is a neutral benchmark summary —
 * no "cleared / not yet cleared".
 */
export function rtpDecision(criteria: RtpCriterion[], currentlyInjured: boolean, mode: "RTP" | "ASSESSMENT" = "RTP"): string {
  const evaluable = criteria.filter((c) => c.status !== "NO_DATA");
  const flags = evaluable.filter((c) => c.status === "FLAG").length;
  const cautions = evaluable.filter((c) => c.status === "CAUTION").length;
  if (!evaluable.length) return "INSUFFICIENT DATA — extend the test battery to assess.";

  if (mode === "ASSESSMENT") {
    if (flags > 0) return `ASSESSMENT — ${flags} benchmark${flags > 1 ? "s" : ""} flagged${cautions ? `, ${cautions} caution` : ""}; targeted work indicated.`;
    if (cautions > 0) return `ASSESSMENT — within range, ${cautions} caution item${cautions > 1 ? "s" : ""} to monitor.`;
    return "ASSESSMENT — all measured benchmarks within target.";
  }

  if (currentlyInjured || flags > 0) {
    return "NOT YET CLEARED — one or more criteria are flagged; continue targeted work and re-test.";
  }
  if (cautions > 0) {
    return "PROGRESSING — no red flags, but caution items remain; clear for graded return with monitoring.";
  }
  return "MEETS MEASURED CRITERIA — all evaluated criteria pass (note: partial battery — see coverage).";
}
