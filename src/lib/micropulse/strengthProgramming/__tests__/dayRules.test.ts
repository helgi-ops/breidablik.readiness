/**
 * Rules per MD day (dayRules.ts, 2026-11-22): what each day allows, what is trimmed, and that the check only ever takes
 * away. One describe per MD day, then the wiring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DAY_RULES, DAY_RULE_TABLE, DAY_RULE_TIME_NOTE, DAY_RULE_TRIM, DAY_RULE_ZONE, DAY_RULE_COACH_DAY_OFF, MATCH_DAY_RULE,
  TIME_BUDGET_EVIDENCE, TIME_BUDGET_TRIM, timeRoles, dayCategoryOf, enforceDayRules, everyExerciseHasDayCategory, heavyVelocityLossCapFor, repsOfLine,
} from "../dayRules";
import { EXERCISE_LIBRARY, EXERCISES_BY_ID } from "../exerciseLibrary";
import { buildStrengthSession } from "..";
import type { ExerciseDose, MdContext, PrescribedExercise, SessionBlock, StrengthSession } from "../types";

function ex(id: string, dose: Partial<ExerciseDose> & { sets: number; reps: string }, extra: Partial<PrescribedExercise> = {}): PrescribedExercise {
  const lib = EXERCISES_BY_ID.get(id)!;
  return {
    exerciseId: id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category,
    dose: { intensity: "RPE 7", rest: "2 min", ...dose }, ...extra,
  };
}
const blk = (type: SessionBlock["type"], exercises: PrescribedExercise[]): SessionBlock => ({ id: `${type}-${exercises[0]?.exerciseId}`, titleEN: type, titleIS: type, type, exercises });
function session(md: MdContext, blocks: SessionBlock[], templateId = "t"): StrengthSession {
  return {
    playerId: "p", mdContext: md, templateId, durationMin: 10, vbtAutoRegulated: false, isCompressed: false,
    blocks, appliedAdaptations: [], summaryEN: "", summaryIS: "", confidence: 0.5,
  };
}
const all = (s: StrengthSession | null) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const find = (s: StrengthSession | null, id: string) => all(s).find((e) => e.exerciseId === id);
const trims = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).filter((a) => a.ruleId === DAY_RULE_TRIM);
const timeLines = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).filter((a) => a.ruleId === TIME_BUDGET_TRIM);
const work = (s: StrengthSession | null) => all(s).reduce((a, e) => a + e.dose.sets * Math.max(1, repsOfLine(e.dose.reps)), 0);

describe("the table", () => {
  it("every MD day has a rule; MD-5 / MD+3 / MD+4 build like MD-4, OFF like MD+2; match day is its own row", () => {
    for (const md of ["MD-5", "MD-4", "MD-3", "MD-2", "MD-1", "MD+1", "MD+2", "MD+3", "MD+4", "OFF"] as MdContext[]) expect(DAY_RULES[md]).toBeDefined();
    expect(DAY_RULES["MD-5"].caps).toEqual(DAY_RULES["MD-4"].caps);
    expect(DAY_RULES["MD+3"].sameAs).toBe("MD-4");
    expect(DAY_RULES.OFF.bans.everything).toBe(true);
    expect(MATCH_DAY_RULE.caps.minutes).toBe(5);
    expect(DAY_RULE_TABLE.map((r) => r.md)).toEqual(["MD-4", "MD-3", "MD-2", "MD-1", "MD", "MD+1", "MD+2"]);
  });

  it("the caps as the coach wrote them", () => {
    expect(DAY_RULES["MD-4"].caps).toMatchObject({ heavyRepsPerLift: 12, contacts: 20, minutes: 25, minutesAfter: 8, vlMax: 15 });
    expect(DAY_RULES["MD-3"].caps).toMatchObject({ loadedReps: 9, contacts: 30, dropJumpContacts: 9, dropHeightCm: 30, minutes: 15, vlMax: 10 });
    expect(DAY_RULES["MD-2"].caps).toMatchObject({ loadedReps: 6, minutes: 20 });
    expect(DAY_RULES["MD-1"].caps).toMatchObject({ loadedReps: 6, contacts: 6, minutes: 10, vlMax: 10 });
    expect(DAY_RULES["MD+1"].caps.minutes).toBe(30);
    expect(heavyVelocityLossCapFor("MD-4")).toBe(15);
    expect(heavyVelocityLossCapFor("MD-3")).toBe(10);
    expect(heavyVelocityLossCapFor("MD+1")).toBe(20);
  });

  it("MD+1 points at the existing minutes rule (unchanged); MD-4 names the time trim and the new-exercise intro", () => {
    expect(DAY_RULES["MD+1"].note?.en).toMatch(/top-up as it is \(the existing minutes rule, md1MinutesTier after Carling 2018/);
    expect(DAY_RULES["MD+1"].note?.is).toMatch(/óbreyttri/);
    expect(DAY_RULES["MD-4"].note?.en).toMatch(/TIME_BUDGET_TRIM.*NEW_EXERCISE_INTRO/);
  });

  it("every rule is in English and Icelandic", () => {
    for (const r of [...Object.values(DAY_RULES), MATCH_DAY_RULE]) {
      expect(r.purpose.en && r.purpose.is).toBeTruthy();
      expect(r.intensity.en && r.intensity.is).toBeTruthy();
      for (const n of r.notAllowed) expect(n.en && n.is).toBeTruthy();
      if (r.note) expect(r.note.en && r.note.is).toBeTruthy();
    }
  });

  it("every library exercise has a day category (null = warm-up / mobility, not counted)", () => {
    expect(everyExerciseHasDayCategory()).toBe(true);
    expect(EXERCISE_LIBRARY.length).toBeGreaterThan(40);
  });

  it("reads a dose line", () => {
    expect(repsOfLine("3")).toBe(3);
    expect(repsOfLine("3-5")).toBe(3);
    expect(repsOfLine("8 each side")).toBe(8);
    expect(repsOfLine("5 + 5 (30s mid-set)")).toBe(10);
    expect(repsOfLine("6 × 1 (singles)")).toBe(6);
    expect(repsOfLine("5s × 1")).toBe(0);
    expect(repsOfLine("30s")).toBe(0);
  });

  it("a main lift is fast when its dose is light and fast", () => {
    expect(dayCategoryOf(ex("ex_trap_bar_dl", { sets: 3, reps: "3", intensity: "85% 1RM" }))).toBe("heavy");
    expect(dayCategoryOf(ex("ex_trap_bar_dl", { sets: 4, reps: "4", intensity: "30–40% 1RM", nearMatch: true }))).toBe("fast");
    expect(dayCategoryOf(ex("ex_back_squat", { sets: 3, reps: "3", intensity: "x", speedZone: { min: 1.0, max: 1.3 } }))).toBe("fast");
    expect(dayCategoryOf(ex("ex_copenhagen", { sets: 3, reps: "6 each side" }))).toBe("eccentric");
    expect(dayCategoryOf(ex("mp_pogo_warmup", { sets: 2, reps: "10" }))).toBeNull();
  });
});

describe("MD-4 — max strength + power", () => {
  it("allowed: heavy lift inside 12 reps, Nordic, a jump dose inside 20 contacts, upper body → unchanged", () => {
    const s = session("MD-4", [
      blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 4, reps: "3", intensity: "85% 1RM", velocityLossCap: 15 })]),
      blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 3, reps: "3" })]),
      blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 4, reps: "5" })]),
      blk("ACCESSORY", [ex("ex_db_bench_press", { sets: 3, reps: "8" })]),
    ]);
    const out = enforceDayRules(s);
    expect(trims(out)).toEqual([]);
    expect(all(out)).toEqual(all(s));
  });

  it("trimmed: 5 × 3 heavy (15) → 4 × 3; a set at 20% speed loss → 15%; jumps over 20 contacts", () => {
    const out = enforceDayRules(session("MD-4", [
      blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 5, reps: "3", intensity: "85% 1RM", velocityLossCap: 20, cue: "stop at 20% velocity loss" })]),
      blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 4, reps: "5" }), ex("ex_broad_jump", { sets: 3, reps: "3" })]),
    ]));
    expect(find(out, "ex_trap_bar_dl")!.dose).toMatchObject({ sets: 4, velocityLossCap: 15, cue: "stop at 15% velocity loss" });
    const contacts = all(out).filter((e) => dayCategoryOf(e) === "plyo").reduce((a, e) => a + e.dose.sets * repsOfLine(e.dose.reps), 0);
    expect(contacts).toBeLessThanOrEqual(20);
    expect(trims(out).length).toBeGreaterThanOrEqual(3);
    expect(trims(out).every((t) => t.triggerEN.startsWith("MD-4 day rule:") && t.triggerIS.startsWith("Dagsregla MD-4:"))).toBe(true);
    expect(trims(out).every((t) => t.evidence.length > 20)).toBe(true);
  });

  it("never to failure: the set stops with 2 reps in reserve", () => {
    const out = enforceDayRules(session("MD-4", [blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "To failure" })])]));
    expect(find(out, "ex_back_squat")!.dose.intensity).toMatch(/2 reps in reserve/);
  });

  it("a unilateral goal lift (3 × 6 each leg) is not a heavy main lift: kept", () => {
    const out = enforceDayRules(session("MD-4", [blk("UNILATERAL", [ex("ex_bulgarian_ss", { sets: 3, reps: "6 each leg" }, { goalPlan: { quality: "braking", week: 1 } })])]));
    expect(find(out, "ex_bulgarian_ss")!.dose.sets).toBe(3);
  });

  it("time over 25 min before training: the upper-body filler comes out, last first (TIME_BUDGET_TRIM)", () => {
    const blocks = [blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 4, reps: "3", intensity: "85% 1RM", rest: "4 min" })]), blk("ACCESSORY", [ex("ex_db_bench_press", { sets: 3, reps: "8", rest: "3 min" }), ex("ex_db_row", { sets: 3, reps: "8", rest: "3 min" })])];
    const out = enforceDayRules(session("MD-4", blocks))!;
    expect(all(out).map((e) => e.exerciseId)).toEqual(["ex_trap_bar_dl"]);
    expect(out.timeTrimmed).toEqual([{ exerciseId: "ex_db_row", sets: 3, role: "upper" }, { exerciseId: "ex_db_bench_press", sets: 3, role: "upper" }]);
    const lines = timeLines(out);
    expect(lines).toHaveLength(2);
    expect(lines[0].triggerEN).toMatch(/^MD-4 time budget: about 25 min before training with the warm-up and rests \(injury prevention not counted\); estimated at \d+/);
    expect(lines[0].actionEN).toMatch(/\(upper-body filler\) taken out\.$/);
    for (const l of lines) { expect(l.triggerIS).toMatch(/Tímarammi MD-4/); expect(l.actionIS).toMatch(/tekin út/); expect(l.evidence).toBe(TIME_BUDGET_EVIDENCE); }
    expect(TIME_BUDGET_EVIDENCE).toMatch(/MicroPulse/);
    // Fits now, so no time note.
    expect(out.appliedAdaptations.some((a) => a.ruleId === DAY_RULE_TIME_NOTE)).toBe(false);
  });

  it("the order: upper-body filler → C exercise → one set of B2; B1 untouched", () => {
    const blocks = [
      blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 4, reps: "3", intensity: "85% 1RM", rest: "4 min" })]),
      blk("UNILATERAL", [ex("ex_bulgarian_ss", { sets: 3, reps: "4", intensity: "RPE 7", rest: "2 min" })]),
      blk("ISO_FINISH", [ex("ex_iso_ham_bridge_long", { sets: 3, reps: "30s", rest: "1 min" })]),
      blk("ACCESSORY", [ex("ex_db_bench_press", { sets: 2, reps: "8", rest: "2 min" })]),
    ];
    expect(timeRoles(blocks).flat()).toEqual(["B1", "B2", "C", "upper"]);
    const out = enforceDayRules(session("MD-4", blocks))!;
    expect(out.timeTrimmed?.map((t) => t.role)).toEqual(["upper", "C", "B2"]);
    expect(find(out, "ex_trap_bar_dl")!.dose.sets).toBe(4);
    expect(find(out, "ex_bulgarian_ss")!.dose.sets).toBe(2);
    expect(timeLines(out).at(-1)!.actionEN).toBe("Bulgarian Split Squat: 2 sets (one set of B2 off).".replace("Bulgarian Split Squat", EXERCISES_BY_ID.get("ex_bulgarian_ss")!.nameEN));
  });

  it("B1 is never cut, injury prevention is not counted and always stays; the coach is told", () => {
    const blocks = [
      blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 6, reps: "2", intensity: "85% 1RM", rest: "5 min" })]),
      blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 3, reps: "5", rest: "2 min" })]),
    ];
    const out = enforceDayRules(session("MD-4", blocks))!;
    expect(find(out, "ex_trap_bar_dl")!.dose.sets).toBe(6);
    expect(find(out, "ex_nordic_curl")!.dose.sets).toBe(3);
    expect(out.timeTrimmed).toBeUndefined();
    expect(timeLines(out).map((l) => l.actionEN)).toEqual(["Kept: B1 (the heavy lift) is never cut and the injury-prevention work always stays."]);
    // A short session with prevention: the Nordic alone never pushes it over.
    const short = enforceDayRules(session("MD-4", [blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 3, reps: "3", intensity: "85% 1RM", rest: "3 min" })]), blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 3, reps: "5", rest: "4 min" }), ex("ex_copenhagen", { sets: 3, reps: "6 each side", rest: "4 min" })])]));
    expect(timeLines(short)).toEqual([]);
  });

  it("runs once: a second pass changes nothing (B2 loses one set at most)", () => {
    const blocks = [
      blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 6, reps: "2", intensity: "85% 1RM", rest: "5 min" })]),
      blk("UNILATERAL", [ex("ex_bulgarian_ss", { sets: 3, reps: "4", intensity: "RPE 7", rest: "3 min" })]),
    ];
    const once = enforceDayRules(session("MD-4", blocks))!;
    const twice = enforceDayRules(once)!;
    expect(all(twice)).toEqual(all(once));
    expect(timeLines(twice)).toEqual(timeLines(once));
    expect(find(twice, "ex_bulgarian_ss")!.dose.sets).toBe(2);
  });

  it("only MD-4 and the days that build like it; MD-3 keeps its own minutes note", () => {
    const blocks = () => [blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 3, reps: "3", intensity: "80% 1RM", rest: "4 min" })]), blk("ACCESSORY", [ex("ex_db_bench_press", { sets: 3, reps: "8", rest: "3 min" }), ex("ex_db_row", { sets: 3, reps: "8", rest: "3 min" })])];
    expect(timeLines(enforceDayRules(session("MD-3", blocks())))).toEqual([]);
    expect(timeLines(enforceDayRules(session("MD+3", blocks()))).length).toBeGreaterThan(0);
  });
});

describe("MD-3 — speed + power", () => {
  const contrast = (liftSets: number, liftReps = "3") => blk("FRENCH_CONTRAST", [
    ex("ex_trap_bar_dl", { sets: liftSets, reps: liftReps, intensity: "80% 1RM", velocityLossCap: 10 }),
    ex("ex_box_jump", { sets: liftSets, reps: "3" }),
    ex("ex_depth_jump", { sets: liftSets, reps: "3" }),
    ex("ex_mb_rotational_throw", { sets: liftSets, reps: "4 each side" }),
  ]);

  it("allowed: the contrast set's heavy lift (3 × 3 = 9) stays, Copenhagen at body weight stays", () => {
    const out = enforceDayRules(session("MD-3", [contrast(3), blk("ADDUCTOR", [ex("ex_copenhagen", { sets: 4, reps: "6 each side" })])]));
    expect(find(out, "ex_trap_bar_dl")!.dose.sets).toBe(3);
    expect(find(out, "ex_copenhagen")!.dose.sets).toBe(4);
    expect(trims(out).filter((t) => /taken out|→/.test(t.actionEN) && !/drop height/.test(t.actionEN))).toEqual([]);
  });

  it("drop jumps get the 30 cm line", () => {
    const out = enforceDayRules(session("MD-3", [contrast(3)]));
    expect(find(out, "ex_depth_jump")!.dose.cue).toMatch(/30 cm/);
  });

  it("trimmed: Nordic and RDL out (heavy eccentric); loaded reps over 9; speed loss 20% → 10%; drop jumps over 9", () => {
    const out = enforceDayRules(session("MD-3", [
      blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 4, reps: "3", intensity: "80% 1RM", velocityLossCap: 20 })]),
      blk("POWER_PRIMER", [ex("ex_trap_bar_jump_squat", { sets: 3, reps: "3", intensity: "30% 1RM" })]),
      blk("POWER_PRIMER", [ex("ex_depth_jump", { sets: 4, reps: "4" })]),
      blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 3, reps: "5" }), ex("ex_rdl", { sets: 3, reps: "6" })]),
    ]));
    expect(find(out, "ex_nordic_curl")).toBeUndefined();
    expect(find(out, "ex_rdl")).toBeUndefined();
    const loaded = (find(out, "ex_trap_bar_dl")?.dose.sets ?? 0) * 3 + (find(out, "ex_trap_bar_jump_squat")?.dose.sets ?? 0) * 3;
    expect(loaded).toBeLessThanOrEqual(9);
    // One set from each in turn: both lifts keep a set.
    expect(find(out, "ex_trap_bar_dl")!.dose.sets).toBeGreaterThanOrEqual(1);
    expect(find(out, "ex_trap_bar_jump_squat")!.dose.sets).toBeGreaterThanOrEqual(1);
    expect(find(out, "ex_trap_bar_dl")!.dose.velocityLossCap).toBe(10);
    expect(find(out, "ex_depth_jump")!.dose.sets * 4).toBeLessThanOrEqual(9);
  });

  it("a loaded squat jump with no zone gets ≥ 1.1 m/s", () => {
    const out = enforceDayRules(session("MD-3", [blk("POWER_PRIMER", [ex("ex_trap_bar_jump_squat", { sets: 3, reps: "3", intensity: "30% 1RM" })])]))!;
    expect(find(out, "ex_trap_bar_jump_squat")!.dose.speedZone).toEqual({ min: 1.1, max: null });
    expect(out.appliedAdaptations.find((a) => a.ruleId === DAY_RULE_ZONE)!.actionIS).toMatch(/1,1 m\/s eða hraðar/);
  });
});

describe("MD-2 — maintenance", () => {
  it("allowed: the week rule's 4 × 4 fast dose, a goal lift at that dose, ISO, upper body, a small jump dose", () => {
    const s = session("MD-2", [
      blk("POWER_PRIMER", [ex("ex_trap_bar_dl", { sets: 4, reps: "4", intensity: "30–40% 1RM", nearMatch: true, speedZone: { min: 1.0, max: 1.3 }, velocityLossCap: 10 })]),
      blk("ISO_FINISH", [ex("ex_imtp_iso", { sets: 3, reps: "5s × 1" })]),
      blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 2, reps: "3" })]),
      blk("ACCESSORY", [ex("ex_db_bench_press", { sets: 2, reps: "6" })]),
    ]);
    const out = enforceDayRules(s);
    expect(trims(out)).toEqual([]);
    expect(all(out)).toEqual(all(s));
  });

  it("trimmed: goal work out (not at the near-match dose), another loaded lift over 6 reps, eccentric out", () => {
    const out = enforceDayRules(session("MD-2", [
      blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "70% 1RM" })]),
      blk("UNILATERAL", [ex("ex_bulgarian_ss", { sets: 3, reps: "6 each leg" }, { goalPlan: { quality: "braking", week: 2 } })]),
      blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 2, reps: "5" })]),
      blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 3, reps: "4" })]),
    ]));
    expect(find(out, "ex_bulgarian_ss")).toBeUndefined();
    expect(find(out, "ex_nordic_curl")).toBeUndefined();
    expect(find(out, "ex_back_squat")!.dose.sets * 3).toBeLessThanOrEqual(6);
    expect(find(out, "ex_box_jump")!.dose.sets * 4).toBeLessThanOrEqual(6);
  });

  it("the goal's lift at the near-match dose stays", () => {
    const out = enforceDayRules(session("MD-2", [blk("POWER_PRIMER", [ex("ex_trap_bar_jump_squat", { sets: 4, reps: "4", intensity: "30% 1RM" }, { goalPlan: { quality: "acceleration", week: 3, nearMatch: true } })])]));
    expect(find(out, "ex_trap_bar_jump_squat")!.dose.sets).toBe(4);
  });
});

describe("MD-1 — activation", () => {
  it("allowed: the week rule's 4 × 4 at ≥ 1.3 m/s, a med ball throw, a few jumps", () => {
    const s = session("MD-1", [
      blk("POWER_PRIMER", [ex("ex_trap_bar_jump_squat", { sets: 4, reps: "4", intensity: "20% 1RM", nearMatch: true, speedZone: { min: 1.3, max: null }, velocityLossCap: 10 })]),
      blk("POWER_PRIMER", [ex("ex_mb_scoop_throw", { sets: 2, reps: "3" }), ex("ex_box_jump", { sets: 1, reps: "3" })]),
    ]);
    expect(trims(enforceDayRules(s))).toEqual([]);
  });

  it("trimmed: anything heavy out, eccentric out, other loaded reps over 6, jumps over 6", () => {
    const out = enforceDayRules(session("MD-1", [
      blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "85% 1RM" })]),
      blk("ADDUCTOR", [ex("ex_copenhagen", { sets: 2, reps: "6 each side" })]),
      blk("POWER_PRIMER", [ex("ex_jump_shrug", { sets: 3, reps: "3", intensity: "40% 1RM" })]),
      blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 3, reps: "3" })]),
    ]));
    expect(find(out, "ex_back_squat")).toBeUndefined();
    expect(find(out, "ex_copenhagen")).toBeUndefined();
    expect(find(out, "ex_jump_shrug")!.dose.sets * 3).toBeLessThanOrEqual(6);
    expect(find(out, "ex_box_jump")!.dose.sets * 3).toBeLessThanOrEqual(6);
  });
});

describe("MD+1 — recovery + maintenance", () => {
  it("allowed: upper body, ISO, a small jump dose", () => {
    const s = session("MD+1", [blk("ISO_FINISH", [ex("ex_imtp_iso", { sets: 3, reps: "3s × 1" })]), blk("ACCESSORY", [ex("ex_db_row", { sets: 3, reps: "8" })]), blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 2, reps: "3" })])]);
    expect(trims(enforceDayRules(s))).toEqual([]);
  });

  it("trimmed: heavy legs out for a player who played", () => {
    const out = enforceDayRules(session("MD+1", [blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "85% 1RM" })]), blk("ACCESSORY", [ex("ex_db_row", { sets: 3, reps: "8" })])], "mdplus1-recovery-v1"));
    expect(find(out, "ex_back_squat")).toBeUndefined();
    expect(trims(out)[0].triggerEN).toMatch(/no heavy leg lifts/);
  });

  it("a player with few minutes keeps the MD+1 strength top-up (the minutes rule)", () => {
    for (const t of ["mdplus1-strength-v1", "struct-cluster-MD+1"]) {
      const out = enforceDayRules(session("MD+1", [blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "85% 1RM" })])], t));
      expect(find(out, "ex_back_squat")!.dose.sets).toBe(3);
    }
  });
});

describe("MD+2 / OFF — off", () => {
  it("a session the coach chose is kept as it is and the day rule says so", () => {
    for (const md of ["MD+2", "OFF"] as MdContext[]) {
      const s = session(md, [blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "85% 1RM" })])]);
      const out = enforceDayRules(s)!;
      expect(all(out)).toEqual(all(s));
      expect(out.appliedAdaptations.map((a) => a.ruleId)).toEqual([DAY_RULE_COACH_DAY_OFF]);
    }
  });
});

describe("the check only takes away", () => {
  const samples: StrengthSession[] = [
    session("MD-4", [blk("COMPOUND", [ex("ex_trap_bar_dl", { sets: 6, reps: "3", intensity: "85% 1RM", velocityLossCap: 20 })]), blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 6, reps: "5" })])]),
    session("MD-3", [blk("COMPOUND", [ex("ex_back_squat", { sets: 5, reps: "3", intensity: "80% 1RM" })]), blk("POSTERIOR", [ex("ex_nordic_curl", { sets: 3, reps: "5" })])]),
    session("MD-1", [blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "85% 1RM" })]), blk("POWER_PRIMER", [ex("ex_box_jump", { sets: 4, reps: "3" })])]),
  ];

  it("never more exercises, sets or reps; the input is not changed", () => {
    for (const s of samples) {
      const before = JSON.stringify(s);
      const out = enforceDayRules(s)!;
      expect(JSON.stringify(s)).toBe(before);
      expect(all(out).length).toBeLessThanOrEqual(all(s).length);
      expect(work(out)).toBeLessThan(work(s));
      for (const e of all(out)) expect(e.dose.sets).toBeLessThanOrEqual(find(s, e.exerciseId)!.dose.sets);
    }
  });

  it("a second run changes nothing (the meso layer runs it again)", () => {
    for (const s of samples) {
      const once = enforceDayRules(s)!;
      expect(enforceDayRules(once)).toEqual(once);
    }
  });

  it("the coach's own swap is never trimmed (the coach decides last)", () => {
    const out = enforceDayRules(session("MD-1", [blk("COMPOUND", [ex("ex_back_squat", { sets: 3, reps: "3", intensity: "85% 1RM" }, { modificationReason: "Coach override: wants a heavy primer" })])]));
    expect(find(out, "ex_back_squat")!.dose.sets).toBe(3);
  });

  it("null and empty sessions pass through", () => {
    expect(enforceDayRules(null)).toBeNull();
    const empty = session("MD-4", []);
    expect(enforceDayRules(empty)).toBe(empty);
  });
});

describe("wiring", () => {
  const snap = (md: MdContext) => ({
    playerId: "p1", todayIso: "2026-11-16", mdContext: md, verdict: "FULL" as const,
    sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
    wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
    vbtDecrement: null, injuryStatus: "cleared" as const, fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
    seasonPhase: null, goalSeason: { phase: "preseason" as const, blockGoal: "transmute" as const },
  });

  it("a built session already meets its day rule (the build runs the check last)", () => {
    for (const md of ["MD-4", "MD-3", "MD-2", "MD-1", "MD+1"] as MdContext[]) {
      const s = buildStrengthSession(snap(md));
      if (!s) continue;
      expect(enforceDayRules(s)).toEqual(s);
      if (md === "MD-4") for (const e of all(s)) if (e.dose.velocityLossCap && dayCategoryOf(e) === "heavy") expect(e.dose.velocityLossCap).toBeLessThanOrEqual(15);
    }
  });

  it("basketball sessions are not checked against football's MD days", () => {
    const s = buildStrengthSession({ ...snap("MD-1"), sport: "basketball" });
    expect((s?.appliedAdaptations ?? []).some((a) => a.ruleId.startsWith("DAY_RULE"))).toBe(false);
  });

  it("never reads or writes the readiness colour", () => {
    const src = readFileSync(join(__dirname, "..", "dayRules.ts"), "utf8");
    expect(src).not.toMatch(/final_color|readiness_entries|\.verdict\b|\bcolor\b/);
  });
});
