import { describe, it, expect } from "vitest";
import { buildBlockEnough, buildWeekEnough, type ActualDay, type PlanDay, type PlanWeek, type WeekKey } from "@/lib/micropulse/sessionEnough/weekEnough";

// A one-match in-season week as the calendar lays it out: Mon off, Tue MD-4 Mechanical, Wed MD-3 Locomotive,
// Thu off, Fri MD-1 Activation, Sat match, Sun off.
const MON = "2026-10-05";
const day = (type: string, f = 1): PlanDay => (type === "rest" || type === "match"
  ? { type, accel: null, decel: null, cod: null, hsr: type === "match" ? 900 : null, load: null, dist: null }
  : { type, accel: 50 * f, decel: 80 * f, cod: 300 * f, hsr: 300 * f, load: 400 * f, dist: 5000 * f });
const week = (over: Partial<Record<number, PlanDay>> = {}, ws = MON): PlanWeek => ({
  weekStart: ws,
  days: [day("rest"), day("mechanical"), day("locomotive"), day("rest"), day("activation"), day("match"), day("rest")].map((d, i) => over[i] ?? d),
});
const iso = (i: number, ws = MON) => { const d = new Date(`${ws}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); };

/** A day where the squad median did `f` × the plan (per key overrides as × the plan too). */
function done(i: number, f = 1, over: Partial<Record<WeekKey, number | null>> = {}, extra: Partial<ActualDay> = {}, ws = MON): ActualDay {
  const pd = week({}, ws).days[i];
  const plan: Record<WeekKey, number | null> = { imaAccel: pd.accel ?? 50, imaDecel: pd.decel ?? 80, imaCod: pd.cod ?? 300, hsr: pd.hsr ?? 300, load: pd.load ?? 400, dist: pd.dist ?? 5000 };
  const med = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, k in over ? (over[k as WeekKey] == null ? null : (v ?? 0) * over[k as WeekKey]!) : (v ?? 0) * f])) as Record<WeekKey, number | null>;
  return { date: iso(i, ws), isMatch: false, players: 18, med, nonStarters: 8, medNonStarter: med, ...extra };
}
const allDone = (f = 1) => [done(1, f), done(2, f), done(4, f)];
const AFTER = "2026-10-12";

describe("buildWeekEnough", () => {
  it("says YES when the sessions hit their plan", () => {
    const r = buildWeekEnough({ week: week(), actual: allDone(1), today: AFTER });
    expect(r.state).toBe("ok");
    expect(r.verdict).toBe("yes");
    expect(r.inProgress).toBe(false);
    expect(r.sessions).toEqual({ planned: 3, elapsed: 3, withData: 3, extra: 0 });
    expect(r.vars.find((v) => v.key === "imaAccel")).toMatchObject({ planned: 150, actual: 150, pct: 100, status: "on" });
    expect(r.counterfactual).toBeNull();
    expect(r.confidence.level).toBe("high");
  });

  it("says MOSTLY when one movement type is at 70%, and names it with what would have flipped it", () => {
    const r = buildWeekEnough({ week: week(), actual: [done(1, 1, { hsr: 0.7 }), done(2, 1, { hsr: 0.7 }), done(4, 1, { hsr: 0.7 })], today: AFTER });
    expect(r.verdict).toBe("mostly");
    expect(r.headline.en).toBe("Mostly: short on high-speed running.");
    expect(r.facts[0].en).toContain("high-speed running 70%");
    // 900 m planned × 0.85 − 630 m done = 135 m.
    expect(r.counterfactual?.en).toMatch(/^~135 more m of high-speed running/);
    expect(r.counterfactual?.en).toContain("made this a yes");
  });

  it("says NO when most movement types are short", () => {
    const r = buildWeekEnough({ week: week(), actual: allDone(0.7), today: AFTER });
    expect(r.verdict).toBe("no");
    expect(r.headline.is).toMatch(/^Nei: vantar upp á/);
  });

  it("names the day that pulled the week down", () => {
    const r = buildWeekEnough({ week: week(), actual: [done(1, 0.5), done(2, 1.1), done(4, 1.1)], today: AFTER });
    expect(r.facts.some((f) => f.en === "Tue (Mechanical) was furthest under: 50% of its plan.")).toBe(true);
  });

  it("leaves a planned session without data out (never a 0) and lowers confidence", () => {
    const r = buildWeekEnough({ week: week(), actual: [done(1), done(4)], today: AFTER });
    expect(r.verdict).toBe("yes");
    expect(r.days[2].role).toBe("no_data");
    expect(r.vars.find((v) => v.key === "imaAccel")?.planned).toBe(100);
    expect(r.facts.at(-1)?.en).toContain("no data from Wed, left out");
    expect(r.confidence.level).toBe("moderate");
  });

  it("indoors without GPS leaves out only high-speed running for that day", () => {
    const r = buildWeekEnough({ week: week(), actual: [done(1, 1, { hsr: null }), done(2), done(4)], today: AFTER });
    expect(r.days[1].noGps).toBe(true);
    expect(r.vars.find((v) => v.key === "hsr")?.planned).toBe(600);
    expect(r.vars.find((v) => v.key === "imaCod")?.planned).toBe(900);
    expect(r.facts.at(-1)?.en).toContain("high-speed running not measured on Tue (no GPS)");
  });

  it("on a top-up day compares the players who did not start, and skips it when too few", () => {
    const w = week({ 1: day("topup") });
    const own = done(1, 1); const starters = { ...own, med: { ...own.med, imaAccel: 5 } };
    const r = buildWeekEnough({ week: w, actual: [starters, done(2), done(4)], today: AFTER });
    expect(r.days[1].byKey.imaAccel.actual).toBe(50);
    const few = buildWeekEnough({ week: w, actual: [{ ...starters, nonStarters: 2 }, done(2), done(4)], today: AFTER });
    expect(few.days[1].role).toBe("topup_few");
    expect(few.vars.find((v) => v.key === "imaAccel")?.planned).toBe(100);
  });

  it("counts an unplanned session on a day off and names it", () => {
    const r = buildWeekEnough({ week: week(), actual: [...allDone(1), done(3)], today: AFTER });
    expect(r.days[3].role).toBe("extra");
    expect(r.sessions.extra).toBe(1);
    expect(r.vars.find((v) => v.key === "imaAccel")?.actual).toBe(200);
    expect(r.overNote?.en).toMatch(/^Above plan:/);
    expect(r.facts.at(-1)?.en).toContain("extra session on Thu (planned off), counted");
  });

  it("mid-week compares only the days that have passed", () => {
    const r = buildWeekEnough({ week: week(), actual: [done(1)], today: iso(2) });
    expect(r.inProgress).toBe(true);
    expect(r.days[2].role).toBe("upcoming");
    expect(r.vars.find((v) => v.key === "imaAccel")?.planned).toBe(50);
    expect(r.headline.en).toBe("So far yes: on plan after 1 of 3 sessions.");
    // Today counts once its data is in.
    const withToday = buildWeekEnough({ week: week(), actual: [done(1), done(2)], today: iso(2) });
    expect(withToday.days[2].role).toBe("counted");
  });

  it("judges a light week against its own (smaller) plan", () => {
    const light: PlanWeek = { ...week({ 1: day("mechanical", 0.6), 2: day("locomotive", 0.6), 4: day("activation", 0.6) }), isLight: true };
    const actual = [1, 2, 4].map((i) => done(i, 0.6));
    expect(buildWeekEnough({ week: light, actual, today: AFTER }).verdict).toBe("yes");
    expect(buildWeekEnough({ week: week(), actual, today: AFTER }).verdict).toBe("no");
  });

  it("says so before the week starts and when nothing is planned", () => {
    expect(buildWeekEnough({ week: week(), actual: [], today: MON }).state).toBe("not_started");
    expect(buildWeekEnough({ week: week({ 1: day("rest"), 2: day("rest"), 4: day("rest") }), actual: [], today: AFTER }).state).toBe("no_plan");
    expect(buildWeekEnough({ week: week(), actual: [], today: AFTER }).state).toBe("no_data");
  });

  it("never counts a match day", () => {
    const r = buildWeekEnough({ week: week(), actual: [...allDone(1), { ...done(5), isMatch: true }], today: AFTER });
    expect(r.days[5].role).toBe("match");
    expect(r.vars.find((v) => v.key === "hsr")?.planned).toBe(900);
  });
});

describe("buildBlockEnough", () => {
  const W2 = "2026-10-12", W3 = "2026-10-19";
  it("counts the finished weeks that hit the plan and names the first that didn't", () => {
    const w1 = buildWeekEnough({ week: week(), actual: allDone(1), today: "2026-10-21" });
    const w2 = buildWeekEnough({ week: week({}, W2), actual: [1, 2, 4].map((i) => done(i, 1, { imaDecel: 0.6, imaAccel: 0.7 }, {}, W2)), today: "2026-10-21" });
    const w3 = buildWeekEnough({ week: week({}, W3), actual: [done(1, 1, {}, {}, W3)], today: "2026-10-21" });
    const b = buildBlockEnough([{ weekNo: 1, enough: w1 }, { weekNo: 2, enough: w2 }, { weekNo: 3, enough: w3 }]);
    expect(b?.finished).toBe(2);
    expect(b?.hit).toBe(1);
    expect(b?.line.en).toBe("1 of 2 finished weeks hit the plan; week 2 was short on accelerations and braking; week 3 so far on plan.");
    expect(b?.weeks.map((w) => w.verdict)).toEqual(["yes", "mostly", "yes"]);
    expect(b?.vars.find((v) => v.key === "imaAccel")?.planned).toBe(350);
  });

  it("is null before any week has a verdict", () => {
    expect(buildBlockEnough([{ weekNo: 1, enough: buildWeekEnough({ week: week(), actual: [], today: MON }) }])).toBeNull();
  });
});
