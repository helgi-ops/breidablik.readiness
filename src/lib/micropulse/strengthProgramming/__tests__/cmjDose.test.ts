/**
 * A jump test on the team's test days changes the gym dose (cmjDose.ts, strength-day-rules brief §3): the read
 * against the player's own range, which day each test feeds, what each rule takes out, that it only takes away, and
 * that the readiness colour is byte-identical with and without a drop.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CMJ_DROP_MD1_FALLBACK, CMJ_DROP_MD2, CMJ_DROP_MD3, CMJ_DROP_NOT_STACKED,
  applyCmjDose, cmjRuleFor, holdCmjCut, readCmjTestDay, testDayFor, type CmjDoseTest, type CmjTrial,
} from "../cmjDose";
import { testDatesFor } from "../cmjDoseLoader";
import { buildStrengthSession } from "..";
import { applyBlockToSession, applyBlockToSessionInner } from "../blockEmphasis";
import { EXERCISES_BY_ID } from "../exerciseLibrary";
import { deriveCmjDoseTeamSignal, derivePlayerCmjDoseSignals } from "@/lib/micropulse/coachSignals";
import type { ExerciseDose, MdContext, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock, StrengthSession } from "../types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/micropulse/sprintExposure/loader", () => ({ loadSprintExposure: vi.fn(async () => ({ band: null })) }));
vi.mock("@/lib/micropulse/movementScreen/loader", () => ({ loadPlayerMovementScreens: vi.fn(async () => []) }));
vi.mock("@/lib/micropulse/unifiedDeficits/collect", () => ({ collectDeficits: vi.fn(async () => ({ rows: [], overrides: [], prehabFlags: [], clearances: [] })) }));
import { buildPlayerContext, strengthView } from "@/lib/micropulse/playerContext";

// ── fixtures ────────────────────────────────────────────────────────────────
/** One test = three trials around `cm`, on `date`. */
const test = (date: string, cm: number, id = date): CmjTrial[] =>
  [cm - 0.5, cm, cm + 0.5].map((v, i) => ({ rawTestId: id, testTimestamp: `${date}T08:0${i}:00`, jumpCm: v }));
/** Baseline: tests every few days before the test day, all around 40 cm. */
const baseline = (): CmjTrial[] => [...test("2026-11-03", 40), ...test("2026-11-06", 40.4), ...test("2026-11-10", 39.6), ...test("2026-11-13", 40)];

const read = (cm: number, testDay: CmjDoseTest["testDay"] = "MD+3", date = "2026-11-17", hsr: number | null = 600, hours: number | null = 72) =>
  readCmjTestDay({ trials: [...test(date, cm), ...baseline()], testDate: date, testDay, matchHsr: hsr, hoursPostMatch: hours });

function ex(id: string, dose: Partial<ExerciseDose> & { sets: number; reps: string }, extra: Partial<PrescribedExercise> = {}): PrescribedExercise {
  const lib = EXERCISES_BY_ID.get(id)!;
  return { exerciseId: id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose: { intensity: "RPE 7", rest: "2 min", ...dose }, ...extra };
}
const blk = (type: SessionBlock["type"], exercises: PrescribedExercise[]): SessionBlock => ({ id: `${type}-${exercises[0]?.exerciseId}`, titleEN: type, titleIS: type, type, exercises });
const session = (md: MdContext, blocks: SessionBlock[]): StrengthSession => ({
  playerId: "p", mdContext: md, templateId: "t", durationMin: 10, vbtAutoRegulated: false, isCompressed: false,
  blocks, appliedAdaptations: [], summaryEN: "", summaryIS: "", confidence: 0.5,
});
const all = (s: StrengthSession | null) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const ids = (s: StrengthSession | null) => all(s).map((e) => e.exerciseId);
const sets = (s: StrengthSession | null, id: string) => all(s).find((e) => e.exerciseId === id)?.dose.sets;
const rules = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).map((a) => a.ruleId);

const snap = (md: MdContext, over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2026-11-17", mdContext: md, verdict: null,
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, seasonPhase: "preseason", ...over,
});

const DROP = read(34)!; // 85% of his usual 40 cm
const NORMAL = read(39)!;

