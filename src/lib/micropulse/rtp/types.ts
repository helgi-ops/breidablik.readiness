/**
 * Return-to-Play (RTP) assessment — shared types.
 *
 * A player-scoped assessment that fuses force-plate data (VALD ForceDecks),
 * limb asymmetry, and injury / return-to-training context into a report the
 * coach/medical team can read and export. This mirrors the structure of a
 * clinical RTP report (executive summary → per-test detail → asymmetry →
 * decision → recommendations).
 *
 * PHASE 0 covers the tests the app already ingests with real numbers (CMJ) plus
 * change-of-direction asymmetry and the injury/RTT picture. The `coverage`
 * field is the honesty banner: which battery tests are present vs pending
 * ingestion (IMTP / DJ / SLDJ / SLISOSQT land in later phases).
 *
 * Pure/serialisable — safe to import on client and server.
 */

export type RtpStatus = "PASS" | "CAUTION" | "FLAG" | "NO_DATA";

/** One evaluated clearance criterion (rule-decided; AI never sets these). */
export type RtpCriterion = {
  key: string;
  label: string;
  target: string;
  current: string;
  status: RtpStatus;
  met: boolean;
  /** Clinical domain this criterion rolls up into (for the domain status table). */
  domain?: string;
  /** Paper/citation the threshold comes from (explainability-first). */
  cite?: string;
};

/** A clinical domain's rolled-up status (worst criterion wins) + its key finding. */
export type RtpDomain = {
  domain: string;
  status: RtpStatus;
  keyFinding: string;
};

export type RtpInjury = {
  active: boolean;
  injuryDate: string | null;
  type: string | null;
  bodyPart: string | null;
  severity: string | null;
  /** left | right | bilateral | na — the involved limb, for LSI framing. */
  bodySide: string | null;
  status: string | null;
  stage: number | null;
  estimatedReturn: string | null;
  layoffDays: number | null;
  weeksPostInjury: number | null;
};

export type RtpCmj = {
  testDate: string | null;
  trialCount: number;
  jumpHeightCm: number | null;
  rsiMod: number | null;
  rsiModSource: string | null;
  peakPowerW: number | null;
  relPeakPowerWkg: number | null;
  peakForceN: number | null;
  /** |L−R|/max × 100 from VALD (concentric/takeoff force), if present. */
  asymmetryPct: number | null;
  asymmetrySide: string | null;
};

export type RtpImtp = {
  testDate: string | null;
  trialCount: number;
  peakForceN: number | null;
  relPeakForceNkg: number | null;
  leftN: number | null;
  rightN: number | null;
  /** |L−R|/max × 100. */
  asymmetryPct: number | null;
  /** Involved-vs-uninvolved limb % when the injured side is known (RTP LSI). */
  lsiPct: number | null;
};

/** A single-leg / reactive battery test (SLDJ, DJ, SLISOSQT, …), read
 *  generically. Empty until such tests are synced — the surface is "ready". */
export type RtpBatteryTest = {
  testType: string;
  label: string;
  testDate: string | null;
  primaryLabel: string;
  primaryValue: number | null;
  primaryUnit: string;
  left: number | null;
  right: number | null;
  asymmetryPct: number | null;
  lsiPct: number | null;
  stiffnessAsymPct: number | null;
  jumpHeightAsymPct: number | null;
};

export type RtpCod = {
  windowDays: number;
  sessions: number;
  highLeft: number;
  highRight: number;
  asymPct: number | null;
  flag: "ok" | "watch" | "concern" | "high" | "no_data";
};

export type RtpValgusSeverity = "none" | "mild" | "moderate" | "severe";
export type RtpValgus = {
  severity: RtpValgusSeverity;
  note: string | null;
  assessedAt: string | null;
};

export type RtpCoverage = {
  /** Battery tests we have real numbers for. */
  present: string[];
  /** Battery tests referenced by a full RTP report but not yet ingested. */
  pending: string[];
};

export type RtpAssessment = {
  player: {
    id: string;
    fullName: string;
    teamId: string;
    position: string | null;
    ageYears: number | null;
    bodyMassKg: number | null;
  };
  generatedAt: string;
  assessmentDate: string;
  /** RTP = injured/returning (clearance framing); ASSESSMENT = healthy profile. */
  mode: "RTP" | "ASSESSMENT";
  injury: RtpInjury | null;
  cmj: RtpCmj | null;
  imtp: RtpImtp | null;
  /** Single-leg / reactive battery tests (SLDJ/DJ/SLISOSQT…) — empty until synced. */
  battery: RtpBatteryTest[];
  cod: RtpCod | null;
  /** Return-to-training context (variant + layoff + stage), from buildRttForPlayer. */
  rtt: { variant: "ima" | "gps"; layoffDays: number | null; stage: number | null; currentlyInjured: boolean } | null;
  criteria: RtpCriterion[];
  domains: RtpDomain[];
  criteriaMet: number;
  criteriaTotal: number;
  decision: string;
  /** Coach-assessed dynamic valgus (manual — not computed). */
  valgus: RtpValgus | null;
  /** Rule-derived, cited recommendations from the flagged domains/criteria. */
  recommendations: string[];
  coverage: RtpCoverage;
};
