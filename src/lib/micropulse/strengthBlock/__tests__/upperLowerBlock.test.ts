import { describe, it, expect } from "vitest";
import { blockDayOrder, blockDays, buildBlockSchedule, buildBlockSession, blockDayMatrix } from "../upperLowerBlock";

describe("block weekly split per method", () => {
  it("upper_lower is a 4-day upper/lower split", () => {
    expect(blockDayOrder("upper_lower")).toEqual(["push", "quad", "pull", "hinge"]);
    expect(buildBlockSchedule("2026-01-05", "EN", "upper_lower")).toHaveLength(16); // 4 days × 4 weeks
  });

  it("contrast is a 3-day full-body split (Mon/Wed/Fri)", () => {
    expect(blockDayOrder("contrast")).toEqual(["fbpush", "fbpull", "combo"]);
    const days = blockDays("contrast", "EN");
    expect(days.map((d) => d.dayName)).toEqual(["Mon", "Wed", "Fri"]);
    expect(days.map((d) => d.focus)).toEqual(["Full body — Push", "Full body — Pull", "Full body — Combo"]);
    expect(buildBlockSchedule("2026-01-05", "EN", "contrast")).toHaveLength(12); // 3 × 4
  });

  it("french_contrast is a 3-day full-body split and each day carries the french-contrast structureId", () => {
    expect(blockDayOrder("french_contrast")).toEqual(["fbpush", "fbpull", "combo"]);
    const s = buildBlockSchedule("2026-01-05", "EN", "french_contrast");
    expect(s).toHaveLength(12);
    for (const day of s) expect(day.blocks[0].structureId).toBe("french-contrast");
  });

  it("french_contrast fbpush is a full A1→A4 complex plus a rounding lift", () => {
    const m = blockDayMatrix("fbpush", "EN", "french_contrast");
    expect(m.exercises.map((e) => e.role)).toEqual(["heavy", "plyo", "loadedjump", "reactive", "main"]);
  });

  it("power-block items stay swappable (library id + alternatives) so Today swap works", () => {
    const sess = buildBlockSession("fbpush", 1, "EN", "contrast");
    const first = sess.blocks[0].items[0];
    expect(first.exerciseId).toBeTruthy();
    expect((first.alternatives ?? []).length).toBeGreaterThan(0);
  });

  it("progressive overload — the heavy A1 load climbs across the 4 weeks", () => {
    const w1 = blockDayMatrix("fbpush", "EN", "contrast").exercises[0].weeks[0];
    const w4 = blockDayMatrix("fbpush", "EN", "contrast").exercises[0].weeks[3];
    expect(w1.rpe).not.toEqual(w4.rpe); // scheme intensifies W1 → W4
  });
});
