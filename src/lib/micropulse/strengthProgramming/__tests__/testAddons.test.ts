/**
 * Strength tests add one prevention set (testAddons.ts, brief §4b): NordBord drop ≥ 10% → +1 Nordic on MD-4;
 * ForceFrame adduction gap / drop ≥ 10% → +1 Copenhagen on MD-3; at most +1 a week from any source (ADDON_CAP);
 * not on a reduced day; the loader reads adduction from the inner pads, same hip angle.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADDON_CAP, FORCEFRAME_ADDON, NORDBORD_ADDON, NORDBORD_REFERENCE_N,
  applyTestAddons, gapPct, legDrops, readAdduction, readNordbord, type BilateralTest,
} from "../testAddons";
import { fetchStrengthTests } from "../testAddonsLoader";
import { buildStrengthSession } from "..";
import { EXERCISES_BY_ID } from "../exerciseLibrary";
import type { MdContext, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock, StrengthSession } from "../types";

const TODAY = "2026-11-23";
const nb = (l: number, r: number, prev: [number, number] | null = [400, 400], date = "2026-11-20"): BilateralTest =>
  ({ date, leftN: l, rightN: r, prev: prev ? { date: "2026-10-20", leftN: prev[0], rightN: prev[1] } : null });

const snap = (md: MdContext, over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: TODAY, mdContext: md, verdict: null,
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, seasonPhase: "inseason", ...over,
});
/** The week rule's prevention dose (weekRule) unless `weekRule: false`. */
function ex(id: string, sets: number, extra: Partial<PrescribedExercise> = {}, weekRule = true): PrescribedExercise {
  const lib = EXERCISES_BY_ID.get(id)!;
  return { exerciseId: id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose: { sets, reps: "5", intensity: "BW", rest: "2 min", ...(weekRule ? { weekRule: true } : {}) }, ...extra };
}
const blocks = (...exs: PrescribedExercise[]): SessionBlock[] => [{ id: "b", titleEN: "Main", titleIS: "Aðal", type: "POSTERIOR", exercises: exs }];
const all = (s: StrengthSession | null) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const setsOf = (s: StrengthSession | null, id: string) => all(s).find((e) => e.exerciseId === id)?.dose.sets;
const rules = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).map((a) => a.ruleId);

describe("the reads", () => {
  it("per-leg drop vs the previous test, and the left/right gap", () => {
    expect(legDrops(nb(340, 400))).toEqual({ left: 15, right: 0 });
    expect(gapPct(nb(340, 400))).toBe(15);
    expect(legDrops(nb(340, 400, null))).toBeNull();
  });

  it("NordBord fires on a leg 10% or more below his previous test; 337 N is only a reference", () => {
    const r = readNordbord(nb(355, 400), TODAY)!; // left 11.3% down
    expect(r.fires).toBe(true);
    expect(r.trigger.en).toContain("left 11.3% below");
    expect(r.trigger.en).toContain(`${NORDBORD_REFERENCE_N} N (Timmins 2016)`);
    expect(r.trigger.is).toContain("vinstri");
    expect(readNordbord(nb(370, 400), TODAY)!.fires).toBe(false); // 7.5%
    // Under 337 N but no drop: nothing fires.
    expect(readNordbord(nb(300, 300, [310, 305]), TODAY)!.fires).toBe(false);
    // No earlier test: nothing fires, said so.
    const first = readNordbord(nb(300, 400, null), TODAY)!;
    expect(first.fires).toBe(false);
    expect(first.trigger.en).toContain("no earlier test");
  });

  it("freshness: NordBord 14 days, ForceFrame 21 days; a future date is no read", () => {
    expect(readNordbord(nb(300, 400, [400, 400], "2026-11-09"), TODAY)).not.toBeNull(); // 14 d
    expect(readNordbord(nb(300, 400, [400, 400], "2026-11-08"), TODAY)).toBeNull(); // 15 d
    expect(readAdduction(nb(300, 400, null, "2026-11-02"), TODAY)).not.toBeNull(); // 21 d
    expect(readAdduction(nb(300, 400, null, "2026-11-01"), TODAY)).toBeNull();
    expect(readNordbord(nb(300, 400, [400, 400], "2026-11-25"), TODAY)).toBeNull();
  });

  it("adduction fires on a 10% left/right gap (no previous test needed) or a 10% drop", () => {
    expect(readAdduction(nb(355, 400, null), TODAY)!.fires).toBe(true); // gap 11.3%
    expect(readAdduction(nb(370, 400, null), TODAY)!.fires).toBe(false); // gap 7.5%
    const drop = readAdduction(nb(350, 360, [400, 400]), TODAY)!; // gap 2.8%, left 12.5% down
    expect(drop.fires).toBe(true);
    expect(drop.trigger.en).toContain("12.5% below");
  });
});

