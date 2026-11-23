/**
 * Goal plan on the player's Today (lota 3). Pure and client-safe.
 *
 * Three jobs, all rules (no AI):
 *   1. Day placement: put this week's add-on sessions (A, B, and C out of season) on the team's training days,
 *      never on a match day, the day before or the day after (MD, MD-1, MD+1), never on a team rest or recovery
 *      day, and at least 2 days apart. Each quality has its preferred match days (e.g. top-speed session A on MD-3
 *      or MD-4, braking session A on MD+3). A busy week can leave a session out; it is not made up later.
 *   2. Today's version: the readiness colour is READ (never set). Green or no check-in = the full session;
 *      yellow = the lighter version (no flat-out or sled sprints, hard stops, box drops or tests; the rest at half
 *      the sets); red = skip it.
 *   3. The card copy, layered: verdict → 2–3 plain facts → the session → "behind the plan".
 *
 * The add-on is its own card. It never changes the colour or a load target. In pre-/off-season session B's gym lifts
 * go into the coach-sent strength session instead ("one session, one whole", 2026-11-17, strengthProgramming/
 * goalPlanGym.ts); the card then names that and keeps only what is left outside the gym (`gymInSession`).
 *
 * Gym-only goals (maximal strength, explosive power, strength + power, 2026-11-18): no extra session at all. Both
 * goal days sit on team strength days and their lifts go into the strength session. In season the card only says the
 * team's session holds what was built (`season: "maintain"`): nothing is added.
 */

import { PLAN_WEEKS, QUALITY_LABEL } from "./common";
import { isGymQuality, type Bi, type GoalBlock, type GoalPlan, type GoalQuality, type GoalSession, type GoalSessionSlot } from "./types";
import { rxContextOf, withRx, type LiftRx } from "./liftRx";
import type { Adherence, DueSession, GoalOutcome, SessionMark } from "./outcome";
import { IN_SEASON_PAUSE_TEXT } from "./seasonPause";
import { noMatchDayFor, noMatchMoveFor, teamLiftsHeavyOn, type MdStructures, type NoMatchDayKind, type NoMatchWeek } from "@/lib/micropulse/strengthProgramming/structures";

// ─── Dates ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const addDays = (iso: string, n: number) => new Date(toMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
/** 0 = Monday … 6 = Sunday. */
const weekdayIdx = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIdx(iso));
}

/** Plan week on a date: 0 = not started yet, 1…8, 9 = finished. The start is always a Monday. */
export function planWeekOn(startIso: string, iso: string): number {
  const d = daysBetween(startIso, iso);
  if (d < 0) return 0;
  const w = Math.floor(d / 7) + 1;
  return w > PLAN_WEEKS ? PLAN_WEEKS + 1 : w;
}

const WD: Bi[] = [
  { en: "Mon", is: "mán" }, { en: "Tue", is: "þri" }, { en: "Wed", is: "mið" }, { en: "Thu", is: "fim" },
  { en: "Fri", is: "fös" }, { en: "Sat", is: "lau" }, { en: "Sun", is: "sun" },
];
const MON: Bi[] = [
  { en: "Jan", is: "jan" }, { en: "Feb", is: "feb" }, { en: "Mar", is: "mar" }, { en: "Apr", is: "apr" },
  { en: "May", is: "maí" }, { en: "Jun", is: "jún" }, { en: "Jul", is: "júl" }, { en: "Aug", is: "ágú" },
  { en: "Sep", is: "sep" }, { en: "Oct", is: "okt" }, { en: "Nov", is: "nóv" }, { en: "Dec", is: "des" },
];

/** "Tue 18 Nov" / "þri 18. nóv". */
export function dayLabel(iso: string): Bi {
  const d = new Date(toMs(iso));
  const w = WD[weekdayIdx(iso)], m = MON[d.getUTCMonth()], n = d.getUTCDate();
  return { en: `${w.en} ${n} ${m.en}`, is: `${w.is} ${n}. ${m.is}` };
}
const weekdayOnly = (iso: string): Bi => WD[weekdayIdx(iso)];

// ─── Team calendar and match days ──────────────────────────────────────────

export type TeamDayType = "train" | "game" | "off" | "recovery";

export type TeamCalendar = {
  /** The days the coach set in the training week (week_plans), by date. */
  days: Record<string, TeamDayType>;
  /** Match dates (fixture list + training-week GAME days). */
  games: string[];
  /** The coach's weekday plan for weeks without a match (strength send, 2026-11-17). With no match near, session B
   *  (gym) goes first on a strength day, then a power day; a light or rest day only when no other day is free. */
  noMatchWeek?: NoMatchWeek;
  /** When that plan last changed: it places session B only from the following week, so a week under way keeps its
   *  days (and the ticks already counted stay where they were). Absent = it applies to every week. */
  noMatchWeekSince?: string;
  /** The team's method per MD day (Structure per MD day): which heavy days really have a heavy lift, so a goal gym
   *  session can go inside that day's strength session (2026-11-20). Absent = the built-in sessions (MD-4 and MD-3 lift
   *  heavy). */
  mdStructures?: MdStructures;
};

export function toTeamDayType(raw: string | null | undefined): TeamDayType | null {
  const s = String(raw ?? "").toUpperCase();
  if (s === "GAME") return "game";
  if (s === "OFF") return "off";
  if (s === "RECOVERY") return "recovery";
  if (s === "TRAIN") return "train";
  return null;
}

/**
 * The match-day label of a date (same order of rules as the strength engine's MD context): MD on a match day,
 * MD+1 the day after, then the countdown MD-4…MD-1, then MD+2…MD+4, then MD-5. null = no match near.
 */
export function mdLabel(iso: string, games: string[]): string | null {
  const offs = games.map((g) => daysBetween(iso, g));
  if (offs.includes(0)) return "MD";
  const ahead = offs.filter((o) => o > 0).sort((a, b) => a - b)[0] ?? null;
  const ago = offs.filter((o) => o < 0).map((o) => -o).sort((a, b) => a - b)[0] ?? null;
  if (ago === 1) return "MD+1";
  if (ahead != null && ahead <= 4) return `MD-${ahead}`;
  if (ago === 2) return "MD+2";
  if (ago === 3) return "MD+3";
  if (ago === 4) return "MD+4";
  if (ahead === 5) return "MD-5";
  return null;
}

