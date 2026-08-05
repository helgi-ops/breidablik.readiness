/**
 * cmjEvidence — bridge the measured CMJ into the fatigue-type classifier.
 *
 * A CMJ measures NET output, so it can't say WHERE the fatigue is — but its phase
 * metrics can once they clear their own measurement noise. This pure module takes
 * the already-CV-gated CMJ phase moves (from `vald/phaseChange.ts`, either the live
 * `PhaseChangeResult[]` or the serialized daily snapshot) and splits the real,
 * fatigue-direction moves onto two axes:
 *
 *   NEURAL — a cleared drop in the explosive, neurally-driven qualities (peak
 *   power, RFD, concentric impulse/force). Early RFD is neural-drive dominated and
 *   falls first. [Gathercole 2015; D'Emanuele 2021]
 *
 *   TISSUE — a cleared lengthening of the time/eccentric qualities (eccentric &
 *   concentric duration, contraction time): an altered jump STRATEGY that outlasts
 *   the height loss — a peripheral/tissue signature. [Gathercole 2015]
 *
 * Plus the multi-day rebound SHAPE: a fast next-day recovery points neural (central
 * fatigue clears in hours); a jump still depressed at 48–72 h points tissue.
 * [Carroll, Taylor & Gandevia 2017; Silva 2018]
 *
 * Only `real` (CV-cleared AND fatigue-direction) moves become drivers. When no
 * metric even has a mature baseline the evidence is `hasData:false`: no drivers,
 * and the classifier lowers confidence — never a silent "no neural fatigue".
 * [Neyroud 2016: thresholds are individual.]
 */

import type { PhaseChangeResult, PhaseChangeStatus, PhaseMetricKey } from "@/lib/micropulse/vald/phaseChange";
import type { ValdDailySnapshot } from "@/lib/micropulse/vald/types";
import { classifyFatigue } from "./classify";
import type {
  CmjDriverSeed,
  CmjFatigueEvidence,
  CmjRecoverySlope,
  FatigueInput,
  NeuromuscularFatigueRead,
} from "./types";

/** Explosive, neurally-driven qualities — a CV-cleared drop here reads NEURAL.
 *  Includes the item-4 refinements: early-phase RFD (neural-drive dominated,
 *  D'Emanuele 2021) and FT:CT (Edwards 2018). */
const NEURAL_METRICS = new Set<PhaseMetricKey>([
  "peakPower",
  "meanRFD",
  "rfdEarly",
  "ftCtRatio",
  "concentricImpulse",
  "peakForce",
]);
/** Time/eccentric qualities — a CV-cleared lengthening here reads TISSUE. */
const TISSUE_METRICS = new Set<PhaseMetricKey>(["eccentricDuration", "concentricDuration", "timeToTakeoff"]);

const PHASE_CITATION = "Gathercole 2015; D'Emanuele 2021 (early RFD is neural)";
const SLOPE_CITATION = "Carroll, Taylor & Gandevia 2017; Silva 2018";

/** Minimal shape the split needs — produced from either the live result or the
 *  serialized snapshot, so both entry points share one gate. */
type PhaseMove = {
  metric: PhaseMetricKey;
  status: PhaseChangeStatus;
  worse: boolean;
  deltaPct: number | null;
  thresholdPct: number;
  labelEn: string;
  labelIs: string;
};

/** Language-neutral numeric detail, e.g. "−9.4% vs baseline (noise floor 4.1%)". */
function moveDetail(m: PhaseMove): string | undefined {
  if (m.deltaPct == null) return undefined;
  const sign = m.deltaPct > 0 ? "+" : "−";
  return `${sign}${Math.abs(m.deltaPct).toFixed(1)}% vs baseline (noise floor ${m.thresholdPct.toFixed(1)}%)`;
}

