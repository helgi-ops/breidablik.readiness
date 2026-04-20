import type {
  CatapultDailyLoadRow,
  CatapultExternalLoadBaseline,
  CatapultExternalLoadSignals,
  DecelBurdenBand,
  HidTrendResult,
  LoadProfileType,
  ResidualDecelBand,
  ResidualDecelResult,
} from "./types";
import {
  getAccelLoad,
  getBand6Distance,
  getDecelLoad,
  getDensityStress,
  getHighAccelEfforts,
  getHighDecelEfforts,
  getHirDistance,
  getTotalDistance,
} from "./baselines";

const SMALL_NUMBER = 0.001;
const MAX_RATIO = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ratio(today: number | null | undefined, baseline: number): number | null {
  if (typeof today !== "number" || !Number.isFinite(today)) return null;
  return clamp(today / Math.max(baseline, SMALL_NUMBER), 0, MAX_RATIO);
}

function normalizeRatio(value: number | null, elevated = 1.1, high = 1.6): number {
  if (value == null) return 0;
  if (value <= elevated) return 0;
  if (value >= high) return 1;
  return clamp((value - elevated) / (high - elevated), 0, 1);
}

// ── Outdoor (GPS) signal weights ─────────────────────────────────────────────

type SignalWeights = {
  hirSpike: number;
  decelSpike: number;
  densityStressRatio: number;
  maxVelocityExposureRatio: number;
  band6ExposureRatio: number;
};

export const CATAPULT_SIGNAL_WEIGHTS: SignalWeights = {
  hirSpike: 0.34,
  decelSpike: 0.26,
  densityStressRatio: 0.2,
  maxVelocityExposureRatio: 0.14,
  band6ExposureRatio: 0.06,
};

// ── Indoor (FMP) signal weights ──────────────────────────────────────────────
//
// When GPS is unavailable, FMP replaces GPS-dependent signals:
//   Dynamic High %    → replaces HIR spike          (high-intensity COD/accel/decel)
//   PlayerLoad spike  → replaces density stress     (overall neuromuscular load)
//   IMA Total spike   → replaces decel spike        (impact load)
//   Dynamic Medium %  → replaces max velocity       (moderate-intensity movement)
//   Running High %         → replaces band6 exposure     (linear running load)

type IndoorSignalWeights = {
  fmpDynamicHighSpike: number;
  playerLoadSpike: number;
  imaTotalSpike: number;
  fmpDynamicMediumSpike: number;
  fmpRunningHighSpike: number;
};

export const INDOOR_SIGNAL_WEIGHTS: IndoorSignalWeights = {
  fmpDynamicHighSpike: 0.34,       // replaces HIR
  playerLoadSpike: 0.26,           // replaces density stress
  imaTotalSpike: 0.20,             // replaces decel spike
  fmpDynamicMediumSpike: 0.14,     // replaces max velocity
  fmpRunningHighSpike: 0.06,   // replaces band6
};

// ── Basketball signal weights ───────────────────────────────────────────────
//
// Basketball is always indoor. Key differences from football indoor:
//   - PlayerLoad is primary (constant jumping, landing, cutting)
//   - IMA Total weighted higher (change-of-direction dominant sport)
//   - Dynamic High still important (explosive lateral movement)
//   - Jump Load proxy via Dynamic High + PlayerLoad interaction
//   - Running High weighted less (court is 28m, less linear running)

export const BASKETBALL_SIGNAL_WEIGHTS: IndoorSignalWeights = {
  playerLoadSpike: 0.30,           // PRIMARY: jumping, landing, cutting load
  imaTotalSpike: 0.28,             // COD-dominant sport, accel/decel critical
  fmpDynamicHighSpike: 0.24,       // explosive lateral movement, sharp cuts
  fmpDynamicMediumSpike: 0.14,     // moderate-intensity movement patterns
  fmpRunningHighSpike: 0.04,       // minimal linear running on court
};

// ── Deceleration-specific helpers (McBurnie et al. 2022) ────────────────────
//
// High-intensity decelerations are biomechanically distinct from accelerations:
// - Higher ground reaction forces & loading rates
// - Eccentric muscle contraction → tissue damage risk
// - Cumulative decel load correlates with overuse injury (2-4 week window)
//
// We therefore track decel burden independently from the general NBS composite.

/**
 * Compute standalone deceleration burden score (0–1).
 * Weights high-intensity decel efforts (Band 2-3) heavily because
 * these represent the most damaging eccentric braking loads.
 */
function computeDecelBurdenScore(
  highDecelSpike: number | null,
  totalDecelSpike: number | null,
): number | null {
  if (highDecelSpike == null && totalDecelSpike == null) return null;
  // High-intensity decels are the primary concern (McBurnie: tissue damage,
  // CK elevation, mechanical fatigue failure). Total decels provide volume context.
  const hiNorm = normalizeRatio(highDecelSpike, 1.10, 1.50);
  const totalNorm = normalizeRatio(totalDecelSpike, 1.15, 1.60);
  return clamp(hiNorm * 0.65 + totalNorm * 0.35, 0, 1);
}