/** Days the add-on never goes on (MicroPulse rule, the same as every plan's safety list). */
const BANNED_MD = new Set(["MD", "MD-1", "MD+1"]);

/** Preferred match days per quality and session (best first). Anything else allowed ranks after these. */
const MID_WEEK = ["MD-3", "MD-4", "MD+3", "MD-5", "MD+4", "MD-2", "MD+2"];
const GYM_DAY = ["MD+2", "MD-4", "MD+3", "MD-2", "MD-3", "MD-5", "MD+4"];
const GYM_HEAVY = ["MD-4", "MD+2", "MD+3", "MD-5", "MD+4", "MD-3"];
const GYM_SECOND = ["MD-2", "MD-3", "MD+3", "MD-4", "MD-5", "MD+4", "MD+2"];
const PREFS: Record<GoalQuality, Partial<Record<GoalSessionSlot, string[]>>> = {
  top_speed: { A: ["MD-3", "MD-4", "MD-5", "MD+3", "MD+4", "MD-2", "MD+2"], B: GYM_DAY },
  acceleration: { A: MID_WEEK, B: GYM_DAY },
  jump: { A: MID_WEEK, B: GYM_DAY },
  braking: { A: ["MD+3", "MD+2", "MD+4", "MD-4", "MD-5", "MD-3"], B: ["MD-2", "MD-3", "MD-4", "MD-5"] },
  // Gym-only goals (2026-11-18): both days are team strength days, the heavier one further from the match.
  max_strength: { A: GYM_HEAVY, B: GYM_SECOND },
  explosive: { A: GYM_HEAVY, B: GYM_SECOND },
  strength_power: { A: GYM_HEAVY, B: GYM_SECOND },
};
/** No match near: weekday order (0 = Mon). */
const WEEKDAY_PREF: Record<GoalSessionSlot, number[]> = {
  A: [1, 2, 0, 3, 4, 5, 6],
  B: [3, 4, 2, 0, 1, 5, 6],
  C: [5, 4, 0, 1, 2, 3, 6],
};

/** Sessions must be at least this many days apart (MicroPulse rule; top speed: 2 days between top-speed days). */
export const MIN_GAP_DAYS = 2;

/**
 * The goal's gym sessions on the week's heavy days (2026-11-20, the coach's call). Pre-season and off-season, from the
 * week of 30 Nov 2026 (the weeks before keep the days they had, so ticks already counted stay where they were):
 *   - A gym goal session (the gym-only goals' two days, the pitch goals' session B) goes on MD-4, then MD-3, then MD-5;
 *     the days after a match (MD+2 to MD+4) last. Gym-only day 2 and braking's session B on MD-3 first. Never MD-2:
 *     with no heavy day free the session is left out that week (close to the match the goal's lift comes light and
 *     fast inside the team session instead, strengthProgramming/goalPlanGym.ts `applyGoalNearMatch`).
 *   - The 2-day gap does not count for a session that is all gym lifts on MD-4 or MD-3 when the team lifts heavy that
 *     day: its lifts take the place of the team's, so it is not an extra session. Never two on the same day. A session
 *     with pitch work (jumps, braking drills, sprints) keeps the gap.
 * In season, and before that week, the days are placed as before. Which day is which is MicroPulse's rule.
 */
export const GYM_ON_HEAVY_DAYS_FROM = "2026-11-30";
const HEAVY_FIRST = ["MD-4", "MD-3", "MD-5", "MD+2", "MD+3", "MD+4"];
const HEAVY_SECOND = ["MD-3", "MD-4", "MD-5", "MD+2", "MD+3", "MD+4"];
const GYM_PREFS: Record<GoalQuality, Partial<Record<GoalSessionSlot, string[]>>> = {
  top_speed: { B: HEAVY_FIRST },
  acceleration: { B: HEAVY_FIRST },
  jump: { B: HEAVY_FIRST },
  braking: { B: HEAVY_SECOND },
  max_strength: { A: HEAVY_FIRST, B: HEAVY_SECOND },
  explosive: { A: HEAVY_FIRST, B: HEAVY_SECOND },
  strength_power: { A: HEAVY_FIRST, B: HEAVY_SECOND },
};
/** A goal gym session: the gym-only goals' days, the pitch goals' session B. */
export const isGymSlot = (quality: GoalQuality, slot: GoalSessionSlot): boolean => (isGymQuality(quality) ? slot !== "C" : slot === "B");
/** The week is placed by the heavy-day rule (pre-/off-season, from the week of 30 Nov 2026). */
export const gymOnHeavyDays = (monday: string, season?: "build" | "maintain"): boolean => season === "build" && monday >= GYM_ON_HEAVY_DAYS_FROM;

/** Every block of the session is a gym lift (it goes into the strength session whole). The same test the automatic
 *  tick uses (`tickGoalFromStrengthSession`). */
export function isAllGymSession(plan: GoalPlan, session: GoalSession): boolean {
  const s = withRx({ weeks: [{ sessions: [session] }] }, rxContextOf(plan)).weeks[0].sessions[0];
  return s.blocks.length > 0 && s.blocks.every((b) => !!b.rx?.length);
}
const allGymSlotsOf = (plan: GoalPlan, quality: GoalQuality, week: number): GoalSessionSlot[] =>
  (plan.weeks.find((w) => w.week === week)?.sessions ?? []).filter((s) => isGymSlot(quality, s.slot) && isAllGymSession(plan, s)).map((s) => s.slot);

/**
 * Test days (brief §4a, 2026-11-23): the session that holds a pitch goal's test (top speed, acceleration, jump,
 * braking) goes on MD+3 first, then MD-2 — the days the team already tests the jump — before the session's usual days.
 * In a 7-day week MD+3 is MD-4, so the test lands on MD-2. The gym-only goals keep their strength test on the heavy day.
 * Which day is MicroPulse's rule (the coach's), not from a study.
 */
export const TEST_DAY_PREFS = ["MD+3", "MD-2"];
const testSlotsOf = (plan: GoalPlan, quality: GoalQuality, week: number): GoalSessionSlot[] =>
  isGymQuality(quality) ? [] : (plan.weeks.find((w) => w.week === week)?.sessions ?? []).filter((s) => s.blocks.some((b) => b.test === true)).map((s) => s.slot);

