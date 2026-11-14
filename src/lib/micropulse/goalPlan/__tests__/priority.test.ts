import { describe, expect, it } from "vitest";
import {
  band3Per90,
  coachPriorityText,
  formatValue,
  goalPriority,
  isPrioritySnapshot,
  peakThirdBest,
  priorityReads,
  priorityValues,
  prioritySnapshot,
  teamEffortMetric,
  type PriorityGpsRow,
  type PriorityPlayerRaw,
  type PriorityTeam,
} from "../priority";
import type { MetricSample } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { GoalQuality } from "../types";
import { addDays } from "../today";

const TODAY = "2026-11-14";

const sample = (value: number, n = 20): MetricSample => ({ value, unit: "", source: "GPS", date: TODAY, sampleSize: n });

/** 8 outfield players in one position (CB), values rising with the index. Player "me" is set per test. */
function team(me: Partial<Record<GoalQuality, number>>, over: { position?: string; sport?: string; n?: number } = {}): PriorityTeam {
  const others = Array.from({ length: over.n ?? 8 }, (_, i) => ({
    playerId: `p${i}`,
    position: "CB",
    values: { top_speed: sample(30 + i * 0.4), acceleration: sample(4 + i * 0.5), braking: sample(4 + i * 0.5), jump: sample(34 + i, 3) },
  }));
  const mine: Partial<Record<GoalQuality, MetricSample>> = {};
  for (const [q, v] of Object.entries(me) as [GoalQuality, number][]) mine[q] = sample(v, q === "jump" ? 3 : 20);
  return { sport: over.sport ?? "football", metric: "band3", players: [...others, { playerId: "me", position: over.position ?? "CB", values: mine }] };
}