describe("applyTestAddons", () => {
  const nordicDrop = { nordbord: nb(340, 400) };
  const adductionGap = { adduction: nb(340, 400, null) };

  it("+1 Nordic set where the Nordic is, logged EN + IS with the numbers", () => {
    const b = blocks(ex("ex_nordic_curl", 4));
    const out = applyTestAddons(b, snap("MD-4", { strengthTests: nordicDrop }));
    expect(b[0].exercises[0].dose.sets).toBe(5);
    expect(out.map((a) => a.ruleId)).toEqual([NORDBORD_ADDON]);
    expect(out[0].actionEN).toContain("+1 Nordic set");
    expect(out[0].actionIS).toContain("+1 Nordic sett");
    expect(out[0].triggerEN).toContain("340 / 400 N");
    expect(out[0].evidence).toContain("Timmins 2016");
  });

  it("+1 Copenhagen set where the Copenhagen is", () => {
    const b = blocks(ex("ex_copenhagen", 4));
    expect(applyTestAddons(b, snap("MD-3", { strengthTests: adductionGap })).map((a) => a.ruleId)).toEqual([FORCEFRAME_ADDON]);
    expect(b[0].exercises[0].dose.sets).toBe(5);
  });

  it("not the exercise's day → nothing, no log", () => {
    const b = blocks(ex("ex_copenhagen", 4));
    expect(applyTestAddons(b, snap("MD-3", { strengthTests: nordicDrop }))).toEqual([]);
    expect(b[0].exercises[0].dose.sets).toBe(4);
  });

  it("ADDON_CAP: the goal's set is the week's one extra set", () => {
    const b = blocks(ex("ex_nordic_curl", 5, { playerGoal: true }));
    const out = applyTestAddons(b, snap("MD-4", { strengthTests: nordicDrop }));
    expect(out.map((a) => a.ruleId)).toEqual([ADDON_CAP]);
    expect(out[0].actionEN).toContain("the player's goal");
    expect(b[0].exercises[0].dose.sets).toBe(5);
  });

  it("ADDON_CAP: already above the week rule's dose → no more", () => {
    const b = blocks(ex("ex_copenhagen", 5));
    expect(applyTestAddons(b, snap("MD-3", { strengthTests: adductionGap })).map((a) => a.ruleId)).toEqual([ADDON_CAP]);
    expect(b[0].exercises[0].dose.sets).toBe(5);
  });

  it("a reduced day (yellow / red check-in) adds nothing and says why", () => {
    for (const verdict of ["MODIFIED", "REDUCED", "RECOVERY", "HOLD"] as const) {
      const b = blocks(ex("ex_nordic_curl", 3));
      const out = applyTestAddons(b, snap("MD-4", { verdict, strengthTests: nordicDrop }));
      expect(b[0].exercises[0].dose.sets).toBe(3);
      expect(out[0].actionEN).toContain("No extra Nordic set today");
    }
  });

  it("ADDON_CAP is weekly: the extra set goes only on the week's prevention dose, not on another day's Nordic", () => {
    const b = blocks(ex("ex_nordic_curl", 2, {}, false)); // a template's Nordic on MD-5, not the week rule's
    const out = applyTestAddons(b, snap("MD-5", { strengthTests: nordicDrop }));
    expect(b[0].exercises[0].dose.sets).toBe(2);
    expect(out.map((a) => a.ruleId)).toEqual([ADDON_CAP]);
    expect(out[0].actionEN).toContain("once a week");
    expect(out[0].actionIS).toContain("einu sinni í viku");
  });

  it("idempotent through the cap: a second pass adds nothing", () => {
    const b = blocks(ex("ex_nordic_curl", 4));
    applyTestAddons(b, snap("MD-4", { strengthTests: nordicDrop }));
    applyTestAddons(b, snap("MD-4", { strengthTests: nordicDrop }));
    expect(b[0].exercises[0].dose.sets).toBe(5);
  });
});

