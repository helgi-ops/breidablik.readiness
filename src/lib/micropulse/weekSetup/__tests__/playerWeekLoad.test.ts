import { describe, expect, it } from "vitest";
import { buildPlayerWeekLoad, dayTargetNote, roleOfMinutes, type PlayerWeekDay, type PlayerWeekInput } from "@/lib/micropulse/weekSetup/playerWeekLoad";
import { dayShare } from "@/lib/micropulse/sessionEnough";

const MATCH = { pl: 900, distance: 10000, hsr: 800, sprint: 200, accel: 100, decel: 120, cod: 400, fr: 1300, stride: 390, accHi: 40, decHi: 50 };
const BASE = { pl: 400, distance: 5000, hsr: 300, sprint: 60, accel: 70, decel: 80, cod: 250, fr: 500, stride: 250, accHi: 20, decHi: 25 };
const player = (over: Partial<PlayerWeekInput> = {}): PlayerWeekInput => ({ name: "P", position: null, usualMinutes: 90, matchMinutes: 90, baseline: BASE, match: MATCH, ...over });
const mech: PlayerWeekDay = { ratio: 1.2, matchPct: 60, dayType: "mechanical" };
const one = (p: PlayerWeekInput, days: PlayerWeekDay[] = [mech], matchCount = 1) => buildPlayerWeekLoad({ players: [p], days, matchCount }).players[0];

