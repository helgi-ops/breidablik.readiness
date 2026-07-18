/**
 * Recovery Protocols — shared types.
 *
 * These mirror the `recovery_protocols` table shape. Stage 1A is read-only
 * library; assignments come in Stage 1B.
 */

export type RecoveryProtocolCategory =
  | "post_match"
  | "md_plus_1"
  | "pre_match"
  | "travel"
  | "general"
  | "rehab";

export type RecoveryEvidenceTier =
  | "strong"
  | "moderate"
  | "practitioner"
  | "mixed";

export type RecoveryDrill = {
  name: string;
  cues: string[];
  reps_or_time: string;
};

export type RecoverySection = {
  title: string;
  duration_min: number;
  description: string;
  drills: RecoveryDrill[];
};

export type RecoveryCitation = {
  label: string;
  source?: string;
};

export type RecoveryProtocol = {
  id: string;
  slug: string;
  title: string;
  category: RecoveryProtocolCategory;
  evidence_tier: RecoveryEvidenceTier;
  duration_min: number;
  when_to_use: string;
  goal: string;
  trigger_hint: string | null;
  sections: RecoverySection[];
  citations: RecoveryCitation[] | null;
  active: boolean;
};

export const CATEGORY_LABELS: Record<RecoveryProtocolCategory, string> = {
  post_match: "Post-match",
  md_plus_1: "MD+1 morning",
  pre_match: "Pre-match",
  travel: "Travel",
  general: "General",
  rehab: "Injury rehab",
};

export const EVIDENCE_LABELS: Record<RecoveryEvidenceTier, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  practitioner: "Practitioner-evidence",
  mixed: "Mixed evidence",
};

export const EVIDENCE_DESCRIPTIONS: Record<RecoveryEvidenceTier, string> = {
  strong: "Multiple RCTs / systematic-review support",
  moderate: "Some RCT support; protocol-level evidence less direct",
  practitioner: "Coach/clinician-derived; limited RCT validation",
  mixed: "Some components RCT-validated, others practitioner-derived",
};
