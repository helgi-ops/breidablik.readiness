/**
 * The week rule (2026-11-19) — how many heavy lower-body REPETITIONS a week holds and which days carry them. Pure.
 *
 * Before this rule every day was built on its own: each method brought its own sets × reps and the week was whatever
 * the days added up to. A week without a match then gave five strength sessions and twice the volume of a match week,
 * with no rule having decided it.
 *
 * The unit is repetitions a week, not sets (the coach's call, 2026-11-19): 12 heavy reps are 6 sets of 2 or 3 sets of
 * 4. The rule fixes the day's heavy reps; the day's method says how many reps a set holds, and the sets follow. Fewer
 * reps a set (1–2) means less fatigue in each set for the same reps.
 *
 * The rule looks forward only: the day's heavy reps come from the day's place in the week (the MD day, or the coach's
 * weekday plan when there is no match). It never reads what was done earlier, and no player's past sessions.
 *
 * What comes from research (read in full from `research/`, 2026-11-19):
 *   - The week is the unit. With the weekly volume the same, few or many sessions gave the same strength in
 *     well-trained men (Cuthbert 2021, Table 1: lower body g = 0.061, 95% CI −0.202 to 0.323; Grgic 2018, volume-equated
 *     p = 0.421). Microdosing is the same weekly volume divided, not a smaller one (Cuthbert 2024).
 *   - How much. 12 heavy reps a week (3 × 4RM half squat, once a week) kept 1RM, sprint and jump for 12 in-season weeks
 *     in professional footballers; every second week lost 10% (Rønnestad 2011). 32 heavy reps a week (4 × 4 at about
 *     90%, twice a week) raised the half squat 116 → 176 kg in 8 pre-season weeks (Helgerud, in Hoff & Helgerud 2004,
 *     no control group). More sets did not give more strength in trained men (1, 3 or 5 sets: Schoenfeld 2019), and 10
 *     or more weekly sets per exercise are not shown to beat 5–9 (Ralston 2017).
 *   - When heavy work is out. Jump, hamstring strength and muscle damage are still off 72 h after a match (Silva 2018,
 *     77 studies); a heavy session can lower performance for 48 h or longer (Harrison 2019); professional teams put the
 *     week's highest load 72 h before the match (Los Arcos 2017). So: heavy on MD-4 and MD-3, and on MD-5 only when
 *     there was no match the days before (the MD-5 label already means that, see `fetchMdContextInfo`).
 *   - Contrast rounds. No training study compares numbers of rounds (Lesinski 2014 says so outright); studies used
 *     1–5 a session, most often 2–4, and 3–4 for French contrast (Welch 2019; Elbadry 2019). The rounds here follow
 *     the heavy lift's sets, so the pairs match.
 *
 * What does NOT come from research, and is MicroPulse's rule: how the week's reps are split between the heavy days,
 * the exact number between the two anchors above (12 kept, 32 built), and the pattern of a week without a match (at
 * most three heavy days, never two days in a row). No study in the folder tests a split over MD days.
 */

import { WEEKDAYS, mondayOfIso, noMatchDayFor, type NoMatchDayKind, type NoMatchWeek } from "./structures";
import type { AppliedAdaptation, MdContext, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock } from "./types";

/** Pre-season builds; every other part of the year holds (in season, off-season, not known). */
export type WeekRuleSeason = "preseason" | "hold";

/** A heavy lift = a main two-leg lift done for 6 reps or fewer in a set. */
export const HEAVY_REPS_MAX = 6;

/**
 * Heavy lower-body reps per day in a week with a match. MD-4 is the main day (furthest from the next match and 72 h
 * after the last one), MD-3 the last heavy day (72 h before the match). MD-5 only exists in a week with no match the
 * weekend before: a smaller extra day.
 *   in season:  9 + 6 = 15 a week (21 with MD-5) — above the 12 that kept strength.
 *   pre-season: 12 + 9 = 21 a week (27 with MD-5) — under the 32 that built strength with nothing else in the week.
 */
export const MATCH_WEEK_HEAVY_REPS: Record<WeekRuleSeason, Partial<Record<MdContext, number>>> = {
  hold: { "MD-5": 6, "MD-4": 9, "MD-3": 6 },
  preseason: { "MD-5": 6, "MD-4": 12, "MD-3": 9 },
};

