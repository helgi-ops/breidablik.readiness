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
/**
 * Reps a set, the coach's choice per heavy MD day (2026-11-19). The day's reps are fixed by the rule; this says how
 * they are cut into sets: 12 reps are 6 × 2 or 3 × 4. Fewer reps a set means less fatigue in each set for the same
 * reps (a set stopped early loses less bar speed: Sánchez-Medina 2011; Pareja-Blanco 2017). Unset = the method's own.
 * Persisted in team_strength_palette.md_reps_per_set (jsonb): MD day → 1–5.
 */
export const HEAVY_MD_DAYS: MdContext[] = ["MD-5", "MD-4", "MD-3"];
export const REPS_PER_SET_CHOICES = [1, 2, 3, 4, 5] as const;
export type RepsPerSet = (typeof REPS_PER_SET_CHOICES)[number];
export type MdRepsPerSet = Partial<Record<MdContext, RepsPerSet>>;

/** Keep only heavy MD day → 1–5. */
export function sanitizeMdRepsPerSet(raw: unknown): MdRepsPerSet {
  const out: MdRepsPerSet = {};
  if (!raw || typeof raw !== "object") return out;
  for (const md of HEAVY_MD_DAYS) {
    const v = Number((raw as Record<string, unknown>)[md]);
    if ((REPS_PER_SET_CHOICES as readonly number[]).includes(v)) out[md] = v as RepsPerSet;
  }
  return out;
}

/** The week's reps are dealt out in threes; a heavy day holds 6 to 15. */
const REP_STEP = 3;
const MIN_REPS_PER_HEAVY_DAY = 6;
const MAX_REPS_PER_HEAVY_DAY = 15;
/** At most 6 sets of one lift; singles may go to 10 (ten single reps). */
const MAX_SETS_PER_LIFT = 6;
const MAX_SETS_OF_SINGLES = 10;
/** A contrast pair is done for at most 5 rounds: the range the studies used (1–5 a session, Lesinski 2014). */
export const CONTRAST_MAX_ROUNDS = 5;

/** The day's reps as sets of `perSet`, to the nearest set, inside the cap for that kind of work. */
export function setsForReps(dayReps: number, perSet: number, kind: "lift" | "contrast" | "french_contrast" = "lift"): number {
  const cap = kind === "french_contrast" ? FRENCH_CONTRAST_MAX_ROUNDS : kind === "contrast" ? CONTRAST_MAX_ROUNDS : perSet === 1 ? MAX_SETS_OF_SINGLES : MAX_SETS_PER_LIFT;
  return Math.max(1, Math.min(cap, Math.round(dayReps / Math.max(1, perSet))));
}

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

/**
 * The bar-speed zone of a day close to the match (2026-11-20, the coach's call): MD-2 in the speed-strength zone,
 * MD-1 in the speed zone, so the bar gets faster and the load lighter as the match comes closer. A light day in a
 * week without a match is built as MD-2 and takes its zone.
 *
 * What comes from research (`research/`):
 *   - The zones and their names: strength-speed 0.75–1.0 m/s, speed-strength 1.0–1.3 m/s in a squat, starting strength
 *     from 1.3 m/s (Mann, Ivey & Sayers 2015: a coaching article on American football, not a trial).
 *   - 1.0–1.3 m/s: professional footballers trained the full squat at 40–55% of max (about 1.28–1.07 m/s) in season,
 *     once or twice a week for 7 weeks, and raised jump power (Otero-Esquina 2017, in Cormier 2020).
 *   - 1.3 m/s or faster: 30–40% of max in the squat is about 1.3–1.43 m/s (%1RM = −2.185·v² − 61.53·v + 122.5,
 *     Pareja-Blanco 2017, professional footballers), the load of the dose that worked the day before competition
 *     (Harrison 2019).
 *   - A speed to aim at gave faster reps than "as fast as possible" (Hirsch & Frost 2019: bench press, 13 lifters).
 *
 * What does NOT come from research: no study tested a target speed for loaded jumps or pulls; the speeds are from
 * squat studies. The same speed is a different load in each lift (Balsalobre-Fernández 2021 advises against fixed
 * zones), so the SPEED decides the load and the % is only where to start. Which day takes which zone is MicroPulse's
 * rule. The bounds are the ones the custom-template page already uses (`VBT_ZONES`: speed-strength 1.0–1.3, speed
 * 1.3+), so no new table is added to the ones that already disagree (docs/vbt-methods.md).
 */
