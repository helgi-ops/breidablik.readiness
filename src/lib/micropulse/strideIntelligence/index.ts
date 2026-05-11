/**
 * Stride Intelligence — IMA-derived movement-quality signals.
 *
 * The Catapult IMA Free Running 8-band pipeline extracts stride events from
 * the IMU regardless of GPS quality, so it works equally well INDOOR and
 * OUTDOOR. Previously these metrics surfaced only as the "Indoor Composite",
 * but the same data carry useful information outdoor too:
 *
 *   1. Cadence (volume-weighted avg stride rate) — declines under NM fatigue.
 *   2. Stride length proxy (HSR distance / high-velocity strides) — declining
 *      values indicate compensation patterns.
 *   3. L/R Change-of-Direction asymmetry (Bishop 2020) — >15% flag for
 *      injury risk and RTP clearance.
 *   4. GPS / IMA decoupling — if GPS reports high-speed running but IMA
 *      stride-load stays low, the player is moving fast without the usual
 *      mechanical cost (reduced effort, possibly fatigue or compensation).
 *
 * The output of this module is a `StrideIntelligencePayload` that the
 * decision engine consumes alongside the existing internal/external/metabolic
 * signals. It is mode-agnostic: same inputs produce same outputs whether
 * the team is set to indoor or outdoor.
 *
 * References:
 *   - Bishop et al. 2020 — Asymmetry thresholds for screening tests in soccer.
 *   - Cardinale et al. 2017 — Cadence as NM fatigue indicator in team sport.
 *   - Catapult IMA white paper — Free Running stride detection bands.
 */

export type StrideRow = {
  /** Per-band stride count (1..8). Null bands treated as 0. */
  strideCounts: (number | null | undefined)[];
  /** Per-band avg stride rate (Hz). Null when band had no strides. */
  strideRates: (number | null | undefined)[];
  /** Per-band IMU player load contribution (a.u.). */
  stridePlayerLoads: (number | null | undefined)[];

  /** Velocity Band 5 + 6 distance (m) — high-speed running coverage. */
  hsrDistance: number | null | undefined;
  /** Velocity Band 6 distance (m) — sprint coverage. */
  sprintDistance?: number | null | undefined;
  /** Total distance covered (m). */
  totalDistance: number | null | undefined;

  /** L/R IMA Change-of-Direction event counts (Low + Medium + High). */
  codLeft: number | null | undefined;
  codRight: number | null | undefined;
};

export type StrideMetrics = {
  totalStrides: number;
  hiVelocityStrides: number;
  highIntensityPlayerLoad: number;
  /** Volume-weighted avg stride rate across all 8 bands (Hz). null when no strides. */
  cadenceWeighted: number | null;
  /** HSR meters / high-velocity strides (m/stride). Normal ~1.8–2.2 at sprint speed. */
  strideLengthHsr: number | null;
  codLeftTotal: number;
  codRightTotal: number;
  /** |L - R| / ((L + R) / 2) × 100. null when total < MIN_COD_EVENTS. */
  codLrAsymmetryPct: number | null;
  /** GPS-vs-IMA decoupling ratio. <0 means HSR distance way above stride load. */
  gpsImaDecoupling: number | null;
};

export type StrideBaselineRef = {
  metricKey: string;
  mean: number | null;
  sd: number | null;
  status: "active" | "calibrating" | "insufficient_data";
};

export type StrideDriverFlag = {
  driver:
    | "STRIDE_CADENCE_DROP"
    | "STRIDE_LENGTH_DROP"
    | "COD_LR_ASYMMETRY"
    | "GPS_IMA_DECOUPLING";
  /** Personal-z score for this metric (signed; negative = below baseline). */
  z: number | null;
  /** Raw value used to compute the flag. */
  value: number | null;
  /** Severity tier for downstream messaging. */
  severity: "watch" | "concern" | "high";
};

export type StrideIntelligencePayload = {
  metrics: StrideMetrics;
  /** Drivers that crossed personal-z or absolute thresholds. Empty when nothing flagged. */
  drivers: StrideDriverFlag[];
  /** Coach-facing one-liner per driver, ready to push into Decision Summary. */
  reasons: string[];
};

const MIN_COD_EVENTS_FOR_ASYMMETRY = 5;

