import { ValdNormalizationError } from "./errors";
import type {
  ValdForceDecksNormalizedResult,
  ValdForceFrameNormalizedResult,
  ValdNordBordNormalizedResult,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function computeAsymmetry(args: {
  left?: number | null;
  right?: number | null;
  trustedPercent?: number | null;
  trustedSide?: string | null;
}): { percent: number | null; side: "left" | "right" | null } {
  if (args.trustedPercent != null) {
    const lowerSide = String(args.trustedSide ?? "").toLowerCase();
    return {
      percent: Math.max(0, args.trustedPercent),
      side: lowerSide === "left" || lowerSide === "right" ? (lowerSide as "left" | "right") : null,
    };
  }
  const left = args.left ?? null;
  const right = args.right ?? null;
  if (left == null || right == null || Math.max(left, right) <= 0) return { percent: null, side: null };
  const percent = Math.abs(left - right) / Math.max(left, right) * 100;
  return { percent, side: left <= right ? "left" : "right" };
}

export function normalizeForceDecksResult(rawPayload: unknown): ValdForceDecksNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceDecks payload.", rawPayload);
  // TODO: VERIFY AGAINST VALD API DOCS
  const leftValue = firstNumber(record.left_value, record.leftValue, record.left);
  const rightValue = firstNumber(record.right_value, record.rightValue, record.right);
  const asym = computeAsymmetry({
    left: leftValue,
    right: rightValue,
    trustedPercent: firstNumber(record.asymmetry_percent, record.asymmetryPercent),
    trustedSide: firstString(record.asymmetry_side, record.asymmetrySide),
  });
  const jumpHeightCm = firstNumber(record.jump_height_cm, record.jumpHeightCm, record.jump_height);
  const peakPowerW = firstNumber(record.peak_power_w, record.peakPowerW, record.peak_power);
  return {
    product: "forcedecks",
    testType: firstString(record.test_type, record.testType, record.protocol, record.name),
    testTimestamp: firstString(record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ?? new Date().toISOString(),
    jumpHeightCm,
    rsiMod: firstNumber(record.rsi_mod, record.rsiMod),
    eccentricDurationMs: firstNumber(record.eccentric_duration_ms, record.eccentricDurationMs),
    concentricDurationMs: firstNumber(record.concentric_duration_ms, record.concentricDurationMs),
    peakPowerW,
    relativePeakPowerWKg: firstNumber(record.relative_peak_power_w_kg, record.relativePeakPowerWKg),
    peakForceN: firstNumber(record.peak_force_n, record.peakForceN),
    concentricImpulseNS: firstNumber(record.concentric_impulse_n_s, record.concentricImpulseNS),
    timeToTakeoffMs: firstNumber(record.time_to_takeoff_ms, record.timeToTakeoffMs),
    leftValue,
    rightValue,
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: jumpHeightCm != null || peakPowerW != null || asym.percent != null,
  };
}

export function normalizeNordBordResult(rawPayload: unknown): ValdNordBordNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid NordBord payload.", rawPayload);
  // TODO: VERIFY AGAINST VALD API DOCS
  const leftPeak = firstNumber(record.left_peak_force_n, record.leftPeakForceN, record.left_peak);
  const rightPeak = firstNumber(record.right_peak_force_n, record.rightPeakForceN, record.right_peak);
  const asym = computeAsymmetry({
    left: leftPeak,
    right: rightPeak,
    trustedPercent: firstNumber(record.asymmetry_percent, record.asymmetryPercent),
    trustedSide: firstString(record.asymmetry_side, record.asymmetrySide),
  });
  return {
    product: "nordbord",
    testType: firstString(record.test_type, record.testType, record.protocol, record.name),
    testTimestamp: firstString(record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ?? new Date().toISOString(),
    leftPeakForceN: leftPeak,
    rightPeakForceN: rightPeak,
    leftAvgForceN: firstNumber(record.left_avg_force_n, record.leftAvgForceN, record.left_average_force_n),
    rightAvgForceN: firstNumber(record.right_avg_force_n, record.rightAvgForceN, record.right_average_force_n),
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: leftPeak != null || rightPeak != null || asym.percent != null,
  };
}

export function normalizeForceFrameResult(rawPayload: unknown): ValdForceFrameNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceFrame payload.", rawPayload);
  // TODO: VERIFY AGAINST VALD API DOCS
  const leftPeak = firstNumber(record.left_peak_force_n, record.leftPeakForceN, record.left_peak);
  const rightPeak = firstNumber(record.right_peak_force_n, record.rightPeakForceN, record.right_peak);
  const asym = computeAsymmetry({
    left: leftPeak,
    right: rightPeak,
    trustedPercent: firstNumber(record.asymmetry_percent, record.asymmetryPercent),
    trustedSide: firstString(record.asymmetry_side, record.asymmetrySide),
  });
  return {
    product: "forceframe",
    testType: firstString(record.test_type, record.testType, record.protocol, record.name),
    testTimestamp: firstString(record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ?? new Date().toISOString(),
    bodyRegion: firstString(record.body_region, record.bodyRegion),
    movementPattern: firstString(record.movement_pattern, record.movementPattern, record.pattern),
    leftPeakForceN: leftPeak,
    rightPeakForceN: rightPeak,
    leftRelativeForce: firstNumber(record.left_relative_force, record.leftRelativeForce),
    rightRelativeForce: firstNumber(record.right_relative_force, record.rightRelativeForce),
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: leftPeak != null || rightPeak != null || asym.percent != null,
  };
}
