/**
 * Plan intent — from what the coach wants (a fixed list, `vocabulary.ts`) to recommendations for a block or a week.
 * Pure, no I/O. RULES decide here; the AI only read the coach's text into the list.
 *
 * Every number comes from a rule that already exists, so a recommendation never disagrees with what the system
 * delivers:
 *   - heavy strength reps per MD day, the near-match fast dose and its speed zones → `strengthProgramming/weekRule.ts`
 *   - Nordic / Copenhagen once a week → `strengthProgramming/preventionRule.ts`
 *   - the block's strength scheme → `strengthProgramming/seasonPhaseStrength.ts` (strengthForBlockGoal)
 *   - conditioning formats (work / rest / reps / % of MAS) → `load/intervalSession.ts` (HIIT_FORMATS) +
 *     `periodization.intervalSpeedsFromMas`
 *   - on-pitch forms (pitch size, bouts) → `dayIdeas.pitchIdeasFor`
 *   - what each MD day is for → the team's periodization model (`periodizationModel.specForDay`)
 *
 * What is NEW here and is MicroPulse's rule, not a study (said on every recommendation that uses it): which MD day
 * carries each kind of conditioning and the top-speed dose, the mapping from the coach's goals to a block goal, and
 * the session lengths in the week grid (estimates). The recommendations are shown, never applied: each one links to
 * the page where the coach changes it.
 */

import { BLOCK_GOAL_LABEL, intervalSpeedsFromMas } from "@/lib/micropulse/periodization";
import { specForDay, DEFAULT_MD_MICROCYCLE, type PeriodizationModel } from "@/lib/micropulse/periodization/periodizationModel";
import { HIIT_FORMATS, type HiitFormatId } from "@/lib/micropulse/load/intervalSession";
import { pitchIdeasFor } from "@/lib/micropulse/dayIdeas";
import {
  MATCH_WEEK_HEAVY_REPS, NO_MATCH_WEEK_HEAVY_TOTAL, NEAR_MATCH_ZONE, noMatchWeekRule, NEAR_MATCH_SETS, NEAR_MATCH_REPS,
  setsForReps, speedZoneText, type MdRepsPerSet, type WeekRuleSeason,
} from "@/lib/micropulse/strengthProgramming/weekRule";
import { PREVENTION_DOSE } from "@/lib/micropulse/strengthProgramming/preventionRule";
import { strengthForBlockGoal, type SeasonPhaseKey } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";
import { NO_MATCH_DAY_LABEL, type NoMatchWeek } from "@/lib/micropulse/strengthProgramming/structures";
import type { MdContext } from "@/lib/micropulse/strengthProgramming/types";
import { GOAL_LABEL, MODE_LABEL, type Bi, type IntentGoal, type IntentItem, type IntentMode, type PlanScope } from "./vocabulary";

// ───────────────────────────── Inputs ─────────────────────────────

export type PlanPhase = "preseason" | "inseason" | "offseason";
export type BlockGoal = "accum" | "transmute" | "realize";

export type PlanContext = {
  scope: PlanScope;
  /** Monday of the week, or of the block's first week (YYYY-MM-DD). */
  start: string;
  /** 1 for a week; the block's length in weeks. */
  weeks: number;
  phase: PlanPhase | null;
  /** The block's goal now (block scope), null when not known. */
  blockGoal: BlockGoal | null;
  /** Match dates from a week before `start` to a week after the window (YYYY-MM-DD). */
  matchDates: string[];
  /** The coach's reps a set per heavy MD day (team_strength_palette.md_reps_per_set). */
  repsPerSet: MdRepsPerSet;
  /** The coach's weekday plan for a week without a match (team_strength_palette.no_match_week). */
  noMatchWeek: NoMatchWeek | null;
  /** How many players have a MAS test, of the active squad. */
  mas: { withMas: number; squad: number };
  /** The team's periodization model (what each MD day is for). */
  model?: PeriodizationModel;
};

// ───────────────────────────── Outputs ─────────────────────────────

export type ItemKind = "strength" | "power" | "prevention" | "conditioning" | "speed" | "pitch" | "fresh";
/** Where the work sits relative to the football session (the course's "before / after / part of / own day"). */
export type ItemWhen = "before" | "after" | "part" | "own";
export type LoadBand = "low" | "moderate" | "high";

export type GridItem = { goal: IntentGoal; kind: ItemKind; when: ItemWhen; text: Bi; load: LoadBand; minutes: number };
export type GridDay = { date: string; md: string | null; isMatch: boolean; football: Bi | null; items: GridItem[] };

export type PlanRecommendation = {
  goal: IntentGoal | "block_goal";
  mode: IntentMode;
  /** One sentence: what to do. */
  headline: Bi;
  /** 2–3 plain facts: the why and the key numbers. */
  facts: Bi[];
  /** "now → suggestion" when the advice is a change; null when nothing needs changing. */
  now: Bi | null;
  suggestion: Bi | null;
  /** When what the coach wants does not fit the week / block. */
  conflict: Bi | null;
  confidence: "high" | "moderate" | "low";
  cite: string;
  /** What in this recommendation is MicroPulse's rule rather than a study's finding. */
  ownRule: Bi | null;
  link: { href: string; label: Bi } | null;
};

export type PlanAdvice = {
  verdict: Bi;
  recommendations: PlanRecommendation[];
  /** One week laid out day by day: the week itself, or the block's first week. */
  grid: GridDay[];
  /** Notes that hold for the whole read (estimated lengths etc.). */
  notes: Bi[];
};

// ───────────────────────────── Dates and MD days ─────────────────────────────

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

/**
 * The MD label of each day of the week from `weekStart`. The day after a match is always MD+1 (recovery); MD+2
 * only when the next match is more than 2 days away; else the days count down to the next match (MD-5 … MD-1).
 * A day with no match within 5 days ahead or 2 behind has no label (a week without a match).
 */
export function mdLabelsForWeek(weekStart: string, matchDates: string[]): Array<{ date: string; md: string | null; isMatch: boolean }> {
  const ms = [...new Set(matchDates)].sort();
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    if (ms.includes(date)) return { date, md: "MD", isMatch: true };
    const prev = [...ms].reverse().find((m) => m < date) ?? null;
    const next = ms.find((m) => m > date) ?? null;
    const dPrev = prev ? daysBetween(prev, date) : Infinity;
    const dNext = next ? daysBetween(date, next) : Infinity;
    let md: string | null = null;
    if (dPrev === 1) md = "MD+1";
    else if (dPrev === 2 && dNext > 2) md = "MD+2";
    else if (dNext <= 5) md = `MD-${dNext}`;
    else if (dPrev <= 2) md = `MD+${dPrev}`;
    return { date, md, isMatch: false };
  });
}

export const matchesInWeek = (weekStart: string, matchDates: string[]) => {
  const end = addDays(weekStart, 6);
  return new Set(matchDates.filter((d) => d >= weekStart && d <= end)).size;
};

// ───────────────────────────── Small helpers ─────────────────────────────

const bi = (en: string, is: string): Bi => ({ en, is });
const listWords = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);

const OWN_DAYS = bi(
  "Which MD day carries this is MicroPulse's rule: no study places it on a given day.",
  "Á hvaða leikdegi þetta er er regla MicroPulse: engin rannsókn setur það á tiltekinn dag.",
);
const LINK_STRENGTH = { href: "/coach/strength", label: bi("Strength → session structure per MD day", "Styrkur → uppsetning á hverjum leikdegi") };
const LINK_COND = { href: "/coach/conditioning", label: bi("Conditioning → tests and interval sessions", "Þol → próf og interval-æfingar") };
const LINK_WEEK = { href: "/coach/week-setup", label: bi("Week setup → each day's stimulus", "Vikuuppsetning → áreiti hvers dags") };
const LINK_SPEED = { href: "/coach/hsr-intelligence", label: bi("Top speed due → who has not run at 90% lately", "Tími á hámarkshraða → hver hefur ekki hlaupið á 90% nýlega") };
const LINK_HUB = { href: "/coach/periodization-hub?tab=plan", label: bi("Meso → block goal", "Mesó → markmið lotu") };