// ── the read ────────────────────────────────────────────────────────────────
describe("the read against his own range (no new %)", () => {
  it("trial mean vs the median of the baseline tests; below cmjRecovery's band = a drop", () => {
    expect(DROP.jumpCm).toBe(34);
    expect(DROP.baselineCm).toBe(40);
    expect(DROP.baselineTests).toBe(4);
    expect(DROP.pctOfBaseline).toBe(85);
    expect(DROP.drop).toBe(true);
    expect(NORMAL.drop).toBe(false); // 97.5% sits inside the noise band
  });

  it("the band follows the last match's high-speed running at MD+3 (Hader 2019) — the same band cmjRecovery gives", () => {
    const heavy = read(39, "MD+3", "2026-11-17", 2000, 72)!; // big match: expected dip 5% at 72 h
    const none = read(39, "MD+3", "2026-11-17", 0, 72)!;
    expect(heavy.band.expectedPct).toBeLessThan(none.band.expectedPct);
    expect(none.band.lo).toBeCloseTo(100 - 7.95, 1);
  });

  it("no ready baseline (too few tests, or back after a gap) → no read, so no rule", () => {
    expect(readCmjTestDay({ trials: [...test("2026-11-17", 30), ...test("2026-11-13", 40)], testDate: "2026-11-17", testDay: "MD+3", matchHsr: 0, hoursPostMatch: 72 })).toBeNull();
    const gap = [...test("2026-11-17", 30), ...test("2026-10-01", 40), ...test("2026-09-28", 40), ...test("2026-09-25", 40)];
    expect(readCmjTestDay({ trials: gap, testDate: "2026-11-17", testDay: "MD+3", matchHsr: 0, hoursPostMatch: 72 })).toBeNull();
  });

  it("no test that day → no read", () => {
    expect(readCmjTestDay({ trials: baseline(), testDate: "2026-11-17", testDay: "MD+3", matchHsr: 0, hoursPostMatch: 72 })).toBeNull();
  });

  it("match running unknown → no dip assumed, said in the evidence", () => {
    const r = read(34, "MD+3", "2026-11-17", null, 72)!;
    expect(r.hsrUnknown).toBe(true);
    const s = applyCmjDose(session("MD-4", [blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 4, reps: "3" })])]), r)!;
    expect(s.appliedAdaptations.at(-1)!.evidence).toMatch(/match running unknown/);
  });
});

// ── which day each test feeds ───────────────────────────────────────────────
describe("test days and the day each one feeds", () => {
  it("a 7-day week: MD+3 is the MD-4 day itself; MD-2 / MD-1 count back from the next match", () => {
    const matches = ["2026-11-14", "2026-11-21"]; // Saturday to Saturday
    expect(testDatesFor("2026-11-17", matches)).toEqual({ "MD+3": "2026-11-17" }); // Tue = MD+3 = MD-4
    expect(testDatesFor("2026-11-19", matches)).toEqual({ "MD+3": "2026-11-17", "MD-2": "2026-11-19" });
    expect(testDatesFor("2026-11-20", matches)).toEqual({ "MD+3": "2026-11-17", "MD-2": "2026-11-19", "MD-1": "2026-11-20" });
  });

  it("a test day after today or across a match does not count", () => {
    expect(testDatesFor("2026-11-16", ["2026-11-14", "2026-11-21"])).toEqual({}); // MD+3 is tomorrow
    expect(testDatesFor("2026-11-17", ["2026-11-14", "2026-11-17"])).toEqual({}); // today is a match
  });

  it("MD+3 feeds the heavy day; MD-2 feeds MD-2 and MD-1; MD-1 only when MD-2 had no test", () => {
    expect(testDayFor("MD-4")).toEqual(["MD+3"]);
    expect(testDayFor("MD-2")).toEqual(["MD-2"]);
    expect(testDayFor("MD-1")).toEqual(["MD-2", "MD-1"]);
    expect(testDayFor("MD-3")).toBeNull();
    expect(cmjRuleFor("MD-4", DROP)).toBe(CMJ_DROP_MD3);
    expect(cmjRuleFor("MD-3", DROP)).toBeNull();
    expect(cmjRuleFor("MD-2", read(34, "MD-2"))).toBe(CMJ_DROP_MD2);
    expect(cmjRuleFor("MD-1", read(34, "MD-2"))).toBe(CMJ_DROP_MD2);
    expect(cmjRuleFor("MD-1", read(34, "MD-1"))).toBe(CMJ_DROP_MD1_FALLBACK);
    expect(cmjRuleFor("MD-4", NORMAL)).toBeNull();
  });
});

