/**
 * Lota 8: "All the details" for each lift in the player's Today session, read from the session the coach (or the
 * engine) sent. The session's own numbers always win; nothing is made up for lifts without a profile.
 */
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "../exerciseLibrary";
import { readMethod, restFromText, restSecondsFromText, rxForPrescribed, rxForTodayItem, TODAY_PROFILE_BY_ID } from "../todayLiftRx";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import { RX_REFS, type LiftRx, type RxLine } from "@/lib/micropulse/goalPlan/liftRx";
import { formatVbtForPlayer } from "@/lib/micropulse/vbtMethods";

const line = (name: string, setsReps: string | null = "3×5") => ({ name, setsReps, isHeader: false });
const NOT_GYM = new Set(["MOVEMENT_PREP", "MOBILITY", "PLYOMETRIC", "MED_BALL"]);

function allLines(r: LiftRx): RxLine[] {
  return [...Object.values(r.rows).filter((l): l is RxLine => !!l), ...r.barSpeed.map((x) => x.line)];
}

/** The item exactly as `strengthSessionToTodayStructure` writes it. */
function sentItem(e: (typeof EXERCISE_LIBRARY)[number], dose: NonNullable<(typeof e.defaultDosing)[keyof typeof e.defaultDosing]>) {
  return {
    name: e.nameEN,
    sets: dose.sets,
    reps: dose.reps,
    rest: dose.rest,
    method: [dose.intensity, dose.cue].filter(Boolean).join(" · "),
    exerciseId: e.id,
    ...(dose.velocityLossCap ? { vlCap: dose.velocityLossCap } : {}),
  };
}

describe("rxForTodayItem: every library exercise × every default dose", () => {
  const cases = EXERCISE_LIBRARY.flatMap((e) => Object.entries(e.defaultDosing).map(([md, dose]) => ({ e, md, dose: dose! })));

  it("warm-up, mobility, plyometric and med-ball work get no table; gym lifts do", () => {
    for (const { e, md, dose } of cases) {
      const rx = rxForTodayItem(sentItem(e, dose), line(e.nameEN), {});
      if (NOT_GYM.has(e.category)) expect(rx, `${e.id} ${md}`).toBeNull();
      else expect(rx, `${e.id} ${md}`).not.toBeNull();
    }
  });

  it("rest, % of max and kg in the table are the session's own numbers", () => {
    for (const { e, md, dose } of cases) {
      if (NOT_GYM.has(e.category)) continue;
      const rx = rxForTodayItem(sentItem(e, dose), line(e.nameEN), {})!;
      const restNums = dose.rest.match(/\d+/g);
      if (restNums) {
        expect(rx.rows.rest?.source, `${e.id} ${md}`).toBe("session");
        for (const n of restNums) expect(rx.rows.rest!.text.en, `${e.id} ${md}`).toContain(n);
      }
      const pct = /(\d+(?:-\d+)?)%\s*1RM/.exec(dose.intensity);
      if (pct) {
        expect(rx.rows.load?.source, `${e.id} ${md}`).toBe("session");
        expect(rx.rows.load!.text.en).toContain(pct[1].replace("-", "–"));
      }
      const kg = /(\d+(?:-\d+)?)\s*kg/.exec(dose.intensity);
      if (kg) expect(rx.rows.load!.text.en).toContain(`${kg[1].replace("-", "–")} kg`);
      if (/RPE/.test(dose.intensity)) {
        expect(rx.rows.effort?.source, `${e.id} ${md}`).toBe("session");
        // An RPE sets the load: never a default load next to it.
        if (rx.rows.load) expect(rx.rows.load.source).toBe("session");
      }
      if (dose.velocityLossCap) {
        const stop = rx.barSpeed.find((x) => x.key === "stop");
        expect(stop?.line.text.en, `${e.id} ${md}`).toContain(`${dose.velocityLossCap}%`);
      }
    }
  });

  it("plain words only: no RPE / RIR / 1RM / MVC, no injury promises, no Icelandic placeholders", () => {
    for (const { e, dose } of cases) {
      const rx = rxForTodayItem(sentItem(e, dose), line(e.nameEN), {});
      if (!rx) continue;
      for (const l of allLines(rx)) {
        for (const t of [l.text.en, l.text.is]) {
          expect(t, e.id).not.toMatch(/\bRPE\b|\bRIR\b|1RM|\bMVC\b/);
          expect(t, e.id).not.toMatch(/injur|prevent|meiðsl/i);
          expect(t, e.id).not.toMatch(/\((?:ur|n|ar|a)\)/);
        }
        for (const k of l.refs ?? []) {
          expect(RX_REFS[k], k).toBeDefined();
          expect(RX_REFS[k].verifiedFrom, k).toBe("full_text");
        }
      }
    }
  });

  it("lifts without a profile get only the session's own lines (nothing filled in)", () => {
    for (const { e, dose } of cases) {
      if (TODAY_PROFILE_BY_ID[e.id]) continue;
      const rx = rxForTodayItem(sentItem(e, dose), line(e.nameEN), {});
      if (!rx) continue;
      expect(rx.profile).toBe("general");
      for (const l of allLines(rx)) expect(l.source, e.id).toBe("session");
    }
  });

  it("profiled lifts fill open lines from MicroPulse's lines (lota 7), never over the session's", () => {
    const squat = EXERCISE_LIBRARY.find((e) => e.id === "ex_back_squat")!;
    const rx = rxForTodayItem(sentItem(squat, squat.defaultDosing["MD-3"]!), line("Back squat"), {})!;
    expect(rx.profile).toBe("heavy");
    expect(rx.rows.load!.text.en).toBe("About 80% of max.");
    expect(rx.rows.tempo!.source).toBe("other_study"); // Pareja-Blanco 2017 line from lota 7
    expect(rx.rows.rest!.text.en).toBe("2 min.");
    expect(rx.barSpeed.find((x) => x.key === "stop")!.line.text.en).toContain("10%");
    expect(rx.barSpeed.find((x) => x.key === "target")!.line.refs).toEqual(["thompson2021"]);
  });
});

