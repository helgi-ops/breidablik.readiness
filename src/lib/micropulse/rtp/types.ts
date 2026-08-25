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

import type { PopKey } from "@/lib/micropulse/vald/benchmarks";

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
  /** Contraction time (movement start -> takeoff), ms. */
  contractionTimeMs: number | null;
  /** Concentric peak velocity (m/s). */
  concentricPeakVelocityMS: number | null;
  /** Concentric rate of force development (N/s). Noisy metric -- read the trend. */
  concentricRfdNS: number | null;
  /** |L−R|/max × 100 from VALD (concentric/takeoff force), if present. */
  asymmetryPct: number | null;
  asymmetrySide: string | null;
};

export type RtpImtp = {
  testDate: string | null;
  trialCount: number;
  peakForceN: number | null;
  relPeakForceNkg: number | null;
  /** Peak force above bodyweight (net), N. */
  netPeakForceN: number | null;
  /** Early explosive-strength force at 100 / 200 ms (N). */
  force100N: number | null;
  force200N: number | null;
  /** Body-mass-relative force at 200 ms (N/kg) — early relative strength. */
  relForce200Nkg: number | null;
  /** Rate of force development 0-100 / 0-200 ms (N/s). */
  rfd100: number | null;
  rfd200: number | null;
  /** Net impulse at 200 ms (N·s). */
  impulse200: number | null;
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
  /** Body-mass-relative peak force (N/kg) for isometric tests, when reported. */
  relForceNkg: number | null;
  asymmetryPct: number | null;
  lsiPct: number | null;
  stiffnessAsymPct: number | null;
  jumpHeightAsymPct: number | null;
};

/**
 * A single-plane strength test from a VALD device that reports left/right peak
 * force directly — NordBord (Nordic eccentric hamstring) or ForceFrame (groin /
 * adductor, and any other joint the frame measures). The RTP-relevant gate is
 * L/R asymmetry (and involved-vs-uninvolved LSI when the injured side is known).
 */
/** One dated test in a limb-strength history (a single session). */
export type RtpLimbStrengthEntry = {
  testDate: string | null;
  /** ForceFrame movement/angle ("Hip AD/AB - 60"); null for NordBord. */
  movement: string | null;
  leftN: number | null;
  rightN: number | null;
  asymmetryPct: number | null;
  asymmetrySide: string | null;
  status: RtpStatus;
};

export type RtpLimbStrengthTest = {
  device: "nordbord" | "forceframe";
  testType: string;          // "Nordic", "Hip AD/AB", …
  label: string;             // coach-readable ("Nordic hamstring", "Hip adduction (groin)")
  bodyRegion: string | null; // "Hamstring", "Hip", "Ankle", …
  /** ForceFrame direction (Pull/Squeeze/Push) of the latest test, if reported. */
  direction: string | null;
  testDate: string | null;   // the LATEST test's date
  leftN: number | null;
  rightN: number | null;
  /** Latest test's average force per limb (N), when the export carries it. */
  avgLeftN: number | null;
  avgRightN: number | null;
  /** Latest test's max rate of force development per limb (N/s), when present. */
  maxRfdLeftNS: number | null;
  maxRfdRightNS: number | null;
  /** |L−R|/max × 100 (latest test). */
  asymmetryPct: number | null;
  /** Weaker side (left/right), from VALD or derived. */
  asymmetrySide: string | null;
  /** Involved-vs-uninvolved limb % when the injured side is known (RTP LSI). */
  lsiPct: number | null;
  /** Bishop 2020 asymmetry status (latest test). */
  status: RtpStatus;
  /** All tests of this type for this player, newest first (incl. the latest). */
  history: RtpLimbStrengthEntry[];
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
  /** Benchmark population (sex + sport) for the reference bands. */
  benchmarkPop: PopKey;
  injury: RtpInjury | null;
  cmj: RtpCmj | null;
  imtp: RtpImtp | null;
  /** Single-leg / reactive battery tests (SLDJ/DJ/SLISOSQT…) — empty until synced. */
  battery: RtpBatteryTest[];
  /** NordBord (hamstring) + ForceFrame (groin/adductor…) L/R strength — empty until synced. */
  limbStrength: RtpLimbStrengthTest[];
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