/** Heavy reps in a week without a match: the same as a match week's MD-4 + MD-3, never more because there are more days. */
export const NO_MATCH_WEEK_HEAVY_TOTAL: Record<WeekRuleSeason, number> = { hold: 15, preseason: 21 };
/** A week without a match: at most three heavy days, never two days in a row. */
export const NO_MATCH_MAX_HEAVY_DAYS = 3;
/** The week's reps are dealt out in threes; a heavy day holds 6 to 15. */
const REP_STEP = 3;
const MIN_REPS_PER_HEAVY_DAY = 6;
const MAX_REPS_PER_HEAVY_DAY = 15;
const MAX_SETS_PER_LIFT = 6;

export const WEEK_RULE_EVIDENCE =
  "Week rule. The unit is heavy repetitions a week: with the weekly volume the same, the number of sessions made no difference to strength (Cuthbert 2021; Grgic 2018). How much: 12 heavy reps a week kept strength in season in professional footballers (Rønnestad 2011); 32 a week built it in a pre-season (Helgerud, in Hoff & Helgerud 2004); more sets did not give more strength in trained men (Schoenfeld 2019; Ralston 2017). When: jump and hamstring strength are still down 72 h after a match (Silva 2018) and a heavy session can lower performance for 48 h or longer (Harrison 2019), so heavy work sits on MD-4 and MD-3. Within the set: footballers who stopped at a 15% speed loss improved jump and strength, those who went to 30% did not improve the jump (Pareja-Blanco 2017). How the reps are split between the heavy days is MicroPulse's rule, not from a study.";

/** The season the rule reads: the season plan's phase when it is on the snapshot, else the week setup's. */
export function weekRuleSeasonOf(snap: Pick<PlayerStrengthSnapshot, "goalSeason" | "seasonPhase">): WeekRuleSeason {
  const planned = snap.goalSeason?.phase ?? null;
  if (planned) return planned === "preseason" ? "preseason" : "hold";
  return String(snap.seasonPhase ?? "").toLowerCase().replace(/[^a-z]/g, "") === "preseason" ? "preseason" : "hold";
}

/** Today's heavy reps in a week with a match, or null when today is not a heavy day (MD-2, MD-1, the days after). */
export function matchWeekHeavyReps(md: MdContext, season: WeekRuleSeason): number | null {
  return MATCH_WEEK_HEAVY_REPS[season][md] ?? null;
}

export type NoMatchWeekRule = {
  /** What today is built as. A strength / power day beyond the three heavy days, or next to one, becomes light; a
   *  weekday the coach's plan leaves out is light too. */
  kind: NoMatchDayKind;
  /** Today's heavy reps (a heavy day), else null. */
  heavyReps: number | null;
  /** Why today is light although the plan says strength / power, or says nothing. */
  lightBecause: "over_three" | "next_to_heavy" | "not_in_plan" | null;
  /** The week's heavy days (ISO dates), in date order. */
  heavyDates: string[];
  /** The week's heavy reps in all. */
  weekTotal: number;
};

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * A week without a match, from the coach's weekday plan (with that week's moves). Null when the plan says nothing
 * for the whole week: then the engine builds the day as before.
 */
