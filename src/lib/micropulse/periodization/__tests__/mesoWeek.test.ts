import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCalendarBlock, type MatchUnitAbs } from "../index";
import { caltypeFromFocus, CALTYPE_FOCUS_LABEL, mesoBlockCalendar, mesoSkeleton, planDayFromCal, planDaysFromCalWeek, skeletonSets } from "../mesoWeek";

const unit: MatchUnitAbs = { dist: 10000, hsr: 800, load: 1000, accdec: 200, accHiEff: 40, decHiEff: 50, stride: 300, dirFwd: 0.5, dirBack: 0.2, dirLat: 0.3, rhie: null, symmetry: null, metPower: null };
const fixtures = ["2026-05-02", "2026-05-09", "2026-05-16", "2026-05-23", "2026-05-30"];
const common = { unit, scopeName: "__team__", baseOverloadPct: 100, stepPct: 5, goal: "accum" as const, deload: { weekStart: null, light: true }, allFixtures: fixtures, noAutoMatch: true };

test("planDayFromCal: the week_plans row Meso writes (match → GAME, rest keeps its MD tag, training = MD + stimulus)", () => {
  const lbl = (en: string) => ({ en, is: en });
  assert.deepEqual(planDayFromCal({ type: "match", md: "MD", label: lbl("Match") }, "2026-05-04", 5),
    { day_index: 6, day_date: "2026-05-09", day_type: "GAME", focus: null, day_intent: "GAME" });
  assert.deepEqual(planDayFromCal({ type: "rest", md: "MD+2", label: lbl("Off") }, "2026-05-04", 0),
    { day_index: 1, day_date: "2026-05-04", day_type: "OFF", focus: "MD+2", day_intent: "OFF" });
  assert.deepEqual(planDayFromCal({ type: "mechanical", md: "MD-4", label: lbl("Mechanical") }, "2026-05-04", 1),
    { day_index: 2, day_date: "2026-05-05", day_type: "TRAIN", focus: "MD-4 Mechanical", day_intent: null });
  // The pre-season day edit: the picked day takes the chosen stimulus, or goes off.
  assert.equal(planDayFromCal({ type: "mixed", md: "MD-3", label: lbl("Mixed") }, "2026-05-04", 2, { label: CALTYPE_FOCUS_LABEL.locomotive }).focus, "MD-3 Locomotive");
  assert.equal(planDayFromCal({ type: "mixed", md: "MD-3", label: lbl("Mixed") }, "2026-05-04", 2, { rest: true }).day_type, "OFF");
  // The focus words read back to the same stimulus.
  for (const [ct, word] of Object.entries(CALTYPE_FOCUS_LABEL)) assert.equal(caltypeFromFocus(`MD-2 ${word}`), ct);
});

test("mesoSkeleton: fixtures are the only games, a saved day reads back, a break forces off", () => {
  const sk = mesoSkeleton({ ...common, startDate: "2026-05-04", numWeeks: 6, savedPlans: { "2026-05-05": { dayType: "OFF", focus: "MD-4" }, "2026-05-13": { dayType: "TRAIN", focus: "MD-3 Locomotive" } }, teamBreaks: [{ start_date: "2026-05-20", end_date: "2026-05-21" }] });
  const matches = Object.entries(sk.days).filter(([, v]) => v === "match").map(([k]) => k).sort();
  assert.deepEqual(matches, ["2026-05-09", "2026-05-16", "2026-05-23", "2026-05-30"]);
  assert.equal(sk.days["2026-05-05"], "off");
  assert.equal(sk.days["2026-05-13"], "session");
  assert.equal(sk.types["2026-05-13"], "locomotive");
  assert.equal(sk.days["2026-05-20"], "off");
  assert.equal(sk.days["2026-05-21"], "off");
  // A week with no fixture gets no game (noAutoMatch).
  assert.ok(!["2026-06-06", "2026-06-07"].some((d) => sk.days[d] === "match"));
});

test("mesoBlockCalendar = the Meso page's calendar (skeleton → buildCalendarBlock), and its weeks map to week_plans days", () => {
  const seed = { ...common, startDate: "2026-05-04", numWeeks: 6 };
  const cal = mesoBlockCalendar({ seed, savedPlans: {}, teamBreaks: [], calendar: { ...common, startDate: "2026-05-04", numWeeks: 4 } });
  const sk = mesoSkeleton({ ...seed, savedPlans: {}, teamBreaks: [] });
  const ref = buildCalendarBlock({ ...common, startDate: "2026-05-04", numWeeks: 4, ...skeletonSets(sk.days), typeOverrides: sk.types });
  assert.deepEqual(cal.weeks.map((w) => w.days.map((d) => d.type)), ref.weeks.map((w) => w.days.map((d) => d.type)));
  const days = planDaysFromCalWeek(cal.weeks[0]);
  assert.equal(days.length, 7);
  assert.equal(days[5].day_date, "2026-05-09");
  assert.equal(days[5].day_type, "GAME");
  assert.ok(days.every((d) => d.day_intent === null || d.day_intent === "GAME" || d.day_intent === "OFF"));
});
