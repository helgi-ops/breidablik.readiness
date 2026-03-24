import { ValdNormalizationError } from "./errors";
import type {
  ValdForceDecksNormalizedResult,
  ValdForceFrameNormalizedResult,
  ValdNordBordNormalizedResult,
} from "./types";

// ── Utility helpers ───────────────────────────────────────────────────────────

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

// ── VALD REST API v2 parameter extraction ─────────────────────────────────────
//
// VALD ForceDecks (and other products) return test results as arrays of
// { resultId: string, value: number } objects under two keys:
//   "parameter"          — primary results (jump height, peak power, etc.)
//   "extendedParameters" — additional / computed results
//
// This helper builds a Map<resultId, value> for fast lookup.

type ParamEntry = { resultId?: unknown; value?: unknown };

function buildParamMap(payload: unknown): Map<string, number> {
  const record = asRecord(payload);
  if (!record) return new Map();
  const map = new Map<string, number>();

  function addEntries(arr: unknown) {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const entry = asRecord(item) as ParamEntry | null;
      if (!entry) continue;
      const id = typeof entry.resultId === "string" ? entry.resultId : null;
      const val = toNumber(entry.value);
      if (id && val != null) map.set(id, val);
    }
  }

  addEntries(record.parameter);
  addEntries(record.parameters);
  addEntries(record.extendedParameters);
  return map;
}

/**
 * Returns the first non-null value from a list of resultId lookups against
 * the parameter map, with an optional multiplier (e.g. ×100 for m→cm,
 * ×1000 for s→ms).
 */
function paramValue(
  map: Map<string, number>,
  ids: string[],
  multiplier = 1,
): number | null {
  for (const id of ids) {
    const v = map.get(id);
    if (v != null) return v * multiplier;
  }
  return null;
}

// ── Asymmetry ─────────────────────────────────────────────────────────────────

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
  const percent = (Math.abs(left - right) / Math.max(left, right)) * 100;
  return { percent, side: left <= right ? "left" : "right" };
}

// ── ForceDecks normalizer ─────────────────────────────────────────────────────
//
// VALD ForceDecks resultId reference (common test types: CMJ, SJ, Drop Jump, IMTP):
//
//   JumpHeightMO      — Jump height momentum method (m → cm ×100)
//   JumpHeight        — Jump height flight-time method (m → cm ×100)
//   RSIMod            — RSI Modified (ratio)
//   PeakPower         — Peak concentric power (W)
//   PeakPowerBW       — Peak power / body weight (W/kg)
//   PeakForce         — Peak force (N)
//   ConcentricImpulse — Concentric impulse (N·s)
//   EccentricDuration — Eccentric phase duration (s → ms ×1000)
//   ConcentricDuration— Concentric phase duration (s → ms ×1000)
//   TimeToTakeoff     — Time from start to takeoff (s → ms ×1000)
//   LeftPeakForce     — Left-limb peak force (N)  [bilateral tests]
//   RightPeakForce    — Right-limb peak force (N) [bilateral tests]
//   Asymmetry         — Asymmetry index (%)
//   AsymmetrySide     — Weaker side string ("Left"/"Right")

export function normalizeForceDecksResult(rawPayload: unknown): ValdForceDecksNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceDecks payload.", rawPayload);

  const params = buildParamMap(rawPayload);

  // Jump height: prefer momentum-offset method, fall back to flight-time
  const jumpHeightCm =
    paramValue(params, ["JumpHeightMO", "JumpHeight"], 100) ??
    firstNumber(record.jump_height_cm, record.jumpHeightCm, record.jump_height);

  const peakPowerW =
    paramValue(params, ["PeakPower"]) ??
    firstNumber(record.peak_power_w, record.peakPowerW, record.peak_power);

  // Bilateral values
  const leftValue =
    paramValue(params, ["LeftPeakForce", "LeftForce"]) ??
    firstNumber(record.left_value, record.leftValue, record.left);
  const rightValue =
    paramValue(params, ["RightPeakForce", "RightForce"]) ??
    firstNumber(record.right_value, record.rightValue, record.right);

  // VALD may provide a pre-computed asymmetry index + side
  const trustedPercent =
    paramValue(params, ["Asymmetry", "AsymmetryIndex"]) ??
    firstNumber(record.asymmetry_percent, record.asymmetryPercent);
  const trustedSide =
    firstString(
      typeof record.AsymmetrySide === "string" ? record.AsymmetrySide : null,
      record.asymmetry_side,
      record.asymmetrySide,
    ) ?? (params.get("AsymmetrySide") != null ? null : null); // numeric side not useful

  const asym = computeAsymmetry({ left: leftValue, right: rightValue, trustedPercent, trustedSide });

  return {
    product: "forcedecks",
    testType: firstString(record.testType, record.test_type, record.protocol, record.name),
    testTimestamp:
      firstString(record.recordedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
      new Date().toISOString(),
    jumpHeightCm,
    rsiMod:
      paramValue(params, ["RSIMod", "RSIModified"]) ??
      firstNumber(record.rsi_mod, record.rsiMod),
    eccentricDurationMs:
      paramValue(params, ["EccentricDuration"], 1000) ??
      firstNumber(record.eccentric_duration_ms, record.eccentricDurationMs),
    concentricDurationMs:
      paramValue(params, ["ConcentricDuration"], 1000) ??
      firstNumber(record.concentric_duration_ms, record.concentricDurationMs),
    peakPowerW,
    relativePeakPowerWKg:
      paramValue(params, ["PeakPowerBW", "PeakPowerRelative"]) ??
      firstNumber(record.relative_peak_power_w_kg, record.relativePeakPowerWKg),
    peakForceN:
      paramValue(params, ["PeakForce"]) ??
      firstNumber(record.peak_force_n, record.peakForceN),
    concentricImpulseNS:
      paramValue(params, ["ConcentricImpulse"]) ??
      firstNumber(record.concentric_impulse_n_s, record.concentricImpulseNS),
    timeToTakeoffMs:
      paramValue(params, ["TimeToTakeoff"], 1000) ??
      firstNumber(record.time_to_takeoff_ms, record.timeToTakeoffMs),
    leftValue,
    rightValue,
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: jumpHeightCm != null || peakPowerW != null || asym.percent != null,
  };
}