// ── what each rule does ─────────────────────────────────────────────────────
describe("CMJ_DROP_MD3: the heavy day runs as a yellow dose", () => {
  const md4 = () => session("MD-4", [
    blk("PREP", [ex("mp_glute_activation", { sets: 1, reps: "30s" })]),
    blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 4, reps: "3", intensity: "85% 1RM", speedZone: { min: 0.55, max: 0.8 }, velocityLossCap: 15 })]),
    blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 3, reps: "5" }), ex("ex_copenhagen", { sets: 2, reps: "6" })]),
  ]);

  it("one round fewer, Nordic 1 set, same bar-speed zone and load; warm-up untouched", () => {
    const s = applyCmjDose(md4(), DROP)!;
    expect(sets(s, "ex_trap_bar_dl")).toBe(3);
    expect(sets(s, "ex_nordic_curl")).toBe(1);
    expect(sets(s, "ex_copenhagen")).toBe(1);
    expect(sets(s, "mp_glute_activation")).toBe(1);
    const dl = all(s).find((e) => e.exerciseId === "ex_trap_bar_dl")!;
    expect(dl.dose.speedZone).toEqual({ min: 0.55, max: 0.8 });
    expect(dl.dose.intensity).toBe("85% 1RM");
    expect(dl.dose.velocityLossCap).toBe(15);
  });

  it("logs the rule with the test's facts in EN + IS and its sources", () => {
    const a = applyCmjDose(md4(), DROP)!.appliedAdaptations.find((x) => x.ruleId === CMJ_DROP_MD3)!;
    expect(a.triggerEN).toMatch(/Jump test MD\+3 \(2026-11-17\): 34 cm = 85% of his usual 40 cm/);
    expect(a.triggerIS).toMatch(/Hoppróf MD\+3/);
    expect(a.actionEN).toMatch(/one round fewer, Nordic 1 set/);
    expect(a.actionIS).toMatch(/einni umferð færra, Nordic 1 sett/);
    expect(a.evidence).toMatch(/Hader 2019/);
  });

  it("on the built MD-4 session too, and the day rule still holds after it", () => {
    const plain = buildStrengthSession(snap("MD-4"), [], { mode: "individualised" });
    const cut = buildStrengthSession(snap("MD-4", { cmjTest: DROP }), [], { mode: "individualised" });
    expect(rules(cut)).toContain(CMJ_DROP_MD3);
    expect(sets(cut, "ex_nordic_curl")).toBe(1);
    expect(sets(cut, "ex_trap_bar_dl")).toBe((sets(plain, "ex_trap_bar_dl") ?? 0) - 1);
    expect(rules(buildStrengthSession(snap("MD-4", { cmjTest: NORMAL }), [], { mode: "individualised" }))).not.toContain(CMJ_DROP_MD3);
  });

  it("not stacked on a yellow check-in (already reduced): logged, nothing more taken", () => {
    const y = buildStrengthSession(snap("MD-4", { verdict: "MODIFIED" }), [], { mode: "individualised" });
    const yc = buildStrengthSession(snap("MD-4", { verdict: "MODIFIED", cmjTest: DROP }), [], { mode: "individualised" });
    expect(yc?.blocks).toEqual(y?.blocks);
    expect(rules(yc)).toContain(CMJ_DROP_NOT_STACKED);
    expect(rules(yc)).not.toContain(CMJ_DROP_MD3);
  });

  it("the meso block does not add the cut set back", () => {
    const cut = applyCmjDose(md4(), DROP)!;
    // Without the hold the block would add a set here (Accumulation, pre-season).
    const raw = applyBlockToSessionInner(cut, "accum", "preseason")!;
    expect(all(raw).some((e) => e.dose.sets > sets(cut, e.exerciseId)!)).toBe(true);
    const accum = applyBlockToSession(cut, "accum", "preseason")!;
    for (const e of all(accum)) expect(e.dose.sets).toBeLessThanOrEqual(sets(cut, e.exerciseId)!);
    const held = holdCmjCut(cut, { ...cut, blocks: cut.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, dose: { ...e.dose, sets: e.dose.sets + 1 } })) })) })!;
    expect(sets(held, "ex_trap_bar_dl")).toBe(3);
  });
});