export type NearMatchDay = "MD-2" | "MD-1";
export type SpeedZone = { min: number; max: number | null };
export const NEAR_MATCH_ZONE: Record<NearMatchDay, { nameEN: string; nameIS: string; zone: SpeedZone; load: string }> = {
  "MD-2": { nameEN: "speed-strength", nameIS: "speed-strength", zone: { min: 1.0, max: 1.3 }, load: "40–55% 1RM" },
  "MD-1": { nameEN: "speed", nameIS: "speed", zone: { min: 1.3, max: null }, load: "30–40% 1RM" },
};
/** The near-match day a build is: MD-1 on MD-1, else MD-2 (MD-2 itself, and a light day in a week without a match). */
export const nearMatchDayOf = (md: MdContext): NearMatchDay => (md === "MD-1" ? "MD-1" : "MD-2");

/** "1.0–1.3 m/s" / "≥ 1.3 m/s" (no words, so the line reads the same in both languages). */
export function speedZoneText(z: SpeedZone): string {
  const f = (n: number) => n.toFixed(1);
  return z.max == null ? `≥ ${f(z.min)} m/s` : `${f(z.min)}–${f(z.max)} m/s`;
}

/** The loaded squat-type jump: the lift the squat studies' loads and speeds are closest to. It takes the day's load
 *  line and the whole zone. */
export const LOADED_SQUAT_JUMP_IDS = new Set(["ex_trap_bar_jump_squat"]);
/** Pulls with a bar. A pull moves faster than a squat at the same effort (a hang clean about 1.4 m/s: Mann 2015), so
 *  for these the zone's lower end is a floor only, and they keep their own load line (a jump shrug 30–40%). */
export const BAR_PULL_IDS = new Set(["ex_jump_shrug", "ex_hang_high_pull", "ex_mid_thigh_pull_dynamic", "ex_hang_power_clean"]);
const isLoadedExplosive = (ex: PrescribedExercise) => ex.category === "BALLISTIC" || ex.category === "EXPLOSIVE_OLYMPIC";

export const NEAR_MATCH_EVIDENCE =
  "Week rule, close to the match. A small fast dose 6–33 h before competition raised later performance: 15–20 ballistic reps at 30–40% of max (jump +5% at 24 h, +3% at 48 h), or at most 6 reps at 85% or more; a light lift without a jump did nothing (Harrison 2019, 11 small studies, strong athletes, none footballers). Stopping the set at a 10% speed loss gave more jump and sprint gain than 30% (Rodríguez-Rosell 2020). 4 × 4 (16 reps), or 3 rounds of 3 + 3 with a paired jump (18), is MicroPulse's split of the 15–20 reps. Bar speed: the zones are Mann 2015's (speed-strength 1.0–1.3 m/s, speed from 1.3 m/s; a coaching article, not a trial). Professional footballers trained the squat at 40–55% of max (1.07–1.28 m/s) in season and raised jump power (Otero-Esquina 2017); 30–40% in the squat is about 1.3–1.43 m/s (Pareja-Blanco 2017). No study tested a target speed for loaded jumps or pulls, and the same speed is a different load in each lift (Balsalobre-Fernández 2021): the speed decides the load, the % is where to start. Which day takes which zone is MicroPulse's rule.";

export type NearMatchApplied = { from: string; to: string; paired: boolean; reps: number; day: NearMatchDay };

/** Paired with a jump, round by round (power contrast): 3 rounds of 3 + 3, so the lift and the jump together stay at
 *  18 explosive reps, inside the 15–20 that worked. */
export const NEAR_MATCH_PAIRED_ROUNDS = 3;
export const NEAR_MATCH_PAIRED_REPS = 3;

const isPairedJump = (e: PrescribedExercise) => e.category === "PLYOMETRIC";
/** The lift's sets and reps close to the match: 3 × 3 when a jump is paired with it in a contrast block, else 4 × 4. */
export function nearMatchSetsReps(blk: SessionBlock, i: number): { sets: number; reps: number; paired: boolean } {
  const paired = blk.type === "FRENCH_CONTRAST" && blk.exercises.some((e, k) => k !== i && isPairedJump(e));
  return { sets: paired ? NEAR_MATCH_PAIRED_ROUNDS : NEAR_MATCH_SETS, reps: paired ? NEAR_MATCH_PAIRED_REPS : NEAR_MATCH_REPS, paired };
}

/**
 * The near-match dose of one lift on one day. A loaded squat-type jump: the day's load and the whole zone. A pull with
 * a bar: its own load (a jump shrug 30–40%) and the zone's lower end as a floor. Anything else (dumbbell, kettlebell):
 * its own load and no bar speed, because no bar is measured.
 */
