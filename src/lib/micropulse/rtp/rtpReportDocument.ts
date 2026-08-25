/**
 * RtpAssessment → ReportDocument (the report layer's shared shape, which the
 * PDF renderer and on-screen report both consume via buildPdfRenderModel).
 *
 * Pure/serialisable — no server-only imports, so the client page can build the
 * document and hand it to downloadReportPdf. The `narrative` (AI prose) is
 * threaded in as the summary/executive TEXT; when absent the deterministic
 * summaryLine is used so the report always renders.
 */

import type { ReportDocument, ReportSection } from "@/lib/micropulse/reporting/types";
import type { RtpAssessment, RtpCriterion } from "./types";
import { computeSprintCost } from "@/lib/micropulse/load/criticalSpeed";

/** CS/D′ inputs for the optional sprint-capacity section (same source as the Conditioning card). */
export type RtpSprintInput = { csKmh: number; dPrimeM: number; dPrimePercentile?: number | null; mssKmh?: number | null };

const n1 = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${Number(v).toFixed(1)}${unit}`);
const n0 = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${Math.round(Number(v))}${unit}`);
const statusLabel: Record<RtpCriterion["status"], string> = { PASS: "PASS", CAUTION: "CAUTION", FLAG: "FLAG", NO_DATA: "—" };

