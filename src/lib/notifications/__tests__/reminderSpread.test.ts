import { describe, expect, it } from "vitest";
import {
  SPREAD_SLOT_TIMES,
  getCurrentScheduledSlot,
  isDueInSpread,
  spreadOffsetMinutes,
} from "../schedule";

// Deterministic fake player ids.
const ids = Array.from({ length: 500 }, (_, i) => {
  const hex = (i * 2654435761 >>> 0).toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-000000000000`;
});

describe("09:00 check-in push is spread over 10 minutes", () => {
  it("only the 09:00 slot is spread", () => {
    expect([...SPREAD_SLOT_TIMES]).toEqual(["09:00"]);
  });

  it("each player gets a fixed share at +0, +2, +4, +6 or +8 min", () => {
    for (const id of ids) {
      const off = spreadOffsetMinutes(id);
      expect([0, 2, 4, 6, 8]).toContain(off);
      expect(spreadOffsetMinutes(id)).toBe(off);
    }
  });

  it("shares are roughly even (no share over 30% of players)", () => {
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(spreadOffsetMinutes(id), (counts.get(spreadOffsetMinutes(id)) ?? 0) + 1);
    expect(counts.size).toBe(5);
    for (const n of counts.values()) expect(n / ids.length).toBeLessThan(0.3);
  });

  it("everyone is due by +8 min, nobody before the slot", () => {
    for (const id of ids) {
      expect(isDueInSpread(id, 8)).toBe(true);
      expect(isDueInSpread(id, -1)).toBe(false);
    }
  });

  it("a late tick catches up every share due by then", () => {
    const due = ids.filter((id) => isDueInSpread(id, 5)).map(spreadOffsetMinutes);
    expect(new Set(due)).toEqual(new Set([0, 2, 4]));
  });

  it("the slot reports minutes since 09:00 (Reykjavik = UTC)", () => {
    const at = (hhmm: string) => new Date(`2026-11-13T${hhmm}:00Z`);
    const s = getCurrentScheduledSlot({ now: at("09:06"), timeZone: "Atlantic/Reykjavik", toleranceMinutes: 30, profile: "standard" });
    expect(s?.localTime).toBe("09:00");
    expect(s?.minutesSinceSlot).toBe(6);
    const early = getCurrentScheduledSlot({ now: at("08:58"), timeZone: "Atlantic/Reykjavik", toleranceMinutes: 30, profile: "standard" });
    expect(early?.minutesSinceSlot).toBe(-2);
  });
});