export function nearMatchDoseFor(ex: PrescribedExercise, day: NearMatchDay, sets: number, reps: number): PrescribedExercise["dose"] {
  const z = NEAR_MATCH_ZONE[day];
  const squatJump = LOADED_SQUAT_JUMP_IDS.has(ex.exerciseId);
  const pull = BAR_PULL_IDS.has(ex.exerciseId);
  const zone: SpeedZone | null = squatJump ? z.zone : pull ? { min: z.zone.min, max: null } : null;
  const own = String(ex.dose.intensity ?? "").split(" · ")[0];
  const load = squatJump ? z.load : ex.exerciseId === "ex_jump_shrug" ? NEAR_MATCH_LOAD : own;
  const { speedZone: _old, ...rest } = ex.dose;
  void _old;
  return {
    ...rest,
    sets,
    reps: String(reps),
    intensity: zone ? [load, speedZoneText(zone)].filter(Boolean).join(" · ") : load,
    velocityLossCap: NEAR_MATCH_VELOCITY_LOSS_CAP,
    cue: !zone
      ? "As fast as possible on every rep; stop the set when the bar slows by 10%"
      : zone.max == null
        ? `Bar speed ${speedZoneText(zone)}: take weight off if it is slower. Stop the set when the bar slows by 10%`
        : `Bar speed ${speedZoneText(zone)}: add weight if it is faster, take weight off if slower. Stop the set when the bar slows by 10%`,
    nearMatch: true,
    ...(zone ? { speedZone: zone } : {}),
  };
}

/**
 * Close to the match: the day's loaded explosive lift does 4 × 4 (16 reps), in the day's bar-speed zone, each set
 * stopped at a 10% speed loss. When a jump is paired with it in the same block, the pair does 3 rounds of 3 + 3
 * (18 reps), so the day's explosive reps stay inside 15–20. The lift is marked (`dose.nearMatch`), so it is found again
 * after the team list has put its own exercise there (`finishNearMatch`). Mutates the blocks. Null when the day's
 * method has no loaded explosive lift (an isometric primer, the built-in iso + box-jump primer): left as it is.
 */
export function applyNearMatchDose(blocks: SessionBlock[], day: NearMatchDay = "MD-1"): NearMatchApplied | null {
  for (const blk of blocks) {
    const i = blk.exercises.findIndex(isLoadedExplosive);
    if (i < 0) continue;
    const ex = blk.exercises[i];
    const from = `${ex.dose.sets} × ${ex.dose.reps}`;
    const { sets, reps, paired } = nearMatchSetsReps(blk, i);
    blk.exercises = blk.exercises.map((e, k) => {
      if (k === i) return { ...e, dose: nearMatchDoseFor(e, day, sets, reps) };
      return paired && isPairedJump(e) ? { ...e, dose: { ...e.dose, sets, reps: String(reps) } } : e;
    });
    const jumps = paired ? blk.exercises.filter((e, k) => k !== i && isPairedJump(e)).length : 0;
    return { from, to: paired ? `${sets} rounds of ${reps} + ${reps}` : `${sets} × ${reps}`, paired, reps: sets * reps * (1 + jumps), day };
  }
  return null;
}

/**
 * After the team list and the player's goal have put their own exercise in the marked spot: the dose is written again
 * for the lift that is there now (its load line, and a bar speed only when a bar is measured). A spot that no longer
 * holds a loaded explosive lift (the team list had only a jump for it) keeps that exercise's own reps and load and
 * gets no bar speed.
 */
export function finishNearMatch(blocks: SessionBlock[], day: NearMatchDay): void {
  for (const blk of blocks) {
    blk.exercises.forEach((ex, i) => {
      if (!ex.dose.nearMatch) return;
      if (!isLoadedExplosive(ex)) {
        if (ex.dose.speedZone) {
          const { speedZone: _z, ...rest } = ex.dose;
          void _z;
          blk.exercises[i] = { ...ex, dose: rest };
        }
        return;
      }
      // The sets stay as they are (a yellow day's readiness rule may have taken some off); the reps and the load line
      // are the near-match dose for the lift that is here now.
      const { reps } = nearMatchSetsReps(blk, i);
      blk.exercises[i] = { ...ex, dose: nearMatchDoseFor(ex, day, ex.dose.sets, reps) };
    });
  }
}