// Asymmetry thresholds — DUAL CHECK design.
//
// Background: our L/R source is raw IMA band1+2+3 left/right counts (all
// direction events at low/medium/high intensity). This captures NATURAL
// dominant-foot bias which makes population-wide thresholds (Bishop 2020 at
// 9/15/18%) too sensitive — it would flag everyone constantly. The Bishop
// numbers were derived from explicit cutting-task tests, not raw direction
// events. From real Breiðablik data (May 2026, 17 players) the distribution
// is: median 19%, p75 23%, p90 28%, p95 34% — so absolute thresholds at
// 9/15/18% don't fit our metric.
//
// Solution: flag when EITHER condition is true:
//   1. Personal-z spike: today's asymmetry is sudden vs the player's own
//      28-day mean (catches new injury / acute compensation)
//   2. Absolute outlier: above population p90/p95 regardless of baseline
//      (catches biomechanically-risky asymmetry even when it's "normal" for
//      that player)
const COD_ASYMMETRY_WATCH_PCT = 25;  // ~p75-p80 — trend toward concern
const COD_ASYMMETRY_CONCERN_PCT = 30; // ~p90 — meaningful imbalance
const COD_ASYMMETRY_HIGH_PCT = 40;   // ~p95+ — serious imbalance regardless of baseline
const Z_WATCH = -1.0;
const Z_CONCERN = -1.5;
const Z_HIGH = -2.0;
/** Below this stride length (m/stride) the value is structurally unrealistic. */
const STRIDE_LENGTH_FLOOR = 0.5;