describe("CMJ_DROP_MD2: MD-2 and MD-1 are maintenance and primer only", () => {
  const md2 = () => session("MD-2", [
    blk("PREP", [ex("mp_pogo_warmup", { sets: 2, reps: "5" })]),
    blk("POWER_PRIMER", [ex("ex_trap_bar_jump_squat", { sets: 2, reps: "3", intensity: "30% 1RM", nearMatch: true }), ex("ex_box_jump", { sets: 2, reps: "3" })]),
    blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 2, reps: "3", intensity: "80% 1RM" }), ex("ex_bulgarian_ss", { sets: 2, reps: "5", intensity: "RPE 7" })]),
    blk("ISO_FINISH", [ex("ex_imtp_iso", { sets: 3, reps: "5s" })]),
  ]);

  it("keeps one primer, one leg lift and the holds; takes out the extra jumps and the second leg lift", () => {
    const s = applyCmjDose(md2(), read(34, "MD-2", "2026-11-19"))!;
    expect(ids(s)).toEqual(["mp_pogo_warmup", "ex_trap_bar_jump_squat", "ex_trap_bar_dl", "ex_imtp_iso"]);
    expect(rules(s)).toContain(CMJ_DROP_MD2);
    expect(sets(s, "ex_trap_bar_dl")).toBe(2); // what stays keeps its dose
  });

  it("the MD-2 test also holds on MD-1", () => {
    const s = applyCmjDose({ ...md2(), mdContext: "MD-1" }, read(34, "MD-2", "2026-11-19"))!;
    expect(rules(s)).toContain(CMJ_DROP_MD2);
  });

  it("the built MD-2 session is already maintenance + primer: logged, nothing taken", () => {
    const plain = buildStrengthSession(snap("MD-2"), [], { mode: "individualised" });
    const cut = buildStrengthSession(snap("MD-2", { cmjTest: read(34, "MD-2", "2026-11-19")! }), [], { mode: "individualised" });
    expect(cut?.blocks).toEqual(plain?.blocks);
    expect(cut!.appliedAdaptations.find((a) => a.ruleId === CMJ_DROP_MD2)!.actionEN).toMatch(/nothing to take out/);
  });
});

describe("CMJ_DROP_MD1_FALLBACK: MD-1 is the primer only", () => {
  it("keeps the warm-up and one primer", () => {
    const md1 = session("MD-1", [
      blk("PREP", [ex("mp_pogo_warmup", { sets: 2, reps: "5" })]),
      blk("POWER_PRIMER", [ex("ex_imtp_iso", { sets: 2, reps: "3s" }), ex("ex_box_jump", { sets: 1, reps: "3" })]),
      blk("ACCESSORY", [ex("ex_db_bench_press", { sets: 2, reps: "8" })]),
    ]);
    const s = applyCmjDose(md1, read(34, "MD-1", "2026-11-20"))!;
    expect(ids(s)).toEqual(["mp_pogo_warmup", "ex_box_jump"]);
    expect(rules(s)).toContain(CMJ_DROP_MD1_FALLBACK);
    expect(s.blocks.some((b) => b.type === "ACCESSORY")).toBe(false);
  });
});

describe("only takes away", () => {
  it("never more sets or exercises than before; same object when nothing fires; runs once", () => {
    const base = session("MD-4", [blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 1, reps: "3" })]), blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 1, reps: "5" })])]);
    expect(applyCmjDose(base, NORMAL)).toBe(base);
    expect(applyCmjDose(base, undefined)).toBe(base);
    const once = applyCmjDose(base, DROP)!;
    expect(sets(once, "ex_trap_bar_dl")).toBe(1); // never below 1
    expect(applyCmjDose(once, DROP)).toBe(once);
    expect(applyCmjDose(null, DROP)).toBeNull();
  });
});