function decelBurdenToBand(score: number | null): DecelBurdenBand | null {
  if (score == null) return null;
  if (score >= 0.70) return "high";
  if (score >= 0.45) return "elevated";
  if (score >= 0.20) return "moderate";
  return "low";
}

/**
 * Compute accel:decel ratio from high-intensity band efforts.
 * Uses Band 2-3 efforts (> 3 m/s² accel, < -3 m/s² decel) as these
 * represent the truly demanding actions with distinct tissue loading.
 */
function computeAccelDecelRatio(
  today: CatapultDailyLoadRow | null,
): { ratio: number | null; profile: LoadProfileType | null } {
  if (!today) return { ratio: null, profile: null };
  const hiAccel = getHighAccelEfforts(today);
  const hiDecel = getHighDecelEfforts(today);
  // Need at least some efforts in both to compute a meaningful ratio
  if (hiAccel + hiDecel < 4) return { ratio: null, profile: null };
  // Avoid division by zero — if one side is 0, use 0.5 floor
  const safeDecel = Math.max(hiDecel, 0.5);
  const r = hiAccel / safeDecel;
  const clamped = clamp(r, 0, 5);

  let profile: LoadProfileType;
  if (clamped < 0.7) profile = "eccentric_dominant";
  else if (clamped > 1.3) profile = "concentric_dominant";
  else profile = "balanced";

  return { ratio: Math.round(clamped * 100) / 100, profile };
}

/**
 * Compute HID% — High-Intensity Distance as fraction of total distance.
 * HIR (Band5+Band6) ÷ totalDistance.
 */
function computeHidPercentage(today: CatapultDailyLoadRow | null): number | null {
  if (!today) return null;
  const total = getTotalDistance(today);
  if (total < 100) return null; // need meaningful distance
  const hir = getHirDistance(today);
  return Math.round((hir / total) * 1000) / 1000; // 3 decimal places
}

/**
 * Residual Decel Index — 3-day weighted accumulation of decel burden.
 * Mirrors Residual MLI pattern: today×1.0 + yesterday×0.6 + 2daysAgo×0.3
 *
 * Uses raw high-intensity decel effort spikes (ratio vs baseline) rather
 * than the 0–1 burden score, so the residual tracks absolute load accumulation.
 */
export function computeResidualDecel(
  todayDecelBurden: number | null,
  yesterdayDecelBurden: number | null,
  twoDaysAgoDecelBurden: number | null,
): ResidualDecelResult {
  const items = [
    { value: todayDecelBurden, weight: 1.0 },
    { value: yesterdayDecelBurden, weight: 0.6 },
    { value: twoDaysAgoDecelBurden, weight: 0.3 },
  ].filter((item): item is { value: number; weight: number } =>
    typeof item.value === "number" && Number.isFinite(item.value),
  );

  if (!items.length) return { residualDecel: null, residualDecelBand: null };

  // Scale burden (0–1) to 0–100 for residual accumulation (matches MLI scale)
  const residual = Math.round(
    items.reduce((sum, item) => sum + item.value * 100 * item.weight, 0) * 10,
  ) / 10;

  let band: ResidualDecelBand;
  if (residual >= 135) band = "HIGH";
  else if (residual >= 100) band = "CAUTION";
  else if (residual >= 60) band = "ELEVATED";
  else band = "NORMAL";

  return { residualDecel: residual, residualDecelBand: band };
}

// ── HID% Fatigue Trend (Harper et al. 2019) ────────────────────────────────
//
// Declining HID% (high-intensity distance as fraction of total) with stable
// total distance signals neuromuscular fatigue — the athlete covers the same
// volume but at lower intensity, indicating inability to reach high speeds.
//
// We compare today's HID% against a 7-day rolling average. A ≥20% relative
// drop (e.g. avg 0.28 → today 0.22) with stable total distance triggers a
// fatigue flag.

/**
 * Compute HID% fatigue trend from recent GPS history.
 *
 * @param recentRows - GPS rows for the last 7 days (NOT including today), sorted by date ascending
 * @param todayRow - Today's GPS row
 */