export function noMatchWeekRule(todayIso: string, plan: NoMatchWeek | null | undefined, season: WeekRuleSeason): NoMatchWeekRule | null {
  const monday = mondayOfIso(todayIso);
  const dates = WEEKDAYS.map((_, i) => addDays(monday, i));
  const kinds = dates.map((d) => noMatchDayFor(d, plan));
  if (kinds.every((k) => k == null)) return null;
  const today = dates.indexOf(todayIso);
  if (today < 0) return null;

  // Strength days first, then power days, each in date order; never next to a day already taken; at most three.
  const order = [
    ...kinds.map((k, i) => (k === "strength" ? i : -1)).filter((i) => i >= 0),
    ...kinds.map((k, i) => (k === "power" ? i : -1)).filter((i) => i >= 0),
  ];
  const heavy: number[] = [];
  const why = new Map<number, "over_three" | "next_to_heavy">();
  for (const i of order) {
    if (heavy.some((j) => Math.abs(j - i) === 1)) why.set(i, "next_to_heavy");
    else if (heavy.length >= NO_MATCH_MAX_HEAVY_DAYS) why.set(i, "over_three");
    else heavy.push(i);
  }

  // The week's reps over the heavy days, dealt out in threes, the larger shares to the days taken first (the strength
  // days). Every heavy day holds at least 6 and at most 15.
  const steps = Math.round(NO_MATCH_WEEK_HEAVY_TOTAL[season] / REP_STEP);
  const reps = new Map<number, number>();
  heavy.forEach((i, n) => {
    const share = (Math.floor(steps / heavy.length) + (n < steps % heavy.length ? 1 : 0)) * REP_STEP;
    reps.set(i, Math.max(MIN_REPS_PER_HEAVY_DAY, Math.min(MAX_REPS_PER_HEAVY_DAY, share)));
  });

  const k = kinds[today];
  const isHeavy = heavy.includes(today);
  return {
    kind: k === "rest" ? "rest" : isHeavy ? (k as NoMatchDayKind) : "light",
    heavyReps: isHeavy ? reps.get(today)! : null,
    lightBecause: isHeavy || k === "rest" || k === "light" ? null : k == null ? "not_in_plan" : why.get(today) ?? null,
    heavyDates: [...heavy].sort((a, b) => a - b).map((i) => dates[i]),
    weekTotal: [...reps.values()].reduce((a, b) => a + b, 0),
  };
}

/** The first number of a reps line ("3", "3-5", "6 × 1 (singles)"); null for holds and lines with no number first. */
function repsOf(reps: string): number | null {
  if (/\d\s*s\b|sec|hold/i.test(reps)) return null;
  const m = /^\s*(\d+)/.exec(reps);
  return m ? Number(m[1]) : null;
}

/** A heavy lower-body lift: a main two-leg lift for 6 reps or fewer. */
export function isHeavyLift(ex: PrescribedExercise): boolean {
  if (ex.category !== "COMPOUND_STRENGTH") return false;
  const reps = repsOf(ex.dose.reps);
  return reps != null && reps <= HEAVY_REPS_MAX;
}

/**
 * Within the set. Professional footballers who stopped each squat set at a 15% speed loss improved jump height and
 * strength; those who went to 30% did not improve the jump, with 65% more reps (Pareja-Blanco 2017). Half the possible
 * reps is about a 20% loss with little metabolic cost (Sánchez-Medina 2011); 10% against 30% over 8 weeks gave more
 * jump and sprint gain (Rodríguez-Rosell 2020). A stop at a speed LOSS holds for every lift; a fixed speed in m/s does
 * not, because the same speed is a different load in each lift (squat 1.00 m/s is about 60% of max, deadlift about
 * 45–50%: Pareja-Blanco 2017; Benavides-Ubric 2020; Balsalobre-Fernández 2021 advises against fixed speed zones).
 */
export const HEAVY_VELOCITY_LOSS_CAP = 20 as const;
export const NEAR_MATCH_VELOCITY_LOSS_CAP = 10 as const;

/**
 * Close to the match (MD-2, MD-1, and a light day in a week without a match): a small fast dose, no heavy lift.
 * A resistance "priming" dose raised performance 6–33 h later; what worked was 15–20 ballistic reps at 30–40% of max
 * (5 × 4 jump squats at 40%: jump +5% at 24 h and +3% at 48 h; 3 × 5 loaded jumps at 30–40%: +4.2% at 6 h) or at most
 * 6 reps at 85% or more. 3 × 5 half squats at 30% without a jump did nothing, and high-volume sessions did not help
 * (Harrison 2019, review of 11 small studies in strong athletes, none footballers). 4 × 4 = 16 reps sits inside
 * 15–20; the exact split into sets is MicroPulse's rule.
 */
export const NEAR_MATCH_SETS = 4;
export const NEAR_MATCH_REPS = 4;
export const NEAR_MATCH_LOAD = "30–40% 1RM";
/** The loaded jumps the 30–40% load line is written for; other explosive lifts keep their own load line. */
const LOADED_JUMP_IDS = new Set(["ex_trap_bar_jump_squat", "ex_jump_shrug"]);
const isLoadedExplosive = (ex: PrescribedExercise) => ex.category === "BALLISTIC" || ex.category === "EXPLOSIVE_OLYMPIC";

