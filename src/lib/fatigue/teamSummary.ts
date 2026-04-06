import type { FatigueClassification, FatigueSeverity, FatigueType } from "@/lib/fatigue/types";

export type TeamFatigueSummary = {
  dominantType: FatigueType;
  counts: {
    NEURAL: number;
    TISSUE: number;
    SYSTEMIC: number;
    MIXED: number;
    NONE: number;
  };
  highSeverityCount: number;
  averageScore: number;
  total: number;
  summaryText: string;
  byType: Record<FatigueType, number>;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

function countBySeverity(items: FatigueClassification[], severity: FatigueSeverity) {
  return items.filter((x) => x.severity === severity).length;
}

export function buildTeamFatigueSummary(items: FatigueClassification[]): TeamFatigueSummary {
  const safe = Array.isArray(items) ? items : [];
  const total = safe.length;

  const byType: Record<FatigueType, number> = {
    NONE: 0,
    SYSTEMIC: 0,
    NEURAL: 0,
    TISSUE: 0,
    MIXED: 0,
  };

  let scoreSum = 0;
  for (const item of safe) {
    byType[item.primaryFatigueType] = (byType[item.primaryFatigueType] ?? 0) + 1;
    scoreSum += item.score ?? 0;
  }

  const dominantType = (["NEURAL", "TISSUE", "SYSTEMIC", "MIXED", "NONE"] as FatigueType[]).reduce(
    (best, cur) => (byType[cur] > byType[best] ? cur : best),
    "NONE" as FatigueType,
  );

  const averageScore = total > 0 ? Math.round(scoreSum / total) : 0;
  const highCount = countBySeverity(safe, "HIGH");
  const mediumCount = countBySeverity(safe, "MODERATE");
  const lowCount = countBySeverity(safe, "LOW");
  const highSeverityCount = highCount;

  const summaryText =
    dominantType === "NONE"
      ? "No dominant fatigue pattern today."
      : `Dominant fatigue pattern today: ${dominantType}.`;

  return {
    dominantType,
    counts: {
      NEURAL: byType.NEURAL,
      TISSUE: byType.TISSUE,
      SYSTEMIC: byType.SYSTEMIC,
      MIXED: byType.MIXED,
      NONE: byType.NONE,
    },
    highSeverityCount,
    averageScore,
    total,
    summaryText,
    byType,
    highCount,
    mediumCount,
    lowCount,
  };
}

export default buildTeamFatigueSummary;
