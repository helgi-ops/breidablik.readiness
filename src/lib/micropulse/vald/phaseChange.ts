/**
 * CV-gated CMJ phase-metric change classification.
 *
 * Phase metrics (how the jump was produced — contraction time, phase durations,
 * impulse, rate of force development) carry fatigue information the outputs miss:
 *   • Marques & Buchheit 2026 ("Jump Height Lies") — after matches, contraction
 *     time +0.55 and concentric impulse/force fell while jump height barely moved.
 *   • Gathercole et al. 2015 — time- and eccentric-related variables stayed
 *     abnormal longest after fatigue, well after jump height recovered.
 *
 * BUT the same Gathercole paper measured their RELIABILITY, and it is a warning:
 * the fatigue-sensitive time/eccentric metrics are ALSO the noisiest (Table 2,
 * intraday/interday CV). A metric with a large CV shown against a small personal
 * SD will flag a one-off wobble as "declining" — the exact over-sensitive-yellow
 * bug the readiness engine already had, re-created on the jump plate.
 *
 * So every phase metric only flags a change that exceeds its OWN measurement
 * noise: the change must clear both the metric's literature CV and the player's
 * own observed CV (whichever is larger), scaled by PHASE_NOISE_K. A CV-16% metric
 * (RFD) needs a far bigger move to mean anything than a CV-5% metric (jump
 * height). Without this gate, phase metrics are just a prettier version of the bug.
 *
 * Pure, side-effect free, bilingual. [Gathercole 2015 10.1123/ijspp.2013-0413;
 * Marques & Buchheit 2026 SPSR 293]
 */

export const PHASE_CHANGE_CITATION =
  "Gathercole et al. 2015 (IJSPP, Table 2 reliability); Marques & Buchheit 2026 (Jump Height Lies)";

/**
 * A change must exceed ~1.5× the metric's typical measurement error (its CV) to
 * be treated as beyond noise — Hopkins' typical-error / smallest-real-change
 * framing. A 1×CV move happens by chance roughly a third of the time; 1.5×CV is
 * the conservative floor we require before a phase metric is allowed to flag.
 */
export const PHASE_NOISE_K = 1.5;

/** Below this many baseline tests we cannot estimate a stable player CV, so we
 *  hold the noise floor at the literature value (never widen down on thin data). */
const PLAYER_CV_MATURE_TESTS = 5;

/** Minimum baseline tests before any change classification is attempted. */
const DEFAULT_MIN_TESTS = 3;

export type WorseDirection = "increase" | "decrease";
export type PhaseChangeStatus = "insufficient" | "noise" | "worth-watching" | "real";

type MetricMeta = {
  /** Conservative literature CV (%) — the larger of Gathercole's intraday/interday. */
  cvPct: number;
  /** Which direction of change means MORE fatigue (the flag direction). */
  worse: WorseDirection;
  /** Plain-language name of the metric. */
  label: { en: string; is: string };
  /** Plain-language reading when the metric moves in the fatigue direction. */
  worseClause: { en: string; is: string };
};

/**
 * Gathercole et al. 2015 (IJSPP) Table 2 — CMJ metric reliability. cvPct is the
 * conservative (larger) of the reported intraday / interday CV. Outputs are
 * reliable (CV < ~5%); time/eccentric metrics are sensitive but noisy (CV > 5%,
 * RFD worst at ~16%). Metrics not in the sample table use a literature-informed
 * conservative value in the same class, cited to the same paper.
 */