export function buildRtpReportDocument(a: RtpAssessment, narrative?: string | null, sprint?: RtpSprintInput | null): ReportDocument {
  const sections: ReportSection[] = [];

  // 1. Athlete & injury context
  const ctx: Record<string, string>[] = [
    { metric: "Athlete", value: a.player.fullName },
    { metric: "Position", value: a.player.position ?? "—" },
    { metric: "Age", value: a.player.ageYears == null ? "—" : `${a.player.ageYears}` },
    { metric: "Body mass", value: n1(a.player.bodyMassKg, " kg") },
    { metric: "Assessment date", value: a.assessmentDate },
    { metric: "Testing system", value: "VALD ForceDecks" },
  ];
  if (a.injury) {
    ctx.push(
      { metric: "Injury", value: [a.injury.severity, a.injury.type ?? a.injury.bodyPart, a.injury.bodySide && a.injury.bodySide !== "na" ? `(${a.injury.bodySide})` : ""].filter(Boolean).join(" ") || "—" },
      { metric: "Time post-injury", value: a.injury.weeksPostInjury == null ? "—" : `${a.injury.weeksPostInjury} weeks` },
      { metric: "RTP stage", value: a.injury.stage == null ? "—" : `${a.injury.stage} / 5` },
    );
  }
  sections.push({ id: "context", title: "Athlete & Injury Context", kind: "METRIC_GRID", data: ctx });

  // 1b. Domain status table (PASS/CAUTION/FLAG per clinical domain).
  if (a.domains.length) {
    sections.push({
      id: "domains",
      title: "Domain Status",
      kind: "TABLE",
      data: a.domains.map((d) => ({ domain: d.domain, status: statusLabel[d.status], key_finding: d.keyFinding })),
    });
  }

  // 2. Executive summary — AI narrative (labelled) or deterministic fallback.
  if (narrative && narrative.trim()) {
    sections.push({ id: "summary", title: "Executive Summary (AI synthesis — from the figures below)", kind: "TEXT", data: narrative.trim() });
  }

  // 3. CMJ detail
  if (a.cmj) {
    sections.push({
      id: "cmj",
      title: "Countermovement Jump (CMJ)",
      kind: "TABLE",
      data: [
        { metric: "Jump height", value: n1(a.cmj.jumpHeightCm, " cm") },
        { metric: "RSI-modified", value: n1(a.cmj.rsiMod) + (a.cmj.rsiModSource === "derived" ? " (derived)" : "") },
        { metric: "Peak power", value: n0(a.cmj.peakPowerW, " W") },
        { metric: "Rel. peak power", value: n1(a.cmj.relPeakPowerWkg, " W/kg") },
        { metric: "Peak force", value: n0(a.cmj.peakForceN, " N") },
        { metric: "Contraction time", value: n0(a.cmj.contractionTimeMs, " ms") },
        { metric: "Concentric peak velocity", value: n1(a.cmj.concentricPeakVelocityMS, " m/s") },
        { metric: "Concentric RFD", value: n0(a.cmj.concentricRfdNS, " N/s") },
        { metric: "Limb asymmetry", value: a.cmj.asymmetryPct == null ? "—" : `${n1(a.cmj.asymmetryPct, "%")}${a.cmj.asymmetrySide ? ` (${a.cmj.asymmetrySide})` : ""}` },
        { metric: "Trials (mean)", value: `${a.cmj.trialCount}` },
      ],
    });
  }

  // 3b. IMTP detail
  if (a.imtp) {
    sections.push({
      id: "imtp",
      title: "Isometric Mid-Thigh Pull (IMTP)",
      kind: "TABLE",
      data: [
        { metric: "Peak vertical force", value: n0(a.imtp.peakForceN, " N") },
        { metric: "Rel. peak force", value: n1(a.imtp.relPeakForceNkg, " N/kg") },
        { metric: "Left", value: n0(a.imtp.leftN, " N") },
        { metric: "Right", value: n0(a.imtp.rightN, " N") },
        { metric: "Limb asymmetry", value: n1(a.imtp.asymmetryPct, "%") },
        ...(a.imtp.lsiPct != null ? [{ metric: "LSI (involved/uninvolved)", value: `${a.imtp.lsiPct}%` }] : []),
        { metric: "Trials (mean)", value: `${a.imtp.trialCount}` },
      ],
    });
  }

  // 3c. Single-leg / reactive battery (SLDJ, DJ, SLISOSQT…)
  for (const b of a.battery) {
    sections.push({
      id: `battery-${b.testType}`,
      title: b.label,
      kind: "TABLE",
      data: [
        { metric: b.primaryLabel, value: b.primaryValue == null ? "—" : `${b.primaryValue}${b.primaryUnit ? " " + b.primaryUnit : ""}` },
        { metric: "Left / Right", value: `${b.left ?? "—"} / ${b.right ?? "—"}` },
        { metric: "Asymmetry", value: n1(b.asymmetryPct, "%") },
        ...(b.stiffnessAsymPct != null ? [{ metric: "Active-stiffness asymmetry", value: n1(b.stiffnessAsymPct, "%") }] : []),
        ...(b.lsiPct != null ? [{ metric: "LSI (involved/uninvolved)", value: `${b.lsiPct}%` }] : []),
      ],
    });
  }

  // 3d. Limb strength — NordBord (hamstring) + ForceFrame (groin/adductor…)
  for (const l of a.limbStrength) {
    sections.push({
      id: `limb-${l.device}-${l.testType}`,
      title: `${l.label} (${l.device === "nordbord" ? "NordBord" : "ForceFrame"})`,
      kind: "TABLE",
      data: [
        { metric: "Left / Right", value: `${l.leftN ?? "—"} / ${l.rightN ?? "—"} N` },
        { metric: "Asymmetry", value: `${n1(l.asymmetryPct, "%")}${l.asymmetrySide ? ` (${l.asymmetrySide} weaker)` : ""}` },
        ...(l.lsiPct != null ? [{ metric: "LSI (involved/uninvolved)", value: `${l.lsiPct}%` }] : []),
        { metric: "Status", value: l.status },
        // Prior tests of this type (history), newest first.
        ...(l.history.length > 1
          ? [{ metric: "— Previous tests —", value: "" }, ...l.history.slice(1).map((h) => ({
              metric: h.testDate ?? "—",
              value: `${h.leftN ?? "—"}/${h.rightN ?? "—"} N · ${n1(h.asymmetryPct, "%")}${l.device === "forceframe" && h.movement ? ` · ${h.movement}` : ""}`,
            }))]
          : []),
      ],
    });
  }

  // 4. Change-of-direction asymmetry
  if (a.cod) {
    sections.push({
      id: "cod",
      title: "Change-of-Direction Asymmetry (high intensity, last 14 days)",
      kind: "TABLE",
      data: [
        { metric: "Left (high)", value: n0(a.cod.highLeft) },
        { metric: "Right (high)", value: n0(a.cod.highRight) },
        { metric: "Asymmetry", value: n1(a.cod.asymPct, "%") },
        { metric: "Flag", value: a.cod.flag.toUpperCase() },
        { metric: "Sessions", value: `${a.cod.sessions}` },
      ],
    });
  }

  // 4a2. Anaerobic sprint capacity (D′ reserve) — how much reserve above CS he has, and what a
  // sprint of a given intensity draws from it. Relevant to repeated-sprint readiness for RTP. Only
  // when the CS/D′ curve is pinned. Skiba 2012 expenditure model; refills below CS.
  const sc = sprint ? computeSprintCost({ csKmh: sprint.csKmh, dPrimeM: sprint.dPrimeM, mssKmh: sprint.mssKmh ?? null }) : null;
  if (sc) {
    sections.push({
      id: "sprint-capacity",
      title: "Anaerobic Sprint Capacity (D′ reserve)",
      kind: "TABLE",
      data: [
        { metric: `Total reserve (above CS ${sc.csKmh} km/h)`, value: `${sc.dPrimeM} m${sprint!.dPrimePercentile != null ? ` · squad ${sprint!.dPrimePercentile}%` : ""}` },
        ...sc.rows.map((r) => ({
          metric: `${r.label.en} — ${r.speedKmh} km/h (+${r.aboveCsKmh})`,
          value: `${Math.round(r.costM)} m / ${sc.refDurationSec}s sprint · ~${Math.round(r.sprintsToEmpty)}× to empty`,
        })),
        { metric: "Model", value: "Skiba 2012 D′-balance (expenditure): (sprint speed − CS) × duration. Refills below CS — a per-single-sprint estimate, not a match budget." },
      ],
    });
  }

  // 4b. Dynamic valgus (coach-assessed)
  if (a.valgus) {
    sections.push({
      id: "valgus",
      title: "Dynamic Valgus (coach-assessed video)",
      kind: "TABLE",
      data: [
        { metric: "Severity", value: a.valgus.severity },
        ...(a.valgus.note ? [{ metric: "Note", value: a.valgus.note }] : []),
        { metric: "Assessed", value: a.valgus.assessedAt ?? "—" },
      ],
    });
  }

  // 5. Criteria / benchmarks checklist
  if (a.criteria.length) {
    sections.push({
      id: "criteria",
      title: a.mode === "RTP"
        ? `Return-to-Play Criteria (${a.criteriaMet} of ${a.criteriaTotal} met)`
        : `Benchmarks (${a.criteriaMet} of ${a.criteriaTotal} within target)`,
      kind: "TABLE",
      data: a.criteria.map((c) => ({ criterion: c.label, target: c.target, current: c.current, status: statusLabel[c.status], met: c.met ? "YES" : "NO" })),
    });
  }

  // 5b. Recommendations (rule-derived from the flagged criteria)
  if (a.recommendations.length) {
    sections.push({ id: "recommendations", title: "Recommendations", kind: "LIST", data: a.recommendations });
  }

  // 6. Coverage / provenance (honesty banner)
  sections.push({
    id: "coverage",
    title: "Battery Coverage",
    kind: "LIST",
    data: [
      `Present (real data): ${a.coverage.present.join(", ") || "—"}`,
      `Pending ingestion: ${a.coverage.pending.join(", ")}`,
      "Rules decide each status; the AI summary only rephrases these figures.",
    ],
  });

  const keyPoints = [
    a.decision,
    a.cmj ? `CMJ ${n1(a.cmj.jumpHeightCm, "cm")}, RSI-mod ${n1(a.cmj.rsiMod)}` : "No CMJ on file",
    a.cod ? `CoD high-intensity asymmetry ${n1(a.cod.asymPct, "%")} (${a.cod.flag})` : "No change-of-direction data",
  ];

  return {
    id: `rtp-${a.player.id}-${a.assessmentDate}`,
    templateKey: "RTP_ASSESSMENT",
    title: `${a.mode === "RTP" ? "Return-to-Play Assessment" : "Force-Plate Assessment"} — ${a.player.fullName}`,
    audience: "MEDICAL",
    scope: "TEAM",
    generatedAt: a.generatedAt,
    generatedForDate: a.assessmentDate,
    teamId: a.player.teamId,
    summaryLine: a.decision,
    keyPoints,
    sections,
    exportFormats: ["PDF"],
    metadata: { playerId: a.player.id },
  };
}