const seasonOf = (phase: PlanPhase | null): WeekRuleSeason => (phase === "preseason" ? "preseason" : "hold");
const seasonPhaseKey = (phase: PlanPhase | null): SeasonPhaseKey => (phase === "preseason" ? "preseason" : phase === "offseason" ? "offseason" : "competitive");
const isBuildPhase = (phase: PlanPhase | null) => phase === "preseason" || phase === "offseason";

/** Total minutes of an interval format (work + rest, + rest between sets). */
function formatMinutes(id: HiitFormatId): number {
  const f = HIIT_FORMATS[id];
  const between = (f.restBetweenSetsSec ?? 0) * Math.max(0, f.sets - 1);
  return Math.round(((f.workSec + f.restSec) * f.reps * f.sets + between) / 60);
}
const pctMasOf = (id: HiitFormatId) => intervalSpeedsFromMas(null).find((z) => z.type === HIIT_FORMATS[id].zoneType)?.pctMas ?? null;
const secs = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);
const secsIs = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} mín` : `${s} s`);

/** "4 × 4 min at 105% MAS, 150 s rest" in both languages. */
function formatLine(id: HiitFormatId): Bi {
  const f = HIIT_FORMATS[id];
  const pct = pctMasOf(id);
  if (f.continuous) return bi(`${secs(f.workSec)} continuous at ${pct}% of MAS`, `${secsIs(f.workSec)} samfellt á ${pct}% af MAS`);
  const sets = f.sets > 1 ? `${f.sets} × ` : "";
  const between = f.restBetweenSetsSec ? `, ${secs(f.restBetweenSetsSec)} between sets` : "";
  const betweenIs = f.restBetweenSetsSec ? `, ${secsIs(f.restBetweenSetsSec)} á milli setta` : "";
  const at = f.nearMax ? "near-max" : `${pct}% of MAS`;
  const atIs = f.nearMax ? "nálægt hámarki" : `${pct}% af MAS`;
  return bi(
    `${sets}${f.reps} × ${secs(f.workSec)} at ${at}, ${secs(f.restSec)} rest${between}`,
    `${sets}${f.reps} × ${secsIs(f.workSec)} á ${atIs}, ${secsIs(f.restSec)} hvíld${betweenIs}`,
  );
}

// ───────────────────────────── The week, as the rules see it ─────────────────────────────

type WeekShape = {
  weekStart: string;
  days: Array<{ date: string; md: string | null; isMatch: boolean }>;
  matches: number;
  /** MD days present this week (training days only). */
  has: (md: string) => boolean;
  /** A week without a match: the coach's weekday plan (strength / power / light / rest) per date. */
  noMatchKind: (date: string) => string | null;
};

function weekShape(ctx: PlanContext, weekStart: string): WeekShape {
  const days = mdLabelsForWeek(weekStart, ctx.matchDates);
  const mds = new Set(days.filter((d) => !d.isMatch && d.md).map((d) => d.md as string));
  return {
    weekStart,
    days,
    matches: matchesInWeek(weekStart, ctx.matchDates),
    has: (md) => mds.has(md),
    noMatchKind: (date) => noMatchWeekRule(date, ctx.noMatchWeek, seasonOf(ctx.phase))?.kind ?? null,
  };
}

/** The heavy days of a week and their reps (week rule). In a week without a match: the coach's weekday plan, through
 *  the same `noMatchWeekRule` the delivery uses. */
function heavyDays(ctx: PlanContext, w: WeekShape): Array<{ date: string; md: string | null; reps: number }> {
  const season = seasonOf(ctx.phase);
  if (w.matches > 0) {
    return w.days
      .filter((d) => !d.isMatch && d.md && MATCH_WEEK_HEAVY_REPS[season][d.md as MdContext] != null)
      .map((d) => ({ date: d.date, md: d.md, reps: MATCH_WEEK_HEAVY_REPS[season][d.md as MdContext] as number }));
  }
  // A week without a match: the delivered rule itself (strength days first, never two in a row, at most three).
  return w.days
    .map((d) => ({ date: d.date, md: null, reps: noMatchWeekRule(d.date, ctx.noMatchWeek, season)?.heavyReps ?? null }))
    .filter((d): d is { date: string; md: null; reps: number } => d.reps != null);
}

// ───────────────────────────── One recommendation per goal ─────────────────────────────

type GoalOut = { rec: PlanRecommendation; items: Array<{ date: string; item: GridItem }> };

const base = (goal: IntentGoal, mode: IntentMode): Omit<PlanRecommendation, "headline" | "facts" | "cite"> => ({
  goal, mode, now: null, suggestion: null, conflict: null, confidence: "high", ownRule: null, link: null,
});

function dateOf(w: WeekShape, md: string): string | null {
  return w.days.find((d) => d.md === md && !d.isMatch)?.date ?? null;
}

function strengthRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi): GoalOut {
  const season = seasonOf(ctx.phase);
  const days = heavyDays(ctx, w);
  const total = days.reduce((s, d) => s + d.reps, 0);
  const split = days.map((d) => `${d.md ?? new Date(utc(d.date)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${d.reps}`).join(" + ");
  const splitIs = days.map((d) => `${d.md ?? new Date(utc(d.date)).toLocaleDateString("is-IS", { weekday: "short", timeZone: "UTC" })} ${d.reps}`).join(" + ");
  const perSet = days.map((d) => (d.md && ctx.repsPerSet[d.md as MdContext] ? { md: d.md, n: ctx.repsPerSet[d.md as MdContext] as number, sets: setsForReps(d.reps, ctx.repsPerSet[d.md as MdContext] as number) } : null)).filter(Boolean) as Array<{ md: string; n: number; sets: number }>;
  const out: GoalOut = { rec: { ...base("max_strength", mode), headline: bi("", ""), facts: [], cite: "Rønnestad 2011; Helgerud (Hoff & Helgerud 2004); Silva 2018; Cuthbert 2021", link: LINK_STRENGTH, ownRule: bi("How the week's reps are split between the heavy days is MicroPulse's rule.", "Hvernig endurtekningum vikunnar er skipt á þungu dagana er regla MicroPulse.") }, items: [] };
  const r = out.rec;
  const anchors = bi("12 heavy reps a week kept strength in season (Rønnestad 2011); 32 a week built it in a pre-season (Helgerud).", "12 þungar endurtekningar á viku héldu styrk á tímabili (Rønnestad 2011); 32 á viku byggðu hann upp á undirbúningstímabili (Helgerud).");
  const timing = bi("Heavy work stays 72 h or more from a match: jump and hamstring strength are still down 72 h after one (Silva 2018).", "Þung vinna er 72 klst. eða meira frá leik: stökk og styrkur aftanlæris eru enn niðri 72 klst. eftir leik (Silva 2018).");

  if (!days.length) {
    r.headline = w.matches > 0
      ? bi(`Max strength: no day ${wk.en} is 72 h from a match, so no heavy day fits.`, `Hámarksstyrkur: enginn dagur ${wk.is} er 72 klst. frá leik, svo enginn þungur dagur kemst fyrir.`)
      : bi(`Max strength: a week without a match takes ${NO_MATCH_WEEK_HEAVY_TOTAL[season]} heavy reps on up to 3 days, never two in a row — set the days in your weekday plan.`, `Hámarksstyrkur: vika án leiks tekur ${NO_MATCH_WEEK_HEAVY_TOTAL[season]} þungar endurtekningar á allt að 3 dögum, aldrei tvo daga í röð — veldu dagana í vikudagaplaninu.`);
    r.facts = [timing, anchors];
    r.confidence = "moderate";
    if (mode === "build") r.conflict = w.matches > 0 ? bi("Building strength does not fit this week: the matches leave no day far enough from them.", "Uppbygging styrks passar ekki í þessa viku: leikirnir skilja engan dag eftir nógu langt frá þeim.") : null;
    return out;
  }

  const ruleLine = bi(`The week rule: ${total} heavy reps ${wk.en} (${split}).`, `Vikureglan: ${total} þungar endurtekningar ${wk.is} (${splitIs}).`);
  const perSetLine = perSet.length
    ? bi(`Your reps a set: ${perSet.map((p) => `${p.md} ${p.n} → ${p.sets} sets`).join(", ")}.`, `Endurtekningar í setti hjá þér: ${perSet.map((p) => `${p.md} ${p.n} → ${p.sets} sett`).join(", ")}.`)
    : null;

  if (mode === "maintain") {
    r.headline = bi(`Max strength: nothing to change — the week rule keeps it with ${total} heavy reps (${split}).`, `Hámarksstyrkur: engu þarf að breyta — vikureglan heldur honum með ${total} þungum endurtekningum (${splitIs}).`);
    r.facts = [anchors, timing];
  } else if (mode === "reduce") {
    r.headline = bi("Max strength: keep at least one heavy day — 12 heavy reps a week kept strength, every second week lost 10% (Rønnestad 2011).", "Hámarksstyrkur: haltu að minnsta kosti einum þungum degi — 12 þungar endurtekningar á viku héldu styrk, önnur hver vika missti 10% (Rønnestad 2011).");
    r.facts = [ruleLine, timing];
    r.now = bi(`${total} heavy reps (${split})`, `${total} þungar endurtekningar (${splitIs})`);
    r.suggestion = days.length > 1
      ? bi(`keep ${days[0].md ?? "the first heavy day"} (${days[0].reps}), drop the other heavy day`, `haltu ${days[0].md ?? "fyrsta þunga deginum"} (${days[0].reps}), slepptu hinum þunga deginum`)
      : bi("keep the one heavy day as it is", "haltu þunga deginum eins og hann er");
    r.ownRule = bi("Which heavy day to drop is MicroPulse's rule; the rule itself does not change on its own.", "Hvaða þunga degi er sleppt er regla MicroPulse; reglan sjálf breytist ekki af sjálfu sér.");
    r.confidence = "moderate";
  } else {
    r.headline = season === "preseason"
      ? bi(`Max strength: heavy work ${wk.en} is ${total} reps (${split}) — the pre-season level of the week rule.`, `Hámarksstyrkur: þung vinna ${wk.is} er ${total} endurtekningar (${splitIs}) — undirbúningsstig vikureglunnar.`)
      : bi(`Max strength: the week rule holds ${total} heavy reps ${wk.en} (${split}).`, `Hámarksstyrkur: vikureglan heldur ${total} þungum endurtekningum ${wk.is} (${splitIs}).`);
    r.facts = [anchors, timing];
    if (ctx.phase === "offseason") {
      r.conflict = bi(
        "In the off-season the week rule holds 15 heavy reps a week (it rises to 21 in pre-season): enough to keep strength, not set to build it.",
        "Á off-season heldur vikureglan 15 þungum endurtekningum á viku (fer í 21 á undirbúningstímabili): nóg til að halda styrk, ekki stillt til að byggja hann upp.",
      );
      r.confidence = "moderate";
    } else if (season !== "preseason") {
      r.conflict = bi(
        "Building max strength in season goes past the week rule: it holds 15 heavy reps, enough to keep strength, not set to build it. Room to build is a pre-season block or a week without a match.",
        "Að byggja upp hámarksstyrk á tímabili fer út fyrir vikuregluna: hún heldur 15 þungum endurtekningum, nóg til að halda styrk en ekki stillt til að byggja hann upp. Rými til uppbyggingar er undirbúningslota eða vika án leiks.",
      );
      r.confidence = "moderate";
    }
  }
  if (perSetLine) r.facts.push(perSetLine);
  r.facts = r.facts.slice(0, 3);

  for (const d of days) {
    const heavyMain = d === days[0];
    out.items.push({ date: d.date, item: {
      goal: "max_strength", kind: "strength", when: "after", load: heavyMain ? "high" : "moderate", minutes: heavyMain ? 45 : 40,
      text: bi(`Heavy lower body, ${d.reps} reps at 80–90% (stop at 20% bar-speed loss)`, `Þungt fyrir neðri hluta, ${d.reps} endurtekningar á 80–90% (hætta við 20% hraðatap)`),
    } });
  }
  return out;
}

function powerRec(ctx: PlanContext, w: WeekShape, mode: IntentMode): GoalOut {
  const z2 = NEAR_MATCH_ZONE["MD-2"], z1 = NEAR_MATCH_ZONE["MD-1"];
  const dose = `${NEAR_MATCH_SETS} × ${NEAR_MATCH_REPS}`;
  const out: GoalOut = { rec: { ...base("power", mode), headline: bi("", ""), facts: [], cite: "Harrison 2019; Pareja-Blanco 2017; Otero-Esquina 2017; Mann 2015", link: LINK_STRENGTH, ownRule: bi("The 4 × 4 split of the 15–20 reps and which day takes which speed zone are MicroPulse's rule.", "Skiptingin 4 × 4 á 15–20 endurtekningunum og hvaða dagur fær hvaða hraðasvæði er regla MicroPulse.") }, items: [] };
  const r = out.rec;
  const priming = bi("A small fast dose 6–33 h before a match raised performance: 15–20 ballistic reps at 30–40% (Harrison 2019).", "Lítill hraður skammtur 6–33 klst. fyrir leik bætti frammistöðu: 15–20 sprengiendurtekningar á 30–40% (Harrison 2019).");
  const zones = bi(`MD-2: ${speedZoneText(z2.zone)} (${z2.load}); MD-1: ${speedZoneText(z1.zone)} (${z1.load}) — the speed decides the load.`, `MD-2: ${speedZoneText(z2.zone)} (${z2.load}); MD-1: ${speedZoneText(z1.zone)} (${z1.load}) — hraðinn ræður þyngdinni.`);
  const contrast = bi("MD-3 pairs the heavy lift with a jump (contrast) — the power day.", "MD-3 parar þungu lyftuna við stökk (contrast) — kraftdagurinn.");
  if (w.matches === 0) {
    r.headline = bi(`Power: in a week without a match the power day is the one marked "power" in your weekday plan; light days take the MD-2 fast dose (${dose}).`, `Kraftur: í viku án leiks er kraftdagurinn sá sem er merktur „kraftur“ í vikudagaplaninu; léttir dagar fá hraðaskammt MD-2 (${dose}).`);
    r.facts = [priming, zones];
    for (const d of w.days) {
      const k = w.noMatchKind(d.date);
      if (k === "power") out.items.push({ date: d.date, item: { goal: "power", kind: "power", when: "after", load: "moderate", minutes: 35, text: bi("Contrast: heavy lift + jump", "Contrast: þung lyfta + stökk") } });
      if (k === "light") out.items.push({ date: d.date, item: { goal: "power", kind: "power", when: "before", load: "low", minutes: 15, text: bi(`Fast dose ${dose}, ${speedZoneText(z2.zone)}`, `Hraðaskammtur ${dose}, ${speedZoneText(z2.zone)}`) } });
    }
    return out;
  }
  if (mode === "maintain") {
    r.headline = bi(`Power: nothing to change — the week rule already gives MD-2 and MD-1 a fast dose (${dose}) and MD-3 a contrast block.`, `Kraftur: engu þarf að breyta — vikureglan gefur þegar MD-2 og MD-1 hraðaskammt (${dose}) og MD-3 contrast-blokk.`);
    r.facts = [priming, zones];
  } else if (mode === "reduce") {
    r.headline = bi("Power: drop the MD-1 dose and keep MD-2 — the dose is small, so this changes little.", "Kraftur: slepptu skammtinum á MD-1 og haltu MD-2 — skammturinn er lítill, svo þetta breytir litlu.");
    r.facts = [priming, zones];
    r.now = bi(`fast dose on MD-2 and MD-1 (${dose} each)`, `hraðaskammtur á MD-2 og MD-1 (${dose} hvor)`);
    r.suggestion = bi("MD-2 only", "aðeins MD-2");
    r.confidence = "moderate";
  } else {
    r.headline = bi(`Power: contrast on MD-3, then a fast dose on MD-2 and MD-1 (${dose} at 30–55%, faster as the match gets closer).`, `Kraftur: contrast á MD-3, svo hraðaskammtur á MD-2 og MD-1 (${dose} á 30–55%, hraðar eftir því sem nær dregur leik).`);
    r.facts = [contrast, priming, zones];
  }
  r.facts = r.facts.slice(0, 3);
  const d3 = dateOf(w, "MD-3"), d2 = dateOf(w, "MD-2"), d1 = dateOf(w, "MD-1");
  if (d3) out.items.push({ date: d3, item: { goal: "power", kind: "power", when: "after", load: "moderate", minutes: 35, text: bi("Contrast: heavy lift paired with a jump", "Contrast: þung lyfta pöruð við stökk") } });
  if (d2) out.items.push({ date: d2, item: { goal: "power", kind: "power", when: "before", load: "low", minutes: 15, text: bi(`Fast dose ${dose}, ${speedZoneText(z2.zone)}`, `Hraðaskammtur ${dose}, ${speedZoneText(z2.zone)}`) } });
  if (d1 && mode !== "reduce") out.items.push({ date: d1, item: { goal: "power", kind: "power", when: "before", load: "low", minutes: 15, text: bi(`Fast dose ${dose}, ${speedZoneText(z1.zone)}`, `Hraðaskammtur ${dose}, ${speedZoneText(z1.zone)}`) } });
  return out;
}

function speedRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi): GoalOut {
  const out: GoalOut = { rec: { ...base("max_speed", mode), headline: bi("", ""), facts: [], cite: "Malone 2017; Buchheit 2023; Silva 2018", link: LINK_SPEED, ownRule: bi("The dose (3–5 flying sprints of 20–30 m) and the day are MicroPulse's starting point: the research gives a weekly exposure, not the dose.", "Skammturinn (3–5 fljúgandi sprettir, 20–30 m) og dagurinn eru upphafspunktur MicroPulse: rannsóknirnar gefa vikulega útsetningu, ekki skammtinn.") }, items: [] };
  const r = out.rec;
  const weekly = bi("Running at 90% of top speed or more about once a week goes with fewer hamstring injuries (Malone 2017).", "Hlaup á 90% af hámarkshraða eða meira um það bil einu sinni í viku fylgja færri aftanlærismeiðsl (Malone 2017).");
  const recover = bi("Sprint speed is back about 48 h after a match (Silva 2018), so not MD+1 or MD+2, and not MD-1.", "Spretthraði er kominn til baka um 48 klst. eftir leik (Silva 2018), svo ekki MD+1 eða MD+2, og ekki MD-1.");
  const day = w.matches === 0
    ? w.days.find((d) => (w.noMatchKind(d.date) ?? "") === "power")?.date ?? w.days.find((d) => !d.isMatch && w.noMatchKind(d.date) !== "rest")?.date ?? null
    : dateOf(w, "MD-3") ?? dateOf(w, "MD-2");
  const dayMd = w.days.find((d) => d.date === day)?.md ?? null;
  if (w.matches >= 2) {
    r.headline = bi("Top speed: with two matches, the matches give the exposure — add no extra sprints for the starters.", "Hámarkshraði: með tveimur leikjum gefa leikirnir útsetninguna — bættu engum aukasprettum við hjá byrjunarliðinu.");
    r.facts = [weekly, recover];
    if (mode === "build") r.conflict = bi("Building top speed in a two-match week adds load where there is no room; do it the next single-match week.", "Uppbygging hámarkshraða í tveggja leikja viku bætir við álagi þar sem ekkert rými er; gerðu það næstu viku með einum leik.");
    r.confidence = "moderate";
    return out;
  }
  if (mode === "reduce") {
    r.headline = bi("Top speed: no extra sprint work — the match gives the starters their exposure.", "Hámarkshraði: engin aukasprettvinna — leikurinn gefur byrjunarliðinu útsetninguna.");
    r.facts = [weekly, recover];
    r.confidence = "moderate";
    return out;
  }
  r.headline = mode === "maintain"
    ? bi(`Top speed: one exposure ${wk.en} keeps it — "Top speed due" lists who has not had one in 10+ days.`, `Hámarkshraði: ein útsetning ${wk.is} heldur honum — „Tími á hámarkshraða“ sýnir hverjir hafa ekki fengið hana í 10+ daga.`)
    : bi(`Top speed: one near-max dose ${wk.en}${dayMd ? ` on ${dayMd}` : ""} — 3–5 flying sprints of 20–30 m at 90% of top speed or more, 2–3 min rest.`, `Hámarkshraði: einn skammtur nálægt hámarki ${wk.is}${dayMd ? ` á ${dayMd}` : ""} — 3–5 fljúgandi sprettir, 20–30 m, á 90% af hámarkshraða eða meira, 2–3 mín hvíld.`);
  r.facts = [weekly, recover];
  r.confidence = "moderate";
  if (day) out.items.push({ date: day, item: { goal: "max_speed", kind: "speed", when: "part", load: "moderate", minutes: 15, text: bi("3–5 flying sprints 20–30 m, ≥90% top speed, full rest", "3–5 fljúgandi sprettir 20–30 m, ≥90% hámarkshraða, full hvíld") } });
  return out;
}

function accelRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi): GoalOut {
  const idea = pitchIdeasFor({ stimulus: "mechanical", phase: ctx.phase })[isBuildPhase(ctx.phase) ? 1 : 0] ?? pitchIdeasFor({ stimulus: "mechanical" })[0];
  const out: GoalOut = { rec: { ...base("accel_decel", mode), headline: bi("", ""), facts: [], cite: idea?.cite || "Hill-Haas 2011", link: LINK_WEEK, ownRule: null }, items: [] };
  const r = out.rec;
  const day = w.matches === 0 ? w.days.find((d) => w.noMatchKind(d.date) === "strength")?.date ?? null : dateOf(w, "MD-4") ?? dateOf(w, "MD-3");
  const dayMd = w.days.find((d) => d.date === day)?.md ?? null;
  const area = bi("Smaller pitches give more accelerations and braking per player, larger ones more high-speed running (Hill-Haas 2011).", "Minni svæði gefa fleiri hraðanir og hemlanir á leikmann, stærri svæði meira háhraðahlaup (Hill-Haas 2011).");
  const why = bi("MD-4 is the week's mechanical day: far enough from both matches for hard braking.", "MD-4 er vélræni dagur vikunnar: nógu langt frá báðum leikjum fyrir harðar hemlanir.");
  if (mode === "reduce") {
    r.headline = bi(`Acceleration and braking: play the ${dayMd ?? "mechanical day"}'s games on a larger pitch — fewer turns, more running.`, `Hröðun og hemlun: spilaðu leiki ${dayMd ?? "vélræna dagsins"} á stærra svæði — færri snúningar, meira hlaup.`);
    r.facts = [area];
    r.ownRule = OWN_DAYS;
    r.confidence = "moderate";
    return out;
  }
  r.headline = mode === "maintain"
    ? bi(`Acceleration and braking: nothing to change — ${dayMd ?? "the mechanical day"}'s small-sided games keep it.`, `Hröðun og hemlun: engu þarf að breyta — fámennir leikir á ${dayMd ?? "vélræna deginum"} halda henni við.`)
    : bi(`Acceleration and braking: on ${dayMd ?? "the mechanical day"} — ${idea.form.en}, ${idea.area.en}, ${idea.bout.en}.`, `Hröðun og hemlun: á ${dayMd ?? "vélræna deginum"} — ${idea.form.is}, ${idea.area.is}, ${idea.bout.is}.`);
  r.facts = [area, why];
  if (!day) { r.conflict = bi(`No mechanical day ${wk.en}.`, `Enginn vélrænn dagur ${wk.is}.`); r.confidence = "low"; return out; }
  out.items.push({ date: day, item: { goal: "accel_decel", kind: "pitch", when: "part", load: "high", minutes: 25, text: bi(`${idea.form.en} (${idea.area.en})`, `${idea.form.is} (${idea.area.is})`) } });
  return out;
}