export function computeHidTrend(
  recentRows: CatapultDailyLoadRow[],
  todayRow: CatapultDailyLoadRow | null,
): HidTrendResult {
  const nullResult: HidTrendResult = {
    hidToday: null,
    hidAvg7d: null,
    hidDeclinePct: null,
    hidFatigueFlag: false,
  };

  const hidToday = computeHidPercentage(todayRow);
  if (hidToday == null) return { ...nullResult, hidToday: null };

  // Compute HID% for each of the recent days
  const recentHids = recentRows
    .map((row) => computeHidPercentage(row))
    .filter((v): v is number => v != null);

  // Need at least 3 days for a meaningful average
  if (recentHids.length < 3) return { ...nullResult, hidToday };

  const hidAvg7d = Math.round(
    (recentHids.reduce((sum, v) => sum + v, 0) / recentHids.length) * 1000,
  ) / 1000;

  // Avoid division by near-zero averages
  if (hidAvg7d < 0.05) return { hidToday, hidAvg7d, hidDeclinePct: null, hidFatigueFlag: false };

  // Relative decline: positive means today is LOWER than average
  const hidDeclinePct = Math.round(((hidAvg7d - hidToday) / hidAvg7d) * 1000) / 1000;

  // Check total distance stability — today's distance should be ≥70% of recent average
  // to confirm this isn't simply a rest/recovery day with low volume
  const recentDistances = recentRows
    .map((row) => getTotalDistance(row))
    .filter((d) => d >= 100);
  const avgDistance = recentDistances.length > 0
    ? recentDistances.reduce((sum, d) => sum + d, 0) / recentDistances.length
    : 0;
  const todayDistance = getTotalDistance(todayRow);
  const distanceStable = avgDistance > 0 && todayDistance >= avgDistance * 0.70;

  // Flag fatigue when HID% dropped ≥20% AND distance is stable
  const hidFatigueFlag = hidDeclinePct >= 0.20 && distanceStable;

  return { hidToday, hidAvg7d, hidDeclinePct, hidFatigueFlag };
}

// ── Main signal computation ──────────────────────────────────────────────────