export const METRIC_META = {
  jumpHeight: {
    cvPct: 5.3, // JH 5.3/4.9
    worse: "decrease",
    label: { en: "jump height", is: "stökkhæð" },
    worseClause: { en: "jump height is down vs usual", is: "stökkhæð er lægri en venjulega" },
  },
  rsiMod: {
    cvPct: 6.0, // reactive strength (JH ÷ contraction time) — compounds two sources
    worse: "decrease",
    label: { en: "RSI-modified", is: "RSI-modified" },
    worseClause: { en: "RSI-modified is down vs usual", is: "RSI-modified er lægra en venjulega" },
  },
  peakPower: {
    cvPct: 2.7, // PP 2.3/2.7
    worse: "decrease",
    label: { en: "peak power", is: "hámarksafl" },
    worseClause: { en: "peak power is down vs usual", is: "hámarksafl er lægra en venjulega" },
  },
  peakForce: {
    cvPct: 5.0, // reliable output (~5%)
    worse: "decrease",
    label: { en: "peak force", is: "hámarkskraftur" },
    worseClause: { en: "peak force is down vs usual", is: "hámarkskraftur er lægri en venjulega" },
  },
  concentricImpulse: {
    cvPct: 8.0, // impulse (conservative — force × time)
    worse: "decrease",
    label: { en: "concentric impulse", is: "sammiðja impúls" },
    worseClause: { en: "produced less push impulse than usual", is: "framleiddi minni impúls en venjulega" },
  },
  eccentricDuration: {
    cvPct: 8.0, // EccDur 6.2/8.0
    worse: "increase",
    label: { en: "eccentric duration", is: "lengd niðurhreyfingar" },
    worseClause: { en: "spent longer absorbing the dip than usual", is: "var lengur í niðurhreyfingu en venjulega" },
  },
  concentricDuration: {
    cvPct: 7.7, // ~time-to-peak-force 6.8/7.7
    worse: "increase",
    label: { en: "concentric duration", is: "lengd upphreyfingar" },
    worseClause: { en: "spent longer in the push phase than usual", is: "var lengur í upphreyfingu en venjulega" },
  },
  timeToTakeoff: {
    cvPct: 7.7, // contraction-time proxy (timing) 6.8/7.7
    worse: "increase",
    label: { en: "contraction time", is: "samdráttartími" },
    worseClause: { en: "produced force slower than usual", is: "framleiddi kraftinn hægar en venjulega" },
  },
  meanRFD: {
    cvPct: 16.2, // mRFD 16.0/16.2 — the noisiest, needs the biggest move to mean anything
    worse: "decrease",
    label: { en: "rate of force development", is: "krafthraði (RFD)" },
    worseClause: { en: "developed force more slowly than usual (RFD down)", is: "byggði upp kraft hægar en venjulega (RFD lægra)" },
  },
  fvAuc: {
    cvPct: 10.6, // FV-AUC 10.6/7.4
    worse: "decrease",
    label: { en: "force–velocity area", is: "kraft-hraða flatarmál" },
    worseClause: { en: "force–velocity output is down vs usual", is: "kraft-hraða úttak er lægra en venjulega" },
  },
  meanEccConPower: {
    cvPct: 7.9, // MEccConP 6.3/7.9
    worse: "decrease",
    label: { en: "mean ecc/con power", is: "meðalafl (niður/upp)" },
    worseClause: { en: "mean power is down vs usual", is: "meðalafl er lægra en venjulega" },
  },
} as const satisfies Record<string, MetricMeta>;

export type PhaseMetricKey = keyof typeof METRIC_META;

