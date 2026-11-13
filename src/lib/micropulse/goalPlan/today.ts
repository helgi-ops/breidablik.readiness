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
 * The add-on is its own card. It never changes Today's session, the colour or a load target.
 */

import { PLAN_WEEKS, QUALITY_LABEL } from "./common";
import type { Bi, GoalBlock, GoalPlan, GoalQuality, GoalSession, GoalSessionSlot } from "./types";

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
const PREFS: Record<GoalQuality, Partial<Record<GoalSessionSlot, string[]>>> = {
  top_speed: { A: ["MD-3", "MD-4", "MD-5", "MD+3", "MD+4", "MD-2", "MD+2"], B: GYM_DAY },
  acceleration: { A: MID_WEEK, B: GYM_DAY },
  jump: { A: MID_WEEK, B: GYM_DAY },
  braking: { A: ["MD+3", "MD+2", "MD+4", "MD-4", "MD-5", "MD-3"], B: ["MD-2", "MD-3", "MD-4", "MD-5"] },
};
/** No match near: weekday order (0 = Mon). */
const WEEKDAY_PREF: Record<GoalSessionSlot, number[]> = {
  A: [1, 2, 0, 3, 4, 5, 6],
  B: [3, 4, 2, 0, 1, 5, 6],
  C: [5, 4, 0, 1, 2, 3, 6],
};

/** Sessions must be at least this many days apart (MicroPulse rule; top speed: 2 days between top-speed days). */
export const MIN_GAP_DAYS = 2;

export type PlacedSession = { slot: GoalSessionSlot; date: string; md: string | null };
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

