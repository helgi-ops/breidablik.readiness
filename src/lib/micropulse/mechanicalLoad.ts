export type MechanicalLoadBand = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "EXTREME";
export type ResidualMechanicalLoadBand = "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";
export type MechanicalLoadConfidence = "high" | "medium" | "low";

export type MechanicalLoadSourceRow = {
  date: string;
  high_decels: number | null;
  total_decels: number | null;
  ima_decel: number | null;
  high_accels: number | null;
  total_accels: number | null;
  ima_accel: number | null;
  cod_events: number | null;
  ima_cod: number | null;
  ima_total: number | null;
  playerload_per_min: number | null;
  impacts: number | null;
};

export type MechanicalLoadComputedRow = {
  dss: number | null;
  ass: number | null;
  css: number | null;
  gds: number | null;
  mli: number | null;
  residualMli: number | null;
  mliBand: MechanicalLoadBand | null;
  residualBand: ResidualMechanicalLoadBand | null;
  decelSpikeFlag: boolean;
  codSpikeFlag: boolean;
  denseMechanicalFlag: boolean;
  highMechanicalFlag: boolean;
  extremeMechanicalFlag: boolean;
  confidence: MechanicalLoadConfidence;
  confidenceReason: string;
};

type BaselineSample = {
  high_decels: number | null;
  total_decels: number | null;
  ima_decel: number | null;
  high_accels: number | null;
  total_accels: number | null;
  ima_accel: number | null;
  cod_events: number | null;
  ima_cod: number | null;
  ima_total: number | null;
  playerload_per_min: number | null;
  impacts: number | null;
};

const MLI_LOOKBACK_DAYS = 28;
const MLI_MIN_BASELINE_OBSERVATIONS = 5;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundNumber(value: number | null, decimals = 1): number | null {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function safeRatio(value: number | null | undefined, baseline: number | null | undefined): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(baseline) || baseline <= 0) return null;
  return value / baseline;
}

export function ratioToScore(ratio: number | null | undefined): number | null {
  if (!isFiniteNumber(ratio)) return null;
  const capped = Math.min(Math.max(ratio, 0), 2);
  return roundNumber((capped / 2) * 100, 1);
}

export function weightedMean(
  items: Array<{ value: number | null | undefined; weight: number }>
): number | null {
  const valid = items.filter((item) => isFiniteNumber(item.value) && item.weight > 0) as Array<{
    value: number;
    weight: number;
  }>;
  if (!valid.length) return null;
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum <= 0) return null;
  const weighted = valid.reduce((sum, item) => sum + item.value * item.weight, 0);
  return roundNumber(weighted / weightSum, 1);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function collectMedian<T extends keyof BaselineSample>(rows: BaselineSample[], key: T): number | null {
  const values = rows.map((row) => row[key]).filter(isFiniteNumber);
  return median(values);
}

function dateMinusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildBaseline(rows: MechanicalLoadSourceRow[], dateKey: string): BaselineSample {
  const start = dateMinusDays(dateKey, MLI_LOOKBACK_DAYS);
  const relevant = rows.filter((row) => row.date < dateKey && row.date >= start);
  return {
    high_decels: collectMedian(relevant, "high_decels"),
    total_decels: collectMedian(relevant, "total_decels"),
    ima_decel: collectMedian(relevant, "ima_decel"),
    high_accels: collectMedian(relevant, "high_accels"),
    total_accels: collectMedian(relevant, "total_accels"),
    ima_accel: collectMedian(relevant, "ima_accel"),
    cod_events: collectMedian(relevant, "cod_events"),
    ima_cod: collectMedian(relevant, "ima_cod"),
    ima_total: collectMedian(relevant, "ima_total"),
    playerload_per_min: collectMedian(relevant, "playerload_per_min"),
    impacts: collectMedian(relevant, "impacts"),
  };
}

function countPresentInputs(row: MechanicalLoadSourceRow): number {
  return [
    row.high_decels,
    row.total_decels,
    row.ima_decel,
    row.high_accels,
    row.total_accels,
    row.ima_accel,
    row.cod_events,
    row.ima_cod,
    row.ima_total,
    row.playerload_per_min,
    row.impacts,
  ].filter(isFiniteNumber).length;
}

function countBaselineObservations(rows: MechanicalLoadSourceRow[], dateKey: string): number {
  const start = dateMinusDays(dateKey, MLI_LOOKBACK_DAYS);
  return rows.filter((row) => row.date < dateKey && row.date >= start && countPresentInputs(row) > 0).length;
}

export function bandFromMLI(mli: number | null | undefined): MechanicalLoadBand | null {
  if (!isFiniteNumber(mli)) return null;
  if (mli >= 85) return "EXTREME";
  if (mli >= 70) return "VERY_HIGH";
  if (mli >= 55) return "HIGH";
  if (mli >= 40) return "MODERATE";
  return "LOW";
}

export function bandFromResidual(residual: number | null | undefined): ResidualMechanicalLoadBand | null {
  if (!isFiniteNumber(residual)) return null;
  if (residual >= 135) return "HIGH";
  if (residual >= 110) return "CAUTION";
  if (residual >= 70) return "ELEVATED";
  return "NORMAL";
}