export const NEAR_MATCH_EVIDENCE =
  "Week rule, close to the match. A small fast dose 6–33 h before competition raised later performance: 15–20 ballistic reps at 30–40% of max (jump +5% at 24 h, +3% at 48 h), or at most 6 reps at 85% or more; a light lift without a jump did nothing (Harrison 2019, 11 small studies, strong athletes, none footballers). Stopping the set at a 10% speed loss gave more jump and sprint gain than 30% (Rodríguez-Rosell 2020). 4 × 4 (16 reps), or 3 rounds of 3 + 3 with a paired jump (18), is MicroPulse's split of the 15–20 reps.";

export type NearMatchApplied = { from: string; to: string; paired: boolean; reps: number };

/** Paired with a jump, round by round (power contrast): 3 rounds of 3 + 3, so the lift and the jump together stay at
 *  18 explosive reps, inside the 15–20 that worked. */
export const NEAR_MATCH_PAIRED_ROUNDS = 3;
export const NEAR_MATCH_PAIRED_REPS = 3;

/**
 * Close to the match: the day's loaded explosive lift does 4 × 4 (16 reps), as fast as possible, each set stopped at
 * a 10% speed loss. When a jump is paired with it in the same block, the pair does 3 rounds of 3 + 3 (18 reps), so the
 * day's explosive reps stay inside 15–20. Mutates the blocks. Null when the day's method has no loaded explosive lift
 * (an isometric primer, the built-in iso + box-jump primer): left as it is.
 */
export function applyNearMatchDose(blocks: SessionBlock[]): NearMatchApplied | null {
  for (const blk of blocks) {
    const i = blk.exercises.findIndex(isLoadedExplosive);
    if (i < 0) continue;
    const ex = blk.exercises[i];
    const from = `${ex.dose.sets} × ${ex.dose.reps}`;
    const isPairedJump = (e: PrescribedExercise, k: number) => k !== i && e.category === "PLYOMETRIC";
    const paired = blk.type === "FRENCH_CONTRAST" && blk.exercises.some(isPairedJump);
    const sets = paired ? NEAR_MATCH_PAIRED_ROUNDS : NEAR_MATCH_SETS;
    const reps = paired ? NEAR_MATCH_PAIRED_REPS : NEAR_MATCH_REPS;
    blk.exercises = blk.exercises.map((e, k) => {
      if (k === i) {
        return {
          ...e,
          dose: {
            ...e.dose,
            sets,
            reps: String(reps),
            intensity: LOADED_JUMP_IDS.has(e.exerciseId) ? NEAR_MATCH_LOAD : e.dose.intensity,
            velocityLossCap: NEAR_MATCH_VELOCITY_LOSS_CAP,
            cue: "As fast as possible on every rep; stop the set when the bar slows by 10%",
          },
        };
      }
      return paired && isPairedJump(e, k) ? { ...e, dose: { ...e.dose, sets, reps: String(reps) } } : e;
    });
    const jumps = paired ? blk.exercises.filter(isPairedJump).length : 0;
    return { from, to: paired ? `${sets} rounds of ${reps} + ${reps}` : `${sets} × ${reps}`, paired, reps: sets * reps * (1 + jumps) };
  }
  return null;
}

/** The "why" line for a day close to the match. */
export function nearMatchAudit(md: MdContext, applied: NearMatchApplied, noMatchLight: boolean): AppliedAdaptation {
  const toIS = applied.paired ? applied.to.replace("rounds of", "hringir af") : applied.to;
  const was = applied.paired || applied.from === applied.to ? { en: "", is: "" } : { en: ` (the method alone gives ${applied.from})`, is: ` (aðferðin ein gefur ${applied.from})` };
  const pairEN = applied.paired ? ", the loaded lift then the jump" : "";
  const pairIS = applied.paired ? ", hlaðna lyftan og svo stökkið" : "";
  return {
    ruleId: "WEEK_RULE_NEAR_MATCH",
    triggerEN: noMatchLight ? "Week rule: a light day in a week without a match" : `Week rule: ${md}, close to the match`,
    triggerIS: noMatchLight ? "Vikuregla: léttur dagur í viku án leiks" : `Vikuregla: ${md}, nálægt leik`,
    actionEN: `Fast work only: ${applied.to}${pairEN}, ${applied.reps} explosive reps in all${was.en}. Light load (30–40% of max for loaded jumps), as fast as possible, each set stopped at a 10% speed loss. No heavy lift today.`,
    actionIS: `Aðeins hröð vinna: ${toIS}${pairIS}, ${applied.reps} sprengiendurtekningar alls${was.is}. Létt þyngd (30–40% af hámarki í hlöðnum hoppum), eins hratt og hægt er, hverju setti hætt við 10% hraðatap. Engin þung lyfta í dag.`,
    evidence: NEAR_MATCH_EVIDENCE,
  };
}