/** The bar-speed sentence of the "why" line, for the lift that is in the fast spot at the end of the build. */
function nearMatchSpeedSay(day: NearMatchDay, lift: PrescribedExercise | null): { en: string; is: string } {
  const comma = (t: string) => t.replace(/(\d)\.(\d)/g, "$1,$2");
  const load = lift ? String(lift.dose.intensity ?? "").split(" · ")[0] : "";
  const loadIS = load.replace("1RM", "af hámarki");
  const z = lift?.dose.speedZone ?? null;
  if (lift && z) {
    const zone = speedZoneText(z);
    const name = z.max == null && BAR_PULL_IDS.has(lift.exerciseId) ? null : day === "MD-1" ? "Speed" : "Speed-strength";
    const start = load ? { en: `, starting at about ${load}`, is: `, byrjað um ${loadIS}` } : { en: "", is: "" };
    return name
      ? { en: `${name} zone: ${zone}${start.en}; the bar speed sets the load.`, is: `${name} svæði: ${comma(zone)}${start.is}; stangarhraðinn ræður þyngdinni.` }
      : { en: `Bar speed ${zone} (a pull moves faster than a squat at the same effort)${start.en}; the bar speed sets the load.`, is: `Stangarhraði ${comma(zone)} (tog fer hraðar en hnébeygja við sama átak)${start.is}; stangarhraðinn ræður þyngdinni.` };
  }
  if (lift && load && !/^bodyweight/i.test(load)) return { en: `Light load (${load}), as fast as possible.`, is: `Létt þyngd (${loadIS}), eins hratt og hægt er.` };
  return { en: "As fast as possible.", is: "Eins hratt og hægt er." };
}

/** The lift in the day's fast spot (`dose.nearMatch`), or null. */
export function nearMatchLiftOf(blocks: SessionBlock[]): PrescribedExercise | null {
  return blocks.flatMap((b) => b.exercises).find((e) => e.dose.nearMatch) ?? null;
}

/** The "why" line for a day close to the match. `lift` = the lift in the fast spot at the end of the build (after the
 *  team list and the player's goal), so the speed it names is that lift's. */
