import { buildCatapultReadinessContextFromRows } from "./catapultReadiness";
import { getBand6Distance, getDecelLoad, getDensityStress, getHirDistance } from "./baselines";
import type {
  TeamExternalLoadPlayerInput,
  TeamExternalLoadPlayerSnapshot,
  TeamExternalLoadTrend,
} from "./teamTypes";

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: string, days: number): string {
  const base = startOfDay(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function valuesForDay(
  snapshots: TeamExternalLoadPlayerSnapshot[],
  key:
    | "playerLoad"
    | "hirDist"
    | "decelerations"
    | "playerLoadPerMinute"
    | "playerLoadSpike"
    | "hirSpike"
    | "decelSpike"
    | "densityStressRatio",
): number[] {
  return snapshots
    .map((snapshot) => snapshot[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function trendFromRatio(current: number, baseline: number, sampleSize: number): TeamExternalLoadTrend["playerLoadTrend"] {
  if (sampleSize < 2 || baseline <= 0 || current <= 0) return "unknown";
  const ratio = current / baseline;
  if (ratio >= 1.12) return "up";
  if (ratio <= 0.88) return "down";
  return "flat";
}

function playerMetricForDate(
  inputs: TeamExternalLoadPlayerInput[],
  date: string,
  metric: "playerLoad" | "hirDist" | "decelLoad" | "densityStress",
): number[] {
  const values: number[] = [];
  for (const player of inputs) {
    const context = buildCatapultReadinessContextFromRows({
      rows: player.historyRows.filter((row) => row.date <= date),
      date,
    });
    const today = context.today;
    if (!today) continue;
    if (metric === "playerLoad" && typeof today.playerLoad === "number") values.push(today.playerLoad);
    if (metric === "hirDist") { const hir = getHirDistance(today); if (hir > 0) values.push(hir); }
    if (metric === "decelLoad") values.push(getDecelLoad(today));
    if (metric === "densityStress") values.push(getDensityStress(today));
  }
  return values;
}

export function buildTeamExternalLoadPlayerSnapshots(
  inputs: TeamExternalLoadPlayerInput[],
): TeamExternalLoadPlayerSnapshot[] {
  return inputs.map((input) => ({
    playerId: input.playerId,
    playerName: input.playerName ?? null,
    readinessState: input.readinessState,
    externalLoadState: input.externalLoadState,
    dataQuality: input.dataQuality,
    playerLoad: input.todayRow?.playerLoad ?? null,
    hirDist: getHirDistance(input.todayRow) || null,
    maxVelocity: input.todayRow?.maxVelocity ?? null,
    accelerations: input.todayRow?.accelerations ?? input.todayRow?.totalAccelerations ?? null,
    decelerations: input.todayRow?.decelerations ?? input.todayRow?.totalDecelerations ?? null,
    playerLoadPerMinute: input.todayRow?.playerLoadPerMinute ?? null,
    band6Distance: getBand6Distance(input.todayRow) || null,
    playerLoadSpike: input.playerLoadSpike ?? null,
    hirSpike: input.hirSpike ?? null,
    decelSpike: input.decelSpike ?? null,
    accelSpike: input.accelSpike ?? null,
    densityStressRatio: input.densityStressRatio ?? null,
    maxVelocityExposureRatio: input.maxVelocityExposureRatio ?? null,
    band6ExposureRatio: input.band6ExposureRatio ?? null,
    neuromuscularBurdenScore: input.neuromuscularBurdenScore ?? null,
    historyRows: input.historyRows,
  }));
}

export function buildTeamExternalLoadTrend(args: {
  date: string;
  inputs: TeamExternalLoadPlayerInput[];
  snapshots: TeamExternalLoadPlayerSnapshot[];
  teamState: TeamExternalLoadTrend["teamState"];
}): TeamExternalLoadTrend {
  const currentPlayerLoad = average(valuesForDay(args.snapshots, "playerLoad"));
  const currentHir = average(valuesForDay(args.snapshots, "hirDist"));
  const currentDecel = average(valuesForDay(args.snapshots, "decelerations"));
  const currentDensity = average(valuesForDay(args.snapshots, "playerLoadPerMinute"));

  const previous3Dates = [1, 2, 3].map((days) => addDays(args.date, -days));
  const previous7Dates = [1, 2, 3, 4, 5, 6, 7].map((days) => addDays(args.date, -days));

  const baselinePlayerLoad = average(previous3Dates.map((date) => average(playerMetricForDate(args.inputs, date, "playerLoad"))).filter((value) => Number.isFinite(value) && value > 0));
  const baselineHir = average(previous3Dates.map((date) => average(playerMetricForDate(args.inputs, date, "hirDist"))).filter((value) => Number.isFinite(value) && value > 0));
  const baselineDecel = average(previous3Dates.map((date) => average(playerMetricForDate(args.inputs, date, "decelLoad"))).filter((value) => Number.isFinite(value) && value > 0));
  const baselineDensity = average(previous7Dates.map((date) => average(playerMetricForDate(args.inputs, date, "densityStress"))).filter((value) => Number.isFinite(value) && value > 0));

  return {
    teamState: args.teamState,
    playerLoadTrend: trendFromRatio(currentPlayerLoad, baselinePlayerLoad, previous3Dates.length),
    hirTrend: trendFromRatio(currentHir, baselineHir, previous3Dates.length),
    decelTrend: trendFromRatio(currentDecel, baselineDecel, previous3Dates.length),
    densityTrend: trendFromRatio(currentDensity, baselineDensity, previous7Dates.length),
  };
}

export function summarizeTeamMetricRatios(snapshots: TeamExternalLoadPlayerSnapshot[]) {
  return {
    averagePlayerLoadSpike: average(valuesForDay(snapshots, "playerLoadSpike")),
    medianPlayerLoadSpike: median(valuesForDay(snapshots, "playerLoadSpike")),
    averageHirSpike: average(valuesForDay(snapshots, "hirSpike")),
    medianHirSpike: median(valuesForDay(snapshots, "hirSpike")),
    averageDecelSpike: average(valuesForDay(snapshots, "decelSpike")),
    medianDecelSpike: median(valuesForDay(snapshots, "decelSpike")),
    averageDensityStressRatio: average(valuesForDay(snapshots, "densityStressRatio")),
    medianDensityStressRatio: median(valuesForDay(snapshots, "densityStressRatio")),
  };
}
