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
};

const SEV_RANK: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 };
const tierOf = (c: number): ConfidenceTier => (c >= 0.75 ? "high" : c >= 0.5 ? "moderate" : "hint");

/**
 * Reconcile raw rows into a ranked, de-duplicated per-player deficit summary.
 */
export function reconcile(rows: DeficitRow[], overrides: DeficitOverride[] = []): ReconciledDeficit[] {
  const overrideBy = new Map(overrides.map((o) => [o.quality, o]));
  const byQuality = new Map<QualityKey, DeficitRow[]>();
  for (const r of rows) { const a = byQuality.get(r.quality) ?? []; a.push(r); byQuality.set(r.quality, a); }

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
