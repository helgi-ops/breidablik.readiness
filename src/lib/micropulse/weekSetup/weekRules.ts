/**
 * Week rules (brief §5, 2026-11-23). Pure and client-safe.
 *
 * INSEASON_THREE_IN_A_ROW: in season the squad never trains three days in a row. A training or recovery session
 * counts; a match day does not count and ends the run (it is not a training session); a day off ends it too.
 * Advisory only: the coach sees the run and the nearest fix, and can keep the plan (that choice is logged with a
 * reason, `session_fit_override_log`, model_source "week_rule"). The plan is never blocked and nothing here reads or
 * writes the readiness colour.
 *
 * The nearest fix turns the fewest days off. Among days that do the job equally well it picks by match day:
 * MD+2 first (48 h after the match), then MD-2, then the days further from the match; MD-4 and MD-3 (the week's main
 * days) and MD+1 / MD-1 last. For a Sunday match after a Sunday match that is MD+2 and MD-2 off; the MD-2 tactical
 * work splits onto MD-3 and MD-1 (the coach's rule).
 */

import { addDays, dayLabel, daysBetween, mdLabel } from "@/lib/micropulse/goalPlan/today";
import type { AppliedAdaptation } from "@/lib/micropulse/strengthProgramming/types";

type Bi = { en: string; is: string };

export const THREE_IN_A_ROW_RULE = "INSEASON_THREE_IN_A_ROW" as const;
/** The most training days in a row in season. */
export const MAX_SESSIONS_IN_A_ROW = 2;
/** `session_fit_override_log.model_source` for a kept week. */
export const WEEK_RULE_LOG_SOURCE = "week_rule" as const;

export const THREE_IN_A_ROW_EVIDENCE =
  "MicroPulse rule (the coach's in-season plan, 2026-11-22): never three training sessions in a row; a match day is " +
  "not a session. A day off at MD+2 is linked with a lower non-contact injury rate (Buchheit et al. 2023b, 56 " +
  "team-seasons).";

export type WeekRuleDayKind = "session" | "off" | "match";

export type WeekRuleDay = {
  date: string;
  kind: WeekRuleDayKind;
  /** A day the fix may turn off (the week being planned). Days from the weeks around it only count. Default true. */
  editable?: boolean;
};

/** week_plans.day_type → the rule's day kind. No row / unknown = no session known, so it does not count. */
export function dayKindOf(dayType: string | null | undefined): WeekRuleDayKind {
  const t = String(dayType ?? "").toUpperCase();
  if (t === "GAME" || t === "MATCH") return "match";
  if (t === "TRAIN" || t === "RECOVERY") return "session";
  return "off";
}

/** The rule holds in season: in-season and play-offs. With no phase known it holds when a match is in the days. */
export function threeInARowApplies(phase: string | null | undefined, days: WeekRuleDay[]): boolean {
  const p = String(phase ?? "").toLowerCase();
  if (p === "inseason" || p === "playoffs" || p === "competitive") return true;
  if (p) return false;
  return days.some((d) => d.kind === "match");
}

type Ref = { date: string; md: string | null };

export type ThreeInARowRun = { days: Ref[] };

export type ThreeInARowMove = { from: Ref; to: Ref[] };

export type ThreeInARowFix = {
  /** The days to make a day off. */
  off: Ref[];
  /** Where the work of a pre-match day that goes off moves (MD-2 → MD-3 and MD-1). */
  moves: ThreeInARowMove[];
  /** Runs the fix cannot break inside the week being planned (they lean on the weeks around it). */
  unresolved: ThreeInARowRun[];
};

export type ThreeInARowCheck = {
  ruleId: typeof THREE_IN_A_ROW_RULE;
  /** False out of season (nothing checked). */
  applies: boolean;
  ok: boolean;
  runs: ThreeInARowRun[];
  fix: ThreeInARowFix | null;
  /** One sentence for the coach. */
  headline: Bi | null;
  /** 2–3 plain facts. */
  facts: Bi[];
  adaptation: AppliedAdaptation | null;
};

/** Which day goes off first (lower = sooner). */
const DROP_ORDER = ["MD+2", "MD-2", "MD+3", "MD+4", "MD-5", "MD-6", "MD+5", "MD+6", "MD-1", "MD+1", "MD-3", "MD-4"];
const dropRank = (md: string | null) => {
  const i = md ? DROP_ORDER.indexOf(md) : -1;
  return i >= 0 ? i : 6; // an unlabelled day ranks with the days far from a match
};

