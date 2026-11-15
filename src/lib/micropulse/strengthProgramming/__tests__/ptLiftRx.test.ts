/**
 * "All the details" in the PT plans: the same table as the player's Today session, read from the plan's own numbers.
 * The trainer's view (plan builder / overview) and the client's view (assigned plan rows) must give the same table.
 */
import { describe, expect, it } from "vitest";
import { ptInputFromClientRow, ptInputFromPlanExercise, rxForPtLift, tempoLineFromCode } from "../ptLiftRx";
import { RX_REFS, type LiftRx, type RxLine } from "@/lib/micropulse/goalPlan/liftRx";
import { formatVbtForPlayer } from "@/lib/micropulse/vbtMethods";
import { toDbLoadType } from "@/lib/trainer/planLoadType";

function allLines(r: LiftRx): RxLine[] {
  return [...Object.values(r.rows).filter((l): l is RxLine => !!l), ...r.barSpeed.map((x) => x.line)];
}

/** The client row exactly as `/api/client/today` builds it from an assigned prescription. */
function assignedRow(ex: Parameters<typeof ptInputFromPlanExercise>[0]) {
  return {
    exercise: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    method: toDbLoadType(ex.loadType) ?? undefined,
    set_rest: ex.restSeconds != null ? `${ex.restSeconds} sec` : undefined,
    load_value: ex.loadValue,
    rpe_target: ex.rpeTarget ?? null,
    tempo: ex.tempo,
    notes: ex.notes || null,
    vbt: ex.vbt ?? null,
  };
}

// Real lines from the PT plans in use (individual_training_prescriptions) and the plan builder's presets.
const PLAN: Parameters<typeof ptInputFromPlanExercise>[0][] = [
  { name: "Back Squat", sets: 3, reps: "5", loadType: "kg", loadValue: 0, rpeTarget: 8, tempo: "", restSeconds: 20, notes: "Back Squat · 80% 1RM · VBT 0.65 m/s (cut 0.5525, 0.15)" },
  { name: "Jump Shrug", sets: 4, reps: "3", loadType: "kg", loadValue: 0, tempo: "", restSeconds: 20, notes: "Jump Shrugs · 30% 1RM · max intent" },
  { name: "Trap Bar Deadlift", sets: 3, reps: "3-5", loadType: "%1RM", loadValue: 85, tempo: "3010", restSeconds: 15, notes: "" },
  { name: "Bench Press", sets: 3, reps: "5", loadType: "kg", loadValue: 0, rpeTarget: 8, tempo: "", restSeconds: 90, notes: "Bench press · 65% 1RM · VBT 0.85 m/s (cut 0.7224999999999999, 0.15)" },
  { name: "Nordic Hamstring Curl", sets: 1, reps: "4-6", loadType: "kg", loadValue: 0, tempo: "", restSeconds: 90, notes: "Nordic hamstring · controlled" },
  { name: "Pallof Press", sets: 1, reps: "8-10 each side", loadType: "kg", loadValue: 0, tempo: "", restSeconds: 30, notes: "Pallof press · controlled" },
  { name: "Romanian Deadlift", sets: 3, reps: "8-10", loadType: "kg", loadValue: 60, tempo: "3010", restSeconds: 120, notes: "" },
  { name: "Hip Thrust", sets: 3, reps: "1", loadType: "RPE", loadValue: 7, tempo: "ISO 45s", restSeconds: 120, notes: "" },
  { name: "Back Squat", sets: 4, reps: "3", loadType: "velocity", loadValue: 70, tempo: "X0X0", restSeconds: 180, notes: "", vbt: { method: "fixed_set_vl", velocityLossPct: 20 } },
  { name: "Bulgarian Split Squat", sets: 3, reps: "8 each leg", loadType: "kg", loadValue: 0, tempo: "2010", restSeconds: 0, notes: "" },
  { name: "Side Plank", sets: 1, reps: "6-8 each side", loadType: "kg", loadValue: 0, restSeconds: 30, notes: "R. Overhead side plank · controlled" },
  { name: "Drop Jump", sets: 3, reps: "5", loadType: "kg", loadValue: 0, restSeconds: 120, notes: "Drop jumps · max intent" },
  { name: "Medicine Ball Rotational Throw", sets: 2, reps: "3 each side", loadType: "kg", loadValue: 0, restSeconds: 180, notes: "MB Moye Start · max intent" },
  { name: "Plyo Push-Up", sets: 3, reps: "5", loadType: "kg", loadValue: 0, restSeconds: 120, notes: "Plyo push-up · max intent" },
];

