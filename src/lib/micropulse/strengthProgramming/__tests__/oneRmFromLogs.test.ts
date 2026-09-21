import { describe, it, expect } from "vitest";
import { oneRepMaxesFromLogs, targetKgForPercent } from "../oneRmFromLogs";
import { e1rmFromSet } from "@/lib/client/oneRepMaxFormulas";
import type { SetLogRow } from "@/lib/client/workingOneRm";

const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const set = (date: string, name: string, weight: number, reps: number, rpe: number): SetLogRow =>
  ({ session_date: date, exercise_name: name, weight_kg: weight, reps, rpe });

describe("oneRepMaxesFromLogs", () => {
  it("the reused Epley e1RM: 100 kg × 5 @ RPE 8 (RIR 2 → r=7) ≈ 123.3 kg (display formula)", () => {
    expect(e1rmFromSet(100, 5, 8)).toBeCloseTo(123.3, 1); // 100·(1+7/30)
  });

  it("near-max sets (RPE 9) corroborated over 2 sessions → extrapolated working 1RM", () => {
    // e1rmEvidence at RPE 9 extrapolates: RIR 1 → r=6 → Epley 100·1.2 = 120.
    const w = oneRepMaxesFromLogs([
      set(daysAgo(7), "Back Squat", 100, 5, 9),
      set(daysAgo(3), "Back Squat", 100, 5, 9),
    ]);
    expect(w["back squat"].source).toBe("logged");
    expect(w["back squat"].one_rm).toBeCloseTo(120, 1);
  });

  it("sub-max sets (RPE 8) contribute the raw weight, not an extrapolated max (evidence guardrail)", () => {
    const w = oneRepMaxesFromLogs([
      set(daysAgo(7), "Back Squat", 100, 5, 8),
      set(daysAgo(3), "Back Squat", 100, 5, 8),
    ]);
    expect(w["back squat"].one_rm).toBe(100); // RPE < 9 → weight lifted, never invents a PR
  });

  it("a single session does not corroborate a working 1RM (guardrail)", () => {
    const w = oneRepMaxesFromLogs([set(daysAgo(3), "Back Squat", 140, 3, 9)]);
    expect(w["back squat"]).toBeUndefined();
  });

  it("tested/coach 1RM stands until logs corroborate a higher value", () => {
    const w = oneRepMaxesFromLogs([set(daysAgo(3), "Back Squat", 100, 5, 8)], { "back squat": 120 });
    expect(w["back squat"].one_rm).toBe(120);
    expect(w["back squat"].source).toBe("tested");
  });

  it("targetKgForPercent → 0.85 × working, rounded to 2.5 kg (name or fraction)", () => {
    const w = oneRepMaxesFromLogs([], { "back squat": 120 });
    expect(targetKgForPercent("back_squat", 85, w)).toBe(102.5);   // 0.85 × 120 = 102 → 102.5
    expect(targetKgForPercent("Back Squat", 0.85, w)).toBe(102.5);
  });

  it("no working 1RM / accessory lift → null (RPE-only)", () => {
    expect(targetKgForPercent("back squat", 85, {})).toBeNull();
    const w = oneRepMaxesFromLogs([], { "back squat": 120 });
    expect(targetKgForPercent("Face Pull", 60, w)).toBeNull(); // accessory → not a canonical lift
  });
});