function computeConfidence(
  current: MechanicalLoadSourceRow,
  rows: MechanicalLoadSourceRow[],
  dateKey: string
): { confidence: MechanicalLoadConfidence; confidenceReason: string } {
  const presentInputs = countPresentInputs(current);
  const coverageRatio = presentInputs / 11;
  const baselineObservations = countBaselineObservations(rows, dateKey);

  if (coverageRatio >= 0.8 && baselineObservations >= MLI_MIN_BASELINE_OBSERVATIONS) {
    return { confidence: "high", confidenceReason: "personal_baseline" };
  }
  if (coverageRatio >= 0.5) {
    return {
      confidence: "medium",
      confidenceReason:
        baselineObservations >= MLI_MIN_BASELINE_OBSERVATIONS ? "limited_inputs" : "position_fallback",
    };
  }
  return { confidence: "low", confidenceReason: "limited_inputs" };
}

function computeResidual(currentMli: number | null, yesterdayMli: number | null, twoDaysAgoMli: number | null): number | null {
  const items = [
    { value: currentMli, weight: 1 },
    { value: yesterdayMli, weight: 0.6 },
    { value: twoDaysAgoMli, weight: 0.3 },
  ].filter((item): item is { value: number; weight: number } => isFiniteNumber(item.value));
  if (!items.length) return null;
  return roundNumber(items.reduce((sum, item) => sum + item.value * item.weight, 0), 1);
}

export function computeMechanicalLoad(
  rows: MechanicalLoadSourceRow[],
  dateKey: string,
  historicalMliByDate: Map<string, number | null> = new Map()
): MechanicalLoadComputedRow | null {
  const current = rows.find((row) => row.date === dateKey);
  if (!current) return null;

  const baseline = buildBaseline(rows, dateKey);

  const highDecelsRatio = safeRatio(current.high_decels, baseline.high_decels);
  const totalDecelsRatio = safeRatio(current.total_decels, baseline.total_decels);
  const imaDecelRatio = safeRatio(current.ima_decel, baseline.ima_decel);

  const highAccelsRatio = safeRatio(current.high_accels, baseline.high_accels);
  const totalAccelsRatio = safeRatio(current.total_accels, baseline.total_accels);
  const imaAccelRatio = safeRatio(current.ima_accel, baseline.ima_accel);

  const codEventsRatio = safeRatio(current.cod_events, baseline.cod_events);
  const imaCodRatio = safeRatio(current.ima_cod, baseline.ima_cod);
  const imaTotalRatio = safeRatio(current.ima_total, baseline.ima_total);
  const playerLoadPerMinRatio = safeRatio(current.playerload_per_min, baseline.playerload_per_min);
  const impactsRatio = safeRatio(current.impacts, baseline.impacts);

  const dss = weightedMean([
    { value: ratioToScore(highDecelsRatio), weight: 0.5 },
    { value: ratioToScore(totalDecelsRatio), weight: 0.25 },
    { value: ratioToScore(imaDecelRatio), weight: 0.25 },
  ]);

  const ass = weightedMean([
    { value: ratioToScore(highAccelsRatio), weight: 0.45 },
    { value: ratioToScore(totalAccelsRatio), weight: 0.25 },
    { value: ratioToScore(imaAccelRatio), weight: 0.3 },
  ]);

  const css = weightedMean([
    { value: ratioToScore(imaCodRatio), weight: current.cod_events != null ? 0.55 : 1 },
    { value: ratioToScore(codEventsRatio), weight: current.cod_events != null ? 0.45 : 0 },
  ]);

  const gds = weightedMean([
    { value: ratioToScore(playerLoadPerMinRatio), weight: current.impacts != null ? 0.4 : 0.55 },
    { value: ratioToScore(imaTotalRatio), weight: current.impacts != null ? 0.35 : 0.45 },
    { value: ratioToScore(impactsRatio), weight: current.impacts != null ? 0.25 : 0 },
  ]);

  const mli = weightedMean([
    { value: dss, weight: 0.4 },
    { value: ass, weight: 0.2 },
    { value: css, weight: 0.25 },
    { value: gds, weight: 0.15 },
  ]);

  const yesterdayKey = dateMinusDays(dateKey, 1);
  const twoDaysAgoKey = dateMinusDays(dateKey, 2);
  const residualMli = computeResidual(
    mli,
    historicalMliByDate.get(yesterdayKey) ?? null,
    historicalMliByDate.get(twoDaysAgoKey) ?? null
  );

  const decelSpikeFlag = (highDecelsRatio ?? 0) >= 1.35;
  const codSpikeFlag = (imaCodRatio ?? 0) >= 1.4;
  const denseMechanicalFlag = (playerLoadPerMinRatio ?? 0) >= 1.3 && (imaTotalRatio ?? 0) >= 1.25;
  const highMechanicalFlag = (mli ?? 0) >= 70;
  const extremeMechanicalFlag = (mli ?? 0) >= 85;
  const { confidence, confidenceReason } = computeConfidence(current, rows, dateKey);

  return {
    dss,
    ass,
    css,
    gds,
    mli,
    residualMli,
    mliBand: bandFromMLI(mli),
    residualBand: bandFromResidual(residualMli),
    decelSpikeFlag,
    codSpikeFlag,
    denseMechanicalFlag,
    highMechanicalFlag,
    extremeMechanicalFlag,
    confidence,
    confidenceReason,
  };
}