/** Conditioning days: pre-season / off-season two (MD-4 and MD-3, or the strength + power days without a match), in season one (MD-3). */
function conditioningDays(ctx: PlanContext, w: WeekShape, count: 1 | 2): Array<{ date: string; md: string | null }> {
  if (w.matches === 0) {
    const ds = w.days.filter((d) => ["strength", "power"].includes(w.noMatchKind(d.date) ?? ""));
    const pick = ds.length ? ds : w.days.filter((d, i) => i === 1 || i === 3); // no weekday plan: Tue + Thu as an example
    return pick.slice(0, count).map((d) => ({ date: d.date, md: d.md }));
  }
  const order = count === 2 ? ["MD-4", "MD-3"] : ["MD-3", "MD-4"];
  return order.map((md) => ({ date: dateOf(w, md), md })).filter((x): x is { date: string; md: string } => !!x.date).slice(0, count);
}

function masGap(ctx: PlanContext): Bi | null {
  const { withMas, squad } = ctx.mas;
  if (squad <= 0 || withMas >= squad * 0.5) return null;
  return bi(`Only ${withMas} of ${squad} players have a MAS test, so run speeds can't be set for the rest — test first.`, `Aðeins ${withMas} af ${squad} leikmönnum eru með MAS-próf, svo ekki er hægt að stilla hlaupahraða fyrir hina — prófaðu fyrst.`);
}

