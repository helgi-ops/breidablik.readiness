import { describe, it, expect } from "vitest";
import { evaluateInjuryRiskRules } from "../rules";
import type { InjuryRiskInput } from "../types";

// 2026-11-25: a NordBord / ForceFrame left/right gap is not scored — a gap alone did not raise
// hamstring (Opar 2015) or groin (Vigneswaran 2025) injury risk. Only the CMJ read adds points.
describe("VALD in the injury-risk score", () => {
  it("scores the CMJ (neuromuscular) read and nothing for a strength-test gap", () => {
    const base = {} as InjuryRiskInput;
    const withCmj = evaluateInjuryRiskRules({ ...base, valdNeuromuscularRiskFlag: true });
    expect(withCmj.triggeredRules).toContain("VALD_NEUROMUSCULAR_CAUTION");
    expect(withCmj.riskScore - evaluateInjuryRiskRules(base).riskScore).toBe(1);
    expect(withCmj.triggeredRules.some((r) => /VALD_(HAMSTRING|GROIN)/.test(r))).toBe(false);
  });
});