function rank(quality: GoalQuality, slot: GoalSessionSlot, day: { date: string; md: string | null }): number {
  const prefs = PREFS[quality][slot] ?? [];
  const i = day.md ? prefs.indexOf(day.md) : -1;
  if (i >= 0) return i;
  return 10 + WEEKDAY_PREF[slot].indexOf(weekdayIdx(day.date));
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
}): WeekPlacement {
  const { days, weekKnown, teamDays } = candidates(args.monday, args.cal);
  const slots = args.slots;
  let best: { score: number; pick: (number | null)[] } = { score: -Infinity, pick: slots.map(() => null) };
  const pick: (number | null)[] = [];
  const ok = (date: string) =>
    (!args.prevLast || Math.abs(daysBetween(args.prevLast, date)) >= MIN_GAP_DAYS) &&
    pick.every((p) => p == null || Math.abs(daysBetween(days[p].date, date)) >= MIN_GAP_DAYS);
  const walk = (i: number) => {
    if (i === slots.length) {
      // Most sessions placed first; when not all fit, session A (the main work) beats B, B beats C; then the best days.
      let placedN = 0, priority = 0, cost = 0;
      pick.forEach((p, k) => {
        if (p == null) return;
        placedN += 1;
        priority += (slots.length - k) * 1_000;
        cost += rank(args.quality, slots[k], days[p]) * (slots.length - k); // earlier slots weigh more
      });
      const score = placedN * 100_000 + priority - cost;
      if (score > best.score) best = { score, pick: [...pick] };
      return;
    }
    for (let d = 0; d < days.length; d++) {
      if (!ok(days[d].date)) continue;
      pick.push(d); walk(i + 1); pick.pop();
    }
    pick.push(null); walk(i + 1); pick.pop();
  };
  walk(0);
  const placed: PlacedSession[] = [];
  const unplaced: GoalSessionSlot[] = [];
  best.pick.forEach((p, k) => {
    if (p == null) unplaced.push(slots[k]);
    else placed.push({ slot: slots[k], date: days[p].date, md: days[p].md });
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
  /** "not_started" | "on" (weeks 1–8) | "paused". */
  state: "not_started" | "on" | "paused";
  week: number;
  weeksTotal: number;
  weekLabel: Bi | null;
  verdict: Bi;
  facts: Bi[];
  /** Today's session, already in today's version; null when there is none today. */
  today: null | {
    slot: GoalSessionSlot;
    focus: Bi;
    minutes: number;
    version: SessionVersion;
    blocks: { what: Bi; dose: Bi; supervised: boolean }[];
  };
  /** `past` = its day is behind today (MicroPulse does not record whether it was done). */
  thisWeek: { slot: GoalSessionSlot; focus: Bi; date: string | null; day: Bi | null; isToday: boolean; past: boolean }[];
  supervision: Bi | null;
  coachNote: string | null;
  details: Bi[];
};

const slotName = (slot: GoalSessionSlot): Bi => ({ en: `session ${slot}`, is: `æfing ${slot}` });
const cap = (b: Bi): Bi => ({ en: b.en.charAt(0).toUpperCase() + b.en.slice(1), is: b.is.charAt(0).toUpperCase() + b.is.slice(1) });

const DAY_RULE: Bi = {
  en: "The days are picked around the team's matches: never on a match day or the day before or after one, and at least 2 days between sessions.",
  is: "Dagarnir eru valdir í kringum leiki liðsins: aldrei á leikdegi né deginum fyrir eða eftir leik, og minnst 2 dagar á milli æfinga.",
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
};

function sessionsOfWeek(plan: GoalPlan, week: number): GoalSession[] {
  return plan.weeks.find((w) => w.week === week)?.sessions ?? [];
}

/** This week's (and last week's, for the Sunday → Monday gap) placement. */
export function placementFor(plan: GoalPlan, quality: GoalQuality, startDate: string, todayIso: string, cal: TeamCalendar): WeekPlacement | null {
  const week = planWeekOn(startDate, todayIso);
  if (week < 1 || week > PLAN_WEEKS) return null;
  const monday = mondayOf(todayIso);
  let prevLast: string | null = null;
  if (week > 1) {
    const prev = placeWeek({ quality, slots: sessionsOfWeek(plan, week - 1).map((s) => s.slot), monday: addDays(monday, -7), cal });
    prevLast = prev.placed.length ? prev.placed[prev.placed.length - 1].date : null;
  }
  return placeWeek({ quality, slots: sessionsOfWeek(plan, week).map((s) => s.slot), monday, cal, prevLast });
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
      facts: [
        { en: `${plan.sessionsPerWeek} short extra sessions a week, on days that fit around the team's matches.`, is: `${plan.sessionsPerWeek} stuttar aukaæfingar á viku, á dögum sem passa við leiki liðsins.` },
        { en: "Each day's session shows here on Today.", is: "Æfing hvers dags birtist hér á Í dag." },
      ],
      today: null, thisWeek: [], supervision: null,
    };
  }
  if (week > PLAN_WEEKS) return null;

  const sessions = sessionsOfWeek(plan, week);
  const placement = placementFor(plan, quality, input.startDate, todayIso, input.cal)!;
  const bySlot = new Map(sessions.map((s) => [s.slot, s]));
  const todays = placement.placed.find((p) => p.date === todayIso) ?? null;
  const weekRow = plan.weeks.find((w) => w.week === week) ?? null;

  const thisWeek = sessions.map((s) => {
    const p = placement.placed.find((x) => x.slot === s.slot) ?? null;
    return { slot: s.slot, focus: s.focus, date: p?.date ?? null, day: p ? weekdayOnly(p.date) : null, isToday: p?.date === todayIso, past: !!p && p.date < todayIso };
  }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")); // in day order; a left-out session last

  const weekFactParts = placement.placed.map((p) => ({ en: `${weekdayOnly(p.date).en} (${p.slot})`, is: `${weekdayOnly(p.date).is} (${p.slot})` }));
  const weekFact: Bi = placement.placed.length
    ? { en: `This week: ${weekFactParts.map((x) => x.en).join(", ")}.`, is: `Þessi vika: ${weekFactParts.map((x) => x.is).join(", ")}.` }
    : placement.teamDays === 0
      ? { en: "The team has no training days this week, so the goal rests too.", is: "Liðið æfir ekki þessa viku, svo markmiðið hvílir líka." }
      : { en: "This week has no free day for the goal (busy match week), so it rests.", is: "Þessi vika hefur engan lausan dag fyrir markmiðið (þétt leikjavika), svo það hvílir." };
  const unplacedFact: Bi | null = placement.placed.length && placement.unplaced.length
    ? {
        en: `${cap(slotName(placement.unplaced[0])).en}${placement.unplaced.length > 1 ? ` and ${placement.unplaced.slice(1).join(", ")}` : ""} has no free day this week, so it is left out, not made up.`,
        is: `${cap(slotName(placement.unplaced[0])).is}${placement.unplaced.length > 1 ? ` og ${placement.unplaced.slice(1).join(", ")}` : ""} á engan lausan dag þessa viku, svo henni er sleppt, ekki unnin upp.`,
      }
    : null;

  let today: GoalTodayCard["today"] = null;
  let verdict: Bi;
  let colourFact: Bi | null = null;

  if (todays && bySlot.get(todays.slot)) {
    const s = bySlot.get(todays.slot)!;
    const v = sessionForColour(s, input.colour);
    today = {
      slot: s.slot, focus: s.focus, minutes: v.version === "full" ? s.minutes : Math.max(5, Math.round(s.minutes / 2)), version: v.version,
      blocks: v.blocks.map((b) => ({ what: b.what, dose: b.dose, supervised: b.supervised === true })),
    };
    const name = `${cap(slotName(s.slot)).en}: ${s.focus.en}`;
    const nameIs = `${cap(slotName(s.slot)).is}: ${s.focus.is}`;
    if (v.version === "skip") {
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
      verdict = { en: `No goal session today. Next: ${weekdayOnly(next.date).en}, ${slotName(next.slot).en} (${s.focus.en}).`, is: `Engin markmiðsæfing í dag. Næst: ${weekdayOnly(next.date).is}, ${slotName(next.slot).is} (${s.focus.is}).` };
    } else if (placement.placed.length) {
      verdict = { en: "No goal session today. This week's sessions are behind you; next week's show on Monday.", is: "Engin markmiðsæfing í dag. Æfingar vikunnar eru búnar; næsta vika birtist á mánudag." };
    } else if (placement.teamDays === 0) {
      verdict = { en: "No goal session this week: the team is not training.", is: "Engin markmiðsæfing þessa viku: liðið æfir ekki." };
    } else {
      verdict = { en: "No goal session this week: the match schedule leaves no free day.", is: "Engin markmiðsæfing þessa viku: leikjadagskráin skilur engan dag eftir." };
    }
  }

  const facts = [weekFact, colourFact ?? unplacedFact ?? DAY_RULE, ...(colourFact && unplacedFact ? [unplacedFact] : [])]
    .filter((f): f is Bi => !!f).slice(0, 3);
  if (!placement.weekKnown) details.unshift(WEEK_UNSET);
  details.unshift(DAY_RULE);

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