/** Days off a run of `n` sessions needs so no part is longer than the limit. */
const need = (n: number) => Math.floor(n / (MAX_SESSIONS_IN_A_ROW + 1));

/** Runs of sessions longer than the limit, in date order (days must be consecutive dates). */
function runsOf(days: WeekRuleDay[]): WeekRuleDay[][] {
  const out: WeekRuleDay[][] = [];
  let cur: WeekRuleDay[] = [];
  const close = () => { if (cur.length > MAX_SESSIONS_IN_A_ROW) out.push(cur); cur = []; };
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const gap = i > 0 && daysBetween(days[i - 1].date, d.date) !== 1;
    if (gap) close();
    if (d.kind === "session") cur.push(d); else close();
  }
  close();
  return out;
}

/** The fewest editable days off that break a run; ties go to the day that goes off first by match day. */
function breakRun(run: WeekRuleDay[], mdOf: (d: string) => string | null): { off: WeekRuleDay[]; left: WeekRuleDay[][] } {
  if (run.length <= MAX_SESSIONS_IN_A_ROW) return { off: [], left: [] };
  let best: { i: number; cost: number; rank: number } | null = null;
  run.forEach((d, i) => {
    if (d.editable === false) return;
    const cost = need(i) + need(run.length - 1 - i);
    const rank = dropRank(mdOf(d.date));
    if (!best || cost < best.cost || (cost === best.cost && rank < best.rank)) best = { i, cost, rank };
  });
  if (!best) return { off: [], left: [run] };
  const i = (best as { i: number }).i;
  const a = breakRun(run.slice(0, i), mdOf);
  const b = breakRun(run.slice(i + 1), mdOf);
  return { off: [...a.off, run[i], ...b.off], left: [...a.left, ...b.left] };
}

const ref = (d: { date: string }, mdOf: (d: string) => string | null): Ref => ({ date: d.date, md: mdOf(d.date) });
const name = (r: Ref): Bi => {
  const l = dayLabel(r.date);
  return r.md ? { en: `${l.en} (${r.md})`, is: `${l.is} (${r.md})` } : l;
};
const list = (xs: Bi[], and: Bi): Bi => {
  const j = (k: "en" | "is") => xs.length <= 1 ? (xs[0]?.[k] ?? "") : `${xs.slice(0, -1).map((x) => x[k]).join(", ")} ${and[k]} ${xs[xs.length - 1][k]}`;
  return { en: j("en"), is: j("is") };
};
const AND: Bi = { en: "and", is: "og" };

/**
 * Checks the days (consecutive dates; the week being planned plus any days around it that count). `matchDates` gives
 * the match-day labels (MD-2 …) and may reach outside the days, so a Monday after a Sunday match reads MD+1.
 */
