/**
 * A left/right asymmetry goes to the coach first; the lift swaps only after the coach's tap (asymmetryReview.ts,
 * brief §4b): the read, the 28-day hold, the CoD rule (RULE 6) and the logs. The palette side is in teamPalette.test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASYMMETRY_KEPT, ASYMMETRY_REVIEW, activeReview, asymmetryRead, asymmetryReviewAudit, asymmetrySwapAllowed,
} from "../asymmetryReview";
import { buildStrengthSession } from "..";
import type { MdContext, PlayerStrengthSnapshot, StrengthSession } from "../types";

const TODAY = "2026-11-23";
const snap = (md: MdContext, over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: TODAY, mdContext: md, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, ...over,
});
const ids = (s: StrengthSession | null) => (s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));
const rules = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).map((a) => a.ruleId);
const swap = (decidedAt = "2026-11-20") => ({ decision: "swap" as const, decidedAt });

describe("the read and the hold", () => {
  it("the larger gap leads, VALD on a tie; weaker side from that source", () => {
    expect(asymmetryRead({ codAsymmetryPct: 12, valdAsymmetryPct: 18, codWeakerSide: "L", valdWeakerSide: "R" })).toEqual({ pct: 18, source: "VALD", weaker: "R" });
    expect(asymmetryRead({ codAsymmetryPct: 20, valdAsymmetryPct: 18, codWeakerSide: "L" })).toEqual({ pct: 20, source: "IMA CoD", weaker: "L" });
    expect(asymmetryRead({ codAsymmetryPct: null, valdAsymmetryPct: null })).toBeNull();
  });

  it("a decision holds 28 days; a future date or an older one is not in force", () => {
    expect(activeReview({ todayIso: TODAY, asymmetryReview: swap("2026-10-26") })).not.toBeNull(); // 28 d
    expect(activeReview({ todayIso: TODAY, asymmetryReview: swap("2026-10-25") })).toBeNull(); // 29 d
    expect(activeReview({ todayIso: TODAY, asymmetryReview: swap("2026-11-24") })).toBeNull();
    expect(asymmetrySwapAllowed({ todayIso: TODAY, asymmetryReview: { decision: "keep", decidedAt: "2026-11-20" } })).toBe(false);
    expect(asymmetrySwapAllowed({ todayIso: TODAY })).toBe(false);
  });

  it("the audit: review below the confirm, kept when the coach kept it, nothing under 10% or once confirmed", () => {
    const review = asymmetryReviewAudit(snap("MD-4", { valdAsymmetryPct: 14, valdWeakerSide: "L" }))!;
    expect(review.ruleId).toBe(ASYMMETRY_REVIEW);
    expect(review.triggerEN).toContain("14% (VALD) (weaker: left)");
    expect(review.triggerIS).toContain("vinstri");
    expect(review.actionIS).toContain("þjálfari staðfestir");
    expect(review.evidence).toContain("Bishop 2020");
    expect(asymmetryReviewAudit(snap("MD-4", { valdAsymmetryPct: 14, asymmetryReview: { decision: "keep", decidedAt: "2026-11-20" } }))!.ruleId).toBe(ASYMMETRY_KEPT);
    expect(asymmetryReviewAudit(snap("MD-4", { valdAsymmetryPct: 9.9 }))).toBeNull();
    expect(asymmetryReviewAudit(snap("MD-4", { valdAsymmetryPct: 14, asymmetryReview: swap() }))).toBeNull();
  });
});

describe("the CoD rule (≥ 15%) in the engine", () => {
  // MD-4 template's main lift is a bilateral compound that RULE 6 used to swap to the Bulgarian split squat.
  const plain = buildStrengthSession(snap("MD-4"));
  const noConfirm = buildStrengthSession(snap("MD-4", { codAsymmetryPct: 20, codWeakerSide: "L" }));
  const confirmed = buildStrengthSession(snap("MD-4", { codAsymmetryPct: 20, codWeakerSide: "L", asymmetryReview: swap() }));

  it("not confirmed → same lifts as without the gap, logged ASYMMETRY_REVIEW", () => {
    expect(ids(noConfirm)).toEqual(ids(plain));
    expect(rules(noConfirm)).toContain(ASYMMETRY_REVIEW);
    expect(rules(noConfirm)).not.toContain("COD_ASYM_MAIN_LIFT_SWAP");
  });

  it("confirmed → the swap as before, naming the coach's date; no review line", () => {
    expect(rules(confirmed)).toContain("COD_ASYM_MAIN_LIFT_SWAP");
    expect(ids(confirmed)).toContain("ex_bulgarian_ss");
    const a = confirmed!.appliedAdaptations.find((x) => x.ruleId === "COD_ASYM_MAIN_LIFT_SWAP")!;
    expect(a.actionEN).toContain("Coach confirmed the swap on 2026-11-20");
    expect(rules(confirmed)).not.toContain(ASYMMETRY_REVIEW);
  });
});

describe("boundaries", () => {
  const code = (f: string) => readFileSync(join(process.cwd(), "src/lib/micropulse/strengthProgramming", f), "utf8");
  it("never reads or writes the readiness colour", () => {
    for (const f of ["asymmetryReview.ts", "asymmetryReviewStore.ts", "testAddons.ts", "testAddonsLoader.ts"]) {
      expect(code(f)).not.toMatch(/readiness_entries|final_color|v_coach_readiness/);
    }
  });
  it("the store writes only asymmetry_reviews (Today only through the check-in rebuild)", () => {
    const writes = [...code("asymmetryReviewStore.ts").matchAll(/from\("([a-z_]+)"\)\.(insert|upsert|update|delete)/g)].map((m) => m[1]);
    expect(writes).toEqual(["asymmetry_reviews"]);
  });
});
