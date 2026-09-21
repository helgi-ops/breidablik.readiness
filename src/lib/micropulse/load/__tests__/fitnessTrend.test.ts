import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildFitnessTrends, SWC_FIELD_PCT } from "../fitnessTrend";

type Row = { test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null };
const vam = (date: string, mas: number): Row => ({ test_date: date, test_type: "mas_vameval", result_value: mas, result_unit: "km/h", mas_kmh: mas, vo2max_est: null });

describe("buildFitnessTrends", () => {
  it("3 VAMEVAL MAS 16.4→16.1→15.8 → down, season ≈ −3.7% (beyond 3% SWC)", () => {
    const { byTestType } = buildFitnessTrends([vam("2026-07-01", 15.8), vam("2026-06-01", 16.1), vam("2026-05-01", 16.4)]); // newest-first input
    const t = byTestType.find((x) => x.points[0].testType === "mas_vameval")!;
    expect(t.points.map((p) => p.value)).toEqual([16.4, 16.1, 15.8]); // sorted oldest→newest
    expect(t.seasonDeltaPct).toBeCloseTo(-3.7, 1);
    expect(t.dir).toBe("down");
    expect(t.swcPct).toBe(3);
    expect(t.verdict.en).toMatch(/retest|investigate/i);
  });

  it("MAS 16.0→16.3 (+1.9%) → stable (inside SWC)", () => {
    const { byTestType } = buildFitnessTrends([vam("2026-06-01", 16.3), vam("2026-05-01", 16.0)]);
    const t = byTestType[0];
    expect(t.seasonDeltaPct).toBeCloseTo(1.9, 1);
    expect(t.dir).toBe("stable");
    expect(t.verdict.en).toMatch(/within test error/i);
  });

  it("one test → insufficient, baseline only", () => {
    const { byTestType } = buildFitnessTrends([vam("2026-05-01", 16.0)]);
    expect(byTestType[0].dir).toBe("insufficient");
    expect(byTestType[0].verdict.en).toMatch(/baseline only/i);
  });

  it("mixed test types group separately; masAcross set with the indicative caveat", () => {
    const { byTestType, masAcross } = buildFitnessTrends([
      vam("2026-07-01", 16.0),
      { test_date: "2026-06-01", test_type: "mas_run_4min", result_value: 1080, result_unit: "m", mas_kmh: 16.2, vo2max_est: null },
      { test_date: "2026-05-01", test_type: "msft_beep", result_value: 12.5, result_unit: "level", mas_kmh: 13.75, vo2max_est: null },
    ]);
    // three distinct protocols → three within-type reads
    expect(new Set(byTestType.map((t) => t.points[0].testType)).size).toBe(3);
    expect(masAcross).not.toBeNull();
    expect(masAcross!.indicative).toBe(true);
    expect(masAcross!.caveat.en).toMatch(/indicative|different protocols|not like-for-like/i);
    // MAS pooled oldest→newest, rounded to 1 dp: 13.75→13.8, 16.2, 16.0
    expect(masAcross!.points.map((p) => p.value)).toEqual([13.8, 16.2, 16.0]);
  });

  it("Yo-Yo distance uses the 5% field SWC", () => {
    const yo = (d: string, m: number): Row => ({ test_date: d, test_type: "yo_yo_ir1", result_value: m, result_unit: "m", mas_kmh: null, vo2max_est: null });
    const { byTestType } = buildFitnessTrends([yo("2026-06-01", 2040), yo("2026-05-01", 2000)]); // +2% → inside 5% → stable
    const t = byTestType[0];
    expect(t.swcPct).toBe(SWC_FIELD_PCT);
    expect(t.dir).toBe("stable");
  });

  it("all-same-protocol MAS → no redundant masAcross (within-type read covers it)", () => {
    const { masAcross } = buildFitnessTrends([vam("2026-06-01", 16.1), vam("2026-05-01", 16.4)]);
    expect(masAcross).toBeNull();
  });

  describe("boundary — descriptive/monitoring only", () => {
    it("fitnessTrend.ts imports nothing from a readiness/decision module", () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(resolve(here, "../fitnessTrend.ts"), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(imports.sort()).toEqual(["./fitnessTests", "./peakPeriod"]);
      for (const forbidden of ["readiness", "decision", "stage4", "resolveFinalState", "recommend"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    });
  });
});