/** A French contrast round is four exercises. The two studies used 3 rounds (Welch 2019) and 3–4 in 50–70 min
 *  sessions (Elbadry 2019); kept at 3 so the day stays short. The cap is MicroPulse's rule. */
export const FRENCH_CONTRAST_MAX_ROUNDS = 3;
const FRENCH_CONTRAST_MIN_EXERCISES = 4;

export type WeekRuleApplied = {
  /** The day's heavy reps as the method alone gives them, and after the rule. */
  from: number;
  to: number;
  /** How the reps are done: "3 × 3", or "2 × 3 + 2 × 3" with two heavy lifts. */
  as: string;
  /** A French contrast block was held at its round cap (so `to` is under the day's number). */
  cappedRounds: boolean;
};

/** A plain range of reps ("3-5", "3–5"): the rule takes the lower end, so the day's reps are a known number. */
const REP_RANGE = /^\s*(\d+)\s*[-–]\s*\d+\s*$/;

/**
 * Sets today's heavy lower-body reps. The method says how many reps a set holds (the lower end of a range); the sets
 * are the day's reps over that, to the nearest set. In a contrast block (heavy lift → jump, round by round) every
 * exercise of the block does the same number of rounds, so the pairs match; a French contrast block (four exercises a
 * round) takes at most three rounds. Mutates the blocks. Null when the day has no heavy lift.
 */
export function applyWeekRule(blocks: SessionBlock[], dayReps: number): WeekRuleApplied | null {
  const spots: { b: number; i: number }[] = [];
  blocks.forEach((blk, b) => blk.exercises.forEach((ex, i) => { if (isHeavyLift(ex)) spots.push({ b, i }); }));
  if (!spots.length) return null;
  const out: WeekRuleApplied = { from: 0, to: 0, as: "", cappedRounds: false };
  const parts: string[] = [];
  spots.forEach((s) => {
    const blk = blocks[s.b];
    const ex = blk.exercises[s.i];
    const perSet = repsOf(ex.dose.reps) ?? 1;
    const contrast = blk.type === "FRENCH_CONTRAST" && spots.filter((x) => x.b === s.b).length === 1;
    // More than one heavy lift in the day: the day's reps are shared between them.
    let sets = Math.max(1, Math.min(MAX_SETS_PER_LIFT, Math.round(dayReps / spots.length / perSet)));
    if (contrast && blk.exercises.length >= FRENCH_CONTRAST_MIN_EXERCISES && sets > FRENCH_CONTRAST_MAX_ROUNDS) {
      sets = FRENCH_CONTRAST_MAX_ROUNDS;
      out.cappedRounds = true;
    }
    out.from += ex.dose.sets * perSet;
    out.to += sets * perSet;
    parts.push(`${sets} × ${perSet}`);
    // The set stops at a 20% speed loss (about half the reps the player could do), never a higher loss.
    const cap = ex.dose.velocityLossCap && ex.dose.velocityLossCap <= HEAVY_VELOCITY_LOSS_CAP ? ex.dose.velocityLossCap : HEAVY_VELOCITY_LOSS_CAP;
    const reps = REP_RANGE.test(ex.dose.reps) ? String(perSet) : ex.dose.reps;
    blk.exercises[s.i] = { ...ex, dose: { ...ex.dose, sets, reps, velocityLossCap: cap, weekRule: true } };
    if (contrast) {
      blk.exercises = blk.exercises.map((e, i) => (i === s.i || e.dose.sets === sets ? e : { ...e, dose: { ...e.dose, sets } }));
    }
  });
  out.as = parts.join(" + ");
  return out;
}