describe("PT plans: trainer view = client view", () => {
  it("the plan builder's lift and the assigned row give the same table, in both languages", () => {
    for (const ex of PLAN) for (const L of ["EN", "IS"] as const) {
      const trainer = rxForPtLift(ptInputFromPlanExercise(ex), L);
      const client = rxForPtLift(ptInputFromClientRow(assignedRow(ex)), L);
      expect(client, `${ex.name} ${ex.tempo ?? ""} ${L}`).toEqual(trainer);
    }
  });

  it("plain words only, every reference read in full", () => {
    for (const ex of PLAN) {
      const rx = rxForPtLift(ptInputFromPlanExercise(ex), "EN");
      if (!rx) continue;
      for (const l of allLines(rx)) {
        for (const t of [l.text.en, l.text.is]) {
          expect(t, String(ex.name)).not.toMatch(/\bRPE\b|\bRIR\b|1RM|\bMVC\b|\bVBT\b|\bcut\b/);
          expect(t, String(ex.name)).not.toMatch(/injur|prevent|meiðsl/i);
          expect(t, String(ex.name)).not.toMatch(/\((?:ur|n|ar|a)\)/);
        }
        for (const k of l.refs ?? []) expect(RX_REFS[k]?.verifiedFrom, k).toBe("full_text");
      }
    }
  });
});

describe("PT plans: the plan's own numbers", () => {
  it("% of max from the notes, how hard from the target, rest, and the device lines from 'VBT … (cut …)'", () => {
    const rx = rxForPtLift(ptInputFromPlanExercise(PLAN[0]), "EN")!;
    expect(rx.profile).toBe("heavy");
    expect(rx.rows.load).toEqual({ text: { en: "About 80% of max.", is: "Um 80% af hámarki." }, source: "session" });
    expect(rx.rows.effort!.text.en).toBe("Stop each set with about 2 reps left in the tank; never to failure.");
    expect(rx.rows.rest!.text.en).toBe("20 s.");
    expect(rx.barSpeed.find((x) => x.key === "target")!.line.text).toEqual({ en: "About 0.65 m/s on each rep.", is: "Um 0,65 m/s í hverri endurtekningu." });
    expect(rx.barSpeed.find((x) => x.key === "stop")!.line.text.en).toBe("Stop the set when a rep drops below about 0.55 m/s (about 15% under the target).");
    expect(rx.barSpeed.find((x) => x.key === "stop")!.line.source).toBe("session");
  });

  it("a lift outside the profiles gets only the plan's lines (bench: load, effort, rest, device; nothing made up)", () => {
    const rx = rxForPtLift(ptInputFromPlanExercise(PLAN[3]), "EN")!;
    expect(rx.profile).toBe("general");
    for (const l of allLines(rx)) expect(l.source).toBe("session");
    expect(rx.barSpeed.find((x) => x.key === "stop")!.line.text.en).toContain("0.72 m/s");
  });

  it("a structured % beats nothing, a 0 kg load is 'not set', and a profiled lift fills only open lines", () => {
    const tbdl = rxForPtLift(ptInputFromPlanExercise(PLAN[2]), "EN")!;
    expect(tbdl.rows.load!.text.en).toBe("About 85% of max.");
    expect(tbdl.rows.tempo!.text.en).toBe("Lower over about 3 s, then straight up.");
    expect(tbdl.rows.tempo!.source).toBe("session");
    expect(tbdl.rows.rest!.text.en).toBe("15 s.");
    const shrug = rxForPtLift(ptInputFromPlanExercise(PLAN[1]), "EN")!;
    expect(shrug.rows.load!.text.en).toBe("About 30% of max.");
    expect(shrug.rows.tempo!.text.en).toBe("Every rep as fast as possible.");
    const rdl = rxForPtLift(ptInputFromPlanExercise(PLAN[6]), "EN")!;
    expect(rdl.rows.load!.text.en).toBe("60 kg.");
  });

  it("'controlled' becomes a plain line; a 0 s rest (straight on to the next lift) gets no rest line", () => {
    const nordic = rxForPtLift(ptInputFromPlanExercise(PLAN[4]), "IS")!;
    expect(nordic.rows.tempo!.text.is).toBe("Hægt og með stjórn.");
    const pallof = rxForPtLift(ptInputFromPlanExercise(PLAN[5]), "EN")!;
    expect(Object.keys(pallof.rows).sort()).toEqual(["rest", "tempo"]);
    const bss = rxForPtLift(ptInputFromPlanExercise(PLAN[9]), "EN")!;
    expect(bss.rows.rest).toBeUndefined();
  });

  it("the trainer's bar-speed rule on a lift is the device line; a bar-speed load stays out (the client never gets it)", () => {
    const ex = PLAN[8];
    const rx = rxForPtLift(ptInputFromPlanExercise(ex), "EN")!;
    const card = formatVbtForPlayer({ method: "fixed_set_vl", velocityLossPct: 20 } as never, "EN");
    expect(rx.barSpeed).toEqual([{ key: "coach", line: { text: { en: card.headline, is: card.headline }, source: "session" } }]);
    expect(rx.rows.load?.source).not.toBe("session");
    expect(rx.rows.tempo!.text.en).toBe("Down and up as fast as possible.");
  });

  it("jumps, throws, planks and plyo push-ups get no table", () => {
    for (const i of [10, 11, 12, 13]) expect(rxForPtLift(ptInputFromPlanExercise(PLAN[i]), "EN"), String(PLAN[i].name)).toBeNull();
  });
});

