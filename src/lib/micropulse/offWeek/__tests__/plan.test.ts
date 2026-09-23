import { describe, it, expect } from "vitest";
import { buildOffWeekPlan, type OffWeekInputs } from "../plan";

const base = (over: Partial<OffWeekInputs> = {}): OffWeekInputs => ({
  days: 7, masKmh: 16, oneRepMaxes: { squat: 140, bench: 100 }, gymAccess: "gym", needs: {}, ...over,
});

const count = (p: ReturnType<typeof buildOffWeekPlan>, t: string) => p.days.filter((d) => d.type === t).length;
const allText = (p: ReturnType<typeof buildOffWeekPlan>) => JSON.stringify(p);

describe("buildOffWeekPlan — maintenance shape", () => {
  it("7-day plan ≈ 2 strength + 2–3 runs + rest", () => {
    const p = buildOffWeekPlan(base());
    expect(count(p, "strength")).toBe(2);
    expect(count(p, "run")).toBeGreaterThanOrEqual(2);
    expect(count(p, "rest")).toBeGreaterThanOrEqual(1);
    expect(p.days.length).toBe(7);
  });

  it("fewer days trims the extras (maintenance minimum keeps 2 strength)", () => {
    expect(count(buildOffWeekPlan(base({ days: 3 })), "strength")).toBe(2);
    expect(buildOffWeekPlan(base({ days: 3 })).days.length).toBe(3);
    expect(buildOffWeekPlan(base({ days: 2 })).days.length).toBe(2);
  });

  it("bodyweight prescriptions when no 1RM (or bodyweight access)", () => {
    const p = buildOffWeekPlan(base({ oneRepMaxes: null, gymAccess: "bodyweight" }));
    expect(allText(p)).toMatch(/split squat|push-up|Armbeygjur/i);
    expect(allText(p)).not.toMatch(/kg\)/); // no kg loads without 1RM
  });

  it("kg annotation appears when 1RM present + gym", () => {
    expect(allText(buildOffWeekPlan(base()))).toMatch(/~\d+ kg/);
  });

  it("runs are time/RPE when no MAS (no km/h fabricated)", () => {
    const p = buildOffWeekPlan(base({ masKmh: null }));
    expect(allText(p)).not.toMatch(/km\/h/);
    expect(allText(p)).toMatch(/RPE/);
  });
});

describe("individualised by need", () => {
  it("hamstring/eccentric deficit → Nordic block + a 'why'", () => {
    const p = buildOffWeekPlan(base({ needs: { deficitEmphases: ["eccentric_hamstring"] } }));
    expect(allText(p)).toMatch(/Nordic/);
    expect(p.why.some((w) => /eccentric/i.test(w.en))).toBe(true);
  });

  it("MAS trending down → a tempo run exists even at low day counts", () => {
    const p = buildOffWeekPlan(base({ days: 3, needs: { masTrend: "down" } }));
    expect(allText(p)).toMatch(/Tempo|interval/i);
    expect(p.why.some((w) => /trending down/i.test(w.en))).toBe(true);
  });

  it("fatigue flag → no hard intervals (tempo downgraded), lighter note", () => {
    const p = buildOffWeekPlan(base({ needs: { fatigueFlag: true } }));
    expect(count(p, "run")).toBeGreaterThanOrEqual(1);
    // tempo interval line ("× 2 min at ~100% MAS") should be gone
    expect(allText(p)).not.toMatch(/100% MAS/);
    expect(p.why.some((w) => /Lighter/i.test(w.en))).toBe(true);
  });

  it("RTP track → rehab plan, never a generic one", () => {
    const p = buildOffWeekPlan(base({ needs: { rtpTrack: "hamstring RTP wk3" } }));
    expect(allText(p)).toMatch(/rehab|RTP/i);
    expect(allText(p)).not.toMatch(/Nordic hamstring 3×5/); // not the generic strength block
    expect(p.why.some((w) => /return-to-play/i.test(w.en))).toBe(true);
  });

  it("no flags → balanced maintenance 'why'", () => {
    expect(buildOffWeekPlan(base()).why.some((w) => /Balanced maintenance/i.test(w.en))).toBe(true);
  });
});

describe("purity boundary", () => {
  it("does not import readiness / decision / load-target engines", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../plan.ts", import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "loadTarget"]) {
      expect(imports.includes(bad)).toBe(false);
    }
  });
});