describe("reading the session's words", () => {
  it("RPE → reps left (Zourdos 2016)", () => {
    expect(readMethod("RPE 8").effort!.text.en).toContain("about 2 reps left");
    expect(readMethod("RPE 8.5 · double progression").effort!.text.en).toContain("about 1–2 reps left");
    expect(readMethod("RPE 7-8").effort!.text.en).toContain("about 2–3 reps left");
    expect(readMethod("RPE 9").effort!.text.is).toContain("um 1 endurtekningu eftir");
    expect(readMethod("RPE 10").effort!.text.en).toContain("last rep");
    expect(readMethod("RPE 8").effort!.refs).toEqual(["zourdos2016"]);
  });

  it("load from %, the lift the % is of, kg, body weight and an empty bar", () => {
    expect(readMethod("30-40% 1RM (deadlift) · Triple extend hard, no catch.").load!.text.en).toBe("About 30–40% of your deadlift max.");
    expect(readMethod("85% 1RM / RPE 8 · Cluster: 3 reps, 25s pause, repeat as singles within set.").load!.text.en).toBe("About 85% of max.");
    expect(readMethod("Trap bar · 85–95% 1RM").load!.text.is).toBe("Um 85–95% af hámarki.");
    expect(readMethod("100% MVC").load!.text.en).toBe("Push or pull as hard as you can.");
    expect(readMethod("70% MVC").load!.text.en).toBe("About 70% of your hardest push or pull.");
    expect(readMethod("4-6 kg").load!.text.en).toBe("4–6 kg.");
    expect(readMethod("Bodyweight, slow eccentric").load!.text.en).toBe("Body weight.");
    expect(readMethod("BW · tempo X").load!.text.is).toBe("Eigin þyngd.");
    expect(readMethod("Bar only").load!.text.en).toBe("Empty bar.");
    expect(readMethod("Max effort").load).toBeNull();
  });

  it("rep speed: a slow lowering in seconds, or as fast as possible", () => {
    expect(readMethod("Slow eccentric (3-5s descent)").tempo!.text.en).toBe("Lower slowly, over about 3–5 s.");
    expect(readMethod("3–4s ecc. · eccentric").tempo!.text.is).toBe("Farðu hægt niður, á um 3–4 sek.");
    expect(readMethod("explosive · max intent · Every rep at maximal velocity").tempo!.text.en).toBe("Every rep as fast as possible.");
    expect(readMethod("Trap bar · explode, tempo X").tempo).not.toBeNull();
    expect(readMethod("85% 1RM / RPE 8 · Cluster: 3 reps, 25s pause, repeat as singles within set.").tempo).toBeNull();
    expect(readMethod("Back knee straight, heel down.").tempo).toBeNull();
  });

  it("rest", () => {
    expect(restFromText("90s")!.text).toEqual({ en: "90 s.", is: "90 sek." });
    expect(restFromText("2-3 min")!.text).toEqual({ en: "2–3 min.", is: "2–3 mín." });
    expect(restFromText("90–120s")!.text.en).toBe("90–120 s.");
    expect(restFromText("—")).toBeNull();
    expect(restFromText("")).toBeNull();
    expect(restFromText(undefined)).toBeNull();
  });
});