/** The "why" line for a day the rule set. The lift is not named: the team list may still put another lift there. */
export function weekRuleAudit(args: {
  md: MdContext;
  season: WeekRuleSeason;
  /** The day's heavy reps by the rule (before a French contrast round cap). */
  dayReps: number;
  applied: WeekRuleApplied;
  noMatch: NoMatchWeekRule | null;
}): AppliedAdaptation {
  const { md, season, dayReps, applied, noMatch } = args;
  const seasonEN = season === "preseason" ? "pre-season" : "in season";
  const seasonIS = season === "preseason" ? "undirbúningstímabil" : "keppnistímabil";
  const matchWeek = MATCH_WEEK_HEAVY_REPS[season];
  const weekReps = (matchWeek["MD-4"] ?? 0) + (matchWeek["MD-3"] ?? 0);
  const week = noMatch
    ? { en: `${noMatch.weekTotal} heavy reps this week on ${noMatch.heavyDates.length} day${noMatch.heavyDates.length === 1 ? "" : "s"}`, is: `${noMatch.weekTotal} þungar endurtekningar í vikunni á ${noMatch.heavyDates.length} ${noMatch.heavyDates.length === 1 ? "degi" : "dögum"}` }
    : { en: `${md} is a heavy day; the week holds ${weekReps} heavy reps on MD-4 and MD-3${md === "MD-5" ? `, and ${matchWeek["MD-5"]} more today because there was no match the days before` : ""}`, is: `${md} er þungur dagur; vikan hefur ${weekReps} þungar endurtekningar á MD-4 og MD-3${md === "MD-5" ? `, og ${matchWeek["MD-5"]} í viðbót í dag því enginn leikur var dagana á undan` : ""}` };
  const was = applied.from === applied.to ? { en: "", is: "" } : { en: ` (the method alone gives ${applied.from})`, is: ` (aðferðin ein gefur ${applied.from})` };
  const cap = applied.cappedRounds
    ? { en: ` French contrast takes at most ${FRENCH_CONTRAST_MAX_ROUNDS} rounds, so the day stays short: ${applied.to} of the day's ${dayReps} reps.`, is: ` French contrast er mest ${FRENCH_CONTRAST_MAX_ROUNDS} hringir, svo dagurinn haldist stuttur: ${applied.to} af ${dayReps} endurtekningum dagsins.` }
    : { en: "", is: "" };
  return {
    ruleId: "WEEK_RULE_HEAVY_REPS",
    triggerEN: `Week rule (${seasonEN}): ${week.en}`,
    triggerIS: `Vikuregla (${seasonIS}): ${week.is}`,
    actionEN: `Today's heavy lower-body reps: ${applied.to}, as ${applied.as}${was.en}. The method says how many reps a set holds; the sets follow. Each set stops at a 20% speed loss, or at about half the reps you could do. In a contrast block the jumps follow the same number of rounds.${cap.en}`,
    actionIS: `Þungar endurtekningar neðri líkama í dag: ${applied.to}, sem ${applied.as}${was.is}. Aðferðin ræður endurtekningum í setti; settin fylgja. Hverju setti er hætt við 20% hraðatap, eða við um helming þeirra endurtekninga sem þú gætir gert. Í contrast-blokk fylgja stökkin sama fjölda hringja.${cap.is}`,
    evidence: WEEK_RULE_EVIDENCE,
  };
}

/** The "why" line for a day the rule made light in a week without a match. */
export function weekRuleLightAudit(rule: NoMatchWeekRule): AppliedAdaptation | null {
  if (!rule.lightBecause) return null;
  const en =
    rule.lightBecause === "not_in_plan" ? "today is not in the weekday plan for weeks without a match"
    : rule.lightBecause === "next_to_heavy" ? "today is next to a heavy day"
    : "the week already has three heavy days";
  const is =
    rule.lightBecause === "not_in_plan" ? "dagurinn er ekki í vikuplaninu fyrir vikur án leiks"
    : rule.lightBecause === "next_to_heavy" ? "dagurinn er við hliðina á þungum degi"
    : "vikan hefur þegar þrjá þunga daga";
  return {
    ruleId: "WEEK_RULE_LIGHT_DAY",
    triggerEN: `Week rule, no match this week: ${en}`,
    triggerIS: `Vikuregla, enginn leikur í vikunni: ${is}`,
    actionEN: "Built as a light day (fast, light work). A week without a match holds at most three heavy days, never two days in a row, and the same heavy reps as a match week.",
    actionIS: "Sett upp sem léttur dagur (hröð og létt vinna). Vika án leiks hefur mest þrjá þunga daga, aldrei tvo daga í röð, og sömu þungu endurtekningarnar og leikvika.",
    evidence: WEEK_RULE_EVIDENCE,
  };
}