describe("goal priority rule (lota 7)", () => {
  it("suggests a clear weakness when the pick is not one", () => {
    const reads = priorityReads(team({ top_speed: 33, acceleration: 3.5, braking: 6, jump: 38 }), "me")!;
    const p = goalPriority(reads, "top_speed", "band3");
    expect(p.reason).toBe("suggest");
    expect(p.suggested).toBe("acceleration");
    expect(p.view?.verdict.is).toBe("Gögnin þín benda frekar á hröðun.");
    expect(p.view?.switchLabel.is).toBe("Skipta í hröðun");
    expect(p.view?.keepLabel.is).toBe("Halda hámarkshraða");
    expect(p.view?.facts[0].is).toMatch(/^Harðar hraðaaukningar: 3,5 á 90 mín, í neðsta þriðjungi leikmanna í þinni stöðu\.$/);
    expect(p.view?.facts[1].en).toMatch(/in the top half\.$/);
    expect(p.view?.facts[1].is).toMatch(/í efri helmingnum\.$/);
    expect(p.view?.details.join(" ")).not.toMatch(/p\d/); // no other player named
    expect(p.view?.details[2].is).toMatch(/^Borið saman við 8 aðra leikmenn í þinni stöðu í liðinu/);
    expect(p.view?.details[2].en).toMatch(/^Compared with the 8 other players in your position/);
  });

  it("no suggestion when the pick is itself a weakness", () => {
    const reads = priorityReads(team({ top_speed: 29, acceleration: 3.5, braking: 6, jump: 38 }), "me")!;
    expect(goalPriority(reads, "top_speed", "band3")).toMatchObject({ reason: "chosen_is_weak", suggested: null, view: null });
  });

  it("no suggestion when the pick is above the bottom third but below the middle (coach's mark: top half)", () => {
    const reads = priorityReads(team({ top_speed: 31, acceleration: 3.5, braking: 6, jump: 38 }), "me")!;
    expect(reads.find((r) => r.quality === "top_speed")?.pctl).toBe(38);
    expect(goalPriority(reads, "top_speed", "band3")).toMatchObject({ reason: "chosen_below_middle", suggested: null });
  });

  it("no suggestion without a clear weakness elsewhere", () => {
    const reads = priorityReads(team({ top_speed: 32, acceleration: 6, braking: 6, jump: 38 }), "me")!;
    expect(goalPriority(reads, "top_speed", "band3").reason).toBe("no_clear_weakness");
  });

  it("no suggestion when the pick has no number", () => {
    const reads = priorityReads(team({ acceleration: 3.5, braking: 6 }), "me")!;
    expect(goalPriority(reads, "jump", "band3").reason).toBe("no_data");
  });

  it("the lower of two weaknesses wins", () => {
    const reads = priorityReads(team({ top_speed: 33, acceleration: 4.2, braking: 3.0, jump: 38 }), "me")!;
    expect(goalPriority(reads, "top_speed", "band3").suggested).toBe("braking");
  });

  it("a blocked quality is never suggested (goalkeeper / basketball top speed)", () => {
    const reads = priorityReads(team({ top_speed: 20, acceleration: 6, braking: 6, jump: 38 }), "me", { top_speed: true })!;
    expect(goalPriority(reads, "jump", "band3").reason).toBe("no_clear_weakness");
    expect(goalPriority(reads, "top_speed", "band3").reason).toBe("blocked");
  });

  it("low confidence (thin evidence) is never suggested", () => {
    const t = team({ top_speed: 33, acceleration: 3.5, braking: 6, jump: 38 });
    t.players.find((p) => p.playerId === "me")!.values.acceleration = sample(3.5, 1);
    expect(goalPriority(priorityReads(t, "me")!, "top_speed", "band3").reason).toBe("no_clear_weakness");
  });

  it("goalkeepers are compared only with goalkeepers; too few → no read", () => {
    const t = team({ top_speed: 25, acceleration: 2, braking: 2, jump: 30 }, { position: "GK" });
    const reads = priorityReads(t, "me")!;
    expect(reads.every((r) => r.pctl == null)).toBe(true);
    expect(goalPriority(reads, "jump", "band3").reason).toBe("no_data");
  });

  it("fewer than 4 in the position → the whole team, and the words say so", () => {
    const t = team({ top_speed: 33, acceleration: 3.5, braking: 6, jump: 38 }, { position: "CF" });
    const p = goalPriority(priorityReads(t, "me")!, "top_speed", "band3");
    expect(p.reads.find((r) => r.quality === "acceleration")?.benchmark).toBe("squad");
    expect(p.view?.facts[0].en).toMatch(/players on your team/);
    expect(p.view?.details.some((d) => /fewer than 4 share your position/.test(d.en))).toBe(true);
  });

  it("formats numbers per language and unit", () => {
    expect(formatValue("top_speed", "band3", 32.14)).toEqual({ en: "32.1 km/h", is: "32,1 km/klst" });
    expect(formatValue("braking", "peak", 4.5)).toEqual({ en: "4.5 m/s²", is: "4,5 m/s²" });
    expect(formatValue("acceleration", "band3", 2)).toEqual({ en: "2.0 per 90 min", is: "2,0 á 90 mín" });
  });

  it("words carry no colour or sport-science terms in the primary view", () => {
    const reads = priorityReads(team({ top_speed: 33, acceleration: 3.5, braking: 6, jump: 38 }), "me")!;
    const v = goalPriority(reads, "top_speed", "band3").view!;
    const primary = [v.verdict, v.sub, ...v.facts, v.switchLabel, v.keepLabel].flatMap((b) => [b.en, b.is]).join(" ");
    expect(primary).not.toMatch(/green|yellow|red|grænn|gulur|rauður|IMA|ACWR|band 3|percentile|hundraðsmark/i);
    expect(v.details.map((d) => d.en).join(" ")).toMatch(/not AI/);
  });
});

