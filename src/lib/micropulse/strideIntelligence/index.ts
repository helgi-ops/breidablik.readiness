/**
 * Stride Intelligence — IMA-derived movement-quality signals.
 *
 * The Catapult IMA Free Running 8-band pipeline extracts stride events from
 * the IMU regardless of GPS quality, so it works equally well INDOOR and
 * OUTDOOR. Previously these metrics surfaced only as the "Indoor Composite",
 * but the same data carry useful information outdoor too:
 *
 *   1. Cadence (volume-weighted avg stride rate) — declines under NM fatigue.
 *   2. Stride length — session average (total distance ÷ total strides) plus
 *      stride length in sustained running (IMA band 5–8 distance ÷ band 5–8
 *      strides). Declining values indicate compensation patterns.
 *   3. L/R Change-of-Direction asymmetry (Bishop 2020) — >15% flag for
 *      injury risk and RTP clearance.
 *   4. GPS / IMA mix — share of GPS high-speed distance vs share of IMU load
 *      that came in runs of 15 s or more (bands 4–8). A rise means more of his
 *      fast running came in short efforts rather than long runs than usual.
 *      Context only — NOT a fatigue marker on its own.
 *
 * IMPORTANT — what the IMA Free Running bands are: BOUT-DURATION bands
 * (Breiðablik thresholds 0–8–12–15–18–21–24–27 s of one continuous run), NOT
 * speed or cadence bands. Mean speed (~12–14 km/h) and stride rate (~87–93/min)
 * are flat from band 4 to 8. Bands 5–8 = long continuous runs (≥18 s), NOT
 * sprinting / high-speed / high cadence. Sprint/HSR comes from GPS velocity
 * bands only. See docs/ima-free-running-bands.md. Several field names below
 * ("hiVelocity", "imaHsr", "hiCadence") are legacy and kept for interface
 * stability — the comments describe what they actually hold.
 *
 * The output of this module is a `StrideIntelligencePayload` that the
 * decision engine consumes alongside the existing internal/external/metabolic
 * signals. It is mode-agnostic: same inputs produce same outputs whether
 * the team is set to indoor or outdoor.
 *
 * References:
 *   - Bishop et al. 2020 — Asymmetry thresholds for screening tests in soccer.
 *   - Cardinale et al. 2017 — Cadence as NM fatigue indicator in team sport.
 *   - Catapult IMA white paper — Free Running bout detection (bout-duration bands).
 *   - McBurnie et al. 2022 — stride/running mechanics as a within-player read.
 */

export type StrideRow = {
  /** Per-band stride count (1..8). Null bands treated as 0. */
  strideCounts: (number | null | undefined)[];
  /** Per-band average stride rate (strides per minute, Catapult V2). Null when the band had no strides. */
  strideRates: (number | null | undefined)[];
  /** Per-band time in band (seconds). When present, cadence = strides ÷ time, which is immune to the zeros
   *  the stored per-band average carries for bands without a bout. */
  strideDurations?: (number | null | undefined)[];
  /** Per-band IMU player load contribution (a.u.). */
  stridePlayerLoads: (number | null | undefined)[];

  /** Velocity Band 5 + 6 distance (m) — high-speed running coverage. */
  hsrDistance: number | null | undefined;
  /** Velocity Band 6 distance (m) — sprint coverage. */
  sprintDistance?: number | null | undefined;
  /** IMA Free Running band 5-8 total distance (m) — distance in LONG CONTINUOUS
   *  RUNS (bouts ≥18 s), domain-consistent with band 5-8 strides. NOT high-speed
   *  running despite the legacy field name. Null indoors (needs GPS). */
  imaHsrDistance?: number | null | undefined;
  /** Total distance covered (m). */
  totalDistance: number | null | undefined;

  /** L/R IMA Change-of-Direction event counts (Low + Medium + High). */
  codLeft: number | null | undefined;
  codRight: number | null | undefined;
};

