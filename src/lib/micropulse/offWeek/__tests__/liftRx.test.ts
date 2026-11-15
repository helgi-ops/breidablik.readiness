import { describe, expect, it } from "vitest";
import { buildOffWeekPlan, type OffWeekInputs } from "../plan";
import { rxForOffWeekBlock, rxForOffWeekPlan } from "../liftRx";

const base = (over: Partial<OffWeekInputs> = {}): OffWeekInputs => ({
  days: 7, masKmh: 16, oneRepMaxes: { squat: 140, bench: 100 }, gymAccess: "gym", needs: {}, ...over,
});
const txt = (r: ReturnType<typeof rxForOffWeekPlan>, L: "en" | "is") =>
  r.map((x) => [...Object.values(x.rows).map((v) => v!.text[L]), ...x.barSpeed.map((b) => b.line.text[L])].join(" ")).join(" ");

describe("off-week plan — \"All the details\" table", () => {
  it("the plan's own numbers: sets × reps, RPE as reps in the tank, ~78% of the lift's own 1RM", () => {
    const rx = rxForOffWeekPlan(buildOffWeekPlan(base()), "EN");
    const squat = rx.find((r) => r.exercise.en === "Back squat")!;
    expect(`${squat.sets}×${squat.reps}`).toBe("3×5");
    expect(squat.rows.load?.text.en).toBe("110 kg.");
    expect(squat.rows.load?.source).toBe("session");
    expect(squat.rows.effort?.text.en).toMatch(/about 3 reps left/);
    // The trap-bar has no 1RM of its own here → no kg (the squat's number is never borrowed).
    expect(rx.find((r) => r.exercise.en === "Trap-bar deadlift")!.rows.load).toBeUndefined();
    expect(rx.find((r) => r.exercise.en === "Bench press")!.rows.load?.text.en).toBe("80 kg.");
  });

  it("power lean reads as fast reps; a bodyweight plan gets no kg", () => {
    const power = rxForOffWeekPlan(buildOffWeekPlan(base({ needs: { strengthLean: "power" } })), "EN");
    expect(power[0].rows.tempo?.text.en).toBe("Every rep as fast as possible.");
    const bw = rxForOffWeekPlan(buildOffWeekPlan(base({ oneRepMaxes: null, gymAccess: "bodyweight" })), "IS");
    expect(bw.map((r) => r.reps)).toEqual(["8/leg", "8/leg"]);
    expect(bw.every((r) => r.rows.load == null)).toBe(true);
    expect(bw[0].rows.tempo?.text.is).toBe("Hægt og með stjórn.");
  });

  it("deficit lifts (Nordic, Copenhagen) get a table; runs, rest and RTP days get none", () => {
    const p = buildOffWeekPlan(base({ needs: { deficitEmphases: ["eccentric", "adductor"] } }));
    const names = rxForOffWeekPlan(p, "EN").map((r) => r.exercise.en);
    expect(names).toEqual(expect.arrayContaining(["Nordic hamstring", "Copenhagen adduction"]));
    for (const d of p.days.filter((x) => x.type !== "strength")) for (const b of d.blocks) expect(rxForOffWeekBlock(b, "EN")).toEqual([]);
    const rtp = buildOffWeekPlan(base({ needs: { rtpTrack: "hamstring" } }));
    expect(rxForOffWeekPlan(rtp, "EN")).toEqual([]);
  });

  it("a plan sent before lifts were stored shows no table", () => {
    expect(rxForOffWeekPlan({ days: [{ blocks: [{ label: { en: "x", is: "x" }, prescription: { en: "x", is: "x" } }] }] }, "EN")).toEqual([]);
  });

  it("plain words in both languages", () => {
    for (const needs of [{}, { strengthLean: "power" as const }, { strengthLean: "hypertrophy" as const, deficitEmphases: ["eccentric", "adductor"] }]) {
      for (const [L, k] of [["EN", "en"], ["IS", "is"]] as const) {
        const t = txt(rxForOffWeekPlan(buildOffWeekPlan(base({ needs })), L), k);
        expect(t.length).toBeGreaterThan(0);
        expect(t).not.toMatch(/\bRPE\b|\bRIR\b|1RM|\bMVC\b|\bVBT\b|\(ur\)|\(n\)/);
      }
    }
  });
});