/** `withHiit`: high-intensity intervals are also built this week, so the aerobic block is one ball game, not two more runs. */
function aerobicRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi, withHiit = false): GoalOut {
  const out: GoalOut = { rec: { ...base("aerobic_base", mode), headline: bi("", ""), facts: [], cite: "Buchheit & Laursen 2013; Hill-Haas 2011", link: LINK_COND, ownRule: OWN_DAYS }, items: [] };
  const r = out.rec;
  const build = isBuildPhase(ctx.phase);
  const runs = formatLine("threshold");
  const ssg = pitchIdeasFor({ stimulus: "locomotive", phase: ctx.phase })[build ? 1 : 0];
  const gap = masGap(ctx);
  const notNear = bi("Not on MD-2 or MD-1 (the match comes first) and not MD+1 (recovery).", "Ekki á MD-2 eða MD-1 (leikurinn gengur fyrir) og ekki MD+1 (endurheimt).");
  if (mode === "reduce") {
    r.headline = bi("Aerobic base: no extra running — the training games and the match carry it.", "Grunnþol: engin aukahlaup — æfingaleikirnir og leikurinn bera það.");
    r.facts = [notNear];
    r.confidence = "moderate";
    return out;
  }
  const count: 1 | 2 = build && mode === "build" && !withHiit ? 2 : 1;
  const asGame = !build || mode === "maintain" || withHiit;
  const days = conditioningDays(ctx, w, count);
  const dayWords = listWords(days.map((d) => d.md ?? new Date(utc(d.date)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })), "and");
  const dayWordsIs = listWords(days.map((d) => d.md ?? new Date(utc(d.date)).toLocaleDateString("is-IS", { weekday: "short", timeZone: "UTC" })), "og");
  if (mode === "maintain") {
    r.headline = bi(`Aerobic base: one aerobic block ${wk.en} keeps it — a large-area game on ${dayWords || "the running day"} (${ssg.area.en}).`, `Grunnþol: ein loftháð blokk ${wk.is} heldur því — leikur á stóru svæði á ${dayWordsIs || "hlaupadeginum"} (${ssg.area.is}).`);
  } else {
    r.headline = bi(
      `Aerobic base: ${count === 2 ? "two" : "one"} aerobic block${count === 2 ? "s" : ""} ${wk.en} on ${dayWords || "the running day"} — runs ${runs.en}, or ${ssg.form.en} (${ssg.area.en}).`,
      `Grunnþol: ${count === 2 ? "tvær loftháðar blokkir" : "ein loftháð blokk"} ${wk.is} á ${dayWordsIs || "hlaupadeginum"} — hlaup ${runs.is}, eða ${ssg.form.is} (${ssg.area.is}).`,
    );
    if (withHiit && build) {
      r.headline = bi(
        `Aerobic base: one block ${wk.en} on ${dayWords || "the running day"} — ${ssg.form.en} (${ssg.area.en}); the interval blocks carry the rest.`,
        `Grunnþol: ein blokk ${wk.is} á ${dayWordsIs || "hlaupadeginum"} — ${ssg.form.is} (${ssg.area.is}); interval-blokkirnar bera restina.`,
      );
    }
    if (!build) r.conflict = bi("In season the match and the running day carry most of the aerobic work; building it further takes room from the week's football.", "Á tímabili bera leikurinn og hlaupadagurinn mest af loftháðu vinnunni; frekari uppbygging tekur rými frá fótbolta vikunnar.");
  }
  r.facts = [bi(`Speed comes from each player's MAS: ${runs.en}.`, `Hraðinn kemur úr MAS hvers leikmanns: ${runs.is}.`), notNear];
  if (gap) { r.facts.unshift(gap); r.confidence = "low"; } else r.confidence = "moderate";
  r.facts = r.facts.slice(0, 3);
  if (!days.length) { r.conflict = bi(`No day ${wk.en} fits conditioning.`, `Enginn dagur ${wk.is} passar fyrir þol.`); r.confidence = "low"; }
  for (const d of days) out.items.push({ date: d.date, item: { goal: "aerobic_base", kind: "conditioning", when: asGame ? "part" : "after", load: "moderate", minutes: asGame ? 20 : formatMinutes("threshold"), text: !asGame ? bi(`Runs ${runs.en}`, `Hlaup ${runs.is}`) : bi(`${ssg.form.en} (${ssg.area.en})`, `${ssg.form.is} (${ssg.area.is})`) } });
  return out;
}

function hiitRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi): GoalOut {
  const out: GoalOut = { rec: { ...base("hiit", mode), headline: bi("", ""), facts: [], cite: "Buchheit & Laursen 2013", link: LINK_COND, ownRule: OWN_DAYS }, items: [] };
  const r = out.rec;
  const build = isBuildPhase(ctx.phase);
  const longL = formatLine("long"), shortL = formatLine("short");
  const gap = masGap(ctx);
  const why = bi("Short 15-15 runs reach the same aerobic intensity with less mechanical load than long runs (Buchheit & Laursen 2013).", "Stutt 15-15 hlaup ná sömu loftháðu ákefð með minna vélrænu álagi en löng hlaup (Buchheit & Laursen 2013).");
  if (mode === "reduce") {
    r.headline = bi("High-intensity endurance: drop the extra interval block; the match covers it for the starters.", "Háákefðarþol: slepptu auka-intervalblokkinni; leikurinn sér um það fyrir byrjunarliðið.");
    r.facts = [why];
    r.confidence = "moderate";
    return out;
  }
  if (w.matches >= 2) {
    r.headline = bi("High-intensity endurance: with two matches, add no interval block — the matches are the high-intensity work.", "Háákefðarþol: með tveimur leikjum bætirðu engri intervalblokk við — leikirnir eru háákefðarvinnan.");
    r.facts = [why];
    if (mode === "build") r.conflict = bi("Two matches leave no day for an extra interval block.", "Tveir leikir skilja engan dag eftir fyrir auka-intervalblokk.");
    r.confidence = "moderate";
    return out;
  }
  const count: 1 | 2 = build && mode === "build" ? 2 : 1;
  const days = conditioningDays(ctx, w, count);
  const fmts: HiitFormatId[] = count === 2 ? ["short", "long"] : ["short"];
  r.headline = count === 2
    ? bi(`High-intensity endurance: two blocks ${wk.en} — 15-15 runs on ${days[0]?.md ?? "the first day"} (${shortL.en}), long intervals on ${days[1]?.md ?? "the second"} (${longL.en}).`, `Háákefðarþol: tvær blokkir ${wk.is} — 15-15 hlaup á ${days[0]?.md ?? "fyrri deginum"} (${shortL.is}), löng interval á ${days[1]?.md ?? "seinni deginum"} (${longL.is}).`)
    : bi(`High-intensity endurance: one block ${wk.en} on ${days[0]?.md ?? "the running day"} — 15-15 runs (${shortL.en}).`, `Háákefðarþol: ein blokk ${wk.is} á ${days[0]?.md ?? "hlaupadeginum"} — 15-15 hlaup (${shortL.is}).`);
  r.facts = [why, bi("Speeds come from each player's MAS test.", "Hraðinn kemur úr MAS-prófi hvers leikmanns.")];
  if (gap) { r.facts.unshift(gap); r.confidence = "low"; } else r.confidence = "moderate";
  r.facts = r.facts.slice(0, 3);
  days.forEach((d, i) => out.items.push({ date: d.date, item: { goal: "hiit", kind: "conditioning", when: "after", load: "high", minutes: formatMinutes(fmts[i] ?? "short"), text: fmts[i] === "long" ? bi(`Long intervals ${longL.en}`, `Löng interval ${longL.is}`) : bi(`15-15 runs ${shortL.en}`, `15-15 hlaup ${shortL.is}`) } }));
  return out;
}

function rsaRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi): GoalOut {
  const out: GoalOut = { rec: { ...base("rsa", mode), headline: bi("", ""), facts: [], cite: "Buchheit & Laursen 2013; Silva 2018", link: LINK_COND, ownRule: OWN_DAYS }, items: [] };
  const r = out.rec;
  const line = formatLine("rsa");
  const timing = bi("Near-max sprints need 48 h either side of a match (Silva 2018): MD-3 is the day.", "Sprettir nálægt hámarki þurfa 48 klst. hvorum megin við leik (Silva 2018): MD-3 er dagurinn.");
  if (mode === "reduce") {
    r.headline = bi("Repeated sprints: no extra block — the match gives the starters this work.", "Hraðaþol: engin aukablokk — leikurinn gefur byrjunarliðinu þessa vinnu.");
    r.facts = [timing];
    r.confidence = "moderate";
    return out;
  }
  const day = w.matches === 0 ? conditioningDays(ctx, w, 1)[0]?.date ?? null : dateOf(w, "MD-3");
  if (!day) {
    r.headline = bi(`Repeated sprints: no day ${wk.en} is 48 h from both matches, so no block fits.`, `Hraðaþol: enginn dagur ${wk.is} er 48 klst. frá báðum leikjum, svo engin blokk kemst fyrir.`);
    r.facts = [timing];
    if (mode === "build") r.conflict = bi("This week has no room for repeated sprints.", "Í þessari viku er ekkert rými fyrir hraðaþol.");
    r.confidence = "moderate";
    return out;
  }
  r.headline = mode === "maintain"
    ? bi("Repeated sprints: one short block every week or two on MD-3 keeps it.", "Hraðaþol: ein stutt blokk á einnar til tveggja vikna fresti á MD-3 heldur því.")
    : bi(`Repeated sprints: one block ${wk.en} on MD-3 — ${line.en}.`, `Hraðaþol: ein blokk ${wk.is} á MD-3 — ${line.is}.`);
  r.facts = [timing, bi("Run the reps near-max; the speed shown is a floor, not a cap.", "Hlauptu endurtekningarnar nálægt hámarki; hraðinn sem er sýndur er lágmark, ekki þak.")];
  r.confidence = "moderate";
  out.items.push({ date: day, item: { goal: "rsa", kind: "conditioning", when: "after", load: "high", minutes: formatMinutes("rsa"), text: bi(`Repeated sprints ${line.en}`, `Endurteknir sprettir ${line.is}`) } });
  return out;
}

function preventionRec(ctx: PlanContext, w: WeekShape, mode: IntentMode): GoalOut {
  const n = PREVENTION_DOSE.nordic, c = PREVENTION_DOSE.copenhagen;
  const out: GoalOut = { rec: { ...base("injury_prevention", mode), headline: bi("", ""), facts: [], cite: "Arnason 2008; van der Horst 2015; Lovell 2018; Schaber 2021; Impellizzeri 2021", link: LINK_STRENGTH, ownRule: bi("One day for each, and which day, is MicroPulse's rule: no study compares one day with two in a row.", "Einn dagur fyrir hvort, og hvaða dagur, er regla MicroPulse: engin rannsókn ber saman einn dag og tvo í röð.") }, items: [] };
  const r = out.rec;
  const rule = bi(`The week rule: Nordic ${n.sets} × ${n.reps} on MD-4 (${n.weekReps} a week), Copenhagen ${c.sets} × 6 a side on MD-3 (${c.weekReps} a side), after field training.`, `Vikureglan: Nordic ${n.sets} × ${n.reps} á MD-4 (${n.weekReps} á viku), Copenhagen ${c.sets} × 6 á hvora hlið á MD-3 (${c.weekReps} á hlið), eftir æfingu á velli.`);
  const evidence = bi("The injury trials used 27–30 Nordic reps a session, 1–2 sessions a week in season; the evidence that it prevents injuries is rated inconclusive (Impellizzeri 2021).", "Meiðslarannsóknirnar notuðu 27–30 Nordic endurtekningar í æfingu, 1–2 æfingar á viku á tímabili; vísbendingar um að það fyrirbyggi meiðsl eru metnar óvissar (Impellizzeri 2021).");
  const after = bi("After training, not before: done before, they left the hamstrings weaker during the session (Lovell 2018).", "Eftir æfingu, ekki á undan: gert á undan skildi það aftanlærið eftir veikara á æfingunni (Lovell 2018).");
  if (mode === "build") {
    r.headline = bi(`Injury prevention: the week rule keeps it at ${n.weekReps} Nordic reps and ${c.weekReps} Copenhagen reps a side a week — more is not in the rule.`, `Meiðslaforvörn: vikureglan heldur henni í ${n.weekReps} Nordic endurtekningum og ${c.weekReps} Copenhagen á hlið á viku — meira er ekki í reglunni.`);
    r.conflict = bi("Raising the dose is the coach's call outside the rule; the trials went up from 12 to 18 reps a session over a week without much soreness.", "Að auka skammtinn er ákvörðun þjálfara utan reglunnar; í rannsóknunum fór skammturinn úr 12 í 18 endurtekningar á æfingu á einni viku án mikilla harðsperra.");
    r.facts = [rule, evidence];
    r.confidence = "moderate";
  } else if (mode === "reduce") {
    r.headline = bi("Injury prevention: keep at least the Nordic day — it is the one with injury trials behind it.", "Meiðslaforvörn: haltu að minnsta kosti Nordic-deginum — það er sá sem meiðslarannsóknir standa að baki.");
    r.facts = [rule, evidence];
    r.confidence = "moderate";
  } else {
    r.headline = bi("Injury prevention: nothing to change — the week rule gives Nordic on MD-4 and Copenhagen on MD-3, after training.", "Meiðslaforvörn: engu þarf að breyta — vikureglan gefur Nordic á MD-4 og Copenhagen á MD-3, eftir æfingu.");
    r.facts = [rule, after];
    r.confidence = "moderate";
  }
  r.facts = r.facts.slice(0, 3);
  const dn = w.matches === 0 ? w.days.find((d) => w.noMatchKind(d.date) === "strength")?.date ?? null : dateOf(w, "MD-4");
  const dc = w.matches === 0 ? w.days.find((d) => w.noMatchKind(d.date) === "power")?.date ?? dn : dateOf(w, "MD-3");
  if (dn) out.items.push({ date: dn, item: { goal: "injury_prevention", kind: "prevention", when: "after", load: "moderate", minutes: 10, text: bi(`Nordic ${n.sets} × ${n.reps}`, `Nordic ${n.sets} × ${n.reps}`) } });
  if (dc && mode !== "reduce") out.items.push({ date: dc, item: { goal: "injury_prevention", kind: "prevention", when: "after", load: "moderate", minutes: 10, text: bi(`Copenhagen ${c.sets} × 6 a side`, `Copenhagen ${c.sets} × 6 á hlið`) } });
  return out;
}