describe("tempo codes in plain words", () => {
  it("reads lowering · pause · lifting · pause", () => {
    expect(tempoLineFromCode("3010")!.text).toEqual({ en: "Lower over about 3 s, then straight up.", is: "Farðu niður á um 3 sekúndum og svo beint upp." });
    expect(tempoLineFromCode("31X0")!.text).toEqual({
      en: "Lower over about 3 s, pause 1 s at the bottom, then up as fast as possible.",
      is: "Farðu niður á um 3 sekúndum, haltu 1 sekúndu niðri og svo eins hratt upp og þú getur.",
    });
    expect(tempoLineFromCode("2-0-2-2")!.text.is).toBe("Farðu niður á um 2 sekúndum og svo upp á um 2 sekúndum; haltu 2 sekúndur uppi.");
    expect(tempoLineFromCode("X0X0")!.text.en).toBe("Down and up as fast as possible.");
    expect(tempoLineFromCode("ISO 30-45s")!.text).toEqual({ en: "Hold the position still for about 30–45 s.", is: "Haltu stöðunni kyrri í um 30–45 sek." });
    expect(tempoLineFromCode("ISO")!.text.en).toBe("Hold the position still.");
    for (const x of ["", "slow", "ISOMETRIC", "301", null, 3010]) expect(tempoLineFromCode(x), String(x)).toBeNull();
  });
});

describe("Explosive Power rows (pct1rm, velocity, dropoff, kg target)", () => {
  it("the kg target the row shows, the speed target and the drop that ends the set", () => {
    const row = { exercise: "Trap-bar deadlift", sets: 2, reps: "3+3 cluster", method: "Cluster", pct1rm: 0.75, dropoff: 0.2, set_rest: "180 sec", velocity: 0.75, target_kg: 120 };
    const rx = rxForPtLift(ptInputFromClientRow(row), "EN")!;
    expect(rx.rows.load!.text.en).toBe("120 kg.");
    expect(rx.rows.rest!.text).toEqual({ en: "3 min.", is: "3 mín." });
    expect(rx.barSpeed.find((x) => x.key === "target")!.line.text.en).toBe("About 0.75 m/s on each rep.");
    expect(rx.barSpeed.find((x) => x.key === "stop")!.line.text.en).toContain("20%");
    const shrug = rxForPtLift(ptInputFromClientRow({ exercise: "Jump shrugs", sets: 3, reps: "3", method: "WL Derivative", pct1rm: 0.4, set_rest: "120 sec", velocity: "Fast as possible" }), "EN")!;
    expect(shrug.rows.load!.text.en).toBe("About 40% of max.");
    expect(shrug.rows.tempo!.text.en).toBe("Every rep as fast as possible.");
  });
});