/** The shared split: real, fatigue-direction moves → neural/tissue seeds, + slope. */
function evidenceFromMoves(moves: PhaseMove[], hasData: boolean, recoverySlope: CmjRecoverySlope): CmjFatigueEvidence {
  const neuralDrivers: CmjDriverSeed[] = [];
  const tissueDrivers: CmjDriverSeed[] = [];

  for (const m of moves) {
    if (m.status !== "real" || !m.worse) continue; // only CV-cleared, fatigue-direction
    const detail = moveDetail(m);
    if (NEURAL_METRICS.has(m.metric)) {
      neuralDrivers.push({
        code: `CMJ_NEURAL_${m.metric}`,
        metric: m.metric,
        points: 2,
        category: "NEURAL",
        labelEn: `${m.labelEn} → central/neural output`,
        labelIs: `${m.labelIs} → mið-/taugaúttak`,
        detail,
        citation: PHASE_CITATION,
      });
    } else if (TISSUE_METRICS.has(m.metric)) {
      tissueDrivers.push({
        code: `CMJ_TISSUE_${m.metric}`,
        metric: m.metric,
        points: 2,
        category: "TISSUE",
        labelEn: `${m.labelEn} → altered jump strategy (tissue/peripheral)`,
        labelIs: `${m.labelIs} → breytt stökkstefna (vefur/útlægt)`,
        detail,
        citation: PHASE_CITATION,
      });
    }
  }

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

export type DeriveCmjEvidenceInput = {
  /** The CV-gated phase results for this player's latest CMJ vs baseline. */
  phaseResults: PhaseChangeResult[];
  /** Multi-day rebound shape, if computable from post-match jumps. Default unknown. */
  recoverySlope?: CmjRecoverySlope;
};

/** Pure. From the LIVE `PhaseChangeResult[]` (e.g. inside the VALD snapshot build). */
export function deriveCmjFatigueEvidence(input: DeriveCmjEvidenceInput): CmjFatigueEvidence {
  const { phaseResults, recoverySlope = "unknown" } = input;
  const moves: PhaseMove[] = phaseResults.map((r) => ({
    metric: r.metric,
    status: r.status,
    worse: r.worse,
    deltaPct: r.deltaPct,
    thresholdPct: r.thresholdPct,
    labelEn: r.label.en,
    labelIs: r.label.is,
  }));
  const hasData = phaseResults.some((r) => r.status !== "insufficient");
  return evidenceFromMoves(moves, hasData, recoverySlope);
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pure. From the SERIALIZED daily snapshot (`vald_daily_player_snapshot.explanation`
 * → `cmj.phase.metrics`, already CV-gated at snapshot-build time). Returns undefined
 * when there is no snapshot at all (non-VALD player → classifier confidence
 * unaffected), never a fabricated zero.
 */
export function cmjEvidenceFromValdSnapshot(snapshot: ValdDailySnapshot | null | undefined): CmjFatigueEvidence | undefined {
  if (!snapshot) return undefined;
  const cmj = (snapshot.explanation?.cmj ?? null) as Record<string, unknown> | null;
  const phase = (cmj?.phase ?? null) as Record<string, unknown> | null;
  const rawMetrics = Array.isArray(phase?.metrics) ? (phase!.metrics as Array<Record<string, unknown>>) : [];

  const moves: PhaseMove[] = rawMetrics.map((m) => {
    const label = (m.label ?? {}) as { en?: string; is?: string };
    return {
      metric: m.metric as PhaseMetricKey,
      status: (m.status as PhaseChangeStatus) ?? "insufficient",
      worse: m.worse === true,
      deltaPct: numOrNull(m.delta_percent),
      thresholdPct: numOrNull(m.threshold_percent) ?? 0,
      labelEn: label.en ?? String(m.metric ?? ""),
      labelIs: label.is ?? String(m.metric ?? ""),
    };
  });

  // A mature baseline existed when the snapshot flagged phase data available, or
  // when at least one serialized metric got past "insufficient".
  const hasData = phase?.available === true || moves.some((m) => m.status !== "insufficient");
  return evidenceFromMoves(moves, hasData, "unknown");
}

export type NeuromuscularFatigueBuildInput = {
  playerId: string;
  energy: number | null;
  sleepQuality: number | null;
  soreness: number | null;
  totalScore: number | null;
  zReadiness: number | null;
  deltaZ: number | null;
  mdDay: string | null;
  intensity: string | null;
  hsrM: number | null;
  hasLoadData: boolean;
  valdSnapshot: ValdDailySnapshot | null | undefined;
};

/**
 * Pure. Assemble a focused FatigueInput from the coach-decision per-player data
 * plus the measured CMJ, classify it, and compact the result for the decision
 * response. Returns null when there is no fatigue signal (type NONE) so the
 * response stays lean. Descriptive only — never touches the readiness colour.
 *
 * Note: `stress`/`sleepDuration`/`pain` are intentionally omitted here — the
 * decision row doesn't expose them in a scale we can trust (stress_mood's polarity
 * differs from the classifier's stress axis), so we don't guess. Energy, sleep
 * quality and soreness share the classifier's "≤2 = fatigue" scale and are safe.
 */
export function buildNeuromuscularFatigueRead(input: NeuromuscularFatigueBuildInput): NeuromuscularFatigueRead | null {
  const cmj = cmjEvidenceFromValdSnapshot(input.valdSnapshot);

  const fatigueInput: FatigueInput = {
    playerId: input.playerId,
    energy: input.energy,
    sleepQuality: input.sleepQuality,
    sleepDuration: null,
    stress: null,
    soreness: input.soreness,
    totalScore: input.totalScore,
    sten: null,
    zReadiness: input.zReadiness,
    deltaZ: input.deltaZ,
    lowStenDays: 0,
    poorWellnessCount: null,
    hsrHighYesterday: (input.hsrM ?? 0) >= 1000,
    accelHighYesterday: false,
    decelHighYesterday: false,
    totalDistanceHighYesterday: false,
    intensityHighYesterday: String(input.intensity ?? "").toUpperCase() === "HIGH",
    matchMinutesHigh: false,
    matchMinutesPlayed: null,
    scheduleCongestion: false,
    travelFlag: false,
    hasPainFlag: false,
    painLocation: null,
    repeatedSameComplaint: false,
    localComplaintMatchesLoad: false,
    mdDay: input.mdDay,
    teamVolatilityHigh: false,
    hasWellnessData: [input.energy, input.sleepQuality, input.soreness, input.totalScore].some((v) => v != null),
    hasLoadData: input.hasLoadData,
    cmj,
  };

  const res = classifyFatigue(fatigueInput);
  if (res.primaryFatigueType === "NONE") return null;

  return {
    primaryType: res.primaryFatigueType,
    secondaryType: res.secondaryFatigueType,
    severity: res.severity,
    confidence: res.confidence,
    usedCmj: cmj != null && cmj.hasData,
    drivers: res.drivers.slice(0, 4).map((d) => ({
      category: d.category,
      labelEn: d.label,
      labelIs: d.labelIs,
      metric: d.metric,
      citation: d.citation,
      detail: d.detail,
    })),
  };
}
