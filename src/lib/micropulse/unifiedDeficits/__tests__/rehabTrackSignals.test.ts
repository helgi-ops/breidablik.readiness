import { describe, it, expect } from "vitest";
import { classifyRehabTrack, rehabTrackDeficits } from "../rehabTrackSignals";
import { reconcile, planCompensations } from "../reconcile";
import { buildStrengthPlan } from "../strengthPlan";

describe("rehab-track writer", () => {
  it("classifies injuries to tracks + qualities", () => {
    expect(classifyRehabTrack("Patellar tendinopathy (jumper's knee)")!.track).toBe("jumpers_knee");
    expect(classifyRehabTrack("ACL reconstruction")!.qualities).toContain("landing_stability");
    expect(classifyRehabTrack("Adductor-related groin pain")!.qualities).toContain("adductor_capacity");
    expect(classifyRehabTrack("common cold")).toBeNull();
  });

  it("emits confirmed, MEDICAL deficits (clinician-owned)", () => {
    const rows = rehabTrackDeficits("ACL", { since: "2026-06-01" });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.source).toBe("rehab_track");
      expect(r.status).toBe("confirmed");
      expect(r.medical).toBe(true);
    }
  });

  it("rehab-track deficits are EXCLUDED from the coach's auto-plan (medical wall)", () => {
    const summary = reconcile(rehabTrackDeficits("ACL"));
    // Every ACL quality is medical → no compensations, no strength targets.
    expect(summary.every((d) => d.medicalReferral && d.feeds.length === 0)).toBe(true);
    expect(planCompensations(summary)).toEqual([]);
    expect(buildStrengthPlan(summary)).toEqual([]);
  });

  it("surfaces on the ledger as a medical referral (→ clinician)", () => {
    const summary = reconcile(rehabTrackDeficits("Achilles tendinopathy"));
    expect(summary[0].medicalReferral).toBe(true);
    expect(summary[0].sources[0].source).toBe("rehab_track");
  });
});
