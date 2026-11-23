/**
 * "E" (2026-11-18): the weekday plan (Mon strength, Wed power, …) against the week actually set up. Breiðablik's
 * week of 23 Nov trains Tue / Thu / Sat / Sun with Mon and Wed off: the strength and power days were silently lost.
 * The check names it and offers a move for that week only; the weekday plan for other weeks is untouched.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applySuggestions, checkNoMatchWeeks, movesToShow, noMatchNearby } from "../noMatchCheck";
import { noMatchDayFor, noMatchWeekToStore, sanitizeNoMatchWeek, type NoMatchWeek } from "../structures";

// Breiðablik, read 2026-11-18 (week_plans + team_strength_palette.no_match_week; no match_schedule rows).
const PLAN: NoMatchWeek = { mon: "strength", wed: "power", thu: "light", sat: "strength", sun: "rest" };
const DAYS = [
  ["2026-11-23", "OFF"], ["2026-11-24", "TRAIN"], ["2026-11-25", "OFF"], ["2026-11-26", "TRAIN"],
  ["2026-11-27", "OFF"], ["2026-11-28", "TRAIN"], ["2026-11-29", "TRAIN"],
  ["2026-11-30", "TRAIN"], ["2026-12-01", "TRAIN"], ["2026-12-02", "TRAIN"], ["2026-12-03", "OFF"],
  ["2026-12-04", "TRAIN"], ["2026-12-05", "GAME"], ["2026-12-06", "OFF"],
].map(([date, dayType]) => ({ date, dayType }));

describe("checkNoMatchWeeks", () => {
  const issues = checkNoMatchWeeks({ days: DAYS, gameDates: [], plan: PLAN });

  it("names the lost days of the week of 23 Nov, in plain words", () => {
    expect(issues.map((i) => i.weekStart)).toEqual(["2026-11-23"]);
    const w = issues[0];
    expect(w.lost.map((l) => [l.weekday, l.kind])).toEqual([["mon", "strength"], ["wed", "power"]]);
    expect(w.headline.en).toBe("Week of 23 Nov: Mon (strength day) and Wed (power day) are days off, so those sessions don't happen.");
    expect(w.headline.is).toBe("Vika 23. nóv: Mán (styrktardagur) og Mið (sprengikraftsdagur) eru frídagar, svo þær æfingar falla niður.");
    expect(w.facts.map((f) => f.en)).toEqual([
      "Training days that week: Tue, Thu, Sat and Sun.",
      "Tue has no day type in the weekday plan, so it builds as a light day.",
      "The week still has a strength day on Sat.",
    ]);
  });

  it("suggests the nearest free days: strength Mon → Tue, power Wed → Thu (a light day)", () => {
    expect(issues[0].suggestions).toEqual([
      { kind: "strength", from: "mon", to: "tue" },
      { kind: "power", from: "wed", to: "thu" },
    ]);
  });

  it("the week before a match is not a 'no match' week (the engine's 4 back / 5 ahead window)", () => {
    expect(noMatchNearby("2026-11-30", ["2026-12-05"])).toBe(false);
    expect(noMatchNearby("2026-11-29", ["2026-12-05"])).toBe(true);
    expect(noMatchNearby("2026-12-09", ["2026-12-05"])).toBe(false);
  });

  it("days not set up yet are not judged; a rest / light day off is not a loss", () => {
    expect(checkNoMatchWeeks({ days: [{ date: "2026-11-23", dayType: null }], gameDates: [], plan: PLAN })).toEqual([]);
    expect(checkNoMatchWeeks({ days: [{ date: "2026-11-26", dayType: "OFF" }, { date: "2026-11-29", dayType: "OFF" }], gameDates: [], plan: PLAN })).toEqual([]);
  });

  it("after the move the week is fine, and the move is listed with the days it sets", () => {
    const moved: NoMatchWeek = { ...PLAN, weeks: { "2026-11-23": applySuggestions(undefined, issues[0].suggestions) } };
    expect(checkNoMatchWeeks({ days: DAYS, gameDates: [], plan: moved })).toEqual([]);
    expect(movesToShow(moved, "2026-11-16").map((m) => m.line.en)).toEqual(["Week of 23 Nov, this week only: Tue strength day and Thu power day."]);
  });
});

describe("one-week moves", () => {
  const plan = sanitizeNoMatchWeek({ ...PLAN, since: "2026-11-17", weeks: { "2026-11-23": { mon: "rest", tue: "strength", wed: "rest", thu: "power" }, "2026-11-24": { tue: "power" }, x: 1 } });
  it("win for that week only; other weeks keep the weekday plan", () => {
    expect(noMatchDayFor("2026-11-24", plan)).toBe("strength");
    expect(noMatchDayFor("2026-11-26", plan)).toBe("power");
    expect(noMatchDayFor("2026-11-23", plan)).toBe("rest");
    expect(noMatchDayFor("2026-12-07", plan)).toBe("strength"); // a Monday, another week
    expect(noMatchDayFor("2026-12-08", plan)).toBeNull();
    expect(Object.keys(plan.weeks ?? {})).toEqual(["2026-11-23"]); // a key that isn't a Monday is dropped
  });
  it("saving the weekday plan never drops or overwrites a saved move, and old weeks are pruned", () => {
    const stored = { ...PLAN, since: "2026-11-17", weeks: { "2026-11-23": { tue: "strength" }, "2026-10-05": { tue: "power" } } };
    const out = noMatchWeekToStore({ ...PLAN, tue: "light", weeks: { "2026-11-23": { tue: "power" } } }, stored, "2026-11-18");
    expect(out.weeks).toEqual({ "2026-11-23": { tue: "strength" } });
    expect(out.tue).toBe("light");
    expect(out.since).toBe("2026-11-18");
    expect(noMatchWeekToStore(PLAN, stored, "2026-11-18").since).toBe("2026-11-17"); // days unchanged → since kept
  });
});

describe("wiring", () => {
  const root = join(__dirname, "../../../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("shown under the weekday plan and on Week setup; the page file is not touched", () => {
    expect(read("src/components/coach/NoMatchWeekEditor.tsx")).toContain("<NoMatchWeekCheck lang={lang} from={todayIso} days={28} plan={value} />");
    expect(read("src/components/coach/WeekSetupView.tsx")).toMatch(/<NoMatchWeekCheck lang=\{isIS \? "IS" : "EN"\} from=\{weekStart\} days=\{7\}/);
  });
  it("a move changes only that week's entry; Standard mode shows nothing", () => {
    const route = read("src/app/api/coach/team/no-match-week/route.ts");
    expect(route).toMatch(/if \(days\) weeks\[weekStart\] = days;/);
    expect(route).toMatch(/const next: Record<string, unknown> = \{ \.\.\.base \};/);
    expect(read("src/components/coach/NoMatchWeekCheck.tsx")).toMatch(/data\.mode === "standard"\) return null/);
  });
  it("goal plans use a moved day even in a week already under way", () => {
    expect(read("src/lib/micropulse/goalPlan/today.ts")).toMatch(/if \(byKind && !day\.md && \(planLive \|\| moved\)\)/);
  });
});
