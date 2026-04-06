import { ISO_ANGLE_LABELS, ISO_PROFILE_DEFAULTS } from "./rules";
import type { IsoContextInput, IsoPrescription, IsoProfile } from "./types";

function isPrimerLike(nodeType?: string | null): boolean {
  const node = String(nodeType ?? "").trim().toLowerCase();
  return node.includes("primer");
}

function isSupportLike(nodeType?: string | null): boolean {
  const node = String(nodeType ?? "").trim().toLowerCase();
  return node === "support_isometric" || node === "recovery_reset";
}

function isPowerOrPrimerIntent(sessionIntent?: string | null): boolean {
  const intent = String(sessionIntent ?? "").trim().toUpperCase();
  return intent === "PRIMER" || intent === "POWER";
}

export function determineIsoProfile(
  input: IsoContextInput
): IsoProfile {
  if (input.athleteState === "RED" || input.mdContext === "MD_PLUS_1" || input.mdContext === "OFF") {
    return "RECOVERY";
  }

  const primerLike = isPrimerLike(input.nodeType);
  const supportLike = isSupportLike(input.nodeType);
  const isIsoMidThighPull = String(input.exerciseId ?? "").trim() === "iso_mid_thigh_pull";

  if (primerLike || isIsoMidThighPull) {
    if (input.mdContext === "MD1" && supportLike && !primerLike) return "TENDON";
    return "NEURAL";
  }

  if (isPowerOrPrimerIntent(input.sessionIntent) && (input.athleteState === "GREEN_PLUS" || input.athleteState === "GREEN")) {
    if (input.mdContext === "MD1" && supportLike && !primerLike) return "TENDON";
    return "NEURAL";
  }

  if (input.athleteState === "YELLOW") return "TENDON";
  if (input.athleteState === "GREEN") return "TENDON";
  if (input.athleteState === "GREEN_PLUS") return "TENDON";
  return "RECOVERY";
}

export function buildIsoPrescription(
  input: IsoContextInput
): IsoPrescription {
  const isoProfile = determineIsoProfile(input);
  const base = ISO_PROFILE_DEFAULTS[isoProfile];

  let sets = base.sets;
  let holdSeconds = base.holdSeconds;
  let restSeconds = base.restSeconds;

  if (isoProfile === "NEURAL" && input.athleteState === "GREEN_PLUS") {
    sets = 5;
    holdSeconds = 4;
    restSeconds = 150;
  } else if (isoProfile === "TENDON" && input.athleteState === "GREEN") {
    sets = 3;
    holdSeconds = 25;
    restSeconds = 75;
  } else if (isoProfile === "TENDON" && input.athleteState === "YELLOW") {
    sets = 2;
    holdSeconds = 20;
    restSeconds = 60;
  } else if (isoProfile === "RECOVERY" && input.athleteState === "RED") {
    sets = 2;
    holdSeconds = 40;
    restSeconds = 75;
  }

  return {
    isoProfile,
    holdSeconds,
    sets,
    restSeconds,
    intensityLabel: base.intensityLabel,
    angleLabel: ISO_ANGLE_LABELS[String(input.exerciseId ?? "").trim()] ?? null,
    goalLabel: base.goalLabel,
  };
}

export function formatIsoPrescriptionLines(
  prescription: IsoPrescription,
  opts?: { concise?: boolean }
): string[] {
  const concise = opts?.concise === true;
  let holdText = `${prescription.holdSeconds} sec holds`;
  let restText = `Rest ${prescription.restSeconds} sec`;

  if (prescription.isoProfile === "NEURAL") {
    holdText = "3-5 sec holds";
    restText = "Rest 90-180 sec";
  } else if (prescription.isoProfile === "TENDON") {
    holdText = prescription.sets <= 2 ? "20 sec holds" : "20-30 sec holds";
    restText = prescription.sets <= 2 ? "Rest 60 sec" : "Rest 60-90 sec";
  } else if (prescription.isoProfile === "RECOVERY") {
    holdText = "30-45 sec holds";
    restText = "Rest 45-90 sec";
  }

  const lines = [
    `${prescription.sets} sets x ${holdText}`,
    prescription.intensityLabel,
    restText,
  ];

  if (!concise) {
    lines.push(`Goal: ${prescription.goalLabel}`);
    if (prescription.angleLabel) lines.push(`Angle: ${prescription.angleLabel}`);
  }

  return lines;
}
