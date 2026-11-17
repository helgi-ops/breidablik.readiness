import { describe, it, expect } from "vitest";
import { blockFromPlan, seasonPlanCandidates } from "../resolveCurrentBlock";
import { buildMesoBlocks } from "@/lib/micropulse/periodization";

// Minimal plan shapes — blockFromPlan only reads phases/loadCurve/matchLoad*/fixtures.
const emptyPlan = { phases: [] as any[], loadCurve: [] as any[], matchLoad: null, matchLoadTeam: null, fixtures: [] as string[] };

describe("blockFromPlan — the meso block containing today", () => {
  it("no phases → null (backward-compat: no plan ⇒ delivery unchanged)", () => {
    expect(blockFromPlan(emptyPlan as any, 4, "2026-06-01")).toBeNull();
  });

  it("a date outside every block span → null", () => {
    const phases = [
      { key: "preseason", label: { en: "", is: "" }, start: "2026-01-05", end: "2026-03-02", weeks: 8, matches: 0, rationale: { en: "", is: "" } },
      { key: "competitive", label: { en: "", is: "" }, start: "2026-03-02", end: "2026-11-02", weeks: 35, matches: 20, rationale: { en: "", is: "" } },
    ];
    const loadCurve = Array.from({ length: 44 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 5)); d.setUTCDate(d.getUTCDate() + i * 7);
      return { weekStart: d.toISOString().slice(0, 10), load: 2000, readiness: null };
    });
    const fixtures = loadCurve.slice(8).map((w) => w.weekStart);
    const plan = { phases, loadCurve, matchLoad: 1800, matchLoadTeam: 1800, fixtures } as any;
    // sanity: there IS a block spine
    const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, loadCurve as any, 4, 1800, fixtures);
    expect(blocks.length).toBeGreaterThan(0);
    // a date well before the plan → no containing block → null
    expect(blockFromPlan(plan, 4, "2020-01-01")).toBeNull();
  });

  it("a date inside the pre-season span resolves to a block with phase 'preseason'", () => {
    const phases = [
      { key: "preseason", label: { en: "", is: "" }, start: "2026-01-05", end: "2026-03-02", weeks: 8, matches: 0, rationale: { en: "", is: "" } },
      { key: "competitive", label: { en: "", is: "" }, start: "2026-03-02", end: "2026-11-02", weeks: 35, matches: 20, rationale: { en: "", is: "" } },
    ];
    const loadCurve = Array.from({ length: 44 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 5)); d.setUTCDate(d.getUTCDate() + i * 7);
      return { weekStart: d.toISOString().slice(0, 10), load: 2000, readiness: null };
    });
    const fixtures = loadCurve.slice(8).map((w) => w.weekStart);
    const plan = { phases, loadCurve, matchLoad: 1800, matchLoadTeam: 1800, fixtures } as any;
    const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, loadCurve as any, 4, 1800, fixtures);
    const first = blocks[0];
    // pick a date inside the first block → must be preseason (before competitive start)
    const mid = first.start;
    const r = blockFromPlan(plan, 4, mid);
    expect(r).not.toBeNull();
    expect(r!.phase).toBe("preseason");
  });
});

describe("seasonPlanCandidates — which season plan holds today (2026-11-17)", () => {
  const r2026 = { season_year: 2026, overrides: { preseasonStart: "2026-02-02", seasonEnd: "2026-10-24", offseasonStart: "2026-10-25" } };
  const r2027 = { season_year: 2027, overrides: { preseasonStart: "2026-11-30", seasonEnd: "2027-10-26" } };

  it("this year's row first, then next year's (a pre-season that opens in Nov/Dec)", () => {
    expect(seasonPlanCandidates("2026-12-05", [r2027, r2026])).toEqual([
      { seasonYear: 2026, ov: r2026.overrides },
      { seasonYear: 2027, ov: r2027.overrides },
    ]);
  });

  it("no row this year → this year with no overrides (the old behaviour), next year's only if saved", () => {
    expect(seasonPlanCandidates("2026-06-01", [])).toEqual([{ seasonYear: 2026, ov: {} }]);
    expect(seasonPlanCandidates("2026-12-05", [r2027])).toEqual([
      { seasonYear: 2026, ov: {} },
      { seasonYear: 2027, ov: r2027.overrides },
    ]);
  });

  it("the year comes from the date asked about, not the clock", () => {
    expect(seasonPlanCandidates("2027-03-01", [r2026, r2027])[0]).toEqual({ seasonYear: 2027, ov: r2027.overrides });
  });

  it("a bad date → nothing to try", () => {
    expect(seasonPlanCandidates("", [r2026])).toEqual([]);
  });
});
