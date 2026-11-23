/**
 * MISSED_DAY_NOT_SHIFTED (brief §5): a missed MD-4 is not moved to MD-3 or later. MD-3 keeps its own session (the
 * same blocks, byte for byte); only the audit says so. The verdict the engine read is unchanged.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildStrengthSession } from "..";
import { MISSED_DAY_RULE, md4DateBefore, missedDayAudit } from "../missedDay";
import type { MdContext, PlayerStrengthSnapshot } from "../types";

const TODAY = "2026-11-26"; // Thu, MD-3 of a Sunday match
const snap = (md: MdContext, over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: TODAY, mdContext: md, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, ...over,
});
const MISSED = { md: "MD-4" as const, date: "2026-11-25" };

describe("the MD-4 date", () => {
  it("MD-3 → yesterday, MD-2 → 2 days back, MD-1 → 3; other days none", () => {
    expect(md4DateBefore(TODAY, "MD-3")).toBe("2026-11-25");
    expect(md4DateBefore(TODAY, "MD-2")).toBe("2026-11-24");
    expect(md4DateBefore(TODAY, "MD-1")).toBe("2026-11-23");
    for (const md of ["MD-4", "MD+1", "MD+2", "MD-5", "OFF"] as MdContext[]) expect(md4DateBefore(TODAY, md)).toBeNull();
  });
});

describe("not moved", () => {
  for (const mode of ["standard", "individualised"] as const) {
    it(`MD-3 keeps its own session after a missed MD-4 (${mode})`, () => {
      const plain = buildStrengthSession(snap("MD-3"), [], { mode });
      const after = buildStrengthSession(snap("MD-3", { missedDay: MISSED }), [], { mode });
      expect(JSON.stringify(after?.blocks)).toBe(JSON.stringify(plain?.blocks));
      const a = after?.appliedAdaptations.find((x) => x.ruleId === MISSED_DAY_RULE);
      expect(a).toBeTruthy();
      expect(a?.actionEN).toBe("Not moved: MD-3 keeps its own session. The missed heavy work is not added to this or a later day.");
      expect(a?.actionIS).toContain("MD-3 heldur sinni æfingu");
      expect(a?.evidence).toMatch(/MicroPulse rule/);
      expect(plain?.appliedAdaptations.some((x) => x.ruleId === MISSED_DAY_RULE)).toBe(false);
    });
  }

  it("no MD-4 lifts appear on MD-3 (no trap-bar deadlift, no Nordic from MD-4)", () => {
    const md4 = buildStrengthSession({ ...snap("MD-4"), todayIso: "2026-11-25" }, [], { mode: "standard" });
    const md3 = buildStrengthSession(snap("MD-3", { missedDay: MISSED }), [], { mode: "standard" });
    const ids = (s: typeof md3) => new Set((s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId)));
    const only4 = [...ids(md4)].filter((id) => !ids(buildStrengthSession(snap("MD-3"), [], { mode: "standard" })).has(id));
    for (const id of only4) expect(ids(md3).has(id)).toBe(false);
  });

  it("only for this week's MD-4, only on MD-3 / MD-2 / MD-1", () => {
    expect(missedDayAudit(TODAY, "MD-3", { md: "MD-4", date: "2026-11-18" })).toBeNull();
    expect(missedDayAudit(TODAY, "MD+1", MISSED)).toBeNull();
    expect(missedDayAudit("2026-11-27", "MD-2", MISSED)?.ruleId).toBe(MISSED_DAY_RULE);
    expect(missedDayAudit(TODAY, "MD-3", null)).toBeNull();
  });

  it("the verdict the engine read is unchanged", () => {
    const s = snap("MD-3", { missedDay: MISSED, verdict: "MODIFIED" });
    const before = JSON.stringify({ verdict: s.verdict });
    buildStrengthSession(s, [], { mode: "individualised" });
    expect(JSON.stringify({ verdict: s.verdict })).toBe(before);
  });
});

describe("wiring", () => {
  it("only the coach's preview reads a missed MD-4 (no cron, no player Today)", () => {
    const root = join(__dirname, "..", "..", "..", "..", "..");
    const route = readFileSync(join(root, "src/app/api/coach/player/[id]/strength-session/route.ts"), "utf8");
    expect(route).toMatch(/loadMissedMd4\(supabase, playerId, todayIso, snapshotIn\.mdContext\)/);
    const auto = readFileSync(join(root, "src/lib/micropulse/strengthProgramming/autoSession.ts"), "utf8");
    expect(auto).not.toMatch(/missedDay/);
  });
});
