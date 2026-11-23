/** A coach override needs a one-tap reason (contradiction 18, 2026-11-23). */
import { describe, expect, it } from "vitest";
import { parseCoachReason, reasonChoices, reasonLabel } from "../coachReasons";
import { confirmedNote } from "../asymmetryReview";

describe("coach reasons", () => {
  it("a known code is required; Other needs a note", () => {
    expect(parseCoachReason("swap", undefined, undefined).ok).toBe(false);
    expect(parseCoachReason("swap", "made_up", "").ok).toBe(false);
    expect(parseCoachReason("swap", "other", "  ").ok).toBe(false);
    expect(parseCoachReason("swap", "niggle", "")).toEqual({ ok: true, code: "niggle", stored: "niggle" });
    expect(parseCoachReason("swap", "other", " knee  taped ")).toEqual({ ok: true, code: "other", stored: "other: knee taped" });
    // a code belongs to its kind: "kicking_leg" is a keep reason, not a swap reason
    expect(parseCoachReason("asym_swap", "kicking_leg", "").ok).toBe(false);
    expect(parseCoachReason("asym_keep", "kicking_leg", "").ok).toBe(true);
  });

  it("the AI code is accepted from the AI button but not shown as a chip", () => {
    expect(parseCoachReason("swap", "ai", "fewer jumps after the match").ok).toBe(true);
    expect(reasonChoices("swap").map((c) => c.code)).not.toContain("ai");
    expect(reasonChoices("swap").map((c) => c.code)).toContain("other");
  });

  it("shown in the reader's language; older free text as written", () => {
    expect(reasonLabel("swap", "niggle", false)).toBe("Pain or a niggle");
    expect(reasonLabel("swap", "niggle", true)).toBe("Eymsli eða verkur");
    expect(reasonLabel("swap", "other: knee taped", false)).toBe("Other: knee taped");
    expect(reasonLabel("swap", "AI: fewer jumps", false)).toBe("AI: fewer jumps");
    expect(reasonLabel("swap", null, false)).toBeNull();
  });

  it("the gap lines carry the coach's reason", () => {
    const snap = (decision: "swap" | "keep", reason: string) => ({
      todayIso: "2026-11-23",
      asymmetryReview: { decision, decidedAt: "2026-11-23T10:00:00Z", asymPct: 14, reason },
    });
    expect(confirmedNote(snap("swap", "old_injury") as never).en).toContain("Old injury on the weaker side");
    expect(confirmedNote(snap("swap", "old_injury") as never).is).toContain("Gömul meiðsli");
  });
});