/** `inTeam`: an all-gym session on a heavy day the team lifts on (the 2-day gap did not count for it). */
export type PlacedSession = { slot: GoalSessionSlot; date: string; md: string | null; inTeam?: true };
export type WeekPlacement = {
  monday: string;
  placed: PlacedSession[];
  unplaced: GoalSessionSlot[];
  /** False when the coach has set no training day this week: every day not around a match (and not marked off or
   *  recovery) is a candidate. */
  weekKnown: boolean;
  /** Days the team trains (or, week not set, days not marked off/recovery/game), before the match rule. 0 = the team is
   *  off all week. */
  teamDays: number;
};

function candidates(monday: string, cal: TeamCalendar): { days: { date: string; md: string | null }[]; weekKnown: boolean; teamDays: number } {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // The week counts as set when the coach marked at least one training day; a week with only a GAME or OFF row is not.
  const weekKnown = dates.some((d) => cal.days[d] === "train");
  const days: { date: string; md: string | null }[] = [];
  let teamDays = 0;
  for (const date of dates) {
    const type = cal.days[date] ?? null;
    if (weekKnown && type !== "train") continue; // set week: only team training days
    if (!weekKnown && type != null) continue; // not set: skip days marked off, recovery or game
    teamDays += 1;
    const md = mdLabel(date, cal.games);
    if (md && BANNED_MD.has(md)) continue;
    days.push({ date, md });
  }
  return { days, weekKnown, teamDays };
}

/** The days the team trains in the week of `iso` (as the placement sees them), each with its match-day label. */
export function teamDaysOfWeek(iso: string, cal: TeamCalendar): { date: string; md: string | null }[] {
  return candidates(mondayOf(iso), cal).days;
}

/** Session B with no match near, by the coach's weekday plan: a strength day can hold the gym lifts in the strength
 *  session; a power day next; unset as before; a light or rest day has no heavy lift, so last. */
const NO_MATCH_B_RANK: Record<NoMatchDayKind, number> = { strength: 0, power: 1, light: 50, rest: 50 };
/** Gym-only goals, both sessions, no match near (MicroPulse rule, 2026-11-18): day 1 (the heavy day) on a strength
 *  day; day 2 on a power day when the goal has a power side (explosive, strength + power), else a second strength day. */
const NO_MATCH_POWER_FIRST: Record<NoMatchDayKind, number> = { power: 0, strength: 1, light: 50, rest: 50 };
function noMatchRank(quality: GoalQuality, slot: GoalSessionSlot): Record<NoMatchDayKind, number> | null {
  if (isGymQuality(quality)) return slot === "B" && quality !== "max_strength" ? NO_MATCH_POWER_FIRST : NO_MATCH_B_RANK;
  return slot === "B" ? NO_MATCH_B_RANK : null;
}

function rank(quality: GoalQuality, slot: GoalSessionSlot, day: { date: string; md: string | null }, cal?: TeamCalendar, heavyDays = false, testDay = false): number {
  const t = testDay && day.md ? TEST_DAY_PREFS.indexOf(day.md) : -1;
  if (t >= 0) return t - TEST_DAY_PREFS.length; // before every usual day
  const prefs = (heavyDays ? GYM_PREFS[quality][slot] : null) ?? PREFS[quality][slot] ?? [];
  const i = day.md ? prefs.indexOf(day.md) : -1;
  if (i >= 0) return i;
  const wd = WEEKDAY_PREF[slot].indexOf(weekdayIdx(day.date));
  const planLive = !cal?.noMatchWeekSince || mondayOf(day.date) > mondayOf(cal.noMatchWeekSince);
  const byKind = noMatchRank(quality, slot);
  // A day the coach moved for that week only (E, 2026-11-18) counts even in a week already under way.
  const moved = noMatchMoveFor(day.date, cal?.noMatchWeek);
  if (byKind && !day.md && (planLive || moved)) {
    const kind = moved ?? noMatchDayFor(day.date, cal?.noMatchWeek);
    if (kind) return byKind[kind] === 50 ? 50 + wd : byKind[kind];
  }
  return 10 + wd;
}

/**
 * Places one week's sessions. Tries every assignment (at most 8^3) and keeps the one that places the most sessions,
 * then the best-ranked days (session A first). `prevLast` = the last session date of the week before, so the 2-day
 * gap also holds across Sunday → Monday.
 */
export function placeWeek(args: {
  quality: GoalQuality;
  slots: GoalSessionSlot[];
  monday: string;
  cal: TeamCalendar;
  prevLast?: string | null;
  /** The team's season: "build" from the week of 30 Nov 2026 places the gym sessions on the heavy days. */
  season?: "build" | "maintain";
  /** The slots whose session is all gym lifts (`isAllGymSession`). */
  allGym?: GoalSessionSlot[];
  /** The slots whose session holds a pitch goal's test (`TEST_DAY_PREFS`). */
  testSlots?: GoalSessionSlot[];
}): WeekPlacement {
  const { days, weekKnown, teamDays } = candidates(args.monday, args.cal);
  const slots = args.slots;
  const heavyDays = gymOnHeavyDays(args.monday, args.season);
  const gym = (k: number) => heavyDays && isGymSlot(args.quality, slots[k]);
  const inTeam = (k: number, day: { md: string | null }) =>
    gym(k) && (args.allGym ?? []).includes(slots[k]) && teamLiftsHeavyOn(day.md, args.cal.mdStructures);
  let best: { score: number; pick: (number | null)[] } = { score: -Infinity, pick: slots.map(() => null) };
  const pick: (number | null)[] = [];
  const ok = (i: number, d: number) => {
    const day = days[d];
    if (gym(i) && day.md === "MD-2") return false; // a gym goal session never on MD-2 (heavy-day rule)
    const free = inTeam(i, day);
    if (args.prevLast && !free && Math.abs(daysBetween(args.prevLast, day.date)) < MIN_GAP_DAYS) return false;
    return pick.every((p, k) => {
      if (p == null) return true;
      const gap = Math.abs(daysBetween(days[p].date, day.date));
      return gap >= MIN_GAP_DAYS || (gap >= 1 && (free || inTeam(k, days[p])));
    });
  };
  const walk = (i: number) => {
    if (i === slots.length) {
      // Most sessions placed first; when not all fit, session A (the main work) beats B, B beats C; then the best days.
      let placedN = 0, priority = 0, cost = 0;
      pick.forEach((p, k) => {
        if (p == null) return;
        placedN += 1;
        priority += (slots.length - k) * 1_000;
        cost += rank(args.quality, slots[k], days[p], args.cal, gym(k), (args.testSlots ?? []).includes(slots[k])) * (slots.length - k); // earlier slots weigh more
      });
      const score = placedN * 100_000 + priority - cost;
      if (score > best.score) best = { score, pick: [...pick] };
      return;
    }
    for (let d = 0; d < days.length; d++) {
      if (!ok(i, d)) continue;
      pick.push(d); walk(i + 1); pick.pop();
    }
    pick.push(null); walk(i + 1); pick.pop();
  };
  walk(0);
  const placed: PlacedSession[] = [];
  const unplaced: GoalSessionSlot[] = [];
  best.pick.forEach((p, k) => {
    if (p == null) unplaced.push(slots[k]);
    else placed.push({ slot: slots[k], date: days[p].date, md: days[p].md, ...(inTeam(k, days[p]) ? { inTeam: true as const } : {}) });
  });
  placed.sort((a, b) => a.date.localeCompare(b.date));
  return { monday: args.monday, placed, unplaced, weekKnown, teamDays };
}