describe("rest timer reads the session's rest", () => {
  it("seconds from the rest text (lower end of a range)", () => {
    expect(restSecondsFromText("90s")).toBe(90);
    expect(restSecondsFromText("3 min")).toBe(180);
    expect(restSecondsFromText("2-3 min")).toBe(120);
    expect(restSecondsFromText("2–3 min")).toBe(120);
    expect(restSecondsFromText("90–120s")).toBe(90);
    expect(restSecondsFromText("20-30s")).toBe(20);
    expect(restSecondsFromText("60–90s")).toBe(60);
    expect(restSecondsFromText("2 mín")).toBe(120);
    expect(restSecondsFromText("45 sek")).toBe(45);
    expect(restSecondsFromText("1:30")).toBe(90);
    expect(restSecondsFromText("75")).toBe(75);
    expect(restSecondsFromText(120)).toBe(120);
  });
  it("finds the rest inside a block note, not the set count", () => {
    expect(restSecondsFromText("4 sets · rest 2-3 min between sets")).toBe(120);
    expect(restSecondsFromText("rest 90s between sets")).toBe(90);
    expect(restSecondsFromText("3 rounds")).toBeNull();
    expect(restSecondsFromText("5 sets")).toBeNull();
  });
  it("no rest → null (the timer falls back)", () => {
    for (const x of ["—", "-", "", "   ", null, undefined, 0, "Max effort"]) expect(restSecondsFromText(x), String(x)).toBeNull();
  });
  it("every library default rest gives a timer", () => {
    for (const e of EXERCISE_LIBRARY) for (const d of Object.values(e.defaultDosing)) {
      if (!d || /^—$/.test(d.rest)) continue;
      expect(restSecondsFromText(d.rest), `${e.id} ${d.rest}`).toBeGreaterThan(0);
    }
  });
});

describe("real Today items", () => {
  it("coach-written items without a library id (Njarðvík W week)", () => {
    const tbdl = rxForTodayItem({ name: "Trap-bar deadlift", sets: "5", reps: "2", rest: "90–120s", method: "Trap bar · 85–95% 1RM" }, line("Trap-bar deadlift"), {})!;
    expect(tbdl.profile).toBe("heavy"); // exact library name
    expect(tbdl.rows.load!.text.en).toBe("About 85–95% of max.");
    expect(tbdl.rows.rest!.text.en).toBe("90–120 s.");

    const press = rxForTodayItem({ name: "Push press", sets: "3", reps: "8", rest: "—", method: "DB/BB · 50–60% 1RM" }, line("Push press"), {})!;
    expect(press.profile).toBe("general");
    expect(press.rows.load!.text.en).toBe("About 50–60% of max.");
    expect(press.rows.rest).toBeUndefined();

    expect(rxForTodayItem({ name: "Mobility / activation", sets: "1", reps: "5–10 min", rest: "—", method: "" }, line("Mobility / activation"), {})).toBeNull();

    const pushups = rxForTodayItem({ name: "Push-ups", sets: "3", reps: "10–15", rest: "75s", method: "BW" }, line("Push-ups"), {})!;
    expect(Object.keys(pushups.rows).sort()).toEqual(["load", "rest"]);
  });

  it("engine items: contrast jump shrug keeps its 20–30 s rest; corrective cue lines get nothing", () => {
    const shrug = rxForTodayItem({ name: "Jump shrug", sets: "3", reps: "3", rest: "20-30s", method: "loaded · fast", exerciseId: "ex_jump_shrug" }, line("Jump shrug"), {})!;
    expect(shrug.profile).toBe("pull");
    expect(shrug.rows.rest!.text.en).toBe("20–30 s.");
    expect(shrug.rows.tempo!.text.en).toBe("Every rep as fast as possible.");
    expect(shrug.rows.load!.refs).toEqual(["suchomel2017"]); // open line, filled from lota 7

    expect(rxForTodayItem({ name: "Lateral step-up", reps: "3 × 8 / side", method: "Drive through the whole foot, knee over 2nd toe." }, line("Lateral step-up", null), {})).toBeNull();
    expect(rxForTodayItem({ name: "Pogo bouncing (warm-up)", sets: "2", reps: "5", rest: "30s", method: "Reactive", exerciseId: "mp_pogo_warmup" }, line("Pogo bouncing (warm-up)"), {})).toBeNull();
  });

  it("free-text template lines: only an exact library lift with a profile and sets × reps, never over its own numbers", () => {
    const plain = rxForTodayItem("Back squat 4×3-5", line("Back squat", "4×3-5"), {})!;
    expect(plain.profile).toBe("heavy");
    expect(plain.rows.load).toBeDefined();
    const withPct = rxForTodayItem("Back squat 4×3 80% · 3 min rest", line("Back squat", "4×3"), {})!;
    expect(withPct.rows.load).toBeUndefined();
    expect(withPct.rows.rest).toBeUndefined();
    expect(rxForTodayItem("Hamstring ISO: 10 sec × 2", line("Hamstring ISO", "10 sec × 2"), {})).toBeNull();
    expect(rxForTodayItem("• Trap Bar Deadlift", line("• Trap Bar Deadlift", null), {})).toBeNull();
    expect(rxForTodayItem("Hip bridge 2×8 (hold 1 sec at top)", line("Hip bridge", "2×8"), {})).toBeNull();
    expect(rxForTodayItem("Choose 1 primer option:", { name: "Choose 1 primer option:", setsReps: null, isHeader: true }, {})).toBeNull();
  });

  it("the coach's bar-speed rule replaces the general device lines on the main lifts only", () => {
    const vbt = formatVbtForPlayer({ method: "fixed_set_vl", velocityLossPct: 20 } as never, "EN");
    const block = { vbt };
    const squat = rxForTodayItem({ name: "Back squat", sets: 5, reps: "3", rest: "3 min", method: "85% 1RM / RPE 8", exerciseId: "ex_back_squat", vlCap: 20 }, line("Back squat"), block)!;
    expect(squat.barSpeed).toEqual([{ key: "coach", line: { text: { en: vbt.headline, is: vbt.headline }, source: "session" } }]);
    const row = rxForTodayItem({ name: "Single-arm DB row", sets: 3, reps: "8 each side", rest: "75s", method: "RPE 8", exerciseId: "ex_db_row" }, line("Single-arm DB row"), block)!;
    expect(row.barSpeed).toEqual([]);
  });
});

