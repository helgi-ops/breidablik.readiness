/**
 * A hand send on a day the week plan marks OFF (offDaySend.ts, contradiction 11): it goes out, with a line saying so;
 * the block leaves OFF dates out.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { offDatesInWeekPlan, withOffDayLine } from "../offDaySend";
import { DAY_RULE_COACH_DAY_OFF } from "../dayRules";
import { buildStrengthSession } from "..";
import type { PlayerStrengthSnapshot } from "../types";

const snap: PlayerStrengthSnapshot = {
  playerId: "p1", todayIso: "2026-11-23", mdContext: "MD-3", verdict: null,
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, seasonPhase: "inseason",
};

function fakeSb(rows: Array<{ day_date: string; day_type: string | null }>, error = false): SupabaseClient {
  const chain = {
    select: () => chain, eq: () => chain,
    in: (_c: string, dates: string[]) => ({ then: (res: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error: { message: "x" } } : { data: rows.filter((r) => dates.includes(r.day_date)), error: null }).then(res) }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("withOffDayLine", () => {
  it("adds one line, EN + IS, naming the MD the session was built for; the session is otherwise unchanged", () => {
    const s = buildStrengthSession(snap, [], { mode: "individualised" })!;
    const out = withOffDayLine(s);
    const line = out.appliedAdaptations.find((a) => a.ruleId === DAY_RULE_COACH_DAY_OFF)!;
    expect(line.triggerEN).toContain("day off in the week plan");
    expect(line.triggerIS).toContain("frídagur í vikuplaninu");
    expect(line.actionEN).toContain("coach chose");
    expect(line.actionEN).toContain("MD-3");
    expect(out.blocks).toEqual(s.blocks);
    expect(withOffDayLine(out).appliedAdaptations.length).toBe(out.appliedAdaptations.length); // once
  });
});

describe("offDatesInWeekPlan", () => {
  it("only rows marked OFF (any case); a missing row is not OFF; an error reads as none", async () => {
    const sb = fakeSb([{ day_date: "2026-11-23", day_type: "off" }, { day_date: "2026-11-24", day_type: "TRAIN" }]);
    expect([...await offDatesInWeekPlan(sb, "t1", ["2026-11-23", "2026-11-24", "2026-11-25"])]).toEqual(["2026-11-23"]);
    expect((await offDatesInWeekPlan(fakeSb([], true), "t1", ["2026-11-23"])).size).toBe(0);
    expect((await offDatesInWeekPlan(sb, null, ["2026-11-23"])).size).toBe(0);
  });
});
