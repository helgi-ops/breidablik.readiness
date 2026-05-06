import { computeCatapultExternalLoadBaseline, fetchCatapultDailyLoadRows } from "./baselines";
import { buildExternalLoadExplanations } from "./explanations";
import { computeCatapultExternalLoadSignals } from "./signals";
import type {
  CatapultDailyLoadRow,
  CatapultExternalLoadBaseline,
  CatapultExternalLoadSignals,
  CatapultReadinessContext,
  CatapultReadinessModifier,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildCatapultReadinessModifier(args: {
  today: CatapultDailyLoadRow | null;
  baseline: CatapultExternalLoadBaseline;
  signals: CatapultExternalLoadSignals;
}): CatapultReadinessModifier {
  const { signals } = args;
  const explanations = buildExternalLoadExplanations(signals);
  const cautionFlags = explanations.map((item) => item.code);

  if (signals.externalLoadState === "unknown") {
    return {
      scoreDelta: signals.dataQuality === "insufficient" ? -1 : 0,
      suggestedStateShift: 0,
      cautionFlags,
      explanations,
    };
  }

  if (signals.externalLoadState === "normal") {
    return {
      scoreDelta: 0,
      suggestedStateShift: 0,
      cautionFlags,
      explanations,
    };
  }

  const burden = signals.neuromuscularBurdenScore ?? 0;
  const highSpikeCount = [
    (signals.playerLoadSpike ?? 0) >= 1.5,
    (signals.hirSpike ?? 0) >= 1.6,
    (signals.decelSpike ?? 0) >= 1.6,
    (signals.accelSpike ?? 0) >= 1.6,
    (signals.maxVelocityExposureRatio ?? 0) >= 1.12,
    (signals.densityStressRatio ?? 0) >= 1.35,
  ].filter(Boolean).length;

  if (signals.externalLoadState === "elevated") {
    return {
      scoreDelta: -clamp(Math.round(4 + burden * 4), 4, 8),
      suggestedStateShift: 1,
      cautionFlags,
      explanations,
    };
  }

  return {
    scoreDelta: -clamp(Math.round(8 + burden * 5 + highSpikeCount), 8, 15),
    suggestedStateShift: 2,
    cautionFlags,
    explanations,
  };
}

export function buildCatapultReadinessContextFromRows(args: {
  rows: CatapultDailyLoadRow[];
  date: string;
  indoorMode?: boolean;
  sportType?: "football" | "basketball";
}): CatapultReadinessContext {
  const { today, baseline, daysSinceData } = computeCatapultExternalLoadBaseline(args);
  const signals = computeCatapultExternalLoadSignals({
    today,
    baseline,
    indoorMode: args.indoorMode,
    sportType: args.sportType,
    daysSinceData,
  });
  const modifier = buildCatapultReadinessModifier({ today, baseline, signals });
  return { today, baseline, signals, modifier };
}

export async function buildCatapultReadinessContextFromDatabase(args: {
  playerId: string;
  date: string;
  teamId?: string | null;
  indoorMode?: boolean;
  sportType?: "football" | "basketball";
}): Promise<CatapultReadinessContext> {
  const rows = await fetchCatapultDailyLoadRows(args);
  return buildCatapultReadinessContextFromRows({ rows, date: args.date, indoorMode: args.indoorMode, sportType: args.sportType });
}
