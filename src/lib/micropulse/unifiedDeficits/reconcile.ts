/**
 * The reconciler — the heart of the unified individualisation engine. Raw deficit
 * rows from every source (movement screen, screening form, VALD, VBT, IMA,
 * clinical Ax, load, rehab track) are noisy and overlapping; this aggregates the
 * SAME quality across sources into ONE deficit with higher confidence — so "more
 * data" is actually better (via reconciliation + confidence), not blind stacking.
 *
 * Rules: aggregate same quality → one deficit; promote hypothesis → confirmed when
 * a confirmed source (instrument / clinician) agrees; weight by confidence +
 * agreement; surface conflicts, don't silently pick; pain / clinical red-flag →
 * clinician (out of the auto-plan). Descriptive — never the readiness colour.
 * Pure — no DB. Coach overrides any deficit.
 */
import type { Bi } from "../movementScreen/registry";
import type { EvidenceGrade } from "../movementScreen/registry";
import type { CompensationKey } from "../movementScreen/correctives/registry";
import {
  QUALITY_LABEL, QUALITY_DOMAIN, QUALITY_COMPENSATION, QUALITY_FEEDS, feedsFor,
  type QualityKey, type Domain,
} from "./quality";

export type DeficitSource =
  | "movement_screen" | "movement_form" | "region" | "vald" | "vbt" | "ima"
  | "load" | "clinical_ax" | "rehab_track";
export type DeficitStatus = "hypothesis" | "confirmed" | "monitoring" | "resolved";
export type Severity = "mild" | "moderate" | "severe";
export type Side = "L" | "R" | "both";

/** One raw deficit written by one source at one time. */
export type DeficitRow = {
  quality: QualityKey;
  source: DeficitSource;
  status: DeficitStatus;
  /** 0..1 — source reliability × maturity × repeats × scorer (see collect.ts). */
  confidence: number;
  severity?: Severity;
  value?: number | null;
  side?: Side;
  provenance: Bi;
  evidenceGrade?: EvidenceGrade;
  confirmationTestsOutstanding?: string[];
  /** True for a pain / clinical red-flag row → routes to the clinician. */
  medical?: boolean;
};

/** Coach override on a quality (dismiss removes from the plan; confirm forces it). */
export type DeficitOverride = { quality: QualityKey; action: "dismiss" | "confirm"; note?: string };

/** A CLEARANCE — an instrument MEASURED this quality in-window and found it within
 *  norm (no deficit). Not a deficit row; it only exists to CONTRADICT a firing
 *  source (the eye-test says valgus, the plates say symmetric → needs a look). */
export type Clearance = { quality: QualityKey; source: DeficitSource; provenance: Bi };

/** A load-monitor PREHAB PRIORITY — a risk flag, NOT a quality deficit (it raises
 *  prehab priority + says "keep robustness up", it doesn't add a corrective). */
export type PrehabFlag = { key: string; label: Bi; detail: Bi; severity: "watch" | "priority"; source: "load"; evidence: string };

export type ConfidenceTier = "hint" | "moderate" | "high";

export type ReconciledDeficit = {
  quality: QualityKey;
  label: Bi;
  domain: Domain;
  status: DeficitStatus;
  confidence: number;
  confidenceTier: ConfidenceTier;
  /** Distinct contributing sources (the corroboration). */
  sources: Array<{ source: DeficitSource; provenance: Bi; status: DeficitStatus; confidence: number }>;
  sides: Side[];
  severity?: Severity;
  evidenceGrade?: EvidenceGrade;
  outstandingConfirmations: string[];
  /** Which consumer(s) read it: corrective/prehab and/or strength/periodization. */
  feeds: Array<"corrective" | "strength">;
  /** Corrective compensations this quality drives (plan traceability). */
  compensations: CompensationKey[];
  /** Pain / clinical → clinician, out of the coach's auto-plan. */
  medicalReferral: boolean;
  /** Coach override, if any. */
  overridden?: "dismiss" | "confirm";
  /** True when an instrument MEASURED this quality and found it clean while another
   *  source flagged it — the engine surfaces the disagreement rather than silently
   *  picking a winner (manifesto: surface conflicts). */
  contested: boolean;
  conflict?: {
    assertedBy: DeficitSource[];
    clearedBy: Array<{ source: DeficitSource; provenance: Bi }>;
    note: Bi;
  };
};

/** Short source names for the conflict note (kept in-engine so the "why" is
 *  self-describing wherever the summary is rendered). */
