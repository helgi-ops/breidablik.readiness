/**
 * Weekday plan vs the week the coach actually set up (2026-11-18, review item E).
 *
 * In a week without a match the individualised modes build each day from the coach's weekday plan
 * (`team_strength_palette.no_match_week`: Mon strength, Wed power, …). That plan is per weekday, but each week's
 * training days are set in Week setup (`week_plans`). When a strength or power day of the plan falls on a day OFF,
 * that session simply never happens, and nothing said so. This check names it and suggests the nearest free
 * training day, as a move for THAT week only (`no_match_week.weeks`), so the weekday plan for other weeks is
 * untouched. Pure: the caller loads the days and the match dates; applying a move is the coach's click.
 *
 * "No match" = the engine's rule (fetchMdContextInfo): no match from 4 days back to 5 days ahead.
 */

import {
  WEEKDAYS,
  WEEKDAY_LABEL,
  NO_MATCH_DAY_LABEL,
  effectiveNoMatchWeek,
  noMatchDayFor,
  weekdayOf,
  type NoMatchDayKind,
  type NoMatchWeek,
  type Weekday,
} from "./structures";

export type PlannedDay = { date: string; dayType: string | null };

type Bi = { en: string; is: string };
type KeyKind = "strength" | "power";

export type NoMatchWeekIssue = {
  /** Monday of the week (YYYY-MM-DD). */
  weekStart: string;
  /** Strength / power days of the plan that are days off this week. */
  lost: Array<{ date: string; weekday: Weekday; kind: KeyKind; stillInWeek: boolean }>;
  /** The week's training days without a match, with what the plan says for them (null = not set). */
  trainingDays: Array<{ date: string; weekday: Weekday; kind: NoMatchDayKind | null }>;
  /** One-click fixes for this week only: the `kind` day moves from `from` (a day off) to `to`. */
  suggestions: Array<{ kind: KeyKind; from: Weekday; to: Weekday }>;
  headline: Bi;
  facts: Bi[];
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => {
  const wd = weekdayOf(iso);
  return wd ? addDays(iso, -WEEKDAYS.indexOf(wd)) : iso;
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/** The engine's "no match nearby": no match day from 4 days back to 5 ahead. */
export function noMatchNearby(date: string, gameDates: Iterable<string>): boolean {
  for (const g of gameDates) {
    const d = dayDiff(g, date);
    if (d >= -4 && d <= 5) return false;
  }
  return true;
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const dayMonth = (iso: string): Bi => {
  const [, m, d] = iso.split("-").map(Number);
  return { en: `${d} ${MONTH_EN[m - 1]}`, is: `${d}. ${MONTH_IS[m - 1]}` };
};
const short = (wd: Weekday): Bi => ({ en: WEEKDAY_LABEL[wd].enShort, is: WEEKDAY_LABEL[wd].isShort });
const list = (xs: Bi[], andEn = "and", andIs = "og"): Bi => {
  const j = (a: string[], and: string) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} ${and} ${a[a.length - 1]}`);
  return { en: j(xs.map((x) => x.en), andEn), is: j(xs.map((x) => x.is), andIs) };
};
const kindName = (k: KeyKind): Bi => ({ en: NO_MATCH_DAY_LABEL[k].en.toLowerCase(), is: NO_MATCH_DAY_LABEL[k].is.toLowerCase() });

/**
 * Check each week in `days` (any range; the week setup passes one week, the strength page the next few). A day with
 * no week_plans row is not judged (the week isn't set up yet). GAME days are never "no match" days.
 */
export function checkNoMatchWeeks(args: { days: PlannedDay[]; gameDates: string[]; plan: NoMatchWeek }): NoMatchWeekIssue[] {
  // The plan the engine builds by: the coach's, else the default (Mon strength, Thu power; 2026-11-23).
  const plan = effectiveNoMatchWeek(args.plan).week;
  const games = new Set(args.gameDates);
  for (const d of args.days) if (String(d.dayType ?? "").toUpperCase() === "GAME") games.add(d.date);

  const weeks = new Map<string, PlannedDay[]>();
  for (const d of args.days) {
    if (!weekdayOf(d.date) || d.dayType == null) continue;
    const ws = mondayOf(d.date);
    weeks.set(ws, [...(weeks.get(ws) ?? []), d]);
  }

  const out: NoMatchWeekIssue[] = [];
  for (const [weekStart, rows] of [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const free = rows.filter((r) => noMatchNearby(r.date, games)).sort((a, b) => a.date.localeCompare(b.date));
    const isOff = (r: PlannedDay) => String(r.dayType ?? "").toUpperCase() === "OFF";
    // The kind of each day = that week's move, else the weekday plan (what the engine builds).
    const trainingDays = free.filter((r) => !isOff(r)).map((r) => {
      const weekday = weekdayOf(r.date)!;
      return { date: r.date, weekday, kind: noMatchDayFor(r.date, plan) };
    });
    const lostRaw = free.filter(isOff).flatMap((r) => {
      const weekday = weekdayOf(r.date)!;
      const kind = noMatchDayFor(r.date, plan);
      return kind === "strength" || kind === "power" ? [{ date: r.date, weekday, kind: kind as KeyKind }] : [];
    });
    if (!lostRaw.length) continue;

    const lost = lostRaw.map((l) => ({ ...l, stillInWeek: trainingDays.some((t) => t.kind === l.kind) }));

    // Nearest training day that is not set, or only a light day; a day is used once.
    const used = new Set<Weekday>();
    const suggestions: NoMatchWeekIssue["suggestions"] = [];
    for (const l of lost) {
      const cand = trainingDays
        .filter((t) => (t.kind == null || t.kind === "light") && !used.has(t.weekday))
        .sort((a, b) => Math.abs(dayDiff(a.date, l.date)) - Math.abs(dayDiff(b.date, l.date))
          || (a.kind == null ? 0 : 1) - (b.kind == null ? 0 : 1)
          || a.date.localeCompare(b.date))[0];
      if (cand) { used.add(cand.weekday); suggestions.push({ kind: l.kind, from: l.weekday, to: cand.weekday }); }
    }

    const wk = dayMonth(weekStart);
    const lostBits = lost.map((l) => ({ en: `${short(l.weekday).en} (${kindName(l.kind).en})`, is: `${short(l.weekday).is} (${kindName(l.kind).is})` }));
    const lostList = list(lostBits);
    const plural = lost.length > 1;
    const headline: Bi = {
      en: `Week of ${wk.en}: ${lostList.en} ${plural ? "are days" : "is a day"} off, so ${plural ? "those sessions don't" : "that session doesn't"} happen.`,
      is: `Vika ${wk.is}: ${lostList.is} ${plural ? "eru frídagar" : "er frídagur"}, svo ${plural ? "þær æfingar falla" : "sú æfing fellur"} niður.`,
    };
    const facts: Bi[] = [];
    if (trainingDays.length) {
      const td = list(trainingDays.map((t) => short(t.weekday)));
      facts.push({ en: `Training days that week: ${td.en}.`, is: `Æfingadagar þá viku: ${td.is}.` });
      const unset = trainingDays.filter((t) => t.kind == null);
      if (unset.length) {
        const u = list(unset.map((t) => short(t.weekday)));
        facts.push(unset.length > 1
          ? { en: `${u.en} have no day type in the weekday plan, so they build as light days.`, is: `${u.is} hafa enga tegund í vikuplaninu og verða því léttir dagar.` }
          : { en: `${u.en} has no day type in the weekday plan, so it builds as a light day.`, is: `${u.is} hefur enga tegund í vikuplaninu og verður því léttur dagur.` });
      }
    }
    for (const l of lost.filter((x) => x.stillInWeek)) {
      const other = trainingDays.filter((t) => t.kind === l.kind).map((t) => short(t.weekday));
      facts.push({ en: `The week still has a ${kindName(l.kind).en} on ${list(other).en}.`, is: `Vikan hefur samt ${kindName(l.kind).is} á ${list(other).is}.` });
    }
    out.push({ weekStart, lost, trainingDays, suggestions, headline, facts });
  }
  return out;
}

/** That week's moves with the suggestions applied: each `to` day gets the kind, each `from` day (a day off) rest. */
export function applySuggestions(
  current: Partial<Record<Weekday, NoMatchDayKind>> | undefined,
  suggestions: Array<{ kind: KeyKind; from: Weekday; to: Weekday }>,
): Partial<Record<Weekday, NoMatchDayKind>> {
  const out = { ...(current ?? {}) };
  for (const s of suggestions) { out[s.from] = "rest"; out[s.to] = s.kind; }
  return out;
}

/** "Tue: strength day" / "Þri: styrktardagur" — one suggested move. */
export function suggestionLabel(s: { kind: KeyKind; from: Weekday; to: Weekday }): Bi {
  return {
    en: `${WEEKDAY_LABEL[s.from].enShort} → ${WEEKDAY_LABEL[s.to].enShort} (${kindName(s.kind).en})`,
    is: `${WEEKDAY_LABEL[s.from].isShort} → ${WEEKDAY_LABEL[s.to].isShort} (${kindName(s.kind).is})`,
  };
}

/** The one-week moves to list (with Undo), in date order, for weeks from `fromMonday` on. */
export function movesToShow(plan: NoMatchWeek, fromMonday: string): Array<{ weekStart: string; line: Bi }> {
  return Object.entries(plan.weeks ?? {})
    .filter(([ws]) => ws >= fromMonday)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, days]) => {
      const set = WEEKDAYS.filter((d) => days[d] && days[d] !== "rest").map((d) => ({
        en: `${WEEKDAY_LABEL[d].enShort} ${NO_MATCH_DAY_LABEL[days[d]!].en.toLowerCase()}`,
        is: `${WEEKDAY_LABEL[d].isShort} ${NO_MATCH_DAY_LABEL[days[d]!].is.toLowerCase()}`,
      }));
      const wk = dayMonth(ws);
      const l = list(set);
      return { weekStart: ws, line: { en: `Week of ${wk.en}, this week only: ${l.en}.`, is: `Vika ${wk.is}, aðeins þessa viku: ${l.is}.` } };
    });
}