describe("in the engine", () => {
  it("MD-4: the week rule's Nordic gets one more set from a NordBord drop", () => {
    const plain = buildStrengthSession(snap("MD-4"), [], { mode: "individualised" });
    const withTest = buildStrengthSession(snap("MD-4", { strengthTests: { nordbord: nb(340, 400) } }), [], { mode: "individualised" });
    const base = setsOf(plain, "ex_nordic_curl");
    expect(base).toBeDefined();
    expect(setsOf(withTest, "ex_nordic_curl")).toBe(base! + 1);
    expect(rules(withTest)).toContain(NORDBORD_ADDON);
  });

  it("MD-3: the Copenhagen gets one more set from an adduction gap", () => {
    const plain = buildStrengthSession(snap("MD-3"), [], { mode: "individualised" });
    const withTest = buildStrengthSession(snap("MD-3", { strengthTests: { adduction: nb(340, 400, null) } }), [], { mode: "individualised" });
    const base = setsOf(plain, "ex_copenhagen");
    expect(base).toBeDefined();
    expect(setsOf(withTest, "ex_copenhagen")).toBe(base! + 1);
    expect(rules(withTest)).toContain(FORCEFRAME_ADDON);
  });

  it("MD-5 with a fresh NordBord drop: no extra set outside the week's Nordic day", () => {
    const s = buildStrengthSession(snap("MD-5", { strengthTests: { nordbord: nb(340, 400) } }), [], { mode: "individualised" });
    const plain = buildStrengthSession(snap("MD-5"), [], { mode: "individualised" });
    expect(setsOf(s, "ex_nordic_curl")).toBe(setsOf(plain, "ex_nordic_curl"));
    expect(rules(s)).not.toContain(NORDBORD_ADDON);
  });

  it("only the prevention exercise changes", () => {
    const plain = buildStrengthSession(snap("MD-4"), [], { mode: "individualised" });
    const withTest = buildStrengthSession(snap("MD-4", { strengthTests: { nordbord: nb(340, 400) } }), [], { mode: "individualised" });
    const strip = (s: StrengthSession | null) => all(s).filter((e) => e.exerciseId !== "ex_nordic_curl").map((e) => [e.exerciseId, e.dose.sets]);
    expect(strip(withTest)).toEqual(strip(plain));
  });
});

// ── loader ──────────────────────────────────────────────────────────────────
type Rows = Record<string, unknown[]>;
function fakeSb(rows: Rows): SupabaseClient {
  const q = (table: string) => {
    let data = rows[table] ?? [];
    const chain = {
      select: () => chain, eq: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
      in: (_c: string, ids: string[]) => { data = data.filter((r) => ids.includes((r as { id: string }).id)); return chain; },
      then: (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data }).then(res),
    };
    return chain;
  };
  return { from: q } as unknown as SupabaseClient;
}

describe("fetchStrengthTests", () => {
  it("adduction comes from the inner pads (not the stored stronger pad), previous test the same hip angle", async () => {
    const sb = fakeSb({
      vald_nordbord_results: [],
      vald_forceframe_results: [
        { test_timestamp: "2026-11-18T09:00:00Z", left_peak_force_n: 463, right_peak_force_n: 472, raw_test_id: "r3", movement_pattern: "Hip AD/AB - 60", is_valid: true },
        { test_timestamp: "2026-11-01T09:00:00Z", left_peak_force_n: 500, right_peak_force_n: 500, raw_test_id: "r2", movement_pattern: "Hip AD/AB - 45", is_valid: true },
        { test_timestamp: "2026-10-01T09:00:00Z", left_peak_force_n: 470, right_peak_force_n: 470, raw_test_id: "r1", movement_pattern: "Hip AD/AB - 60", is_valid: true },
      ],
      vald_raw_tests: [
        { id: "r3", innerL: "406.75", innerR: "409.75" },
        { id: "r2", innerL: "600", innerR: "600" },
        { id: "r1", innerL: "460", innerR: "455" },
      ],
    });
    const t = await fetchStrengthTests(sb, "p1", TODAY);
    expect(t?.adduction).toEqual({ date: "2026-11-18", leftN: 406.75, rightN: 409.75, prev: { date: "2026-10-01", leftN: 460, rightN: 455 } });
    expect(t?.nordbord).toBeNull();
  });

  it("stale tests are no read; invalid rows are skipped", async () => {
    const sb = fakeSb({
      vald_nordbord_results: [
        { test_timestamp: "2026-11-20T09:00:00Z", left_peak_force_n: 300, right_peak_force_n: 300, is_valid: false },
        { test_timestamp: "2026-10-01T09:00:00Z", left_peak_force_n: 400, right_peak_force_n: 400, is_valid: true },
      ],
      vald_forceframe_results: [],
      vald_raw_tests: [],
    });
    expect(await fetchStrengthTests(sb, "p1", TODAY)).toBeNull();
  });
});