export function computeCatapultExternalLoadSignals(args: {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
  indoorMode?: boolean;
  sportType?: "football" | "basketball";
}): CatapultExternalLoadSignals {
  const { today, baseline, indoorMode = false, sportType = "football" } = args;

  // Basketball always uses indoor mode regardless of toggle
  const effectiveIndoor = sportType === "basketball" ? true : indoorMode;

  // Select correct indoor weights based on sport
  const indoorWeights = sportType === "basketball" ? BASKETBALL_SIGNAL_WEIGHTS : INDOOR_SIGNAL_WEIGHTS;
  const days7 = baseline.availability.daysAvailable7d;
  const days28 = baseline.availability.daysAvailable28d;
  const dataQuality =
    !today || days28 < 10 ? "insufficient" : days7 < 3 ? "partial" : "good";

  // ── GPS-based signals (always computed, may be null indoors) ───────────────

  const playerLoadSpike = ratio(today?.playerLoad ?? null, baseline.chronic28dAvg.playerLoad);
  const hirSpike = ratio(getHirDistance(today), baseline.chronic28dAvg.hirDist);
  const decelSpike = ratio(getDecelLoad(today), baseline.chronic28dAvg.decelLoad);
  const accelSpike = ratio(getAccelLoad(today), baseline.chronic28dAvg.accelLoad);
  const maxVelocityExposureRatio = ratio(today?.maxVelocity ?? null, baseline.chronic28dAvg.maxVelocity);
  const densityStressRatio = ratio(getDensityStress(today), baseline.chronic28dAvg.densityStress);
  const band6ExposureRatio = ratio(getBand6Distance(today), baseline.chronic28dAvg.band6Distance);

  // ── FMP-based signals (always computed, primary when indoor) ───────────────

  const fmpDynamicHighSpike = ratio(today?.fmpDynamicHighS ?? null, baseline.chronic28dAvg.fmpDynamicHighS);
  const fmpDynamicMediumSpike = ratio(today?.fmpDynamicMediumS ?? null, baseline.chronic28dAvg.fmpDynamicMediumS);
  const fmpRunningHighSpike = ratio(today?.fmpRunningHighS ?? null, baseline.chronic28dAvg.fmpRunningHighS);
  const imaTotalSpike = ratio(today?.imaTotal ?? null, baseline.chronic28dAvg.imaTotal);

  // ── Deceleration-specific metrics ─────────────────────────────────────────

  const highDecelSpike = ratio(getHighDecelEfforts(today), baseline.chronic28dAvg.highDecelEfforts);
  const highAccelSpike = ratio(getHighAccelEfforts(today), baseline.chronic28dAvg.highAccelEfforts);

  const decelBurdenScore = dataQuality === "insufficient"
    ? null
    : computeDecelBurdenScore(highDecelSpike, decelSpike);
  const decelBurdenBand = decelBurdenToBand(decelBurdenScore);

  const { ratio: accelDecelRatio, profile: loadProfile } = computeAccelDecelRatio(today);
  const hidPercentage = computeHidPercentage(today);

  // ── Burden score ───────────────────────────────────────────────────────────

  let neuromuscularBurdenScore: number | null;

  if (dataQuality === "insufficient") {
    neuromuscularBurdenScore = null;
  } else if (effectiveIndoor) {
    // Indoor Mode: FMP + PlayerLoad + IMA based burden (weights vary by sport)
    neuromuscularBurdenScore = clamp(
      normalizeRatio(fmpDynamicHighSpike, 1.15, 1.6) * indoorWeights.fmpDynamicHighSpike +
        normalizeRatio(playerLoadSpike, 1.15, 1.6) * indoorWeights.playerLoadSpike +
        normalizeRatio(imaTotalSpike, 1.15, 1.6) * indoorWeights.imaTotalSpike +
        normalizeRatio(fmpDynamicMediumSpike, 1.1, 1.35) * indoorWeights.fmpDynamicMediumSpike +
        normalizeRatio(fmpRunningHighSpike, 1.2, 1.5) * indoorWeights.fmpRunningHighSpike,
      0,
      1,
    );
  } else {
    // Outdoor Mode: GPS based burden (original)
    neuromuscularBurdenScore = clamp(
      normalizeRatio(hirSpike, 1.15, 1.6) * CATAPULT_SIGNAL_WEIGHTS.hirSpike +
        normalizeRatio(decelSpike, 1.15, 1.6) * CATAPULT_SIGNAL_WEIGHTS.decelSpike +
        normalizeRatio(densityStressRatio, 1.1, 1.35) * CATAPULT_SIGNAL_WEIGHTS.densityStressRatio +
        normalizeRatio(maxVelocityExposureRatio, 1.02, 1.12) * CATAPULT_SIGNAL_WEIGHTS.maxVelocityExposureRatio +
        normalizeRatio(band6ExposureRatio, 1.2, 1.5) * CATAPULT_SIGNAL_WEIGHTS.band6ExposureRatio,
      0,
      1,
    );
  }

  // ── Load state classification ──────────────────────────────────────────────

  let elevatedCount: number;
  let highCount: number;

  if (effectiveIndoor) {
    // Indoor: use FMP + PlayerLoad + IMA signals
    elevatedCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.3,
      fmpDynamicHighSpike != null && fmpDynamicHighSpike >= 1.3,
      fmpDynamicMediumSpike != null && fmpDynamicMediumSpike >= 1.3,
      imaTotalSpike != null && imaTotalSpike >= 1.3,
      fmpRunningHighSpike != null && fmpRunningHighSpike >= 1.2,
    ].filter(Boolean).length;
    highCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.5,
      fmpDynamicHighSpike != null && fmpDynamicHighSpike >= 1.6,
      fmpDynamicMediumSpike != null && fmpDynamicMediumSpike >= 1.6,
      imaTotalSpike != null && imaTotalSpike >= 1.6,
      fmpRunningHighSpike != null && fmpRunningHighSpike >= 1.5,
    ].filter(Boolean).length;
  } else {
    // Outdoor: original GPS signals
    elevatedCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.3,
      hirSpike != null && hirSpike >= 1.3,
      decelSpike != null && decelSpike >= 1.3,
      accelSpike != null && accelSpike >= 1.3,
      maxVelocityExposureRatio != null && maxVelocityExposureRatio >= 1.05,
      densityStressRatio != null && densityStressRatio >= 1.2,
    ].filter(Boolean).length;
    highCount = [
      playerLoadSpike != null && playerLoadSpike >= 1.5,
      hirSpike != null && hirSpike >= 1.6,
      decelSpike != null && decelSpike >= 1.6,
      accelSpike != null && accelSpike >= 1.6,
      maxVelocityExposureRatio != null && maxVelocityExposureRatio >= 1.12,
      densityStressRatio != null && densityStressRatio >= 1.35,
    ].filter(Boolean).length;
  }

  let externalLoadState: CatapultExternalLoadSignals["externalLoadState"] = "normal";
  if (dataQuality === "insufficient") externalLoadState = "unknown";
  else if (highCount >= 2 || elevatedCount >= 3 || (neuromuscularBurdenScore ?? 0) >= 0.66) externalLoadState = "high";
  else if (highCount >= 1 || elevatedCount >= 1 || (neuromuscularBurdenScore ?? 0) >= 0.34) externalLoadState = "elevated";

  return {
    playerLoadSpike,
    hirSpike,
    decelSpike,
    accelSpike,
    maxVelocityExposureRatio,
    densityStressRatio,
    band6ExposureRatio,
    neuromuscularBurdenScore,
    externalLoadState,
    dataQuality,
    // FMP indoor signals
    fmpDynamicHighSpike,
    fmpDynamicMediumSpike,
    fmpRunningHighSpike,
    imaTotalSpike,
    // Deceleration-specific metrics
    decelBurdenScore,
    decelBurdenBand,
    accelDecelRatio,
    loadProfile,
    hidPercentage,
  };
}
