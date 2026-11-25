/**
 * What "Use this plan" writes when the coach accepts a pre-season proposal — computed as a pure plan so
 * the confirm step can show it first ("12 days change in the week plan, 3 tests added") and the route
 * writes exactly that. Safety rules (tested):
 *
 *  - Only days from TODAY onward. The past is never rewritten.
 *  - Never a match day (a fixture, or a day the proposal fixes as a match) — matches belong to Fixtures.
 *  - Never a team break day — the break owns it.
 *  - His choice stands: a day he already saved in Week Setup is kept, unless he changed it in the draft
 *    or chose "start from scratch". A day that already reads the same is not rewritten.
 *  - A week that already has a Week Setup row keeps its system/intensity; only missing rows are created.
 *  - Tests: only the core tests, only in weeks where that test isn't already scheduled, on the first
 *    training day that isn't the day after a match (the protocols ask for ≥48 h rest).
 *
 * The week_plans row shape matches the hub's day editor (`setPreDay`) so Week Setup reads it back.
 */

import { caltypeFromFocus, type PreseasonProposal, type SavedDay } from "./preseasonProposal";

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const isoAdd = (iso: string, d: number) => new Date(ms(iso) + d * DAY).toISOString().slice(0, 10);

export type AcceptDayRow = { day_index: number; day_date: string; day_type: "TRAIN" | "OFF"; focus: string | null; day_intent: string | null };
export type AcceptWeek = { week_start: string; system_key: string; intensity_target: number; createSetup: boolean; days: AcceptDayRow[] };
export type AcceptTest = { test_key: string; test_date: string };

export type AcceptPlan = {
  weeks: AcceptWeek[];
  tests: AcceptTest[];
  overrides: Record<string, unknown>;
  summary: { daysChanged: number; weeksTouched: number; testsAdded: number; kept: { past: number; match: number; teamBreak: number; coachDay: number; same: number } };
};

export type AcceptInput = {
  proposal: PreseasonProposal;
  today: string;
  /** Current week_plans rows in the window (iso → day). */
  existingDays: Record<string, SavedDay>;
  /** Current week_setups rows (week_start → its system/intensity). */
  existingWeekSetups: Record<string, { system_key: string; intensity_target: number }>;
  /** Every fixture date (match_schedule). */
  fixtures: string[];
  /** Team breaks (inclusive ranges). */
  breaks: Array<{ start: string; end: string }>;
  /** Days the coach changed in the draft — written even over a saved day. */
  editedDays?: string[];
  fromScratch?: boolean;
  /** Already-scheduled tests (coach_test_schedule). */
  existingTests: AcceptTest[];
  /** The planned pre-season belongs to the next season's row (index-keyed blockWeeks, as the hub saves it). */
  plansNext: boolean;
  /** That row's current blockWeeks (ISO-keyed entries are kept for this season's own pre-season). */
  existingBlockWeeks?: Record<string, number> | null;
};

const onOff = (dayType: string | undefined) => (dayType === "OFF" ? "off" : dayType === "TRAIN" || dayType === "RECOVERY" ? "on" : dayType === "GAME" ? "match" : "none");

export function planPreseasonAccept(input: AcceptInput): AcceptPlan {
  const { proposal: p, today } = input;
  const fixtures = new Set(input.fixtures);
  const edited = new Set(input.editedDays ?? []);
  const onBreak = (d: string) => input.breaks.some((b) => b.start <= d && d <= b.end);
  const kept = { past: 0, match: 0, teamBreak: 0, coachDay: 0, same: 0 };

  const weeks: AcceptWeek[] = [];
  for (const w of p.weeks) {
    const rows: AcceptDayRow[] = [];
    w.days.forEach((d, i) => {
      const date = d.date;
      if (date < today) { kept.past++; return; }
      if (d.type === "match" || fixtures.has(date)) { kept.match++; return; }
      if (onBreak(date)) { kept.teamBreak++; return; }
      const off = d.type === "rest";
      const row: AcceptDayRow = {
        day_index: i + 1, day_date: date,
        day_type: off ? "OFF" : "TRAIN",
        focus: off ? (d.md || null) : [d.md, d.label.en].filter(Boolean).join(" "),
        day_intent: off ? "OFF" : null,
      };
      const ex = input.existingDays[date];
      if (ex && !edited.has(date) && !input.fromScratch) { kept.coachDay++; return; }
      if (ex) {
        const same = onOff(ex.dayType) === (off ? "off" : "on")
          && (off || caltypeFromFocus(ex.focus ?? "") === caltypeFromFocus(row.focus ?? ""));
        if (same) { kept.same++; return; }
      }
      rows.push(row);
    });
    if (!rows.length) continue;
    const ex = input.existingWeekSetups[w.weekStart];
    weeks.push({
      week_start: w.weekStart,
      system_key: ex?.system_key ?? (w.isDeload ? "RECOVERY" : "STRENGTH"),
      intensity_target: ex?.intensity_target ?? (w.isDeload ? 3 : Math.max(3, Math.min(9, Math.round(5 + (w.mult - 1) * 12)))),
      createSetup: !ex,
      days: rows,
    });
  }

  // Tests: core only, one per (test, week), not where that test already sits in the week.
  const tests: AcceptTest[] = [];
  const has = (key: string, from: string, to: string) => input.existingTests.some((t) => t.test_key === key && t.test_date >= from && t.test_date < to);
  for (const t of p.tests.filter((x) => x.priority === "core")) {
    for (const wi of t.weeks) {
      const w = p.weeks[wi - 1]; if (!w) continue;
      const wEnd = isoAdd(w.weekStart, 7);
      if (has(t.key, w.weekStart, wEnd)) continue;
      const ok = (d: PreseasonProposal["weeks"][number]["days"][number]) => d.date >= today && d.type !== "match" && !fixtures.has(d.date) && !onBreak(d.date);
      const pick = w.days.find((d) => ok(d) && d.type !== "rest" && d.md !== "MD+1")
        ?? w.days.find((d) => ok(d) && d.type !== "rest");
      if (pick) tests.push({ test_key: t.key, test_date: pick.date });
    }
  }

  // Settings the plan was built with → the season row (merge; the route never drops other keys).
  const lens: Record<string, number> = {};
  p.engine.meso.lens.forEach((n, i) => { lens[String(i)] = n; });
  const keepIso = input.plansNext ? {} : Object.fromEntries(Object.entries(input.existingBlockWeeks ?? {}).filter(([k]) => !/^\d+$/.test(k)));
  const overrides: Record<string, unknown> = {
    preseasonSessions: p.settings.sessionsPerWeek,
    preseasonWeek1Mult: p.settings.week1MatchMultiple,
    preMesoTail: p.engine.meso.tail,
    blockWeeks: { ...keepIso, ...lens },
  };
  if (Object.keys(p.settings.week1Kpi).length || input.fromScratch) overrides.preWeek1Kpi = p.settings.week1Kpi;

  const daysChanged = weeks.reduce((s, w) => s + w.days.length, 0);
  return { weeks, tests, overrides, summary: { daysChanged, weeksTouched: weeks.length, testsAdded: tests.length, kept } };
}
