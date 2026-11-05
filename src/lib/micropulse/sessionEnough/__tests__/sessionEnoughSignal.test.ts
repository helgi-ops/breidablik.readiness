import { describe, it, expect } from "vitest";
import { deriveSessionEnoughSignal } from "@/lib/micropulse/coachSignals";

const base = {
  state: "ok", sessionDate: "2026-10-22", mdLabel: "MD-2",
  headline: { en: "Mostly — short on fast running.", is: "Að mestu — vantaði upp á hraðhlaup." },
  facts: [{ en: "Fast running reached 79%…", is: "Hraðhlaup náði 79%…" }],
  counterfactual: { en: "~75 more m…", is: "~75 fleiri m…" },
  confidence: { level: "high" as const },
};

describe("deriveSessionEnoughSignal (Today chip + morning digest)", () => {
  it("is silent on yes, not-applicable and missing reads", () => {
    const yes = deriveSessionEnoughSignal({ ...base, verdict: "yes", headline: { en: "Yes — the session gave what MD-2 should.", is: "Já." } });
    expect(yes.level).toBe("steady");
    expect(yes.why.en[0]).toContain("Yes — "); // carried for the morning digest, no chip
    expect(deriveSessionEnoughSignal({ state: "not_available", verdict: null }).level).toBe("steady");
    expect(deriveSessionEnoughSignal(null).level).toBe("steady");
  });
  it("watch on mostly, elevated on no — first why line is the verdict with day + date", () => {
    const m = deriveSessionEnoughSignal({ ...base, verdict: "mostly" });
    expect(m.level).toBe("watch");
    expect(m.why.en[0]).toBe("Mostly — short on fast running. (MD-2 · 2026-10-22)");
    expect(m.href).toBe("/coach/post-training");
    expect(m.counterfactual?.en).toContain("75 more");
    expect(deriveSessionEnoughSignal({ ...base, verdict: "no" }).level).toBe("elevated");
  });
});
