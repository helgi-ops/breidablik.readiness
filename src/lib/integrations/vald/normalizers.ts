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

// ── VALD parameter extraction ──────────────────────────────────────────────────
//
// VALD External API v2019q3 TestDTO returns test parameters as:
//   "param"     — single TestParameterDTO { resultId: integer, value: number, definition?: ResultDefinition }
//   "extParams" — array of TestParameterDTO
//
// Older / internal APIs may use:
//   "parameter" / "parameters"    — array of the same shape
//   "extendedParameters"          — array of the same shape
//
// The definition sub-object (if present) may carry a human-readable name/shortName
// that maps to our lookup keys (e.g. "JumpHeightMO", "PeakPower").
//
// This helper builds a Map<key, value> where key is:
//   1. definition.name or definition.shortName (preferred — matches our string keys)
//   2. String(resultId) as numeric fallback

type ParamEntry = { resultId?: unknown; value?: unknown; definition?: unknown };

function buildParamMap(payload: unknown): Map<string, number> {
  const record = asRecord(payload);
  if (!record) return new Map();
  const map = new Map<string, number>();

  function addEntry(item: unknown) {
    const entry = asRecord(item) as ParamEntry | null;
    if (!entry) return;
    const val = toNumber(entry.value);
    if (val == null) return;

    // Prefer named key from definition (matches our resultId string constants)
    const def = asRecord(entry.definition);
    const namedKey =
      (typeof def?.name === "string" && def.name.trim() ? def.name.trim() : null) ??
      (typeof def?.shortName === "string" && def.shortName.trim() ? def.shortName.trim() : null) ??
      (typeof def?.key === "string" && def.key.trim() ? def.key.trim() : null);

    if (namedKey) {
      map.set(namedKey, val);
    }

    // Also store by resultId (string or numeric-as-string) as a universal fallback
    if (typeof entry.resultId === "string" && entry.resultId.trim()) {
      map.set(entry.resultId.trim(), val);
    } else if (typeof entry.resultId === "number") {
      map.set(String(entry.resultId), val);
    }
  }

  function addEntries(arr: unknown) {
    if (Array.isArray(arr)) {
      for (const item of arr) addEntry(item);
    } else if (arr && typeof arr === "object") {
      // Single object (VALD External API "param" field)
      addEntry(arr);
    }
  }

  // VALD External API v2019q3 fields
  addEntries(record.param);
  addEntries(record.extParams);
  // Older / internal API fields (kept for backwards compatibility)
  addEntries(record.parameter);
  addEntries(record.parameters);
  addEntries(record.extendedParameters);

  // VALD per-athlete endpoint format: trials[].results[]
  // Each result has: { resultId, value, limb, definition: { result, unit, name } }
  // We store with keys prefixed "TRIAL_<RESULT_CODE>" (and "_LEFT", "_RIGHT" for bilateral).
  // Unit conversion: Meter→×100 cm, Second→×1000 ms; others stored as-is.
  const trials = record.trials;
  if (Array.isArray(trials)) {
    const groups = new Map<string, number[]>();
    for (const trial of trials) {
      const t = asRecord(trial);
      if (!t) continue;
      const results = t.results;
      if (!Array.isArray(results)) continue;
      for (const res of results) {
        const r = asRecord(res);
        if (!r) continue;
        const val = toNumber(r.value);
        if (val == null) continue;
        const def = asRecord(r.definition);
        if (!def) continue;
        const resultCode = typeof def.result === "string" ? def.result.trim() : null;
        if (!resultCode) continue;
        // Unit-aware conversion to canonical units
        const unit = typeof def.unit === "string" ? def.unit.trim().toLowerCase() : "";
        let converted = val;
        if (unit === "meter" || unit === "m") converted = val * 100; // m → cm
        else if (unit === "second" || unit === "s") converted = val * 1000; // s → ms
        // VALD ForceDecks MISLABELS its phase-duration keys (Contraction Time,
        // Eccentric/Concentric/Braking Duration, Flight Time, Time to Peak Force)
        // as "Millisecond" but sends SECONDS — e.g. contraction time 0.9 = 0.9 s.
        // Verified across the whole squad (every "Millisecond" value < 1). Convert
        // to real ms so the _ms columns hold milliseconds, not seconds.
        else if (unit === "millisecond" || unit === "ms") converted = val * 1000;
        // RSI-modified (unit "RSIModified") comes ×100 from VALD's API vs the
        // standard ratio the app displays — divide to canonical (52.5 → 0.525).
        else if (unit === "rsimodified") converted = val / 100;
        // Newton, Watt, Centimeter, % — stored as-is
        const limb = typeof r.limb === "string" ? r.limb.trim() : "Trial";
        const suffix = limb === "Trial" || limb === "Both" ? "" : `_${limb.toUpperCase()}`;
        const key = `TRIAL_${resultCode}${suffix}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(converted);
      }
    }
    // For each metric, use the max value across all trials
    for (const [key, values] of groups) {
      if (!map.has(key)) map.set(key, Math.max(...values));
    }
  }

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

/**
 * Resolve RSI-modified with honest provenance. Prefer VALD's native value; if it
 * isn't sent but jump height + time-to-takeoff are, DERIVE it:
 *   RSI-mod = jump_height(m) ÷ time-to-takeoff(s)
 *           = (cm/100) ÷ (ms/1000) = cm × 10 ÷ ms
 * If neither a native value nor the components exist, return null — NEVER zero.
 * A missing RSI is a claim about the data, not the athlete.
 */
function resolveRsiMod(
  rsiModFromVald: number | null,
  jumpHeightCm: number | null,
  timeToTakeoffMs: number | null,
): { rsiMod: number | null; rsiModSource: "vald" | "derived" | null } {
  if (rsiModFromVald != null) return { rsiMod: rsiModFromVald, rsiModSource: "vald" };
  if (jumpHeightCm != null && timeToTakeoffMs != null && timeToTakeoffMs > 0) {
    return { rsiMod: (jumpHeightCm * 10) / timeToTakeoffMs, rsiModSource: "derived" };
  }
  return { rsiMod: null, rsiModSource: null };
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

/**
 * Best-effort capture of early/windowed RFD (N/s) and measured flight time (ms)
 * from VALD's CMJ result keys (item 4). Defensive key list — VALD's exact RFD code
 * varies by test config; whatever is absent stays null (→ honest empty state, never
 * a fabricated zero). Prefers early windows (0–100/0–200 ms) over peak/mean RFD.
 */
function extractRfdFlight(params: Map<string, number>): { rfdNS: number | null; flightTimeMs: number | null } {
  const rfdNS = paramValue(params, [
    // VALD's actual CMJ result code is CONCENTRIC_RFD (the headline "Concentric
    // RFD", N/s). The early-window CONCENTRIC_RFD_50/_100 exist too but are wildly
    // noisy (CoV often > 100%), so we take the peak concentric RFD, not the windows.
    "TRIAL_CONCENTRIC_RFD",
    "TRIAL_RFD_0_100_MS",
    "TRIAL_RFD_0_200_MS",
    "TRIAL_RFD_100",
    "TRIAL_RFD_200",
    "TRIAL_MEAN_RFD",
    "TRIAL_RFD",
    "TRIAL_PEAK_RFD",
  ]);
  const flightTimeMs =
    paramValue(params, ["TRIAL_FLIGHT_TIME"]) ??
    paramValue(params, ["FlightTime"], 1000);
  return { rfdNS: rfdNS ?? null, flightTimeMs: flightTimeMs ?? null };
}

export function normalizeForceDecksResult(rawPayload: unknown): ValdForceDecksNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceDecks payload.", rawPayload);

  const params = buildParamMap(rawPayload);

  // Jump height: prefer momentum-offset, fall back to flight-time.
  // TRIAL_JUMP_HEIGHT_MO / TRIAL_JUMP_HEIGHT come from trials[].results[] — already in cm.
  // JumpHeightMO / JumpHeight come from param/extParams — in meters, need ×100.
  const jumpHeightCm =
    paramValue(params, ["TRIAL_JUMP_HEIGHT_MO", "TRIAL_JUMP_HEIGHT"]) ??
    paramValue(params, ["JumpHeightMO", "JumpHeight"], 100) ??
    firstNumber(record.jump_height_cm, record.jumpHeightCm, record.jump_height);

  const peakPowerW =
    paramValue(params, ["TRIAL_PEAK_TAKEOFF_POWER", "TRIAL_PEAK_POWER"]) ??
    paramValue(params, ["PeakPower"]) ??
    firstNumber(record.peak_power_w, record.peakPowerW, record.peak_power);

  // Athlete body weight (kg) — used to compute relative power when VALD doesn't return it directly
  const bodyWeightKg = firstNumber(record.weight, record.bodyWeightKg, record.body_weight_kg);

  // Bilateral values — prefer concentric peak/mean force from trials
  const leftValue =
    paramValue(params, ["TRIAL_CONCENTRIC_PEAK_FORCE_LEFT", "TRIAL_MEAN_TAKEOFF_FORCE_LEFT", "TRIAL_PEAK_FORCE_LEFT"]) ??
    paramValue(params, ["LeftPeakForce", "LeftForce"]) ??
    firstNumber(record.left_value, record.leftValue, record.left);
  const rightValue =
    paramValue(params, ["TRIAL_CONCENTRIC_PEAK_FORCE_RIGHT", "TRIAL_MEAN_TAKEOFF_FORCE_RIGHT", "TRIAL_PEAK_FORCE_RIGHT"]) ??
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

  const timeToTakeoffMs =
    // VALD sends no takeoff-time key; CONTRACTION_TIME ("Contraction Time",
    // movement-start→takeoff) is the available proxy the phase CV gate uses.
    paramValue(params, ["TRIAL_TIME_TO_TAKEOFF", "TRIAL_CONTRACTION_TIME"]) ??
    paramValue(params, ["TimeToTakeoff"], 1000) ??
    firstNumber(record.time_to_takeoff_ms, record.timeToTakeoffMs);
  const rsiModFromVald =
    paramValue(params, ["TRIAL_RSI_MODIFIED", "TRIAL_RSI_MOD"]) ??
    paramValue(params, ["RSIMod", "RSIModified"]) ??
    firstNumber(record.rsi_mod, record.rsiMod);
  const { rsiMod, rsiModSource } = resolveRsiMod(rsiModFromVald, jumpHeightCm, timeToTakeoffMs);
  const rfdFlight = extractRfdFlight(params);

  return {
    product: "forcedecks",
    testType: firstString(record.testType, record.test_type, record.protocol, record.name),
    testTimestamp:
      firstString(record.recordedUTC, record.recordedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
      new Date().toISOString(),
    jumpHeightCm,
    rsiMod,
    rsiModSource,
    resultKeysSeen: [...params.keys()],
    eccentricDurationMs:
      // TRIAL keys already in ms (unit="Second" converted ×1000 in buildParamMap).
      // ECCENTRIC_TIME is VALD's actual key for "Eccentric Duration".
      // NB: VALD misspells "braking" as "BEAKING" in its ratio keys
      // (BEAKING_CONCENTRIC_DURATION_RATIO etc.) — match that typo, not "BRAKING",
      // if those are ever needed. The keys below are spelled correctly.
      paramValue(params, ["TRIAL_ECCENTRIC_DURATION", "TRIAL_ECCENTRIC_TIME", "TRIAL_BRAKING_DURATION"]) ??
      paramValue(params, ["EccentricDuration"], 1000) ??
      firstNumber(record.eccentric_duration_ms, record.eccentricDurationMs),
    concentricDurationMs:
      paramValue(params, ["TRIAL_CONCENTRIC_DURATION", "TRIAL_PROPULSION_DURATION"]) ??
      paramValue(params, ["ConcentricDuration"], 1000) ??
      firstNumber(record.concentric_duration_ms, record.concentricDurationMs),
    peakPowerW,
    relativePeakPowerWKg:
      paramValue(params, ["TRIAL_PEAK_TAKEOFF_POWER_BW"]) ??
      paramValue(params, ["PeakPowerBW", "PeakPowerRelative"]) ??
      firstNumber(record.relative_peak_power_w_kg, record.relativePeakPowerWKg) ??
      // Compute from peak power + body weight when VALD doesn't return it directly
      (peakPowerW != null && bodyWeightKg != null && bodyWeightKg > 0
        ? peakPowerW / bodyWeightKg
        : null),
    peakForceN:
      paramValue(params, ["TRIAL_PEAK_CONCENTRIC_FORCE", "TRIAL_PEAK_FORCE"]) ??
      paramValue(params, ["PeakForce"]) ??
      firstNumber(record.peak_force_n, record.peakForceN),
    concentricImpulseNS:
      paramValue(params, ["TRIAL_CONCENTRIC_IMPULSE"]) ??
      paramValue(params, ["ConcentricImpulse"]) ??
      firstNumber(record.concentric_impulse_n_s, record.concentricImpulseNS),
    timeToTakeoffMs,
    rfdNS: rfdFlight.rfdNS,
    flightTimeMs: rfdFlight.flightTimeMs,
    concentricPeakVelocityMS: paramValue(params, ["TRIAL_PEAK_TAKEOFF_VELOCITY"]),
    leftValue,
    rightValue,
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: jumpHeightCm != null || peakPowerW != null || asym.percent != null,
  };
}

// ── NordBord normalizer ───────────────────────────────────────────────────────
//
// External NordBord /tests/v2 returns FLAT fields (no param/extParams envelope),
// verified against VALD's own guide (support.vald.com, 23 Aug 2026):
//   leftMaxForce / rightMaxForce   — peak force per limb (N)
//   leftAvgForce / rightAvgForce   — average force per limb (N)
//   leftImpulse  / rightImpulse    — impulse (N·s)      [kept in raw]
//   leftTorque   / rightTorque     — torque (N·m)       [kept in raw]
//   testTypeName ("Nordic"), testDateUtc, modifiedDateUtc, device
// (The legacy PeakForce/param keys are kept as fallbacks for older payloads.)

export function normalizeNordBordResult(rawPayload: unknown): ValdNordBordNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid NordBord payload.", rawPayload);

  const params = buildParamMap(rawPayload);

  const leftPeak =
    firstNumber(record.leftMaxForce) ??
    paramValue(params, ["LeftPeakForce"]) ??
    firstNumber(record.left_peak_force_n, record.leftPeakForceN, record.left_peak);
  const rightPeak =
    firstNumber(record.rightMaxForce) ??
    paramValue(params, ["RightPeakForce"]) ??
    firstNumber(record.right_peak_force_n, record.rightPeakForceN, record.right_peak);
  const trustedPercent =
    paramValue(params, ["Asymmetry", "AsymmetryIndex"]) ??
    firstNumber(record.asymmetry_percent, record.asymmetryPercent);
  const asym = computeAsymmetry({ left: leftPeak, right: rightPeak, trustedPercent });

  return {
    product: "nordbord",
    testType: firstString(record.testTypeName, record.testType, record.test_type, record.protocol, record.name),
    testTimestamp:
      firstString(record.recordedUTC, record.recordedDateUtc, record.testDateUtc, record.modifiedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
      new Date().toISOString(),
    leftPeakForceN: leftPeak,
    rightPeakForceN: rightPeak,
    leftAvgForceN:
      firstNumber(record.leftAvgForce) ??
      paramValue(params, ["LeftAverageForce", "LeftAvgForce"]) ??
      firstNumber(record.left_avg_force_n, record.leftAvgForceN, record.left_average_force_n),
    rightAvgForceN:
      firstNumber(record.rightAvgForce) ??
      paramValue(params, ["RightAverageForce", "RightAvgForce"]) ??
      firstNumber(record.right_avg_force_n, record.rightAvgForceN, record.right_average_force_n),
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: leftPeak != null || rightPeak != null || asym.percent != null,
  };
}

// ── ForceFrame normalizer ─────────────────────────────────────────────────────
//
// External ForceFrame /tests/v2 returns FLAT fields split across TWO paddle sets
// (inner + outer), each with a left/right pair — verified against VALD's own
// guide (support.vald.com, 23 Aug 2026):
//   innerLeftMaxForce / innerRightMaxForce / innerLeftAvgForce / innerRightAvgForce
//   outerLeftMaxForce / outerRightMaxForce / outerLeftAvgForce / outerRightAvgForce
//   testTypeName ("Ankle IN/EV", "Hip AD/AB", …), testPositionName, testDateUtc
//
// Inner and outer are DIFFERENT movements measured together (e.g. adduction vs
// abduction), so they cannot be merged into one limb. We report the left/right
// asymmetry for the DOMINANT paddle set — the one actually loaded this test
// (greater combined L+R force). All four raw values remain in vald_raw_tests for
// anyone who needs the non-dominant movement. Per-kg relative force is NOT in the
// /tests summary (it lives in /tests/{id}/metrics), so it stays null — honest.

export function normalizeForceFrameResult(rawPayload: unknown): ValdForceFrameNormalizedResult {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceFrame payload.", rawPayload);

  const params = buildParamMap(rawPayload);

  const innerL = firstNumber(record.innerLeftMaxForce);
  const innerR = firstNumber(record.innerRightMaxForce);
  const outerL = firstNumber(record.outerLeftMaxForce);
  const outerR = firstNumber(record.outerRightMaxForce);
  const innerSum = (innerL ?? 0) + (innerR ?? 0);
  const outerSum = (outerL ?? 0) + (outerR ?? 0);
  const hasPaddleFields = innerL != null || innerR != null || outerL != null || outerR != null;
  // Dominant paddle set = the one with the greater combined force.
  const useOuter = outerSum > innerSum;

  const leftPeak = hasPaddleFields
    ? (useOuter ? outerL : innerL)
    : paramValue(params, ["LeftPeakForce"]) ?? firstNumber(record.left_peak_force_n, record.leftPeakForceN, record.left_peak);
  const rightPeak = hasPaddleFields
    ? (useOuter ? outerR : innerR)
    : paramValue(params, ["RightPeakForce"]) ?? firstNumber(record.right_peak_force_n, record.rightPeakForceN, record.right_peak);

  const trustedPercent =
    paramValue(params, ["Asymmetry", "AsymmetryIndex"]) ??
    firstNumber(record.asymmetry_percent, record.asymmetryPercent);
  const asym = computeAsymmetry({ left: leftPeak, right: rightPeak, trustedPercent });

  const testTypeName = firstString(record.testTypeName, record.testType, record.test_type, record.protocol, record.name);
  return {
    product: "forceframe",
    testType: testTypeName,
    testTimestamp:
      firstString(record.recordedUTC, record.recordedDateUtc, record.testDateUtc, record.modifiedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
      new Date().toISOString(),
    // Body region = the joint word from the test name ("Ankle", "Hip", "Neck").
    bodyRegion:
      firstString(record.bodyRegion, record.body_region) ??
      (testTypeName ? testTypeName.split(/[\s/]/)[0] : null),
    // Movement pattern = the specific test/position ("Ankle IN/EV", "Hip AD/AB").
    movementPattern:
      firstString(record.movementPattern, record.movement_pattern, record.pattern) ??
      firstString(record.testPositionName) ?? testTypeName,
    leftPeakForceN: leftPeak,
    rightPeakForceN: rightPeak,
    leftRelativeForce:
      paramValue(params, ["LeftRelativeForce"]) ??
      firstNumber(record.leftMaxForcePerKg, record.left_relative_force, record.leftRelativeForce),
    rightRelativeForce:
      paramValue(params, ["RightRelativeForce"]) ??
      firstNumber(record.rightMaxForcePerKg, record.right_relative_force, record.rightRelativeForce),
    asymmetryPercent: asym.percent,
    asymmetrySide: asym.side,
    isValid: leftPeak != null || rightPeak != null || asym.percent != null,
  };
}

// ── ForceDecks per-trial expansion ───────────────────────────────────────────
//
// VALD test sessions contain multiple trials (typically 3 CMJ jumps).
// This function returns one ValdForceDecksNormalizedResult per trial,
// each tagged with a 1-based trialNumber.  If the payload has no `trials`
// array (legacy format), it falls back to the original normalizer so we
// still produce at least one row.

function buildTrialParamMap(trialRecord: Record<string, unknown>): Map<string, number> {
  const map = new Map<string, number>();
  const results = trialRecord.results;
  if (!Array.isArray(results)) return map;
  for (const res of results) {
    const r = asRecord(res);
    if (!r) continue;
    const val = toNumber(r.value);
    if (val == null) continue;
    const def = asRecord(r.definition);
    if (!def) continue;
    const resultCode = typeof def.result === "string" ? def.result.trim() : null;
    if (!resultCode) continue;
    const unit = typeof def.unit === "string" ? def.unit.trim().toLowerCase() : "";
    let converted = val;
    if (unit === "meter" || unit === "m") converted = val * 100;
    else if (unit === "second" || unit === "s") converted = val * 1000;
    // VALD mislabels ForceDecks phase durations as "Millisecond" but sends
    // seconds (see buildParamMap note) — convert to real ms.
    else if (unit === "millisecond" || unit === "ms") converted = val * 1000;
    // VALD's API returns RSI-modified (unit "RSIModified") ×100 vs the standard
    // ratio the ForceDecks app displays (e.g. 52.5 → 0.525). Divide to canonical.
    else if (unit === "rsimodified") converted = val / 100;
    const limb = typeof r.limb === "string" ? r.limb.trim() : "Trial";
    const suffix = limb === "Trial" || limb === "Both" ? "" : `_${limb.toUpperCase()}`;
    const key = `TRIAL_${resultCode}${suffix}`;
    map.set(key, converted);
    // Also store human-readable name from definition for param lookups
    const namedKey =
      (typeof def.name === "string" && def.name.trim() ? def.name.trim() : null) ??
      (typeof def.shortName === "string" && def.shortName.trim() ? def.shortName.trim() : null);
    if (namedKey) map.set(namedKey, converted);
  }
  return map;
}

export type ForceDecksTrialResult = ValdForceDecksNormalizedResult & { trialNumber: number };

export function normalizeForceDecksTrials(rawPayload: unknown): ForceDecksTrialResult[] {
  const record = asRecord(rawPayload);
  if (!record) throw new ValdNormalizationError("Invalid ForceDecks payload.", rawPayload);

  const trials = record.trials;
  if (!Array.isArray(trials) || trials.length === 0) {
    return [{ ...normalizeForceDecksResult(rawPayload), trialNumber: 1 }];
  }

  const testType = firstString(record.testType, record.test_type, record.protocol, record.name);
  const baseTimestamp =
    firstString(record.recordedUTC, record.recordedDateUtc, record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at) ??
    new Date().toISOString();
  const bodyWeightKg = firstNumber(record.weight, record.bodyWeightKg, record.body_weight_kg);

  const expanded: ForceDecksTrialResult[] = [];
  for (let i = 0; i < trials.length; i++) {
    const t = asRecord(trials[i]);
    if (!t) continue;
    const params = buildTrialParamMap(t as Record<string, unknown>);
    const jumpHeightCm =
      paramValue(params, ["TRIAL_JUMP_HEIGHT_MO", "TRIAL_JUMP_HEIGHT"]) ??
      paramValue(params, ["Jump Height (Flight Time)"]) ??
      paramValue(params, ["Jump Height (Imp-Mom)"]);
    const peakPowerW =
      paramValue(params, ["TRIAL_PEAK_TAKEOFF_POWER", "TRIAL_PEAK_POWER"]) ??
      paramValue(params, ["Peak Power / Force"]);
    const leftValue =
      paramValue(params, ["TRIAL_CONCENTRIC_PEAK_FORCE_LEFT", "TRIAL_MEAN_TAKEOFF_FORCE_LEFT", "TRIAL_PEAK_FORCE_LEFT"]);
    const rightValue =
      paramValue(params, ["TRIAL_CONCENTRIC_PEAK_FORCE_RIGHT", "TRIAL_MEAN_TAKEOFF_FORCE_RIGHT", "TRIAL_PEAK_FORCE_RIGHT"]);
    const trustedPercent = paramValue(params, ["TRIAL_ASYMMETRY", "Asymmetry"]);
    const trialAsym = computeAsymmetry({ left: leftValue, right: rightValue, trustedPercent });
    const trialTimestamp = firstString(t.recordedUTC as string | undefined) ?? baseTimestamp;

    // CONTRACTION_TIME (movement-start→takeoff) is VALD's takeoff-time proxy.
    const timeToTakeoffMs = paramValue(params, ["TRIAL_TIME_TO_TAKEOFF", "TRIAL_CONTRACTION_TIME"]);
    const { rsiMod, rsiModSource } = resolveRsiMod(
      paramValue(params, ["TRIAL_RSI_MODIFIED", "TRIAL_RSI_MOD"]),
      jumpHeightCm,
      timeToTakeoffMs,
    );

    expanded.push({
      product: "forcedecks",
      trialNumber: i + 1,
      testType,
      testTimestamp: trialTimestamp,
      jumpHeightCm,
      rsiMod,
      rsiModSource,
      resultKeysSeen: [...params.keys()],
      eccentricDurationMs: paramValue(params, ["TRIAL_ECCENTRIC_DURATION", "TRIAL_ECCENTRIC_TIME", "TRIAL_BRAKING_DURATION"]),
      concentricDurationMs: paramValue(params, ["TRIAL_CONCENTRIC_DURATION", "TRIAL_PROPULSION_DURATION"]),
      peakPowerW,
      relativePeakPowerWKg:
        paramValue(params, ["TRIAL_PEAK_TAKEOFF_POWER_BW"]) ??
        (peakPowerW != null && bodyWeightKg != null && bodyWeightKg > 0 ? peakPowerW / bodyWeightKg : null),
      peakForceN: paramValue(params, ["TRIAL_PEAK_CONCENTRIC_FORCE", "TRIAL_PEAK_FORCE"]),
      concentricImpulseNS: paramValue(params, ["TRIAL_CONCENTRIC_IMPULSE"]),
      timeToTakeoffMs,
      rfdNS: extractRfdFlight(params).rfdNS,
      flightTimeMs: extractRfdFlight(params).flightTimeMs,
      concentricPeakVelocityMS: paramValue(params, ["TRIAL_PEAK_TAKEOFF_VELOCITY"]),
      leftValue,
      rightValue,
      asymmetryPercent: trialAsym.percent,
      asymmetrySide: trialAsym.side,
      isValid: jumpHeightCm != null || peakPowerW != null || trialAsym.percent != null,
    });
  }

  if (expanded.length === 0) {
    return [{ ...normalizeForceDecksResult(rawPayload), trialNumber: 1 }];
  }
  return expanded;
}