describe("the coach's /coach/strength card shows the player's table", () => {
  it("rxForPrescribed = rxForTodayItem on the item the send writes, for every library dose, with and without a bar-speed rule", () => {
    const vbt = formatVbtForPlayer({ method: "fixed_set_vl", velocityLossPct: 20 } as never, "EN");
    for (const e of EXERCISE_LIBRARY) for (const [md, dose] of Object.entries(e.defaultDosing)) {
      if (!dose) continue;
      const ex = { exerciseId: e.id, nameEN: e.nameEN, nameIS: e.nameIS, category: e.category, dose };
      const block = { id: "b", titleEN: "B", titleIS: "B", type: "COMPOUND", exercises: [ex] };
      for (const withVbt of [false, true]) {
        const session = { blocks: [block], ...(withVbt ? { blockEmphasis: { quality: { en: "Q", is: "Q" }, intent: { en: "I", is: "I" }, vbt: { method: "fixed_set_vl", velocityLossPct: 20 } } } : {}) };
        const sent = strengthSessionToTodayStructure(session as never, "EN")[0];
        const player = rxForTodayItem(sent.items[0], line(sent.items[0].name, `${dose.sets}×${dose.reps}`), sent);
        const coach = rxForPrescribed(ex as never, sent.vbt ? vbt : null, "EN");
        expect(coach, `${e.id} ${md} vbt=${withVbt}`).toEqual(player);
      }
    }
  });
});

describe("toTodayStructure carries the speed-loss stop", () => {
  it("vlCap rides on the item when the dose has one", () => {
    const session = {
      blocks: [
        {
          id: "b1",
          titleEN: "Strength",
          titleIS: "Styrkur",
          type: "COMPOUND",
          exercises: [
            { exerciseId: "ex_back_squat", nameEN: "Back squat", nameIS: "Bak-hnébeygja", category: "COMPOUND_STRENGTH", dose: { sets: 5, reps: "3", intensity: "85% 1RM / RPE 8", rest: "3 min", velocityLossCap: 20 } },
            { exerciseId: "ex_db_row", nameEN: "Single-arm DB row", nameIS: "Einhenda róður", category: "UPPER_BODY", dose: { sets: 3, reps: "8", intensity: "RPE 8", rest: "75s" } },
          ],
        },
      ],
    };
    const out = strengthSessionToTodayStructure(session as never, "EN");
    expect(out[0].items[0].vlCap).toBe(20);
    expect(out[0].items[1].vlCap).toBeUndefined();
  });
});