export type StrideMetrics = {
  totalStrides: number;
  /** Strides in bands 5–8 = long continuous runs (≥18 s). Legacy name — not velocity. */
  hiVelocityStrides: number;
  /** IMU player load in bands 4–8 = runs of 15 s or more. Legacy name — not intensity. */
  highIntensityPlayerLoad: number;
  /** Volume-weighted avg stride rate across all 8 bands (Hz). null when no strides. */
  cadenceWeighted: number | null;
  /** Session-average stride length = total distance ÷ total strides (m/stride).
   *  Legacy name ("Hsr") — see the v3 note in computeStrideMetrics. */
  strideLengthHsr: number | null;
  /** IMA band 5-8 distance (m) — long-run distance (bouts ≥18 s). NOT HSR. null when absent. */
  imaHsrDistanceM: number | null;
  /** Stride length in sustained running = IMA band 5-8 distance ÷ band 5-8
   *  strides (m/stride). Domain-consistent (both from the stride series), unlike
   *  the session-average strideLengthHsr. null when the IMA distance is absent.
   *  Legacy name ("hiCadence") — bands 5–8 are long runs, not high cadence. */
  hiCadenceStrideLengthM: number | null;
  codLeftTotal: number;
  codRightTotal: number;
  /** |L - R| / ((L + R) / 2) × 100. null when total < MIN_COD_EVENTS. */
  codLrAsymmetryPct: number | null;
  /** GPS HSR share of distance − share of IMU load in runs ≥15 s (bands 4–8).
   *  Positive = more fast running came outside long runs than in long-run load. */
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

  // Cadence (strides per minute). From time in band when the sync carries it: strides ÷ seconds × 60 over
  // the bands that have both. Else the stored per-band average, weighted by strides, counting only bands
  // with a rate (a band without a bout stores 0 and would pull the mean down).
  const durations = (row.strideDurations ?? []).map((v) => Number(v ?? 0));
  let timedStrides = 0, timedSeconds = 0, weightedSum = 0, ratedStrides = 0;
  for (let i = 0; i < 8; i += 1) {
    const c = counts[i] ?? 0;
    const r = rates[i] ?? 0;
    const d = durations[i] ?? 0;
    if (c > 0 && d > 0) { timedStrides += c; timedSeconds += d; }
    if (c > 0 && r > 0 && Number.isFinite(r)) { weightedSum += r * c; ratedStrides += c; }
  }
  const cadenceWeighted = timedSeconds > 0 ? (timedStrides / timedSeconds) * 60 : ratedStrides > 0 ? weightedSum / ratedStrides : null;

  // Average stride length across the whole session.
  //
  // Iteration history (kept for posterity so we don't repeat the mistake):
  //  v1: hsrDistance / (bands 5-8 strides) → 0.15 m/stride (too low).
  //      Bands 5-8 are BOUT-DURATION bands (runs ≥18 s), not velocity bands
  //      (earlier notes wrongly called them stride-RATE bands) — they hold
  //      every stride of a long continuous run, whatever its speed.
  //  v2: sprintDistance / band-8 strides → 0.02 m/stride (worse).
  //      Same root cause: band 8 = runs longer than 27 s, NOT top velocity.
  //      A long tempo run racks up band-8 strides while contributing zero
  //      sprint distance.
  //  v3 (current): totalDistance / totalStrides.
  //      Coach-friendly average stride length across the session. Normal
  //      range 0.8–1.4 m/stride for field-sport mixed-pace sessions
  //      (Buchheit 2014). A drop in this metric reflects shorter, more
  //      frequent steps — a known fatigue / running-mechanic compensation
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

  // GPS / IMA mix — share of GPS HSR distance vs share of IMU load in bands 4–8
  // (runs of 15 s or more; bout-duration bands, NOT intensity bands). Positive
  // and growing = more of his fast running came in short efforts rather than in
  // long continuous runs than usual. Contextual, not a fatigue marker by itself.
  const hsrDist = Number(row.hsrDistance ?? 0);
  const totalDist = Number(row.totalDistance ?? 0);
  const totalPlayerLoad = nullSafeSum(loads);
  let gpsImaDecoupling: number | null = null;
  if (totalDist > 0 && totalPlayerLoad > 0) {
    const hsrShare = hsrDist / totalDist;
    const hiLoadShare = highIntensityPlayerLoad / totalPlayerLoad;
    gpsImaDecoupling = hsrShare - hiLoadShare;
  }

  // Stride length in sustained running from the stride series itself: IMA band
  // 5-8 distance ÷ band 5-8 strides (long continuous runs ≥18 s). Domain-
  // consistent (both from the same bout-duration bands), so it avoids the v1
  // mistake of mixing GPS HSR distance with stride counts. null when the band
  // 5-8 distance is absent (indoors / not yet ingested).
  const imaHsr = Number(row.imaHsrDistance ?? 0) || 0;
  const hiCadenceStrideLengthM =
    imaHsr > 0 && hiVelocityStrides > 0 ? imaHsr / hiVelocityStrides : null;

  return {
    totalStrides,
    hiVelocityStrides,
    highIntensityPlayerLoad,
    cadenceWeighted,
    strideLengthHsr,
    imaHsrDistanceM: imaHsr > 0 ? imaHsr : null,
    hiCadenceStrideLengthM,
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
        `Cadence ${metrics.cadenceWeighted.toFixed(0)} strides/min — ${z.toFixed(1)}σ below personal baseline. NM fatigue indicator.`,
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
        `Average stride length is ${metrics.strideLengthHsr.toFixed(2)} m/stride — ${z.toFixed(1)}σ below baseline. Possible compensation pattern.`,
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

  // 4. GPS-IMA mix shift — drifting positive vs personal baseline (contextual)
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
        `GPS-IMA mix shift +${z.toFixed(1)}σ above baseline — more of his fast GPS running came in short efforts rather than long continuous runs than usual. Context, not a fatigue sign on its own.`,
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