function freshnessRec(ctx: PlanContext, w: WeekShape, mode: IntentMode, wk: Bi, others: IntentItem[]): GoalOut {
  const out: GoalOut = { rec: { ...base("freshness", mode), headline: bi("", ""), facts: [], cite: "Silva 2018; Harrison 2019; Bosquet 2007", link: ctx.scope === "block" ? LINK_HUB : LINK_STRENGTH, ownRule: null }, items: [] };
  const r = out.rec;
  r.headline = w.matches > 0
    ? bi(`Freshness: heavy work ends on MD-3; MD-2 and MD-1 stay light ${wk.en} — a fast dose only, no heavy lift.`, `Ferskleiki: þung vinna endar á MD-3; MD-2 og MD-1 eru léttir ${wk.is} — aðeins hraðaskammtur, engin þung lyfta.`)
    : bi(`Freshness: ${wk.en} has no match — keep the heavy days apart and one full rest day.`, `Ferskleiki: ${wk.is} er enginn leikur — hafðu þungu dagana aðskilda og einn fullan hvíldardag.`);
  r.facts = [
    bi("Jump and hamstring strength are still down 72 h after a match, and a heavy session can lower performance for 48 h (Silva 2018; Harrison 2019).", "Stökk og styrkur aftanlæris eru enn niðri 72 klst. eftir leik og þung æfing getur dregið úr frammistöðu í 48 klst. (Silva 2018; Harrison 2019)."),
    bi("A taper cuts volume and keeps intensity (Bosquet 2007).", "Niðurtröppun minnkar magn og heldur ákefð (Bosquet 2007)."),
  ];
  const builds = others.filter((o) => o.mode === "build" && ["max_strength", "aerobic_base", "hiit"].includes(o.goal));
  if (builds.length) {
    r.conflict = bi(
      `You also want to build ${listWords(builds.map((b) => GOAL_LABEL[b.goal].en.toLowerCase()), "and")}: that pulls the other way. The rules keep that work on MD-4/MD-3, 72 h or more before the match.`,
      `Þú vilt líka byggja upp ${listWords(builds.map((b) => GOAL_LABEL[b.goal].is.toLowerCase()), "og")}: það togar í hina áttina. Reglurnar halda þeirri vinnu á MD-4/MD-3, 72 klst. eða meira fyrir leik.`,
    );
  }
  r.confidence = "high";
  const d1 = dateOf(w, "MD-1");
  if (d1) out.items.push({ date: d1, item: { goal: "freshness", kind: "fresh", when: "part", load: "low", minutes: 45, text: bi("Short and sharp — the lightest day before the match", "Stutt og beitt — léttasti dagur fyrir leik") } });
  return out;
}

// ───────────────────────────── The block goal ─────────────────────────────

const BUILD_TO_BLOCK: Partial<Record<IntentGoal, BlockGoal>> = {
  max_strength: "accum", aerobic_base: "accum", hiit: "accum",
  power: "transmute", max_speed: "transmute", accel_decel: "transmute", rsa: "transmute",
  freshness: "realize",
};
const BLOCK_ORDER: BlockGoal[] = ["accum", "transmute", "realize"];

/** The block goal the coach's wants point to: build goals vote for a block goal, freshness counts double. Null = no build goal. */
export function suggestBlockGoal(items: IntentItem[], current: BlockGoal | null): BlockGoal | null {
  const score: Record<BlockGoal, number> = { accum: 0, transmute: 0, realize: 0 };
  for (const it of items) {
    const g = BUILD_TO_BLOCK[it.goal];
    if (!g) continue;
    if (it.goal === "freshness") score.realize += 2;
    else if (it.mode === "build") score[g] += 1;
  }
  const best = Math.max(...Object.values(score));
  if (best <= 0) return null;
  const tied = BLOCK_ORDER.filter((g) => score[g] === best);
  return current && tied.includes(current) ? current : tied[0];
}

function blockGoalRec(ctx: PlanContext, items: IntentItem[]): PlanRecommendation | null {
  const goal = suggestBlockGoal(items, ctx.blockGoal);
  if (!goal) return null;
  const phaseKey = seasonPhaseKey(ctx.phase);
  const scheme = strengthForBlockGoal(goal, phaseKey);
  const voters = items.filter((it) => BUILD_TO_BLOCK[it.goal] === goal && (it.mode === "build" || it.goal === "freshness"));
  const why = bi(listWords(voters.map((v) => GOAL_LABEL[v.goal].en.toLowerCase()), "and"), listWords(voters.map((v) => GOAL_LABEL[v.goal].is.toLowerCase()), "og"));
  const label = BLOCK_GOAL_LABEL[goal];
  const same = ctx.blockGoal === goal;
  const rec: PlanRecommendation = {
    goal: "block_goal",
    mode: "build",
    headline: same
      ? bi(`Block goal: ${label.en} already fits what you wrote (${why.en}).`, `Markmið lotu: ${label.is} passar nú þegar við það sem þú skrifaðir (${why.is}).`)
      : bi(`Block goal: ${label.en} fits what you wrote (${why.en}).`, `Markmið lotu: ${label.is} passar við það sem þú skrifaðir (${why.is}).`),
    facts: [
      bi(`Strength in a ${label.en} block: ${scheme.quality.en} · ${scheme.pct1rm.en} · ${scheme.scheme.en}`, `Styrkur í ${label.is}-lotu: ${scheme.quality.is} · ${scheme.pct1rm.is} · ${scheme.scheme.is}`),
      isBuildPhase(ctx.phase)
        ? bi("The block's last week is the light week (~60% volume, intensity kept).", "Síðasta vika lotunnar er létta vikan (~60% magn, ákefð haldið).")
        : bi("In season there is no automatic light week; you choose one if you want it.", "Á tímabili er engin sjálfvirk létt vika; þú velur hana ef þú vilt."),
    ],
    now: !same && ctx.blockGoal ? BLOCK_GOAL_LABEL[ctx.blockGoal] : null,
    suggestion: !same && ctx.blockGoal ? label : null,
    conflict: !isBuildPhase(ctx.phase) && goal === "accum"
      ? bi("An Accumulation block in season adds load between matches; the week rule still caps heavy reps at 15 a week.", "Uppsöfnunarlota á tímabili bætir álagi á milli leikja; vikureglan heldur samt þungum endurtekningum í 15 á viku.")
      : null,
    confidence: ctx.blockGoal ? "moderate" : "low",
    cite: `Issurin 2010; ${scheme.cite}`,
    ownRule: bi("Matching your goals to a block goal is MicroPulse's rule (build goals vote; freshness counts double).", "Að para markmiðin þín við markmið lotu er regla MicroPulse (uppbyggingarmarkmið kjósa; ferskleiki telur tvöfalt)."),
    link: LINK_HUB,
  };
  return rec;
}