// ── the coach's Today line ──────────────────────────────────────────────────
describe("the coach's Today line before the match", () => {
  const facts = { en: "Jump test MD-2: 34 cm = 85%", is: "Hoppróf MD-2: 34 cm = 85%" };
  it("one watch chip per player, a team line naming them; steady when nobody", () => {
    expect(deriveCmjDoseTeamSignal([]).level).toBe("steady");
    const one = [{ playerId: "a", name: "Anna Jónsdóttir", rule: "CMJ_DROP_MD2" as const, facts }];
    const t = deriveCmjDoseTeamSignal(one);
    expect(t.level).toBe("watch");
    expect(t.why.en[0]).toMatch(/Anna/);
    expect(t.counterfactual!.en).toMatch(/readiness colour is not changed/);
    const p = derivePlayerCmjDoseSignals(one);
    expect(p[0].playerId).toBe("a");
    expect(p[0].signal.why.is[1]).toMatch(/viðhald og örvun/);
    expect(deriveCmjDoseTeamSignal([...one, { ...one[0], playerId: "b" }, { ...one[0], playerId: "c" }]).level).toBe("elevated");
  });
});

// ── the readiness colour ────────────────────────────────────────────────────
describe("the readiness colour is byte-identical with and without a CMJ drop", () => {
  type Row = Record<string, unknown>;
  function fakeSb(tables: Record<string, Row[]>, writes: string[]): SupabaseClient {
    const build = (tbl: string, rows: Row[]) => {
      const qb: Record<string, unknown> = {
        select: () => qb, eq: () => qb, gte: () => qb, lte: () => qb, gt: () => qb, lt: () => qb, in: () => qb,
        not: () => qb, or: () => qb, order: () => qb, limit: () => qb, range: () => qb,
        insert: () => { writes.push(tbl); return qb; }, update: () => { writes.push(tbl); return qb; },
        upsert: () => { writes.push(tbl); return qb; }, delete: () => { writes.push(tbl); return qb; },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null }),
        single: () => Promise.resolve({ data: rows[0] ?? null }),
        then: (res: (v: { data: Row[] }) => unknown) => Promise.resolve({ data: rows }).then(res),
      };
      return qb;
    };
    return { from: (tbl: string) => build(tbl, tables[tbl] ?? []) } as unknown as SupabaseClient;
  }
  const trialsRows = (cm: number) => [...test("2026-11-17", cm), ...baseline()]
    .sort((a, b) => (a.testTimestamp < b.testTimestamp ? 1 : -1))
    .map((t) => ({ raw_test_id: t.rawTestId, test_timestamp: t.testTimestamp, jump_height_cm: t.jumpCm }));
  const tables = (cm: number | null): Record<string, Row[]> => ({
    v_coach_readiness_today_v8: [{ final_color: "green" }],
    readiness_entries: [{ color: "green", entry_date: "2026-11-17" }],
    match_schedule: [{ match_date: "2026-11-14" }, { match_date: "2026-11-21" }],
    ...(cm == null ? {} : { vald_forcedecks_results: trialsRows(cm) }),
  });

  it("same verdict in the context and the snapshot; the drop only reaches the session; nothing is written", async () => {
    const writes: string[] = [];
    const args = { playerId: "p1", teamId: "t1", todayIso: "2026-11-17", mdContextOverride: "MD-4" as MdContext };
    const without = await buildPlayerContext(fakeSb(tables(null), writes), args);
    const withDrop = await buildPlayerContext(fakeSb(tables(34), writes), args);
    expect(withDrop.cmjTest?.data.test?.drop).toBe(true);
    expect(without.cmjTest?.data.test).toBeUndefined();
    expect(JSON.stringify(withDrop.verdict)).toBe(JSON.stringify(without.verdict));
    const a = strengthView(without), b = strengthView(withDrop);
    expect(JSON.stringify(b.verdict)).toBe(JSON.stringify(a.verdict));
    const { cmjTest, ...rest } = b;
    expect(cmjTest?.drop).toBe(true);
    expect(JSON.stringify(rest)).toBe(JSON.stringify(a)); // everything else in the snapshot byte-identical
    expect(writes).toEqual([]);
  });

  it("the CMJ code never names the colour or its tables", () => {
    for (const f of ["cmjDose.ts", "cmjDoseLoader.ts", "cmjDoseRefresh.ts"]) {
      const src = readFileSync(join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src).not.toMatch(/final_color|readiness_entries|v_coach_readiness|\.color\b|verdict\s*[:=]/);
    }
  });
});
