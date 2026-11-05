import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/push/webPush", () => ({ sendWebPush: vi.fn(), isSubscriptionGone: () => false }));
vi.mock("@/lib/email/sendTransactionalEmail", () => ({ sendTransactionalEmail: vi.fn() }));
import { buildMorningDigest } from "@/lib/notifications/coachDigest";
import { deriveSessionEnoughSignal, type CoachSignal } from "@/lib/micropulse/coachSignals";

const own = (s: CoachSignal) => ({ ...s, playerId: null });
const enough = (verdict: "yes" | "mostly" | "no") => own(deriveSessionEnoughSignal({
  state: "ok", sessionDate: "2026-10-22", mdLabel: "MD-2", verdict,
  headline: { en: `${verdict} headline`, is: `${verdict} fyrirsögn` }, facts: [], confidence: { level: "high" },
}));
const elevated: CoachSignal = { engine: "hr_load", level: "elevated", label: { en: "Hidden load (HR)", is: "x" }, why: { en: ["7 worked harder"], is: ["7"] }, confidence: "high", counterfactual: null, href: "/coach/hr" };

describe("morning digest — Did we do enough?", () => {
  it("is the first line even when other reads are more urgent", () => {
    const d = buildMorningDigest([own(elevated), enough("mostly")]);
    expect(d.items[0].label.en).toBe("Did we do enough?");
    expect(d.items[0].why.en).toBe("mostly headline (MD-2 · 2026-10-22)");
    expect(d.items).toHaveLength(2);
  });
  it("still answers on a quiet morning when the answer is yes", () => {
    const d = buildMorningDigest([enough("yes")]);
    expect(d.tone).toBe("steady");
    expect(d.items.map((i) => i.why.en)).toEqual(["yes headline (MD-2 · 2026-10-22)"]);
  });
  it("counts a 'no' as needing attention, without listing it twice", () => {
    const d = buildMorningDigest([enough("no")]);
    expect(d.tone).toBe("action");
    expect(d.items).toHaveLength(1);
  });
  it("adds nothing when there was no judged session", () => {
    expect(buildMorningDigest([]).items).toHaveLength(0);
  });
});