// ── NordBord normalizer ───────────────────────────────────────────────────────
//
// VALD NordBord resultId reference:
//   LeftPeakForce     — Left peak force (N)
//   RightPeakForce    — Right peak force (N)
//   LeftAverageForce  — Left average force (N)
//   RightAverageForce — Right average force (N)
//   Asymmetry         — Asymmetry index (%)

export function normalizeNordBordResult(rawPayload: unknown): ValdNordBordNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid NordBord payload.", rawPayload);

  const params = buildParamMap(rawPayload);

  const leftPeak =
    paramValue(params, ["LeftPeakForce"]) ??
    firstNumber(record.left_peak_force_n, record.leftPeakForceN, record.left_peak);
  const rightPeak =
    paramValue(params, ["RightPeakForce"]) ??
    firstNumber(record.right_peak_force_n, record.rightPeakForceN, record.right_peak);
  const trustedPercent =
    paramValue(params, ["Asymmetry", "AsymmetryIndex"]) ??
    firstNumber(record.asymmetry_percent, record.asymmetryPercent);
  const asym = computeAsymmetry({ left: leftPeak, right: rightPeak, trustedPercent });

  return {
    product: "nordbord",
    testType: firstString(record.testType, record.test_type, record.protocol, record.name),
    testTimestamp:
      firstString(record.recordedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
      new Date().toISOString(),
    leftPeakForceN: leftPeak,
    rightPeakForceN: rightPeak,
    leftAvgForceN:
      paramValue(params, ["LeftAverageForce", "LeftAvgForce"]) ??
      firstNumber(record.left_avg_force_n, record.leftAvgForceN, record.left_average_force_n),
    rightAvgForceN:
      paramValue(params, ["RightAverageForce", "RightAvgForce"]) ??
      firstNumber(record.right_avg_force_n, record.rightAvgForceN, record.right_average_force_n),
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: leftPeak != null || rightPeak != null || asym.percent != null,
  };
}

// ── ForceFrame normalizer ─────────────────────────────────────────────────────
//
// VALD ForceFrame resultId reference:
//   LeftPeakForce     — Left peak force (N)
//   RightPeakForce    — Right peak force (N)
//   LeftRelativeForce — Left relative force (N/kg)
//   RightRelativeForce— Right relative force (N/kg)
//   Asymmetry         — Asymmetry index (%)

export function normalizeForceFrameResult(rawPayload: unknown): ValdForceFrameNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceFrame payload.", rawPayload);

  const params = buildParamMap(rawPayload);

  const leftPeak =
    paramValue(params, ["LeftPeakForce"]) ??
    firstNumber(record.left_peak_force_n, record.leftPeakForceN, record.left_peak);
  const rightPeak =
    paramValue(params, ["RightPeakForce"]) ??
    firstNumber(record.right_peak_force_n, record.rightPeakForceN, record.right_peak);
  const trustedPercent =
    paramValue(params, ["Asymmetry", "AsymmetryIndex"]) ??
    firstNumber(record.asymmetry_percent, record.asymmetryPercent);
  const asym = computeAsymmetry({ left: leftPeak, right: rightPeak, trustedPercent });

  return {
    product: "forceframe",
    testType: firstString(record.testType, record.test_type, record.protocol, record.name),
    testTimestamp:
      firstString(record.recordedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
      new Date().toISOString(),
    bodyRegion: firstString(record.bodyRegion, record.body_region),
    movementPattern: firstString(record.movementPattern, record.movement_pattern, record.pattern),
    leftPeakForceN: leftPeak,
    rightPeakForceN: rightPeak,
    leftRelativeForce:
      paramValue(params, ["LeftRelativeForce"]) ??
      firstNumber(record.left_relative_force, record.leftRelativeForce),
    rightRelativeForce:
      paramValue(params, ["RightRelativeForce"]) ??
      firstNumber(record.right_relative_force, record.rightRelativeForce),
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: leftPeak != null || rightPeak != null || asym.percent != null,
  };
}