// ─── Today's version by colour ─────────────────────────────────────────────

export type DayColour = "green" | "yellow" | "red";

export function toDayColour(raw: string | null | undefined): DayColour | null {
  const s = String(raw ?? "").toLowerCase();
  return s === "green" || s === "yellow" || s === "red" ? s : null;
}

/** Work left out on a yellow day: anything flat out, sled sprints, hard stops, box drops and tests. */
export function isHardBlock(b: GoalBlock): boolean {
  return (
    b.test === true || b.topSpeed === true || b.dropJumps === true ||
    (b.flatOutM ?? 0) > 0 || (b.hardStops ?? 0) > 0 || (b.sledM ?? 0) > 0 ||
    b.method === "flying_sprints" || b.method === "accel_sprints" || b.method === "resisted_sled"
  );
}

export type SessionVersion = "full" | "lighter" | "skip";

export function sessionForColour(s: GoalSession, colour: DayColour | null): { version: SessionVersion; blocks: GoalBlock[]; left: GoalBlock[] } {
  if (colour === "red") return { version: "skip", blocks: [], left: s.blocks };
  if (colour === "yellow") {
    const keep = s.blocks.filter((b) => !isHardBlock(b));
    const left = s.blocks.filter(isHardBlock);
    return keep.length ? { version: "lighter", blocks: keep, left } : { version: "skip", blocks: [], left };
  }
  return { version: "full", blocks: s.blocks, left: [] };
}

// ─── The card ──────────────────────────────────────────────────────────────

export type GoalTodayStatus = "approved" | "paused";

export type GoalTodayCard = {
  quality: GoalQuality;
  title: Bi;
  /** "not_started" | "on" (weeks 1–8) | "paused" | "finished" (up to 14 days after the last week, lota 4). */
  state: "not_started" | "on" | "paused" | "finished";
  week: number;
  weeksTotal: number;
  weekLabel: Bi | null;
  verdict: Bi;
  facts: Bi[];
  /** Today's session, already in today's version; null when there is none today. */
  today: null | {
    slot: GoalSessionSlot;
    /** "Session B" / "Goal day 2" (the gym-only goals number their days). Absent on old cards = "Session <slot>". */
    name?: Bi;
    focus: Bi;
    minutes: number;
    version: SessionVersion;
    /** `swapped`: the team swapped this exercise (lota 5); the dose is the planned one. */
    blocks: { what: Bi; dose: Bi; supervised: boolean; swapped?: boolean; rx?: LiftRx[] }[];
    /** The player's tick on it (lota 4). */
    mark: SessionMark["status"] | null;
    /** The session's gym lifts are inside today's strength session (pre-/off-season, "one session, one whole",
     *  2026-11-17): `blocks` then holds only what is left for outside the gym (often nothing; a test for the
     *  gym-only goals). */
    inSession?: true;
  };
  /** `past` = its day is behind today; `mark` = the player's tick; `canMark` = placed on today or earlier. */
  /** `tag`: the short pill label ("B" / "Day 2"); `ask`: the session in "Did you do …?" (Icelandic accusative). */
  thisWeek: { slot: GoalSessionSlot; tag?: Bi; ask?: Bi; focus: Bi; date: string | null; day: Bi | null; isToday: boolean; past: boolean; mark: SessionMark["status"] | null; canMark: boolean }[];
  supervision: Bi | null;
  coachNote: string | null;
  details: Bi[];
};

const slotName = (slot: GoalSessionSlot): Bi => ({ en: `session ${slot}`, is: `æfing ${slot}` });
const cap = (b: Bi): Bi => ({ en: b.en.charAt(0).toUpperCase() + b.en.slice(1), is: b.is.charAt(0).toUpperCase() + b.is.slice(1) });

const DAY_RULE: Bi = {
  en: "The days are picked around the team's matches: never on a match day or the day before or after one, and at least 2 days between sessions. A test goes on MD+3, else MD-2.",
  is: "Dagarnir eru valdir í kringum leiki liðsins: aldrei á leikdegi né deginum fyrir eða eftir leik, og minnst 2 dagar á milli æfinga. Próf fer á MD+3, annars MD-2.",
};
/** Pre-/off-season from the week of 30 Nov 2026 (`gymOnHeavyDays`). */
const DAY_RULE_HEAVY: Bi = {
  en: "The days are picked around the team's matches: never on a match day or the day before or after one. Gym sessions go on the heavy days (MD-4, MD-3), inside the team strength session, never on MD-2; other sessions at least 2 days apart. A test goes on MD+3, else MD-2.",
  is: "Dagarnir eru valdir í kringum leiki liðsins: aldrei á leikdegi né deginum fyrir eða eftir leik. Salaræfingar fara á þungu dagana (MD-4, MD-3), inn í styrktaræfingu liðsins, aldrei á MD-2; aðrar æfingar með minnst 2 daga á milli. Próf fer á MD+3, annars MD-2.",
};
/** An all-gym session placed inside the team's heavy session (the 2-day gap did not count) that is not in today's
 *  sent session (the coach sent another mode, or it has not been sent yet). */
