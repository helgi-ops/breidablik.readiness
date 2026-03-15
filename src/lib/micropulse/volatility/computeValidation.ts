import { computePlayerVolatilitySummary } from "./compute";
import type { VolatilityDailyPoint } from "./types";

type ValidationCase = { id: string; pass: boolean; details: string[] };

function d(day: number, checkIn: number, z: number): VolatilityDailyPoint {
  return {
    date: `2026-03-${String(day).padStart(2, "0")}`,
    checkInScore: checkIn,
    zScore: z,
    deltaZ: 0,
    soreness: 4,
    sleepQuality: 4,
    mood: 4,
    energy: 4,
    stress: 4,
  };
}

export function runVolatilityValidation() {
  const cases: ValidationCase[] = [];

  const stable7 = [d(1, 19, 1.1), d(2, 19, 1.1), d(3, 19, 1.12), d(4, 18, 1.1), d(5, 19, 1.09), d(6, 19, 1.1), d(7, 19, 1.11)];
  const stableSummary = computePlayerVolatilitySummary(stable7);
  cases.push({
    id: "SEVEN_DAY_STABLE_IS_LOW",
    pass: stableSummary.level === "LOW" && stableSummary.sampleSize === 7,
    details: [`level=${stableSummary.level}`, `sampleSize=${stableSummary.sampleSize}`],
  });

  const oscillating5 = [d(1, 15, -0.2), d(2, 22, 1.9), d(3, 14, -0.5), d(4, 23, 2.1), d(5, 13, -0.7)];
  const oscillatingSummary = computePlayerVolatilitySummary(oscillating5);
  cases.push({
    id: "FIVE_DAY_OSCILLATION_IS_MODERATE_OR_HIGH",
    pass: oscillatingSummary.level === "MODERATE" || oscillatingSummary.level === "HIGH",
    details: [`level=${oscillatingSummary.level}`, `score=${oscillatingSummary.overallScore}`],
  });

  const insufficient2 = [d(1, 18, 0.2), d(2, 18, 0.2)];
  const insufficientSummary = computePlayerVolatilitySummary(insufficient2);
  cases.push({
    id: "LESS_THAN_THREE_IS_INSUFFICIENT",
    pass: insufficientSummary.level === "INSUFFICIENT" && insufficientSummary.hasEnoughData === false,
    details: [`level=${insufficientSummary.level}`, `enough=${insufficientSummary.hasEnoughData}`],
  });

  const partialData = [
    { date: "2026-03-01", checkInScore: 18 },
    { date: "2026-03-02", checkInScore: 21 },
    { date: "2026-03-03", checkInScore: 19 },
    { date: "2026-03-04", checkInScore: 22 },
    { date: "2026-03-05", checkInScore: 20 },
  ] as VolatilityDailyPoint[];
  const partialSummary = computePlayerVolatilitySummary(partialData);
  cases.push({
    id: "PARTIAL_VARIABLES_STILL_COMPUTE",
    pass: partialSummary.level !== "INSUFFICIENT" && partialSummary.drivers.length >= 1,
    details: [`level=${partialSummary.level}`, `drivers=${partialSummary.drivers.length}`],
  });

  const passed = cases.filter((c) => c.pass).length;
  return { total: cases.length, passed, failed: cases.length - passed, cases };
}
