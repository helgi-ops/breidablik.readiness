import { describe, expect, it } from "vitest";
import { cleanPlayerNote, isGoalQuality, isMonday, nextMonday, parseDecision, planEndDate, PLAYER_BLOCK_TEXT, PLAYER_NOTE_MAX } from "../requests";

const TODAY = "2026-11-13"; // a Friday

describe("dates", () => {
  it("next Monday on or after a day", () => {
    expect(nextMonday(TODAY)).toBe("2026-11-16");
    expect(nextMonday("2026-11-16")).toBe("2026-11-16");
    expect(nextMonday("2026-11-15")).toBe("2026-11-16");
  });
  it("Mondays and plan end", () => {
    expect(isMonday("2026-11-16")).toBe(true);
    expect(isMonday("2026-11-17")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
    expect(isMonday("16.11.2026")).toBe(false);
    expect(planEndDate("2026-11-16")).toBe("2027-01-10"); // 8 weeks, Sunday
  });
});

describe("parseDecision", () => {
  const approve = (over: Record<string, unknown> = {}) => parseDecision({ action: "approve", startDate: "2026-11-16", ...over }, TODAY, "build_first");
  it("approve with the rule's start needs no reason", () => {
    const r = approve({ start: "build_first" });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.action === "approve") expect(r.value.start).toBeNull();
  });
  it("another start needs a reason", () => {
    expect(approve({ start: "ready" }).ok).toBe(false);
    expect(approve({ start: "ready", reason: "ok" }).ok).toBe(false);
    const r = approve({ start: "ready", reason: "Sprinted flat out in Tuesday's game" });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.action === "approve") expect(r.value.start).toBe("ready");
  });
  it("start date must be a Monday, not past, within 28 days", () => {
    expect(approve({ startDate: "2026-11-17" }).ok).toBe(false);
    expect(approve({ startDate: "2026-11-09" }).ok).toBe(false);
    expect(approve({ startDate: "2026-12-14" }).ok).toBe(false);
    expect(approve({ startDate: "2026-12-07" }).ok).toBe(true);
  });
  it("decline and stop need a reason; unknown actions fail", () => {
    expect(parseDecision({ action: "decline" }, TODAY, null).ok).toBe(false);
    expect(parseDecision({ action: "decline", reason: "Not before the cup final" }, TODAY, null).ok).toBe(true);
    expect(parseDecision({ action: "stop", reason: "   " }, TODAY, null).ok).toBe(false);
    expect(parseDecision({ action: "stop", reason: "Knee is sore again" }, TODAY, null).ok).toBe(true);
    expect(parseDecision({ action: "delete" }, TODAY, null).ok).toBe(false);
    expect(parseDecision(null, TODAY, null).ok).toBe(false);
  });
});

describe("player input", () => {
  it("note is trimmed, collapsed and capped", () => {
    expect(cleanPlayerNote("  hi   there ")).toBe("hi there");
    expect(cleanPlayerNote("")).toBeNull();
    expect(cleanPlayerNote(42)).toBeNull();
    expect(cleanPlayerNote("x".repeat(400))!.length).toBe(PLAYER_NOTE_MAX);
  });
  it("only the four qualities", () => {
    expect(isGoalQuality("jump")).toBe(true);
    expect(isGoalQuality("endurance")).toBe(false);
  });
  it("player block texts are plain and gender-neutral in both languages", () => {
    for (const t of Object.values(PLAYER_BLOCK_TEXT)) {
      expect(t.en).not.toMatch(/\b(he|she|his|her|him)\b/i);
      expect(t.is).not.toMatch(/\(ur\)|\(n\)|\(a\)/);
      expect(`${t.en} ${t.is}`).not.toMatch(/ACWR|IMTP|RSI|DSI|eccentric|plyometric/i);
    }
  });
});