function nullSafeSum(xs: ReadonlyArray<number | null | undefined>): number {
  let s = 0;
  for (const x of xs) {
    const n = Number(x ?? 0);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

/**
 * Convert raw daily-row stride fields into derived stride metrics.
 * Pure / no IO — call this with whatever shape your loader produces.
 */
export function computeStrideMetrics(row: StrideRow): StrideMetrics {
  const counts = row.strideCounts.map((v) => Number(v ?? 0));
  const rates = row.strideRates.map((v) => Number(v ?? 0));
  const loads = row.stridePlayerLoads.map((v) => Number(v ?? 0));

  const totalStrides = counts.reduce((s, c) => s + (Number.isFinite(c) ? c : 0), 0);
  const hiVelocityStrides = (counts[4] ?? 0) + (counts[5] ?? 0) + (counts[6] ?? 0) + (counts[7] ?? 0);
  const highIntensityPlayerLoad =
    (loads[3] ?? 0) + (loads[4] ?? 0) + (loads[5] ?? 0) + (loads[6] ?? 0) + (loads[7] ?? 0);

  // Volume-weighted cadence: Σ(rate × count) / Σcount.
  let weightedSum = 0;
  for (let i = 0; i < 8; i += 1) {
    const c = counts[i] ?? 0;
    const r = rates[i] ?? 0;
    if (c > 0 && Number.isFinite(r) && Number.isFinite(c)) {
      weightedSum += r * c;
    }
  }
  const cadenceWeighted = totalStrides > 0 ? weightedSum / totalStrides : null;

  // Average stride length across the whole session.
  //
  // Iteration history (kept for posterity so we don't repeat the mistake):
  //  v1: hsrDistance / (bands 5-8 strides) → 0.15 m/stride (too low).
  //      Bands 5-8 are stride-RATE bands, not velocity bands — they capture
  //      every fast-cadence step including high-cadence jogging.
  //  v2: sprintDistance / band-8 strides → 0.02 m/stride (worse).
  //      Same root cause: band 8 = top stride-rate, NOT top velocity. A
  //      player jogging at 3 m/s with 4 Hz cadence racks up band-8 strides
  //      while contributing zero sprint distance.
  //  v3 (current): totalDistance / totalStrides.
  //      Coach-friendly average stride length across the session. Normal
  //      range 0.8–1.4 m/stride for field-sport mixed-pace sessions
  //      (Buchheit 2014). A drop in this metric reflects shorter, more
  //      frequent steps — a known fatigue / sprint-mechanic compensation
  //      pattern (Mendiguchia 2020). Trends matter more than absolute
  //      values; baseline z-score flags individual decline.
  const totalDistForStride = Number(row.totalDistance ?? 0);
  const strideLengthHsr =
    totalStrides > 0 && Number.isFinite(totalDistForStride) && totalDistForStride > 0
      ? totalDistForStride / totalStrides
      : null;

  const codL = Number(row.codLeft ?? 0);
  const codR = Number(row.codRight ?? 0);
  const codSum = codL + codR;
  const codAvg = codSum / 2;
  const codLrAsymmetryPct =
    codSum >= MIN_COD_EVENTS_FOR_ASYMMETRY && codAvg > 0
      ? (Math.abs(codL - codR) / codAvg) * 100
      : null;

  // GPS / IMA decoupling — does GPS show fast running without matching IMU load?
  // We compare the share of HSR distance vs the share of high-band stride load.
  // If HSR distance is high but high-band stride load is low for the same session,
  // the ratio (HSR_share - HiLoad_share) is positive and growing → decoupling.
  const hsrDist = Number(row.hsrDistance ?? 0);
  const totalDist = Number(row.totalDistance ?? 0);
  const totalPlayerLoad = nullSafeSum(loads);
  let gpsImaDecoupling: number | null = null;
  if (totalDist > 0 && totalPlayerLoad > 0) {
    const hsrShare = hsrDist / totalDist;
    const hiLoadShare = highIntensityPlayerLoad / totalPlayerLoad;
    gpsImaDecoupling = hsrShare - hiLoadShare;
  }

  return {
    totalStrides,
    hiVelocityStrides,
    highIntensityPlayerLoad,
    cadenceWeighted,
    strideLengthHsr,
    codLeftTotal: codL,
    codRightTotal: codR,
    codLrAsymmetryPct,
    gpsImaDecoupling,
  };
}

function severityFromZ(z: number): StrideDriverFlag["severity"] {
  if (z <= Z_HIGH) return "high";
  if (z <= Z_CONCERN) return "concern";
  return "watch";
}

function severityFromAsymmetry(pct: number): StrideDriverFlag["severity"] {
  if (pct >= COD_ASYMMETRY_HIGH_PCT) return "high";
  if (pct >= COD_ASYMMETRY_CONCERN_PCT) return "concern";
  return "watch";
}

function zScore(value: number, mean: number, sd: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    return null;
  }
  return (value - mean) / sd;
}

/**
 * Build the full Stride Intelligence payload — derived metrics plus any
 * drivers that crossed thresholds. Pass in personal baselines for
 * cadence and stride length so we can check personal-z drift.
 */
export function buildStrideIntelligence(
  row: StrideRow,
  baselines?: {
    cadence?: StrideBaselineRef | null;
    strideLengthHsr?: StrideBaselineRef | null;
    gpsImaDecoupling?: StrideBaselineRef | null;
    codLrAsymmetry?: StrideBaselineRef | null;
  } | null,
): StrideIntelligencePayload {
  const metrics = computeStrideMetrics(row);
  const drivers: StrideDriverFlag[] = [];
  const reasons: string[] = [];

  // 1. Cadence drop (NM fatigue)
  const cadBase = baselines?.cadence;
  if (
    metrics.cadenceWeighted != null &&
    cadBase?.status === "active" &&
    cadBase.mean != null &&
    cadBase.sd != null
  ) {
    const z = zScore(metrics.cadenceWeighted, cadBase.mean, cadBase.sd);
    if (z != null && z <= Z_WATCH) {
      const severity = severityFromZ(z);
      drivers.push({ driver: "STRIDE_CADENCE_DROP", z, value: metrics.cadenceWeighted, severity });
      reasons.push(
        `Cadence ${metrics.cadenceWeighted.toFixed(2)} Hz — ${z.toFixed(1)}σ below personal baseline. NM fatigue indicator.`,
      );
    }
  }

  // 2. Stride length drop (mechanical compensation)
  const slBase = baselines?.strideLengthHsr;
  if (
    metrics.strideLengthHsr != null &&
    metrics.strideLengthHsr >= STRIDE_LENGTH_FLOOR &&
    slBase?.status === "active" &&
    slBase.mean != null &&
    slBase.sd != null
  ) {
    const z = zScore(metrics.strideLengthHsr, slBase.mean, slBase.sd);
    if (z != null && z <= Z_WATCH) {
      const severity = severityFromZ(z);
      drivers.push({
        driver: "STRIDE_LENGTH_DROP",
        z,
        value: metrics.strideLengthHsr,
        severity,
      });
      reasons.push(
        `Stride length at HSR is ${metrics.strideLengthHsr.toFixed(2)} m/stride — ${z.toFixed(1)}σ below baseline. Possible compensation pattern.`,
      );
    }
  }

  // 3. L/R CoD asymmetry — DUAL CHECK (personal-z spike OR absolute outlier).
  // See threshold comments above for rationale. Picks the WORSE of the two
  // signals so a sudden +2σ spike at 28% gets flagged "high" (acute spike
  // matters) AND a player whose normal is already 40% gets flagged "high"
  // (biomechanically risky regardless of baseline).
  if (metrics.codLrAsymmetryPct != null && metrics.codLrAsymmetryPct >= 5) {
    const asymBase = (baselines as { codLrAsymmetry?: StrideBaselineRef | null } | null | undefined)
      ?.codLrAsymmetry;
    let zSpike: number | null = null;
    if (
      asymBase?.status === "active" &&
      asymBase.mean != null &&
      asymBase.sd != null
    ) {
      zSpike = zScore(metrics.codLrAsymmetryPct, asymBase.mean, asymBase.sd);
    }

    // Personal-z severity (positive z = spike vs own baseline)
    let personalSev: StrideDriverFlag["severity"] | null = null;
    if (zSpike != null) {
      if (zSpike >= 2.0) personalSev = "high";
      else if (zSpike >= 1.5) personalSev = "concern";
      else if (zSpike >= 1.0) personalSev = "watch";
    }

    // Absolute severity (outlier vs population)
    let absoluteSev: StrideDriverFlag["severity"] | null = null;
    if (metrics.codLrAsymmetryPct >= COD_ASYMMETRY_HIGH_PCT) absoluteSev = "high";
    else if (metrics.codLrAsymmetryPct >= COD_ASYMMETRY_CONCERN_PCT) absoluteSev = "concern";
    else if (metrics.codLrAsymmetryPct >= COD_ASYMMETRY_WATCH_PCT) absoluteSev = "watch";

    // Pick worst — high > concern > watch > null
    const rank = (s: StrideDriverFlag["severity"] | null) =>
      s === "high" ? 3 : s === "concern" ? 2 : s === "watch" ? 1 : 0;
    const finalSev =
      rank(personalSev) >= rank(absoluteSev) ? personalSev : absoluteSev;

    if (finalSev) {
      drivers.push({
        driver: "COD_LR_ASYMMETRY",
        z: zSpike,
        value: metrics.codLrAsymmetryPct,
        severity: finalSev,
      });
      const direction = metrics.codLeftTotal > metrics.codRightTotal ? "left-dominant" : "right-dominant";
      const baselineStr = asymBase?.mean != null ? ` (baseline ${asymBase.mean.toFixed(0)}%)` : "";
      const zStr = zSpike != null ? ` ${zSpike >= 0 ? "+" : ""}${zSpike.toFixed(1)}σ` : "";
      reasons.push(
        `L/R CoD asymmetry ${metrics.codLrAsymmetryPct.toFixed(0)}%${zStr} ${direction}${baselineStr} — ${
          finalSev === "high"
            ? "serious imbalance — investigate before next match"
            : finalSev === "concern"
              ? "meaningful imbalance vs personal norm or population"
              : "trending toward concern"
        }`,
      );
    }
  }

  // 4. GPS-IMA decoupling — drifting positive vs personal baseline
  const dcBase = baselines?.gpsImaDecoupling;
  if (
    metrics.gpsImaDecoupling != null &&
    dcBase?.status === "active" &&
    dcBase.mean != null &&
    dcBase.sd != null
  ) {
    const z = zScore(metrics.gpsImaDecoupling, dcBase.mean, dcBase.sd);
    // For decoupling, ABOVE baseline (positive z) means more decoupling — risk indicator.
    if (z != null && z >= Math.abs(Z_WATCH)) {
      const severity =
        z >= Math.abs(Z_HIGH) ? "high" : z >= Math.abs(Z_CONCERN) ? "concern" : "watch";
      drivers.push({
        driver: "GPS_IMA_DECOUPLING",
        z,
        value: metrics.gpsImaDecoupling,
        severity,
      });
      reasons.push(
        `GPS-IMA decoupling +${z.toFixed(1)}σ above baseline — covering distance with reduced mechanical cost. Possible NM fatigue or compensation.`,
      );
    }
  }

  return { metrics, drivers, reasons };
}

/** Metric keys persisted in athlete_metric_baselines for stride intelligence. */
export const STRIDE_BASELINE_METRIC_KEYS = {
  cadence: "stride_cadence_weighted",
  strideLengthHsr: "stride_length_hsr_m",
  gpsImaDecoupling: "stride_gps_ima_decoupling",
  codLrAsymmetry: "stride_cod_lr_asym_pct",
} as const;