export function nearMatchAudit(md: MdContext, applied: NearMatchApplied, noMatchLight: boolean, lift: PrescribedExercise | null = null): AppliedAdaptation {
  const toIS = applied.paired ? applied.to.replace("rounds of", "hringir af") : applied.to;
  const was = applied.paired || applied.from === applied.to ? { en: "", is: "" } : { en: ` (the method alone gives ${applied.from})`, is: ` (aðferðin ein gefur ${applied.from})` };
  const pairEN = applied.paired ? ", the loaded lift then the jump" : "";
  const pairIS = applied.paired ? ", hlaðna lyftan og svo stökkið" : "";
  const speed = nearMatchSpeedSay(applied.day, lift);
  return {
    ruleId: "WEEK_RULE_NEAR_MATCH",
    triggerEN: noMatchLight ? "Week rule: a light day in a week without a match" : `Week rule: ${md}, close to the match`,
    triggerIS: noMatchLight ? "Vikuregla: léttur dagur í viku án leiks" : `Vikuregla: ${md}, nálægt leik`,
    actionEN: `Fast work only: ${applied.to}${pairEN}, ${applied.reps} explosive reps in all${was.en}. ${speed.en} Each set stopped at a 10% speed loss. No heavy lift today.`,
    actionIS: `Aðeins hröð vinna: ${toIS}${pairIS}, ${applied.reps} sprengiendurtekningar alls${was.is}. ${speed.is} Hverju setti hætt við 10% hraðatap. Engin þung lyfta í dag.`,
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
  /** A cap held the sets under the day's reps: French contrast rounds (3), contrast rounds (5), or sets of one lift. */
  capped: "french_contrast" | "contrast" | "sets" | null;
  /** The coach's reps a set for this day were used (else the method's own). */
  coachRepsPerSet: number | null;
};

/** A plain reps line: one number ("3") or a range ("3-5", "3–5"). Only these take the coach's reps a set; a cluster
 *  line ("6 × 1 (singles)") is the method's own way of cutting the set and stays. */
const REP_PLAIN = /^\s*(\d+)\s*(?:[-–]\s*\d+\s*)?$/;

/**
 * Sets today's heavy lower-body reps. How many reps a set holds: the coach's choice for the day when there is one,
 * else the method's (the lower end of a range); the sets are the day's reps over that, to the nearest set. In a
 * contrast block (heavy lift → jump, round by round) every exercise of the block does the same number of rounds, so
 * the pairs match: at most five rounds, and three in a French contrast block (four exercises a round). Mutates the
 * blocks. Null when the day has no heavy lift.
 */
export function applyWeekRule(blocks: SessionBlock[], dayReps: number, coachRepsPerSet?: number | null): WeekRuleApplied | null {
  const spots: { b: number; i: number }[] = [];
  blocks.forEach((blk, b) => blk.exercises.forEach((ex, i) => { if (isHeavyLift(ex)) spots.push({ b, i }); }));
  if (!spots.length) return null;
  const out: WeekRuleApplied = { from: 0, to: 0, as: "", capped: null, coachRepsPerSet: null };
  const parts: string[] = [];
  spots.forEach((s) => {
    const blk = blocks[s.b];
    const ex = blk.exercises[s.i];
    const own = repsOf(ex.dose.reps) ?? 1;
    const plain = REP_PLAIN.test(ex.dose.reps);
    const useCoach = plain && coachRepsPerSet != null && coachRepsPerSet >= 1 && coachRepsPerSet <= HEAVY_REPS_MAX;
    const perSet = useCoach ? Math.round(coachRepsPerSet!) : own;
    if (useCoach) out.coachRepsPerSet = perSet;
    const contrast = blk.type === "FRENCH_CONTRAST" && spots.filter((x) => x.b === s.b).length === 1;
    const kind = !contrast ? "lift" : blk.exercises.length >= FRENCH_CONTRAST_MIN_EXERCISES ? "french_contrast" : "contrast";
    // More than one heavy lift in the day: the day's reps are shared between them.
    const share = dayReps / spots.length;
    const sets = setsForReps(share, perSet, kind);
    if (sets < Math.round(share / perSet)) out.capped = kind === "lift" ? "sets" : kind;
    out.from += ex.dose.sets * own;
    out.to += sets * perSet;
    parts.push(`${sets} × ${perSet}`);
    // The set stops at a 20% speed loss (about half the reps the player could do), never a higher loss.
    const cap = ex.dose.velocityLossCap && ex.dose.velocityLossCap <= HEAVY_VELOCITY_LOSS_CAP ? ex.dose.velocityLossCap : HEAVY_VELOCITY_LOSS_CAP;
    const reps = plain ? String(perSet) : ex.dose.reps;
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
  const of = { en: `${applied.to} of the day's ${dayReps} reps`, is: `${applied.to} af ${dayReps} endurtekningum dagsins` };
  const cap =
    applied.capped === "french_contrast" ? { en: ` French contrast takes at most ${FRENCH_CONTRAST_MAX_ROUNDS} rounds, so the day stays short: ${of.en}.`, is: ` French contrast er mest ${FRENCH_CONTRAST_MAX_ROUNDS} hringir, svo dagurinn haldist stuttur: ${of.is}.` }
    : applied.capped === "contrast" ? { en: ` A contrast pair takes at most ${CONTRAST_MAX_ROUNDS} rounds: ${of.en}.`, is: ` Contrast-par er mest ${CONTRAST_MAX_ROUNDS} hringir: ${of.is}.` }
    : applied.capped === "sets" ? { en: ` One lift takes a limited number of sets: ${of.en}.`, is: ` Ein lyfta fær takmarkaðan fjölda setta: ${of.is}.` }
    : { en: "", is: "" };
  const who = applied.coachRepsPerSet != null
    ? { en: `The coach chose ${applied.coachRepsPerSet} rep${applied.coachRepsPerSet === 1 ? "" : "s"} a set for ${md}; the sets follow.`, is: `Þjálfarinn valdi ${applied.coachRepsPerSet} ${applied.coachRepsPerSet === 1 ? "endurtekningu" : "endurtekningar"} í setti á ${md}; settin fylgja.` }
    : { en: "The method says how many reps a set holds; the sets follow.", is: "Aðferðin ræður endurtekningum í setti; settin fylgja." };
  return {
    ruleId: "WEEK_RULE_HEAVY_REPS",
    triggerEN: `Week rule (${seasonEN}): ${week.en}`,
    triggerIS: `Vikuregla (${seasonIS}): ${week.is}`,
    actionEN: `Today's heavy lower-body reps: ${applied.to}, as ${applied.as}${was.en}. ${who.en} Each set stops at a 20% speed loss, or at about half the reps you could do. In a contrast block the jumps follow the same number of rounds.${cap.en}`,
    actionIS: `Þungar endurtekningar neðri líkama í dag: ${applied.to}, sem ${applied.as}${was.is}. ${who.is} Hverju setti er hætt við 20% hraðatap, eða við um helming þeirra endurtekninga sem þú gætir gert. Í contrast-blokk fylgja stökkin sama fjölda hringja.${cap.is}`,
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
