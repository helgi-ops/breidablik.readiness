import { describe, expect, it } from "vitest";
import {
  applySaved, buildRunnerBlocks, completeRound, firstOpen, lastTimeByExercise, parseRestSeconds,
  skipBlock, summarize, toPayload, updateSet, type PlanRow,
} from "../sessionRunner";

const french: PlanRow[] = [
  { exercise: "Trap-bar deadlift", sets: 3, reps: "3", target_kg: 110, group: "A", group_method: "French contrast", set_rest: "180 sec" },
  { exercise: "Box jump", sets: 3, reps: "5", group: "A", group_method: "French contrast" },
  { exercise: "Trap-bar jump", sets: 3, reps: "5", target_kg: 30, group: "A", group_method: "French contrast" },
  { exercise: "Band jump", sets: 3, reps: "5", group: "A", group_method: "French contrast" },
];
const single: PlanRow[] = [{ exercise: "Split squat", sets: 2, reps: "6", target_kg: 28 }];
const none = new Map();

describe("sessionRunner", () => {
  it("reads rest times and falls back to 2 min", () => {
    expect(parseRestSeconds("90 sec")).toBe(90);
    expect(parseRestSeconds("3 min")).toBe(180);
    expect(parseRestSeconds("2:30")).toBe(150);
    expect(parseRestSeconds(undefined)).toBe(120);
    expect(parseRestSeconds("")).toBe(120);
  });

  it("keeps a French contrast as one block of rounds", () => {
    const b = buildRunnerBlocks(french, none);
    expect(b.length).toBe(1);
    expect(b[0].kind).toBe("french_contrast");
    expect(b[0].restSeconds).toBe(180);
  });

  it("loaded jumps carry weight, unloaded ones are bodyweight", () => {
    const [b] = buildRunnerBlocks(french, none);
    expect(b.exercises[2].sets[0].weight_kg).toBe(30);
    expect(b.exercises[2].sets[0].is_bodyweight).toBe(false);
    expect(b.exercises[1].sets[0].is_bodyweight).toBe(true);
  });

  it("a round logs every exercise at once", () => {
    const blocks = completeRound(buildRunnerBlocks(french, none), { block: 0, round: 0 });
    expect(toPayload(blocks).length).toBe(4);
    expect(toPayload(blocks)[0].sets.length).toBe(1);
    expect(firstOpen(blocks)?.round).toBe(1);
  });

  it("a change carries forward but leaves finished rounds alone", () => {
    let b = completeRound(buildRunnerBlocks(french, none), { block: 0, round: 0 });
    b = updateSet(b, { block: 0, round: 1 }, 2, { weight_kg: 35 });
    expect(b[0].exercises[2].sets[0].weight_kg).toBe(30);
    expect(b[0].exercises[2].sets[2].weight_kg).toBe(35);
  });

  it("resumes from saved sets", () => {
    const b = applySaved(buildRunnerBlocks(single, none), [
      { session_date: "2026-11-02", exercise_name: "Split squat", set_number: 1, weight_kg: 26, reps: 6 },
    ]);
    expect(firstOpen(b)?.round).toBe(1);
    expect(b[0].exercises[0].sets[0].weight_kg).toBe(26);
  });

  it("skipping a block ends it without logging", () => {
    const b = skipBlock(buildRunnerBlocks(single, none), 0);
    expect(firstOpen(b)).toBeNull();
    expect(toPayload(b).length).toBe(0);
  });

  it("uses last time's heaviest set when no target is planned", () => {
    const last = lastTimeByExercise([
      { session_date: "2026-10-30", exercise_name: "Row", set_number: 1, weight_kg: 40, reps: 8 },
      { session_date: "2026-10-30", exercise_name: "Row", set_number: 2, weight_kg: 42, reps: 6 },
      { session_date: "2026-10-20", exercise_name: "Row", set_number: 1, weight_kg: 50, reps: 5 },
    ], "2026-11-02");
    expect(last.get("Row")?.weight_kg).toBe(42);
    const [b] = buildRunnerBlocks([{ exercise: "Row", sets: 1, reps: "8" }], last);
    expect(b.exercises[0].sets[0].weight_kg).toBe(42);
  });

  it("totals lifted weight without bodyweight sets", () => {
    const b = completeRound(buildRunnerBlocks(french, none), { block: 0, round: 0 });
    expect(summarize(b).liftedKg).toBe(110 * 3 + 30 * 5);
  });
});