const IN_TEAM_NOT_SENT: Bi = {
  en: "This session belongs inside the team strength session today. If today's session doesn't hold its lifts, do them in place of the matching team lifts.",
  is: "Þessi æfing á heima inni í styrktaræfingu liðsins í dag. Ef æfing dagsins er ekki með lyftur hennar, gerðu þær í stað samsvarandi lyftna liðsins.",
};
const WEEK_UNSET: Bi = {
  en: "The coach has not set this week's training days yet, so the days are a suggestion around the matches.",
  is: "Þjálfarinn hefur ekki sett æfingadaga vikunnar enn, svo dagarnir eru tillaga út frá leikjum.",
};
const YELLOW_FACT: Bi = {
  en: "Yellow check-in today: the lighter version. No flat-out or sled sprints, hard stops, box drops or tests; the rest at half the sets.",
  is: "Gul innskráning í dag: léttari útgáfa. Engir sprettir á fullu eða með sleða, harðar bremsur, fallhopp né próf; restin með hálfum settum.",
};
const RED_FACT: Bi = {
  en: "Red check-in today: skip the goal session. It isn't made up later.",
  is: "Rauð innskráning í dag: slepptu markmiðsæfingunni. Hún er ekki unnin upp seinna.",
};
const GREEN_FACT: Bi = { en: "Green check-in today: the full session.", is: "Græn innskráning í dag: öll æfingin." };
const NO_CHECKIN_FACT: Bi = {
  en: "No check-in yet today. A yellow or red check-in changes this session, so check in first.",
  is: "Engin innskráning enn í dag. Gul eða rauð innskráning breytir æfingunni, svo skráðu þig inn fyrst.",
};

const DETAILS_COMMON: Bi[] = [
  { en: "Rules place the sessions and pick today's version; there is no AI here.", is: "Reglur raða æfingunum og velja útgáfu dagsins; hér er engin gervigreind." },
  { en: "The plan reads your check-in colour; it never changes it, and it never changes the team's session.", is: "Áætlunin les litinn úr innskráningunni; hún breytir honum aldrei, né æfingu liðsins." },
];

export type GoalTodayInput = {
  quality: GoalQuality;
  status: GoalTodayStatus;
  plan: GoalPlan;
  startDate: string;
  todayIso: string;
  cal: TeamCalendar;
  colour: DayColour | null;
  coachNote: string | null;
  pausedWeek?: number | null;
  /** Why it is paused (2026-11-22): "in_season" = the competitive season (resumes at the next pre-season);
   *  "injury" or absent = injured / coming back (the coach restarts it). */
  pausedReason?: "injury" | "in_season" | null;
  /** In-season pause: the next pre-season's first day when a saved season plan has it. */
  nextPreseason?: string | null;
  /** The player's ticks on this plan (lota 4). */
  marks?: SessionMark[];
  /** Today's strength session (coach-sent) holds this plan week's gym lifts (2026-11-17): the slot merged, or true = B. */
  gymInSession?: boolean | GoalSessionSlot;
  /** The team's season today (`goalSeasonOf`). Gym-only goals: "maintain" (in season, or not known) = the card only
   *  says what holds; nothing is added. Pitch goals: "maintain" leaves out session C, the short out-of-season session
   *  (2026-11-18). Absent = build. */
  season?: "build" | "maintain";
};

/** Session C is out of season only (`WHEN.off_day`): in season a plan built out of season goes on with A and B. */
const C_LEFT_OUT: Bi = {
  en: "In season: the short third session is left out; sessions A and B go on.",
  is: "Á tímabili: stuttu þriðju æfingunni er sleppt; æfingar A og B halda áfram.",
};

const IN_SESSION_FACT: Bi = {
  en: "Pre-season and off-season: your goal's gym lifts are part of the team strength session, in place of the matching exercises. One session, not two.",
  is: "Undirbúnings- og hvíldartímabil: lyftur markmiðsins eru hluti af styrktaræfingu liðsins, í stað samsvarandi æfinga. Ein æfing, ekki tvær.",
};
const HOLD_VERDICT: Bi = {
  en: "In season: your team strength session holds what you built. Nothing extra this week.",
  is: "Á tímabili: styrktaræfing liðsins heldur því sem þú byggðir upp. Ekkert aukalega þessa viku.",
};
const HOLD_FACTS: Bi[] = [
  { en: "Keep the same weights in the team session; no extra sets.", is: "Haltu sömu þyngdum í æfingu liðsins; engin aukasett." },
  { en: "The goal builds again in pre-season and off-season, when its lifts go into the team strength session.", is: "Markmiðið byggir aftur upp á undirbúnings- og hvíldartímabili, þegar lyftur þess fara inn í styrktaræfingu liðsins." },
];
/** "goal day 1" / "session B": the gym-only goals have no session A on the pitch, so their days are numbered. */
const partName = (quality: GoalQuality, slot: GoalSessionSlot): Bi =>
  isGymQuality(quality) ? { en: `goal day ${slot === "A" ? 1 : 2}`, is: `markmiðsdagur ${slot === "A" ? 1 : 2}` } : slotName(slot);

/** True when the plan holds a session C (built out of season). Plans without one never need the season read. */
export function planHasSessionC(plan: Pick<GoalPlan, "weeks">): boolean {
  return plan.weeks.some((w) => w.sessions.some((s) => s.slot === "C"));
}

/** One week's sessions; in season ("maintain") session C is left out (out of season only, 2026-11-18). */
function sessionsOfWeek(plan: GoalPlan, week: number, season?: "build" | "maintain"): GoalSession[] {
  const all = plan.weeks.find((w) => w.week === week)?.sessions ?? [];
  return season === "maintain" ? all.filter((s) => s.slot !== "C") : all;
}

/**
 * Every session the rules placed from week 1 up to `untilIso` (for adherence), each week placed exactly as the
 * Today card placed it (`placementFor`). A resumed plan's early weeks fall on its virtual dates; ticks are matched
 * by week and slot, so that does not change the count much. `season` as on the card: in season session C is not due.
 */
export function placedSessionsUpTo(plan: GoalPlan, quality: GoalQuality, startDate: string, untilIso: string, cal: TeamCalendar, season?: "build" | "maintain"): DueSession[] {
  const last = Math.min(PLAN_WEEKS, planWeekOn(startDate, untilIso));
  const out: DueSession[] = [];
  for (let w = 1; w <= last; w++) {
    const p = placementFor(plan, quality, startDate, addDays(startDate, (w - 1) * 7), cal, season);
    for (const s of p?.placed ?? []) if (s.date <= untilIso) out.push({ week: w, slot: s.slot, date: s.date });
  }
  return out;
}