describe("numbers from raw rows", () => {
  const row = (date: string, over: Partial<PriorityGpsRow> = {}): PriorityGpsRow => ({
    date, maxVelocity: null, maxVel: null, playerLoad: 500, totalDistance: 5000, minutes: 60,
    accelB3: null, decelB3: null, accelPeak: null, decelPeak: null, ...over,
  });

  it("band 3 per 90 min: GPS time 20–150 min, days over 40 dropped, best row per date", () => {
    const rows = [
      row(addDays(TODAY, -1), { accelB3: 3, minutes: 90 }),
      row(addDays(TODAY, -1), { accelB3: 1, minutes: 90 }), // same date, fewer → ignored
      row(addDays(TODAY, -2), { accelB3: 6, minutes: 90 }),
      row(addDays(TODAY, -3), { accelB3: 0, minutes: 90 }), // 0 is a real day
      row(addDays(TODAY, -4), { accelB3: 80, minutes: 90 }), // fault
      row(addDays(TODAY, -5), { accelB3: 5, minutes: 10 }), // stub
      row(addDays(TODAY, -6), { accelB3: 5, minutes: 300 }), // all-day file
      row(addDays(TODAY, -400), { accelB3: 9, minutes: 90 }), // older than 12 months
    ];
    expect(band3Per90(rows, "accel", TODAY)).toEqual({ value: 3, days: 3, date: addDays(TODAY, -1) });
    expect(band3Per90(rows.slice(0, 2), "accel", TODAY)).toBeNull(); // fewer than 3 days
  });

  it("peak: 3rd-highest day, needs 10 days, spikes dropped", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(addDays(TODAY, -i - 1), { decelPeak: -(3 + i * 0.1) }));
    rows.push(row(addDays(TODAY, -20), { decelPeak: 15 })); // spike
    expect(peakThirdBest(rows, "decel", TODAY)?.value).toBe(3.7);
    expect(peakThirdBest(rows.slice(0, 9), "decel", TODAY)).toBeNull();
  });

  it("team metric: band 3 if anyone has it, else peak; values never mix", () => {
    const withB3: PriorityPlayerRaw = { playerId: "a", position: "CB", gps: [row(TODAY, { accelB3: 0 })], sprintTestKmh: null, jumps: [] };
    const peakOnly: PriorityPlayerRaw = { playerId: "b", position: "CB", gps: [row(TODAY, { accelPeak: 4 })], sprintTestKmh: null, jumps: [] };
    expect(teamEffortMetric([withB3, peakOnly])).toBe("band3");
    expect(teamEffortMetric([peakOnly])).toBe("peak");
    const many = Array.from({ length: 12 }, (_, i) => row(addDays(TODAY, -i), { accelPeak: 4 }));
    expect(priorityValues({ ...peakOnly, gps: many }, TODAY, "band3").acceleration).toBeUndefined();
    expect(priorityValues({ ...peakOnly, gps: many }, TODAY, "peak").acceleration?.value).toBe(4);
  });

  it("jump: latest test within 12 months", () => {
    const p: PriorityPlayerRaw = {
      playerId: "a", position: "CB", gps: [], sprintTestKmh: null,
      jumps: [{ date: addDays(TODAY, -30), cm: 36.04, trials: 3 }, { date: addDays(TODAY, -10), cm: 38.26, trials: 2 }, { date: addDays(TODAY, -400), cm: 45, trials: 3 }],
    };
    expect(priorityValues(p, TODAY, "band3").jump).toMatchObject({ value: 38.3, sampleSize: 2 });
    expect(priorityValues({ ...p, jumps: [p.jumps[2]] }, TODAY, "band3").jump).toBeUndefined();
  });
});

describe("what the coach sees", () => {
  const reads = priorityReads(team({ top_speed: 33, acceleration: 3.5, braking: 6, jump: 38 }), "me")!;

  it("kept: the pick had a suggestion and the player sent it anyway", () => {
    const s = prioritySnapshot(reads, "band3", "top_speed", null)!;
    expect(s).toMatchObject({ firstPick: "top_speed", suggested: "acceleration", outcome: "kept" });
    expect(isPrioritySnapshot(s)).toBe(true);
    const t = coachPriorityText(s);
    expect(t.line.en).toMatch(/^MicroPulse suggested acceleration \(\d+(st|nd|rd|th) percentile in position\)\. The player kept top speed \(\d+(st|nd|rd|th)\)\.$/);
    expect(t.line.is).toMatch(/^MicroPulse stakk upp á hröðun \(\d+\. hundraðsmark í stöðu\)\. Leikmaðurinn hélt hámarkshraða \(\d+\.\)\.$/);
    expect(t.details).toHaveLength(5);
    expect(t.details[0].is).toMatch(/hundraðsmark af 9 leikmönnum í stöðu$/);
    expect(t.details[0].en).toMatch(/percentile of 9 players in position$/);
  });

  it("switched: counts only when the switch went to the suggested quality", () => {
    expect(prioritySnapshot(reads, "band3", "acceleration", "top_speed")).toMatchObject({ firstPick: "top_speed", outcome: "switched" });
    expect(coachPriorityText(prioritySnapshot(reads, "band3", "acceleration", "top_speed")!).line.is).toMatch(/Leikmaðurinn valdi fyrst hámarkshraða \(\d+\.\) og skipti\.$/);
    // "Switched" to something else: judged on what was sent (jump has a suggestion too → kept).
    expect(prioritySnapshot(reads, "band3", "jump", "top_speed")).toMatchObject({ firstPick: "jump", outcome: "kept" });
  });

  it("nothing stored when there was nothing to suggest", () => {
    expect(prioritySnapshot(reads, "band3", "acceleration", null)).toBeNull();
    expect(prioritySnapshot(null, "band3", "top_speed", null)).toBeNull();
    expect(isPrioritySnapshot({ v: 2 })).toBe(false);
    expect(isPrioritySnapshot(null)).toBe(false);
  });
});