// ───────────────────────────── Put together ─────────────────────────────

const FOOTBALL_LABEL: Record<string, Bi> = {
  mechanical: bi("Football: mechanical (tight areas, accel/decel)", "Fótbolti: vélrænt (þröng svæði, hröðun/hemlun)"),
  locomotive: bi("Football: running (large areas, high speed)", "Fótbolti: hlaup (stór svæði, háhraði)"),
  mixed: bi("Football: mixed, match-like", "Fótbolti: blandað, leiklíkt"),
  speed: bi("Football: speed (short, fast actions)", "Fótbolti: hraði (stuttar, hraðar aðgerðir)"),
};

/** A week without a match: the day as the weekday plan builds it. */
function noMatchLabel(kind: string | null): Bi | null {
  const l = kind ? NO_MATCH_DAY_LABEL[kind as keyof typeof NO_MATCH_DAY_LABEL] : null;
  return l ? bi(`${l.en} (weekday plan)`, `${l.is} (vikudagaplan)`) : null;
}

function footballFor(model: PeriodizationModel, md: string | null, isMatch: boolean): Bi | null {
  if (isMatch) return bi("Match", "Leikur");
  if (!md) return null;
  if (md === "MD-1") return bi("Football: activation — short and sharp", "Fótbolti: virkjun — stutt og beitt");
  if (md === "MD+1") return bi("Recovery; top-up for players with few minutes", "Endurheimt; áfylling fyrir þá sem spiluðu lítið");
  if (md === "MD+2") return bi("Rest or light recovery", "Hvíld eða létt endurheimt");
  const spec = specForDay(model, md);
  if (!spec) return null;
  return FOOTBALL_LABEL[spec.intendedType] ?? spec.note;
}

export function recommendPlan(items: IntentItem[], ctx: PlanContext): PlanAdvice {
  const model = ctx.model ?? DEFAULT_MD_MICROCYCLE;
  const w = weekShape(ctx, ctx.start);
  const wk = ctx.scope === "block" ? bi("each week", "í hverri viku") : bi("this week", "í vikunni");
  const outs: GoalOut[] = [];
  for (const it of items) {
    switch (it.goal) {
      case "max_strength": outs.push(strengthRec(ctx, w, it.mode, wk)); break;
      case "power": outs.push(powerRec(ctx, w, it.mode)); break;
      case "max_speed": outs.push(speedRec(ctx, w, it.mode, wk)); break;
      case "accel_decel": outs.push(accelRec(ctx, w, it.mode, wk)); break;
      case "aerobic_base": outs.push(aerobicRec(ctx, w, it.mode, wk, items.some((o) => o.goal === "hiit" && o.mode === "build"))); break;
      case "hiit": outs.push(hiitRec(ctx, w, it.mode, wk)); break;
      case "rsa": outs.push(rsaRec(ctx, w, it.mode, wk)); break;
      case "injury_prevention": outs.push(preventionRec(ctx, w, it.mode)); break;
      case "freshness": outs.push(freshnessRec(ctx, w, it.mode, wk, items.filter((o) => o.goal !== "freshness"))); break;
    }
  }
  const recs = outs.map((o) => o.rec);
  if (ctx.scope === "block") {
    const bg = blockGoalRec(ctx, items);
    if (bg) recs.unshift(bg);
  }
  const grid: GridDay[] = w.days.map((d) => ({
    date: d.date, md: d.md, isMatch: d.isMatch,
    football: footballFor(model, d.md, d.isMatch) ?? (w.matches === 0 ? noMatchLabel(w.noMatchKind(d.date)) : null),
    items: mergeContrast(outs.flatMap((o) => o.items.filter((x) => x.date === d.date).map((x) => x.item))),
  }));
  return { verdict: verdictFor(items, recs, ctx, w), recommendations: recs, grid, notes: gridNotes(ctx, w) };
}

/** A heavy day that also carries the contrast block: the contrast IS that day's heavy lift with a jump after it
 *  (heavy first, then the jump — the one exception to power-first), so it adds a few minutes, not a second session. */
function mergeContrast(items: GridItem[]): GridItem[] {
  if (!items.some((i) => i.kind === "strength")) return items;
  return items.map((i) => (i.kind === "power" && i.text.en.startsWith("Contrast")
    ? { ...i, minutes: 10, text: bi("Contrast: a jump right after each heavy set", "Contrast: stökk strax á eftir hverju þungu setti") }
    : i));
}

function verdictFor(items: IntentItem[], recs: PlanRecommendation[], ctx: PlanContext, w: WeekShape): Bi {
  const what = ctx.scope === "block" ? bi("this block", "þessa lotu") : bi("this week", "þessa viku");
  if (!items.length) return bi(`Nothing read yet — write what you want from ${what.en}.`, `Ekkert lesið enn — skrifaðu hvað þú vilt ná fram með ${what.is}.`);
  const n = items.length;
  const list = bi(
    items.map((i) => (i.goal === "freshness" ? GOAL_LABEL[i.goal].en : `${GOAL_LABEL[i.goal].en} (${MODE_LABEL[i.mode].en})`)).join(" · "),
    items.map((i) => (i.goal === "freshness" ? GOAL_LABEL[i.goal].is : `${GOAL_LABEL[i.goal].is} (${MODE_LABEL[i.mode].is})`)).join(" · "),
  );
  // Only the goals' own recommendations count, so "x of n" adds up (the block-goal card is extra).
  const clashes = recs.filter((r) => r.goal !== "block_goal" && r.conflict).length;
  const m = w.matches === 0 ? bi("no match", "enginn leikur") : w.matches === 1 ? bi("one match", "einn leikur") : bi(`${w.matches} matches`, `${w.matches} leikir`);
  const when = ctx.scope === "block" ? bi(`first week: ${m.en}`, `fyrsta vika: ${m.is}`) : m;
  if (!clashes) {
    return bi(
      `${n === 1 ? "Your goal fits" : `All ${n} goals fit`} ${what.en} (${when.en}): ${list.en}.`,
      `${n === 1 ? "Markmiðið passar" : `Öll ${n} markmiðin passa`} við ${what.is} (${when.is}): ${list.is}.`,
    );
  }
  return bi(
    `${clashes} of ${n} ${n === 1 ? "goal" : "goals"} ${clashes === 1 ? "doesn't" : "don't"} fit as written (${when.en}) — see ⚠ below: ${list.en}.`,
    `${clashes} af ${n} markmiðum ${clashes === 1 ? "passar" : "passa"} ekki eins og skrifað er (${when.is}) — sjá ⚠ að neðan: ${list.is}.`,
  );
}

function gridNotes(ctx: PlanContext, w: WeekShape): Bi[] {
  const notes: Bi[] = [bi("Session lengths are estimates, for planning.", "Lengd æfinga er áætluð, til skipulags.")];
  if (w.matches === 0 && !w.days.some((d) => w.noMatchKind(d.date))) {
    notes.push(bi("No match and no weekday plan: days are an example. Set strength / power / light days under Strength → weeks without a match.", "Enginn leikur og ekkert vikudagaplan: dagarnir eru dæmi. Stilltu styrk / kraft / létta daga undir Styrkur → vikur án leiks."));
  }
  if (ctx.scope === "block") notes.push(bi("The grid is the block's first week; the other weeks follow the same rules with their own matches.", "Taflan er fyrsta vika lotunnar; hinar vikurnar fylgja sömu reglum með sínum leikjum."));
  return notes;
}