/** This week's (and last week's, for the Sunday → Monday gap) placement. */
export function placementFor(plan: GoalPlan, quality: GoalQuality, startDate: string, todayIso: string, cal: TeamCalendar, season?: "build" | "maintain"): WeekPlacement | null {
  const week = planWeekOn(startDate, todayIso);
  if (week < 1 || week > PLAN_WEEKS) return null;
  const monday = mondayOf(todayIso);
  let prevLast: string | null = null;
  if (week > 1) {
    const prev = placeWeek({ quality, slots: sessionsOfWeek(plan, week - 1, season).map((s) => s.slot), monday: addDays(monday, -7), cal, season, allGym: allGymSlotsOf(plan, quality, week - 1), testSlots: testSlotsOf(plan, quality, week - 1) });
    // A session inside the team's heavy session is not an extra session: the gap does not count from it.
    const counted = prev.placed.filter((p) => !p.inTeam);
    prevLast = counted.length ? counted[counted.length - 1].date : null;
  }
  return placeWeek({ quality, slots: sessionsOfWeek(plan, week, season).map((s) => s.slot), monday, cal, prevLast, season, allGym: allGymSlotsOf(plan, quality, week), testSlots: testSlotsOf(plan, quality, week) });
}

export function buildGoalTodayCard(input: GoalTodayInput): GoalTodayCard | null {
  const { plan, quality, todayIso } = input;
  if (plan.status !== "ok") return null;
  const q = QUALITY_LABEL[quality];
  const title: Bi = { en: `My goal: ${q.en.toLowerCase()}`, is: `Markmiðið mitt: ${q.is.toLowerCase()}` };
  const details: Bi[] = [
    ...DETAILS_COMMON,
    ...(plan.branch ? [{ en: `The plan's start: ${plan.branch.label.en}.`, is: `Upphaf áætlunarinnar: ${plan.branch.label.is}.` }] : []),
    plan.basis,
    { en: `Sources: ${plan.refs.map((r) => r.short).join(", ")}.`, is: `Heimildir: ${plan.refs.map((r) => r.short).join(", ")}.` },
  ];
  const base = { quality, title, weeksTotal: PLAN_WEEKS, coachNote: input.coachNote, details };

  if (input.status === "paused" && input.pausedReason === "in_season") {
    // GOAL_PLAN_PAUSED_IN_SEASON: no goal work in season, no separate card session, nothing merged.
    const w = input.pausedWeek ?? null;
    const pre = input.nextPreseason ? dayLabel(input.nextPreseason) : null;
    return {
      ...base, state: "paused", week: w ?? 0, weekLabel: null,
      verdict: IN_SEASON_PAUSE_TEXT,
      facts: [
        ...(w && w >= 1 ? [{ en: `Paused in week ${w} of ${PLAN_WEEKS}.`, is: `Sett í bið í viku ${w} af ${PLAN_WEEKS}.` }] : []),
        pre
          ? { en: `Pre-season starts on ${pre.en} in your coach's season plan.`, is: `Undirbúningstímabilið hefst ${pre.is} samkvæmt tímabilsáætlun þjálfarans.` }
          : { en: "It resumes when your coach's season plan reaches pre-season.", is: "Planið heldur áfram þegar tímabilsáætlun þjálfarans kemur að undirbúningstímabili." },
        { en: "In season the team strength session keeps what you built.", is: "Á keppnistímabili heldur styrktaræfing liðsins því sem þú byggðir upp." },
      ],
      today: null, thisWeek: [], supervision: null,
      details: [
        { en: "Rule: goal plans build in pre-season and off-season and pause in the competitive season (maintenance period). The season comes from the coach's season plan, else the week setup.", is: "Regla: markmiðsplön byggja upp á undirbúnings- og hvíldartímabili og eru í bið á keppnistímabili (viðhaldstímabil). Tímabilið kemur úr tímabilsáætlun þjálfarans, annars vikuuppsetningu." },
        ...details,
      ],
    };
  }

  if (input.status === "paused") {
    const w = input.pausedWeek ?? null;
    return {
      ...base, state: "paused", week: w ?? 0, weekLabel: null,
      verdict: { en: "Your goal plan is paused while you are injured or coming back. Your coach restarts it.", is: "Markmiðsáætlunin er í bið á meðan meiðsli eða endurkoma standa yfir. Þjálfarinn setur hana aftur af stað." },
      facts: [
        ...(w && w >= 1 ? [{ en: `Paused in week ${w} of ${PLAN_WEEKS}.`, is: `Sett í bið í viku ${w} af ${PLAN_WEEKS}.` }] : []),
        { en: "Nothing to do for the goal until then: follow your return plan.", is: "Ekkert að gera fyrir markmiðið þangað til: fylgdu endurkomuáætluninni." },
      ],
      today: null, thisWeek: [], supervision: null,
    };
  }

  const week = planWeekOn(input.startDate, todayIso);
  if (week === 0) {
    const start = dayLabel(input.startDate);
    return {
      ...base, state: "not_started", week: 0, weekLabel: null,
      verdict: { en: `Your 8 weeks start on ${start.en}.`, is: `Vikurnar 8 hefjast ${start.is}.` },
      facts: isGymQuality(quality)
        ? [
            { en: `${plan.sessionsPerWeek} goal days a week, inside the team strength session: no extra session.`, is: `${plan.sessionsPerWeek} markmiðsdagar á viku, inni í styrktaræfingu liðsins: engin aukaæfing.` },
            { en: "Built in pre-season and off-season; in season the team session holds it.", is: "Byggt upp á undirbúnings- og hvíldartímabili; á tímabili heldur æfing liðsins því." },
          ]
        : [
            { en: `${plan.sessionsPerWeek} short extra sessions a week, on days that fit around the team's matches.`, is: `${plan.sessionsPerWeek} stuttar aukaæfingar á viku, á dögum sem passa við leiki liðsins.` },
            { en: "Each day's session shows here on Today.", is: "Æfing hvers dags birtist hér á Í dag." },
          ],
      today: null, thisWeek: [], supervision: null,
    };
  }
  if (week > PLAN_WEEKS) return null;

  // Gym-only goal in season (or season not known): nothing is added; the team's session holds what was built.
  if (isGymQuality(quality) && input.season === "maintain") {
    return {
      ...base, state: "on", week, weekLabel: plan.weeks.find((w) => w.week === week)?.label ?? null,
      verdict: HOLD_VERDICT, facts: HOLD_FACTS, today: null, thisWeek: [], supervision: null,
      details: [{ en: "The season comes from the coach's season plan (or the week setup). Not known counts as in season.", is: "Tímabilið kemur úr tímabilsáætlun þjálfarans (eða vikuuppsetningu). Óþekkt telst sem á tímabili." }, ...details],
    };
  }

  // Lota 7: today's lifts get their full set of variables, derived from the frozen blocks (never stored).
  const sessions = withRx({ weeks: [{ sessions: sessionsOfWeek(plan, week, input.season) }] }, rxContextOf(plan)).weeks[0].sessions;
  const placement = placementFor(plan, quality, input.startDate, todayIso, input.cal, input.season)!;
  const cLeftOut = input.season === "maintain" && sessionsOfWeek(plan, week).some((s) => s.slot === "C");
  const bySlot = new Map(sessions.map((s) => [s.slot, s]));
  const todays = placement.placed.find((p) => p.date === todayIso) ?? null;
  const weekRow = plan.weeks.find((w) => w.week === week) ?? null;

  const markOf = (slot: GoalSessionSlot) => input.marks?.find((m) => m.week === week && m.slot === slot)?.status ?? null;
  const gymOnly = isGymQuality(quality);
  const tagOf = (slot: GoalSessionSlot): Bi => (gymOnly ? { en: `Day ${slot === "A" ? 1 : 2}`, is: `Dagur ${slot === "A" ? 1 : 2}` } : { en: slot, is: slot });
  const thisWeek = sessions.map((s) => {
    const p = placement.placed.find((x) => x.slot === s.slot) ?? null;
    return {
      slot: s.slot, tag: tagOf(s.slot),
      ask: gymOnly ? { en: `goal day ${s.slot === "A" ? 1 : 2}`, is: `markmiðsdag ${s.slot === "A" ? 1 : 2}` } : { en: `session ${s.slot}`, is: `æfingu ${s.slot}` },
      focus: s.focus, date: p?.date ?? null, day: p ? weekdayOnly(p.date) : null, isToday: p?.date === todayIso, past: !!p && p.date < todayIso,
      mark: markOf(s.slot), canMark: !!p && p.date <= todayIso,
    };
  }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")); // in day order; a left-out session last

  const weekFactParts = placement.placed.map((p) => ({ en: `${weekdayOnly(p.date).en} (${tagOf(p.slot).en.toLowerCase()})`, is: `${weekdayOnly(p.date).is} (${tagOf(p.slot).is.toLowerCase()})` }));
  const weekFact: Bi = placement.placed.length
    ? { en: `This week: ${weekFactParts.map((x) => x.en).join(", ")}.`, is: `Þessi vika: ${weekFactParts.map((x) => x.is).join(", ")}.` }
    : placement.teamDays === 0
      ? { en: "The team has no training days this week, so the goal rests too.", is: "Liðið æfir ekki þessa viku, svo markmiðið hvílir líka." }
      : { en: "This week has no free day for the goal (busy match week), so it rests.", is: "Þessi vika hefur engan lausan dag fyrir markmiðið (þétt leikjavika), svo það hvílir." };
  const unplacedFact: Bi | null = placement.placed.length && placement.unplaced.length
    ? {
        en: `${cap(partName(quality, placement.unplaced[0])).en}${placement.unplaced.length > 1 ? ` and ${placement.unplaced.slice(1).join(", ")}` : ""} has no free day this week, so it is left out, not made up.`,
        is: `${cap(partName(quality, placement.unplaced[0])).is}${placement.unplaced.length > 1 ? ` og ${placement.unplaced.slice(1).join(", ")}` : ""} á engan lausan dag þessa viku, svo ${gymOnly ? "honum er sleppt, ekki unninn" : "henni er sleppt, ekki unnin"} upp.`,
      }
    : null;

  let today: GoalTodayCard["today"] = null;
  let verdict: Bi;
  let colourFact: Bi | null = null;

  if (todays && bySlot.get(todays.slot)) {
    const s = bySlot.get(todays.slot)!;
    const v = sessionForColour(s, input.colour);
    // "One session, one whole": the session's gym lifts (the blocks with a lift prescription) are in today's strength
    // session; only the rest (bounds, braking drills, a test) is left here.
    const inSlot = input.gymInSession === true ? "B" : input.gymInSession || null;
    const inSession = inSlot === s.slot && v.version !== "skip";
    const shown = inSession ? v.blocks.filter((b) => !b.rx?.length) : v.blocks;
    today = {
      slot: s.slot, name: cap(partName(quality, s.slot)), focus: s.focus, minutes: v.version === "full" ? s.minutes : Math.max(5, Math.round(s.minutes / 2)), version: v.version,
      blocks: shown.map((b) => ({ what: b.what, dose: b.dose, supervised: b.supervised === true, ...(b.swap?.swapped ? { swapped: true } : {}), ...(b.rx?.length ? { rx: b.rx } : {}) })),
      mark: markOf(s.slot),
      ...(inSession ? { inSession: true as const } : {}),
    };
    const pn = partName(quality, s.slot);
    const name = `${cap(pn).en}: ${s.focus.en}`;
    const nameIs = `${cap(pn).is}: ${s.focus.is}`;
    if (inSession) {
      const f = { en: s.focus.en.charAt(0).toLowerCase() + s.focus.en.slice(1), is: s.focus.is.charAt(0).toLowerCase() + s.focus.is.slice(1) };
      verdict = shown.length
        ? { en: `Today: ${pn.en} (${f.en}). The gym part is in your strength session; the rest is below.`, is: `Í dag: ${pn.is} (${f.is}). Salur-hlutinn er í styrktaræfingunni þinni; restin er hér fyrir neðan.` }
        : { en: `Today, ${pn.en} (${f.en}) is part of your strength session (Today's session).`, is: `Í dag er ${pn.is} (${f.is}) hluti af styrktaræfingunni þinni (Æfing dagsins).` };
    } else if (v.version === "skip") {
      verdict = input.colour === "red"
        ? { en: `Skip today's goal session (${s.focus.en}). Red day: rest comes first.`, is: `Slepptu markmiðsæfingunni í dag (${s.focus.is}). Rauður dagur: hvíld gengur fyrir.` }
        : { en: `Skip today's goal session (${s.focus.en}). Yellow day, and it is all flat-out work.`, is: `Slepptu markmiðsæfingunni í dag (${s.focus.is}). Gulur dagur, og hún er öll á fullu.` };
    } else if (v.version === "lighter") {
      verdict = { en: `Today: the lighter version of ${name.charAt(0).toLowerCase()}${name.slice(1)} (about ${today.minutes} min).`, is: `Í dag: léttari útgáfa af ${nameIs.charAt(0).toLowerCase()}${nameIs.slice(1)} (um ${today.minutes} mín).` };
    } else {
      verdict = { en: `Today: ${name} (${s.minutes} min).`, is: `Í dag: ${nameIs} (${s.minutes} mín).` };
    }
    colourFact = input.colour === "yellow" ? YELLOW_FACT : input.colour === "red" ? RED_FACT : input.colour === "green" ? GREEN_FACT : NO_CHECKIN_FACT;
  } else {
    const next = placement.placed.find((p) => p.date > todayIso) ?? null;
    if (next) {
      const s = bySlot.get(next.slot)!;
      verdict = { en: `No goal session today. Next: ${weekdayOnly(next.date).en}, ${partName(quality, next.slot).en} (${s.focus.en}).`, is: `Engin markmiðsæfing í dag. Næst: ${weekdayOnly(next.date).is}, ${partName(quality, next.slot).is} (${s.focus.is}).` };
    } else if (placement.placed.length) {
      verdict = { en: "No goal session today. This week's sessions are behind you; next week's show on Monday.", is: "Engin markmiðsæfing í dag. Æfingar vikunnar eru búnar; næsta vika birtist á mánudag." };
    } else if (placement.teamDays === 0) {
      verdict = { en: "No goal session this week: the team is not training.", is: "Engin markmiðsæfing þessa viku: liðið æfir ekki." };
    } else {
      verdict = { en: "No goal session this week: the match schedule leaves no free day.", is: "Engin markmiðsæfing þessa viku: leikjadagskráin skilur engan dag eftir." };
    }
  }

  const dayRule = gymOnHeavyDays(placement.monday, input.season) ? DAY_RULE_HEAVY : DAY_RULE;
  const inTeamNotSent = !!todays?.inTeam && !!today && !today.inSession && today.version !== "skip";
  const facts = (today?.inSession
    ? [weekFact, IN_SESSION_FACT, colourFact]
    : [weekFact, inTeamNotSent ? IN_TEAM_NOT_SENT : null, colourFact ?? unplacedFact ?? dayRule, ...(colourFact && unplacedFact ? [unplacedFact] : []), cLeftOut ? C_LEFT_OUT : null])
    .filter((f): f is Bi => !!f).slice(0, 3);
  if (!placement.weekKnown) details.unshift(WEEK_UNSET);
  if (cLeftOut) details.unshift(C_LEFT_OUT);
  details.unshift(dayRule);

  return {
    ...base,
    state: "on",
    week,
    weekLabel: weekRow?.label ?? null,
    verdict,
    facts,
    today,
    thisWeek,
    supervision: today && today.version !== "skip" ? (plan.youthLevel ? plan.supervision : today.blocks.some((b) => b.supervised) ? plan.supervision : null) : null,
    details,
  };
}

// ─── Lota 4: the finished card ─────────────────────────────────────────────

export type GoalFinishedInput = {
  quality: GoalQuality;
  plan: GoalPlan;
  endDate: string;
  todayIso: string;
  outcome: GoalOutcome;
  adherence: Adherence;
  coachNote: string | null;
};

/** After the last week: what changed (from the coach's tests or VALD), how many sessions were ticked, what next. */
export function buildGoalFinishedCard(input: GoalFinishedInput): GoalTodayCard | null {
  const { plan, quality, outcome } = input;
  if (plan.status !== "ok") return null;
  const q = QUALITY_LABEL[quality];
  const title: Bi = { en: `My goal: ${q.en.toLowerCase()}`, is: `Markmiðið mitt: ${q.is.toLowerCase()}` };
  const done: Bi = { en: "Your 8 weeks are done.", is: "Vikurnar 8 eru búnar." };
  const verdict: Bi = outcome.state === "waiting"
    ? { en: `${done.en} Last step: the retest with your coach.`, is: `${done.is} Síðasta skrefið: endurprófið með þjálfaranum.` }
    : { en: `${done.en} ${outcome.verdict.en}`, is: `${done.is} ${outcome.verdict.is}` };
  const main = outcome.measures.find((m) => m.measure === outcome.main) ?? null;
  const facts: Bi[] = [
    input.adherence.due ? input.adherence.line : null,
    outcome.state === "waiting"
      ? plan.tests.what
      : main
        ? { en: "The plan compares your week-1 test with your week-8 retest; a small change is read as no clear change.", is: "Áætlunin ber saman prófið í viku 1 og endurprófið í viku 8; lítil breyting er lesin sem engin skýr breyting." }
        : null,
    { en: "Want to keep going? Ask for a new goal under Today → See more → My goal.", is: "Viltu halda áfram? Biddu um nýtt markmið undir Í dag → Skoða meira → Markmiðið mitt." },
  ].filter((f): f is Bi => !!f).slice(0, 3);
  const details: Bi[] = [
    ...outcome.measures.filter((m) => m.measure !== outcome.main).map((m) => m.line),
    plan.tests.change,
    { en: "Rules compare the tests; there is no AI here. The plan never changed your check-in colour or the team's session.", is: "Reglur bera prófin saman; hér er engin gervigreind. Áætlunin breytti aldrei litnum þínum né æfingu liðsins." },
    { en: `Sources: ${plan.refs.map((r) => r.short).join(", ")}.`, is: `Heimildir: ${plan.refs.map((r) => r.short).join(", ")}.` },
  ];
  return {
    quality, title, state: "finished", week: PLAN_WEEKS, weeksTotal: PLAN_WEEKS, weekLabel: null,
    verdict, facts, today: null, thisWeek: [], supervision: null, coachNote: input.coachNote, details,
  };
}