const SOURCE_SHORT: Record<DeficitSource, Bi> = {
  movement_screen: { en: "movement screen", is: "hreyfiskimun" },
  movement_form: { en: "screening form", is: "skimunar-form" },
  region: { en: "region assessment", is: "svæðismat" },
  vald: { en: "VALD", is: "VALD" },
  vbt: { en: "VBT", is: "VBT" },
  ima: { en: "IMA", is: "IMA" },
  load: { en: "load monitor", is: "álags-vöktun" },
  clinical_ax: { en: "clinical assessment", is: "klínískt mat" },
  rehab_track: { en: "rehab track", is: "endurhæfingar-ferill" },
};
const joinBi = (items: Bi[], lang: "en" | "is"): string => {
  const parts = items.map((b) => b[lang]);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${lang === "en" ? "&" : "og"} ${parts[parts.length - 1]}`;
};

const SEV_RANK: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 };
const tierOf = (c: number): ConfidenceTier => (c >= 0.75 ? "high" : c >= 0.5 ? "moderate" : "hint");

/**
 * Reconcile raw rows into a ranked, de-duplicated per-player deficit summary.
 */
export function reconcile(rows: DeficitRow[], overrides: DeficitOverride[] = [], clearances: Clearance[] = []): ReconciledDeficit[] {
  const overrideBy = new Map(overrides.map((o) => [o.quality, o]));
  const byQuality = new Map<QualityKey, DeficitRow[]>();
  for (const r of rows) { const a = byQuality.get(r.quality) ?? []; a.push(r); byQuality.set(r.quality, a); }
  const clearBy = new Map<QualityKey, Clearance[]>();
  for (const c of clearances) { const a = clearBy.get(c.quality) ?? []; a.push(c); clearBy.set(c.quality, a); }

  const out: ReconciledDeficit[] = [];
  for (const [quality, group] of byQuality) {
    const distinctSources = new Set(group.map((r) => r.source));
    const anyConfirmed = group.some((r) => r.status === "confirmed");
    const medicalReferral = group.some((r) => r.medical);

    // Confidence: strongest single source + an agreement bonus per extra source.
    const base = Math.max(...group.map((r) => r.confidence));
    const agreement = Math.min(0.2, 0.1 * (distinctSources.size - 1));
    let confidence = Math.min(1, base + agreement);

    // Promote hypothesis → confirmed when a confirmed source agrees.
    let status: DeficitStatus = anyConfirmed ? "confirmed" : "hypothesis";

    const override = overrideBy.get(quality);
    if (override?.action === "confirm") { status = "confirmed"; confidence = Math.max(confidence, 0.75); }

    // Conflict: an instrument measured THIS quality and cleared it while another
    // source flagged it. Surface the disagreement; a contested-but-unconfirmed
    // deficit is capped to "hint" so it never reads high while an instrument
    // disagrees. A coach confirm still forces it through (coach decides).
    const clearedFor = (clearBy.get(quality) ?? []).filter((c) => !distinctSources.has(c.source));
    let contested = false;
    let conflict: ReconciledDeficit["conflict"];
    if (clearedFor.length > 0 && !medicalReferral) {
      contested = true;
      const assertedBy = [...distinctSources];
      const clearedBy = clearedFor.map((c) => ({ source: c.source, provenance: c.provenance }));
      conflict = {
        assertedBy,
        clearedBy,
        note: {
          en: `Flagged by ${joinBi(assertedBy.map((s) => SOURCE_SHORT[s]), "en")}, but ${joinBi(clearedBy.map((c) => SOURCE_SHORT[c.source]), "en")} measured it within norm — needs a look.`,
          is: `Merkt af ${joinBi(assertedBy.map((s) => SOURCE_SHORT[s]), "is")}, en ${joinBi(clearedBy.map((c) => SOURCE_SHORT[c.source]), "is")} mældi það innan viðmiða — þarf að skoða.`,
        },
      };
      if (status !== "confirmed" && override?.action !== "confirm") confidence = Math.min(confidence, 0.49);
    }

    const sides = [...new Set(group.map((r) => r.side).filter((s): s is Side => !!s))];
    const severity = group.map((r) => r.severity).filter((s): s is Severity => !!s).sort((a, b) => SEV_RANK[b] - SEV_RANK[a])[0];
    const evidenceGrade = group.map((r) => r.evidenceGrade).find((g): g is EvidenceGrade => !!g);
    const outstanding = [...new Set(group.flatMap((r) => r.confirmationTestsOutstanding ?? []))];
    const domain = QUALITY_DOMAIN[quality];

    out.push({
      quality,
      label: QUALITY_LABEL[quality],
      domain,
      status,
      confidence,
      confidenceTier: tierOf(confidence),
      sources: group.map((r) => ({ source: r.source, provenance: r.provenance, status: r.status, confidence: r.confidence })),
      sides,
      severity,
      evidenceGrade,
      outstandingConfirmations: outstanding,
      feeds: medicalReferral ? [] : (QUALITY_FEEDS[quality] ?? feedsFor(domain)),
      compensations: medicalReferral ? [] : (QUALITY_COMPENSATION[quality] ?? []),
      medicalReferral,
      overridden: override?.action,
      contested,
      conflict,
    });
  }

  // Priority: dismissed last; then confirmed before hypothesis; then more sources,
  // higher severity, higher confidence. (Medical items are shown but not planned.)
  const statusRank = (d: ReconciledDeficit) => (d.status === "confirmed" ? 2 : d.status === "hypothesis" ? 1 : 0);
  return out.sort((a, b) => {
    if (!!a.overridden !== !!b.overridden) return a.overridden === "dismiss" ? 1 : b.overridden === "dismiss" ? -1 : 0;
    if (statusRank(b) !== statusRank(a)) return statusRank(b) - statusRank(a);
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length;
    const sev = (SEV_RANK[b.severity ?? "mild"] ?? 0) - (SEV_RANK[a.severity ?? "mild"] ?? 0);
    if (sev) return sev;
    return b.confidence - a.confidence;
  });
}

/** The corrective compensations the reconciled plan should target (non-medical,
 *  non-dismissed). Feeds the existing corrective/rehab pipeline. */
export function planCompensations(reconciled: ReconciledDeficit[]): CompensationKey[] {
  const set = new Set<CompensationKey>();
  for (const d of reconciled) {
    if (d.medicalReferral || d.overridden === "dismiss") continue;
    for (const c of d.compensations) set.add(c);
  }
  return [...set];
}
