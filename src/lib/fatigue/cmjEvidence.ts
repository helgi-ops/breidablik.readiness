/**
 * cmjEvidence — bridge the measured CMJ into the fatigue-type classifier.
 *
 * A CMJ measures NET output, so it can't say WHERE the fatigue is — but its phase
 * metrics can once they clear their own measurement noise. This pure mapper takes
 * the already-CV-gated `PhaseChangeResult[]` from `vald/phaseChange.ts` (it never
 * recomputes a jump) and splits the real, fatigue-direction moves onto two axes:
 *
 *   NEURAL — a cleared drop in the explosive, neurally-driven qualities (peak
 *   power, RFD, concentric impulse/force). Early RFD in particular is neural-drive
 *   dominated and falls first. [Gathercole 2015; D'Emanuele 2021]
 *
 *   TISSUE — a cleared lengthening of the time/eccentric qualities (eccentric &
 *   concentric duration, contraction time): an altered jump STRATEGY that outlasts
 *   the height loss — a peripheral/tissue signature. [Gathercole 2015]
 *
 * Plus the multi-day rebound SHAPE: a fast next-day recovery points neural (central
 * fatigue clears in hours); a jump still depressed at 48–72 h points tissue
 * (peripheral recovers slower than sprint). [Carroll, Taylor & Gandevia 2017;
 * Silva 2018]
 *
 * Only `real` (CV-cleared AND fatigue-direction) moves become drivers — a
 * within-noise wobble adds nothing. When no metric even has a mature baseline the
 * evidence is `hasData:false`: no drivers, and the classifier lowers confidence —
 * never a silent "no neural fatigue". [Neyroud 2016: thresholds are individual.]
 */

import type { PhaseChangeResult, PhaseMetricKey } from "@/lib/micropulse/vald/phaseChange";
import type { CmjDriverSeed, CmjFatigueEvidence, CmjRecoverySlope } from "./types";

/** Explosive, neurally-driven qualities — a CV-cleared drop here reads NEURAL. */
const NEURAL_METRICS = new Set<PhaseMetricKey>(["peakPower", "meanRFD", "concentricImpulse", "peakForce"]);
/** Time/eccentric qualities — a CV-cleared lengthening here reads TISSUE. */
const TISSUE_METRICS = new Set<PhaseMetricKey>(["eccentricDuration", "concentricDuration", "timeToTakeoff"]);

const PHASE_CITATION = "Gathercole 2015; D'Emanuele 2021 (early RFD is neural)";
const SLOPE_CITATION = "Carroll, Taylor & Gandevia 2017; Silva 2018";

/** Language-neutral numeric detail, e.g. "−9.4% vs baseline (noise floor 4.1%)". */
function phaseDetail(r: PhaseChangeResult): string | undefined {
  if (r.deltaPct == null) return undefined;
  const sign = r.deltaPct > 0 ? "+" : "−";
  return `${sign}${Math.abs(r.deltaPct).toFixed(1)}% vs baseline (noise floor ${r.thresholdPct.toFixed(1)}%)`;
}

export type DeriveCmjEvidenceInput = {
  /** The CV-gated phase results for this player's latest CMJ vs baseline. */
  phaseResults: PhaseChangeResult[];
  /** Multi-day rebound shape, if computable from post-match jumps. Default unknown. */
  recoverySlope?: CmjRecoverySlope;
};

/**
 * Pure. Split the CV-gated CMJ phase moves into neural/tissue driver seeds and fold
 * in the recovery-slope signal. Returns `hasData:false` (no drivers) when no metric
 * had a mature baseline, so the classifier can lower confidence honestly.
 */
export function deriveCmjFatigueEvidence(input: DeriveCmjEvidenceInput): CmjFatigueEvidence {
  const { phaseResults, recoverySlope = "unknown" } = input;

  // A mature baseline existed for at least one metric (not every result is "insufficient").
  const hasData = phaseResults.some((r) => r.status !== "insufficient");

  const neuralDrivers: CmjDriverSeed[] = [];
  const tissueDrivers: CmjDriverSeed[] = [];

  for (const r of phaseResults) {
    // Only a CV-cleared move in the fatigue direction earns a driver.
    if (r.status !== "real" || !r.worse) continue;
    const detail = phaseDetail(r);
    if (NEURAL_METRICS.has(r.metric)) {
      neuralDrivers.push({
        code: `CMJ_NEURAL_${r.metric}`,
        metric: r.metric,
        points: 2,
        category: "NEURAL",
        labelEn: `${r.label.en} → central/neural output`,
        labelIs: `${r.label.is} → mið-/taugaúttak`,
        detail,
        citation: PHASE_CITATION,
      });
    } else if (TISSUE_METRICS.has(r.metric)) {
      tissueDrivers.push({
        code: `CMJ_TISSUE_${r.metric}`,
        metric: r.metric,
        points: 2,
        category: "TISSUE",
        labelEn: `${r.label.en} → altered jump strategy (tissue/peripheral)`,
        labelIs: `${r.label.is} → breytt stökkstefna (vefur/útlægt)`,
        detail,
        citation: PHASE_CITATION,
      });
    }
  }

  // Multi-day rebound shape. Only meaningful once we actually know the slope.
  if (recoverySlope === "fast") {
    neuralDrivers.push({
      code: "CMJ_RECOVERY_FAST",
      metric: "recoverySlope",
      points: 1,
      category: "NEURAL",
      labelEn: "fast next-day CMJ rebound → central fatigue (recovers in hours)",
      labelIs: "hröð CMJ endurheimt daginn eftir → miðlæg þreyta (jafnar sig á klukkustundum)",
      citation: SLOPE_CITATION,
    });
  } else if (recoverySlope === "slow") {
    tissueDrivers.push({
      code: "CMJ_RECOVERY_SLOW",
      metric: "recoverySlope",
      points: 2,
      category: "TISSUE",
      labelEn: "CMJ still depressed at 48–72 h → peripheral/muscular fatigue",
      labelIs: "CMJ enn lækkað eftir 48–72 klst → útlæg/vöðvaþreyta",
      citation: SLOPE_CITATION,
    });
  }

  return { hasData, neuralDrivers, tissueDrivers, recoverySlope };
}