export function checkThreeInARow(args: { days: WeekRuleDay[]; matchDates: string[]; phase: string | null | undefined }): ThreeInARowCheck {
  const days = [...args.days].sort((a, b) => a.date.localeCompare(b.date));
  const empty: ThreeInARowCheck = { ruleId: THREE_IN_A_ROW_RULE, applies: false, ok: true, runs: [], fix: null, headline: null, facts: [], adaptation: null };
  if (!threeInARowApplies(args.phase, days)) return empty;
  const games = [...new Set([...args.matchDates, ...days.filter((d) => d.kind === "match").map((d) => d.date)])];
  const mdOf = (iso: string) => mdLabel(iso, games);
  // A run counts only when it touches the week being planned.
  const raw = runsOf(days).filter((r) => r.some((d) => d.editable !== false));
  if (!raw.length) return { ...empty, applies: true };

  const runs: ThreeInARowRun[] = raw.map((r) => ({ days: r.map((d) => ref(d, mdOf)) }));
  const off: WeekRuleDay[] = [];
  const unresolved: ThreeInARowRun[] = [];
  for (const r of raw) {
    const b = breakRun(r, mdOf);
    off.push(...b.off);
    unresolved.push(...b.left.map((l) => ({ days: l.map((d) => ref(d, mdOf)) })));
  }
  const offSet = new Set(off.map((d) => d.date));
  const isSession = (iso: string) => days.some((d) => d.date === iso && d.kind === "session" && !offSet.has(iso));
  // A pre-match day that goes off hands its work to the session days either side (MD-2 → MD-3 and MD-1).
  const moves: ThreeInARowMove[] = off
    .map((d) => ref(d, mdOf))
    .filter((r) => !!r.md && /^MD-\d$/.test(r.md))
    .map((r) => ({ from: r, to: [addDays(r.date, -1), addDays(r.date, 1)].filter(isSession).map((iso) => ({ date: iso, md: mdOf(iso) })) }))
    .filter((m) => m.to.length > 0);
  const fix: ThreeInARowFix = { off: off.map((d) => ref(d, mdOf)), moves, unresolved };

  const longest = Math.max(...runs.map((r) => r.days.length));
  const runText = list(runs.map((r) => {
    const a = name(r.days[0]), z = name(r.days[r.days.length - 1]);
    return { en: `${a.en} to ${z.en}`, is: `${a.is} til ${z.is}` };
  }), AND);
  const offText = list(fix.off.map(name), AND);
  const headline: Bi = {
    en: `${longest} training days in a row — in season the squad gets a day off after two.`,
    is: `${longest} æfingadagar í röð — á keppnistímabili fær hópurinn frí eftir tvo.`,
  };
  const moveText = (m: ThreeInARowMove): Bi => {
    const to = list(m.to.map(name), AND);
    const split = m.to.length > 1;
    return m.from.md === "MD-2"
      ? split
        ? { en: `The MD-2 tactical work splits onto ${to.en}.`, is: `Taktíska vinnan á MD-2 skiptist á ${to.is}.` }
        : { en: `The MD-2 tactical work moves to ${to.en}.`, is: `Taktíska vinnan á MD-2 færist á ${to.is}.` }
      : { en: `The ${m.from.md} work ${split ? "splits onto" : "moves to"} ${to.en}.`, is: `Vinnan á ${m.from.md} ${split ? "skiptist á" : "færist á"} ${to.is}.` };
  };
  const facts: Bi[] = [
    { en: `In a row: ${runText.en}. A match day does not count as a session.`, is: `Í röð: ${runText.is}. Leikdagur telst ekki sem æfing.` },
  ];
  if (fix.off.length) {
    const mv = fix.moves.map(moveText);
    facts.push({
      en: `Nearest fix: ${offText.en} off.${mv.length ? ` ${mv.map((m) => m.en).join(" ")}` : ""}`,
      is: `Næsta lagfæring: frí ${offText.is}.${mv.length ? ` ${mv.map((m) => m.is).join(" ")}` : ""}`,
    });
  }
  if (unresolved.length) {
    facts.push({
      en: "Part of the run is in the week before or after; change that week to break it.",
      is: "Hluti raðarinnar er í vikunni á undan eða eftir; breyttu þeirri viku til að rjúfa hana.",
    });
  }
  facts.push({ en: "Advice only: you can keep the plan; your reason is saved.", is: "Aðeins ráð: þú getur haldið planinu; ástæðan þín er vistuð." });

  const adaptation: AppliedAdaptation = {
    ruleId: THREE_IN_A_ROW_RULE,
    triggerEN: `In season, ${longest} training days in a row (${runText.en}).`,
    triggerIS: `Á keppnistímabili, ${longest} æfingadagar í röð (${runText.is}).`,
    actionEN: fix.off.length ? `Advised: ${offText.en} off. Not applied; the coach decides.` : "Flagged for the coach; no day in this week can break it.",
    actionIS: fix.off.length ? `Ráðlagt: frí ${offText.is}. Ekki gert sjálfkrafa; þjálfarinn ræður.` : "Flaggað fyrir þjálfarann; enginn dagur í þessari viku rýfur röðina.",
    evidence: THREE_IN_A_ROW_EVIDENCE,
  };
  return { ruleId: THREE_IN_A_ROW_RULE, applies: true, ok: false, runs, fix, headline, facts, adaptation };
}

/** The runs as one string, so a coach's "keep" holds only for the week they saw. */
export function runSignature(check: Pick<ThreeInARowCheck, "runs">): string {
  return check.runs.map((r) => `${r.days[0]?.date}..${r.days[r.days.length - 1]?.date}`).join(",");
}

/** The week with the fix applied (the fix's days become days off). */
export function applyThreeInARowFix<T extends { date: string; kind: WeekRuleDayKind }>(days: T[], fix: ThreeInARowFix | null): T[] {
  if (!fix) return days;
  const off = new Set(fix.off.map((r) => r.date));
  return days.map((d) => (off.has(d.date) ? { ...d, kind: "off" as const } : d));
}