describe("training days", () => {
  it("IMA Acc/Dec/CoD = own match × the day-type standard, the post-training card's target", () => {
    const d = one(player()).perDay[0];
    expect(d.accel).toBe(80);
    expect(d.decel).toBe(96);
    expect(d.cod).toBe(320);
  });
  it("fast running and strides follow the MD-day, as on the card", () => {
    const d = one(player()).perDay[0];
    expect(d.fr).toBe(Math.round(1300 * dayShare("frDistance", 60)));
    expect(d.stride).toBe(Math.round(390 * dayShare("strideHi", 60)));
  });
  it("Player Load and distance stay baseline × the day's planned ratio", () => {
    const d = one(player()).perDay[0];
    expect(d.pl).toBe(480);
    expect(d.distance).toBe(6000);
  });
  it("HSR = own match × the day-type standard, not the player's recent training", () => {
    expect(one(player()).perDay[0].hsr).toBe(200);
    expect(one(player({ baseline: { ...BASE, hsr: 0 } })).perDay[0].hsr).toBe(200);
    expect(one(player(), [{ ratio: 1, matchPct: 60, dayType: "locomotive" }]).perDay[0].hsr).toBe(360);
    expect(one(player(), [{ ratio: 1, matchPct: 60, dayType: null }]).perDay[0].hsr).toBe(300);
  });
  it("sprint and Acc/Dec B2-3 = own match × the day-type standard", () => {
    const d = one(player()).perDay[0];
    expect(d.accHi).toBe(36);
    expect(d.decHi).toBe(40);
    expect(d.sprint).toBe(20);
    const mixed = one(player(), [{ ratio: 1, matchPct: 85, dayType: "mixed" }]).perDay[0];
    expect(mixed.accHi).toBe(26);
    expect(mixed.sprint).toBe(60);
  });
  it("the sprint standard runs the other way from the mechanical one: running day high, mechanical day low", () => {
    const sprintOn = (dayType: PlayerWeekDay["dayType"]) => one(player(), [{ ratio: 1, matchPct: 60, dayType }]).perDay[0].sprint as number;
    expect(sprintOn("locomotive")).toBeGreaterThan(sprintOn("mixed"));
    expect(sprintOn("mixed")).toBeGreaterThan(sprintOn("mechanical"));
  });
  it("it needs no IMA feed: a Lite team gets it too", () => {
    expect(one(player({ match: { ...MATCH, cod: null, fr: null, stride: null } })).perDay[0].accHi).toBe(36);
  });
  it("no match value, no day-type, or a recovering starter fall back to baseline × ratio", () => {
    expect(one(player({ match: { ...MATCH, sprint: 0 } })).perDay[0].sprint).toBe(72);
    expect(one(player(), [{ ratio: 1, matchPct: 60, dayType: null }]).perDay[0].accHi).toBe(20);
    const topup: PlayerWeekDay = { ratio: 0.5, matchPct: 22, dayType: "topup" };
    expect(one(player(), [topup]).perDay[0].accHi).toBe(10);
    expect(one(player({ usualMinutes: 15 }), [topup]).perDay[0].accHi).toBe(28);
  });
  it("no match value on an IMA variable falls back to baseline × ratio", () => {
    const d = one(player({ match: { ...MATCH, accel: null } })).perDay[0];
    expect(d.accel).toBe(84);
    expect(d.decel).toBe(96);
  });
  it("a match value of 0 is missing data, not a target of 0", () => {
    const r = one(player({ match: { ...MATCH, stride: 0 } }));
    expect(r.perDay[0].stride).toBe(300);
    expect(r.perMatch.stride).toBeNull();
  });
  it("an IMA variable with no data anywhere prints nothing, never 0", () => {
    const r = one(player({ baseline: { ...BASE, stride: 0 }, match: { ...MATCH, stride: 0 } }));
    expect(r.perDay[0].stride).toBeNull();
    expect(r.training.stride).toBeNull();
    expect(r.week.stride).toBeNull();
    expect(r.week.accel).not.toBeNull();
  });
  it("a real 0 stays 0 on variables where it can happen, like sprint distance", () => {
    const noDayType: PlayerWeekDay = { ratio: 1, matchPct: 60, dayType: null };
    expect(one(player({ baseline: { ...BASE, sprint: 0 } }), [noDayType]).perDay[0].sprint).toBe(0);
  });
  it("no recent training: the match value × the day's share, not a full match on every day", () => {
    const d = one(player({ baseline: null })).perDay[0];
    expect(d.pl).toBe(540);
    expect(d.distance).toBe(6000);
  });
  it("no recent training and no MD context prints nothing rather than guessing", () => {
    const d = one(player({ baseline: null }), [{ ratio: 1, matchPct: null, dayType: null }]).perDay[0];
    expect(d.pl).toBeNull();
  });
  it("a team with no IMA feed keeps its accelerations on baseline × ratio", () => {
    const d = one(player({ match: { ...MATCH, cod: null, fr: null, stride: null } })).perDay[0];
    expect(d.accel).toBe(84);
  });
  it("no MD context falls back to baseline × ratio", () => {
    const d = one(player(), [{ ratio: 1, matchPct: null, dayType: "mechanical" }]).perDay[0];
    expect(d.accel).toBe(70);
  });
  it("no day-type sizes everything by the MD-day", () => {
    const d = one(player(), [{ ratio: 1, matchPct: 85, dayType: null }]).perDay[0];
    expect(d.decel).toBe(Math.round(120 * dayShare("imaDecel", 85)));
  });
  it("a top-up day: a usual starter stays on the recovery level, others get the top-up standard", () => {
    const topup: PlayerWeekDay = { ratio: 0.5, matchPct: 22, dayType: "topup" };
    expect(one(player(), [topup]).perDay[0].accel).toBe(Math.round(100 * dayShare("imaAccel", 22)));
    expect(one(player({ usualMinutes: 15 }), [topup]).perDay[0].accel).toBe(55);
  });
  it("a rest day is zero", () => {
    const d = one(player(), [{ ratio: 0, matchPct: 60, dayType: "mechanical" }]).perDay[0];
    expect(d.accel).toBe(0);
    expect(d.pl).toBe(0);
  });
});

