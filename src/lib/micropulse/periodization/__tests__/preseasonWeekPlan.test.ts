import { describe, it, expect } from "vitest";
import { distributeWeekKpis, profileForIntent, trainingShareOfWeek } from "../preseasonWeekPlan";

const WEEKLY_KPI = { totalPlayerLoad: 3000, totalDistance: 60000, velocityBand6: 1800, accelB23: 240, decelB23: 270 };
const INTENTS = ["FORCE_LIGHT", "FORCE", "NEURAL_VELOCITY", "VELOCITY", "RECOVERY_MD1", "OFF", "OFF"];

describe("distributeWeekKpis", () => {
  it("each KPI's daily slices sum back to the weekly KPI target", () => {
    const days = distributeWeekKpis({ intents: INTENTS, weeklyLoad: 3000, weeklySrpe: 1800, weeklyKpi: WEEKLY_KPI });
    for (const k of Object.keys(WEEKLY_KPI) as (keyof typeof WEEKLY_KPI)[]) {
      const sum = days.reduce((s, d) => s + (d.byKpi[k] ?? 0), 0);
      // rounding tolerance: within the number of contributing days
      expect(Math.abs(sum - WEEKLY_KPI[k])).toBeLessThanOrEqual(days.length);
    }
  });

  it("overall load slices sum to the weekly load", () => {
    const days = distributeWeekKpis({ intents: INTENTS, weeklyLoad: 3000, weeklySrpe: 1800, weeklyKpi: WEEKLY_KPI });
    const sum = days.reduce((s, d) => s + (d.loadTarget ?? 0), 0);
    expect(Math.abs(sum - 3000)).toBeLessThanOrEqual(days.length);
    const srpe = days.reduce((s, d) => s + (d.srpeTarget ?? 0), 0);
    expect(Math.abs(srpe - 1800)).toBeLessThanOrEqual(days.length);
  });

  it("velocity days carry more sprint (band6) than force days", () => {
    const days = distributeWeekKpis({ intents: INTENTS, weeklyLoad: 3000, weeklySrpe: 1800, weeklyKpi: WEEKLY_KPI });
    const neural = days[2]; // NEURAL_VELOCITY
    const force = days[1];  // FORCE
    expect(neural.byKpi.velocityBand6!).toBeGreaterThan(force.byKpi.velocityBand6!);
    // and force days carry more accel/decel than the neural day
    expect(force.byKpi.accelB23!).toBeGreaterThan(neural.byKpi.accelB23!);
  });

  it("OFF / GAME days take no training slice", () => {
    const days = distributeWeekKpis({ intents: INTENTS, weeklyLoad: 3000, weeklySrpe: 1800, weeklyKpi: WEEKLY_KPI });
    expect(days[5].training).toBe(false);
    expect(days[5].loadTarget).toBe(0);
    expect(days[5].byKpi).toEqual({});
    expect(days[6].loadTarget).toBe(0);
  });

  it("null weekly load → null day load, KPIs still absent, sRPE independent", () => {
    const days = distributeWeekKpis({ intents: INTENTS, weeklyLoad: null, weeklySrpe: 1200, weeklyKpi: {} });
    expect(days[0].loadTarget).toBeNull();
    expect(days[0].byKpi).toEqual({});
    expect(days[0].srpeTarget).not.toBeNull(); // sRPE still distributes
  });

  it("unknown intent falls back to a default training profile", () => {
    const p = profileForIntent("SOMETHING_NEW");
    expect(p.training).toBe(true);
    expect(p.loadWeight).toBeGreaterThan(0);
  });

  it("an all-OFF week distributes nothing (no divide-by-zero)", () => {
    const days = distributeWeekKpis({ intents: ["OFF", "OFF", "OFF", "OFF", "OFF", "OFF", "OFF"], weeklyLoad: 3000, weeklySrpe: 1800, weeklyKpi: WEEKLY_KPI });
    expect(days.every((d) => d.loadTarget === 0)).toBe(true);
    expect(days.every((d) => Object.keys(d.byKpi).length === 0)).toBe(true);
  });
});

describe("purity boundary", () => {
  it("does not import readiness / decision / load-target engines", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../preseasonWeekPlan.ts", import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "loadTarget"]) {
      expect(imports.includes(bad)).toBe(false);
    }
  });
});

describe("trainingShareOfWeek — the friendly counts, training fills the rest", () => {
  const MATCH = { totalPlayerLoad: 1000, totalDistance: 10000, velocityBand6: 150, accelB23: 40, decelB23: 45 };
  const withGame = ["FORCE", "NEURAL_VELOCITY", "OFF", "VELOCITY", "ACTIVATION", "GAME", "RECOVERY_MD1"];
  const sum = (days: ReturnType<typeof distributeWeekKpis>, k: "totalDistance") => days.reduce((s, d) => s + (d.byKpi[k] ?? 0), 0);

  it("days + the friendly = the week's total, per variable", () => {
    const share = trainingShareOfWeek({ weeklyLoad: 3000, weeklySrpe: 2000, weeklyKpi: WEEKLY_KPI, games: 1, exposure: 0.6, matchKpi: MATCH, matchLoad: 1000, matchSrpe: 700 });
    expect(share.weeklyKpi.totalDistance).toBe(54000);
    expect(share.weeklyKpi.velocityBand6).toBe(1710);
    expect(share.weeklyLoad).toBe(2400);
    expect(share.weeklySrpe).toBe(1580);
    const days = distributeWeekKpis({ intents: withGame, ...share });
    expect(Math.abs(sum(days, "totalDistance") + 0.6 * 10000 - 60000)).toBeLessThanOrEqual(5);
  });

  it("no game → nothing taken off; take a session out → the rest carry the same total", () => {
    const none = trainingShareOfWeek({ weeklyLoad: 3000, weeklySrpe: null, weeklyKpi: WEEKLY_KPI, games: 0, exposure: 0.6, matchKpi: MATCH, matchLoad: 1000, matchSrpe: null });
    expect(none.weeklyKpi).toEqual(WEEKLY_KPI);
    const share = trainingShareOfWeek({ weeklyLoad: 3000, weeklySrpe: null, weeklyKpi: WEEKLY_KPI, games: 1, exposure: 0.6, matchKpi: MATCH, matchLoad: 1000, matchSrpe: null });
    const fewer = [...withGame]; fewer[0] = "OFF";
    const a = distributeWeekKpis({ intents: withGame, ...share }), b = distributeWeekKpis({ intents: fewer, ...share });
    expect(Math.abs(sum(a, "totalDistance") - sum(b, "totalDistance"))).toBeLessThanOrEqual(5);
    expect(b[1].byKpi.totalDistance!).toBeGreaterThan(a[1].byKpi.totalDistance!);
  });
});