export type PhaseChangeResult = {
  metric: PhaseMetricKey;
  status: PhaseChangeStatus;
  /** Signed % change of the latest test mean vs the baseline mean. null if insufficient. */
  deltaPct: number | null;
  /** Whether the change is in the fatigue direction. */
  worse: boolean;
  baseline: number | null;
  latest: number | null;
  testCount: number;
  literatureCvPct: number;
  /** The player's own observed CV once the baseline is mature (else null). */
  playerCvPct: number | null;
  /** max(literature, mature player CV) — never below literature. */
  effectiveCvPct: number;
  /** The move (in %) a change must exceed to be "real": effectiveCvPct × k. */
  thresholdPct: number;
  label: { en: string; is: string };
  citation: string;
};

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleSd(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildLabel(meta: MetricMeta, status: PhaseChangeStatus, worse: boolean): { en: string; is: string } {
  if (status === "insufficient") {
    return {
      en: `${meta.label.en}: not enough tests yet for a baseline`,
      is: `${meta.label.is}: ekki næg próf enn fyrir viðmið`,
    };
  }
  if (status === "real") {
    // Only the fatigue direction reaches "real".
    return {
      en: `${meta.worseClause.en} — and beyond measurement noise`,
      is: `${meta.worseClause.is} — og það er umfram mæliskekkju`,
    };
  }
  if (status === "worth-watching") {
    if (worse) {
      return {
        en: `${meta.worseClause.en} — but within measurement noise, worth watching`,
        is: `${meta.worseClause.is} — en innan mæliskekkju, vert að fylgjast með`,
      };
    }
    return {
      en: `${meta.label.en} moved in a good direction vs usual — worth watching`,
      is: `${meta.label.is} færðist í rétta átt — vert að fylgjast með`,
    };
  }
  // noise
  return {
    en: `${meta.label.en} is within its normal range (change within measurement noise)`,
    is: `${meta.label.is} er innan eðlilegra marka (breyting innan mæliskekkju)`,
  };
}

export type ClassifyPhaseChangeInput = {
  metric: PhaseMetricKey;
  /** Latest test's trial-mean value for this metric. */
  latest: number | null;
  /** Prior tests' trial-mean values (the baseline window, latest test excluded). */
  baselineValues: number[];
  minTests?: number;
};

/**
 * Classify a phase-metric change against BOTH the metric's literature CV and the
 * player's own observed CV. A change is only `real` when it is in the fatigue
 * direction AND exceeds max(literatureCV, maturePlayerCV) × PHASE_NOISE_K. A
 * change that clears the literature noise floor but not the (wider) personal
 * floor, or that moves the good way, is `worth-watching`; smaller is `noise`.
 * Thin/empty baselines are `insufficient`.
 *
 * The player's CV can only WIDEN the floor, never narrow it below the literature
 * value — a thin baseline under-estimates CV and would re-open the wobble bug.
 */
export function classifyPhaseChange(input: ClassifyPhaseChangeInput): PhaseChangeResult {
  const meta = METRIC_META[input.metric];
  const minTests = input.minTests ?? DEFAULT_MIN_TESTS;
  const testCount = input.baselineValues.length;
  const literatureCvPct = meta.cvPct;

  const base = {
    metric: input.metric,
    worse: false,
    baseline: null as number | null,
    latest: input.latest,
    testCount,
    literatureCvPct,
    playerCvPct: null as number | null,
    citation: PHASE_CHANGE_CITATION,
  };

  if (input.latest == null || testCount < minTests) {
    return {
      ...base,
      status: "insufficient",
      deltaPct: null,
      effectiveCvPct: literatureCvPct,
      thresholdPct: literatureCvPct * PHASE_NOISE_K,
      label: buildLabel(meta, "insufficient", false),
    };
  }

  const baseline = mean(input.baselineValues);
  if (!(Math.abs(baseline) > 0)) {
    return {
      ...base,
      baseline,
      status: "insufficient",
      deltaPct: null,
      effectiveCvPct: literatureCvPct,
      thresholdPct: literatureCvPct * PHASE_NOISE_K,
      label: buildLabel(meta, "insufficient", false),
    };
  }

  const sd = sampleSd(input.baselineValues, baseline);
  const observedCvPct = (sd / Math.abs(baseline)) * 100;
  const playerCvPct = testCount >= PLAYER_CV_MATURE_TESTS ? observedCvPct : null;
  // Never narrow below the literature CV — only widen when the player is noisier.
  const effectiveCvPct = playerCvPct != null ? Math.max(literatureCvPct, playerCvPct) : literatureCvPct;

  const deltaPct = ((input.latest - baseline) / Math.abs(baseline)) * 100;
  const worse = meta.worse === "decrease" ? deltaPct < 0 : deltaPct > 0;
  const magnitude = Math.abs(deltaPct);

  const noiseFloorPct = literatureCvPct * PHASE_NOISE_K; // metric measurement noise
  const realThresholdPct = effectiveCvPct * PHASE_NOISE_K; // clears the wider of the two floors

  let status: PhaseChangeStatus;
  if (magnitude < noiseFloorPct) {
    status = "noise";
  } else if (worse && magnitude >= realThresholdPct) {
    status = "real";
  } else {
    // Clears metric noise but not the personal floor, or moves the good way.
    status = "worth-watching";
  }

  return {
    metric: input.metric,
    status,
    deltaPct,
    worse,
    baseline,
    latest: input.latest,
    testCount,
    literatureCvPct,
    playerCvPct,
    effectiveCvPct,
    thresholdPct: realThresholdPct,
    label: buildLabel(meta, status, worse),
    citation: PHASE_CHANGE_CITATION,
  };
}

/**
 * Pick the single worst `real` change to headline — the largest fatigue-direction
 * move (relative to its own threshold) among metrics that cleared the gate.
 * Returns null when nothing is `real`, so the surface can say "within normal
 * limits" instead of listing sub-threshold noise.
 */
export function worstRealChange(results: PhaseChangeResult[]): PhaseChangeResult | null {
  const real = results.filter((r) => r.status === "real" && r.deltaPct != null);
  if (!real.length) return null;
  return real.reduce((worst, r) => {
    const rExcess = Math.abs(r.deltaPct!) / (r.thresholdPct || 1);
    const wExcess = Math.abs(worst.deltaPct!) / (worst.thresholdPct || 1);
    return rExcess > wExcess ? r : worst;
  });
}