describe("the week", () => {
  it("week = training + matches, and two matches double the match line", () => {
    const r = one(player(), [mech, { ...mech, ratio: 0.8 }], 2);
    expect(r.training.pl).toBe(480 + 320);
    expect(r.perMatch.pl).toBe(900);
    expect(r.matches.pl).toBe(1800);
    expect(r.week.pl).toBe(2600);
    expect(r.week.accel).toBe(160 + 200);
  });
  it("a low-minute player's match line is scaled by usual minutes", () => {
    const r = one(player({ usualMinutes: 30 }));
    expect(r.perMatch.pl).toBe(300);
    expect(r.role).toBe("rotation");
  });
  it("never above a full match, even for someone who usually plays longer than the reference", () => {
    expect(one(player({ usualMinutes: 96, matchMinutes: 90 })).perMatch.pl).toBe(900);
  });
  it("unknown usual minutes: no match line, and the week is training only", () => {
    const r = one(player({ usualMinutes: null }));
    expect(r.matches.pl).toBeNull();
    expect(r.week.pl).toBe(480);
  });
  it("a week with no match has an empty match contribution", () => {
    const r = one(player(), [mech], 0);
    expect(r.matches.pl).toBe(0);
    expect(r.week.pl).toBe(480);
  });
});

describe("the table", () => {
  it("sorts by the week's Player Load and hides variables nobody has", () => {
    const lite = (name: string, pl: number): PlayerWeekInput => ({
      name, position: null, usualMinutes: 90, matchMinutes: 90,
      baseline: { pl, distance: 5000, hsr: 300 }, match: { pl: 900, distance: 10000, hsr: 800 },
    });
    const t = buildPlayerWeekLoad({ players: [lite("low", 200), lite("high", 500)], days: [mech], matchCount: 1 });
    expect(t.players.map((p) => p.name)).toEqual(["high", "low"]);
    expect(t.vars).toEqual(["pl", "distance", "hsr"]);
  });
  it("injured and rehab players get no plan and are named instead", () => {
    const t = buildPlayerWeekLoad({
      players: [player({ name: "Fit" }), player({ name: "Zed", injuryStatus: "Injured" }), player({ name: "Abe", injuryStatus: "rehabilitation" }), player({ name: "Old", injuryStatus: "cleared" })],
      days: [mech], matchCount: 1,
    });
    expect(t.players.map((p) => p.name).sort()).toEqual(["Fit", "Old"]);
    expect(t.notPlanned).toEqual([{ name: "Abe", status: "rehabilitation" }, { name: "Zed", status: "injured" }]);
  });
  it("a player on a return ramp stays in the plan, flagged", () => {
    const t = buildPlayerWeekLoad({ players: [player({ injuryStatus: "rtp_training" }), player({ name: "Fit" })], days: [mech], matchCount: 1 });
    expect(t.players.map((p) => p.returning).sort()).toEqual([false, true]);
    expect(t.notPlanned).toEqual([]);
  });
  it("drops a player with no data at all", () => {
    const t = buildPlayerWeekLoad({ players: [player(), player({ name: "empty", baseline: null, match: null })], days: [mech], matchCount: 1 });
    expect(t.players).toHaveLength(1);
  });
  it("roles follow usual minutes", () => {
    expect([roleOfMinutes(75), roleOfMinutes(45), roleOfMinutes(10), roleOfMinutes(null)]).toEqual(["starter", "rotation", "low", null]);
  });
  it("the per-day note states the day's target", () => {
    expect(dayTargetNote(mech).en).toContain("about 80%");
    expect(dayTargetNote({ ratio: 1, matchPct: 50, dayType: null }).en).toContain("MD-day");
    expect(dayTargetNote(mech).en).toContain("sprint about 10%");
    expect(dayTargetNote(mech).en).toContain("high-speed running about 25%");
    expect(dayTargetNote(mech, false).en).not.toContain("changes of direction");
    expect(dayTargetNote(mech, false).en).toContain("Hard accelerations about 90%");
    expect(dayTargetNote({ ratio: 1, matchPct: 50, dayType: null }, false).en).toContain("recent training load");
  });
});
