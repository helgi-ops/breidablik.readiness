/**
 * Rules per MD day (2026-11-22): what each day of the match week is for, what may go in it, and the caps. Pure.
 *
 * Source: the day rules in Helgi's UEFA Fitness B weekly plans for Breiðablik (pre-season Jan 2027, in-season week).
 * They are the coach's rules, not a study; the velocity-loss caps carry their studies.
 *
 * `enforceDayRules` checks a built session against its day AFTER every adaptation and before delivery: on a breach it
 * trims (fewer sets, or the exercise out) and logs `DAY_RULE_TRIM` with the reason. It never adds volume. A coach's
 * own exercise swap picks the exercise, not the dose (coach's call 2026-11-23, like the CMJ cut): the day's bans and
 * the time trim leave it in, the dose caps apply to it, and it always keeps at least one set. Runs at the end of `buildStrengthSession` and again
 * after the meso layer (`applyBlockToSession`), which can add a set; a second run on a clean session changes nothing.
 *
 * The coach's calls on 2026-11-22, where the brief's table met rules already live:
 *   - MD-3: the heavy lift that opens a contrast set stays; it counts in the day's 9 loaded reps (no "heavy zone" trim).
 *     A light loaded jump in the same rounds (≤ 40% of max) counts as jump contacts, not loaded reps (2026-11-23).
 *   - Copenhagen at body weight is not "heavy eccentric": it stays on MD-3 (the prevention rule). Nordic and RDL are.
 *   - Time caps are shown, not trimmed: the time estimate is rough; the ordered time trim comes later (§6).
 *   - Small jump doses stay on MD-2 / MD-1 / MD+1, capped at 6 contacts (MicroPulse's number for "small").
 *   - Close to the match the week rule's 4 × 4 fast dose (Harrison 2019) is not cut to the table's 6 reps: the caps of
 *     6 apply to any other loaded lift on those days (`dose.nearMatch` is left out of the count).
 *   - MD-4 heavy sets stop at 15% speed loss (was 20%; Pareja-Blanco 2017).
 *   - MD-2 is fast work only (2026-11-23): no heavy lift, legs 1.0–1.3 m/s as the week rule's near-match zone, sets stop
 *     at 10% speed loss. The table's earlier "legs 0.55–0.70 m/s" with a heavy lift is gone (it disagreed with the week
 *     rule's "No heavy lift today").
 *
 * Never reads or writes the readiness colour.
 */

import type { AppliedAdaptation, ExerciseCategory, MdContext, PrescribedExercise, SessionBlock, StrengthSession } from "./types";
import { DAY_CATEGORY, EXERCISES_BY_ID, type DayCategory } from "./exerciseLibrary";

/** A bar-speed bound as text: one decimal unless it needs two ("1.0", "1.3", "0.55"). */
export const zoneNum = (n: number): string => n.toFixed(2).replace(/(\.\d)0$/, "$1");

export type { DayCategory } from "./exerciseLibrary";

type Bi = { en: string; is: string };

export const DAY_RULE_TRIM = "DAY_RULE_TRIM";
export const DAY_RULE_TIME_NOTE = "DAY_RULE_TIME_NOTE";
export const DAY_RULE_ZONE = "DAY_RULE_ZONE";
export const DAY_RULE_COACH_DAY_OFF = "DAY_RULE_COACH_DAY_OFF";
export const TIME_BUDGET_TRIM = "TIME_BUDGET_TRIM";
/** MD-4's time budget (brief §6): warm-up and rests included, from `estimateSessionMinutes`. */
export const MD4_TIME_BUDGET_MIN = 25;
export const TIME_BUDGET_EVIDENCE =
  "The coach's MD-4 time budget (UEFA Fitness B weekly plans, 2026-11-22): 25 min before training with the warm-up and " +
  "rests, + 8 min after. Drop the upper-body filler, then the C exercise, then one set of B2; B1 (the heavy lift) is " +
  "never cut. The injury-prevention work (Nordic, Copenhagen and the test add-ons) always stays and is counted in the " +
  "8 min after, not the 25 (MicroPulse's reading of the table). MicroPulse's estimate: sets × (30 s of work + the " +
  "rest), 6 min warm-up.";

export const DAY_RULES_SOURCE =
  "Day rules from the coach's weekly plans (UEFA Fitness B, Breiðablik, 2026-11-22): the coach's rules, not from a study.";
const VL_EVIDENCE =
  "Professional footballers who stopped each squat set at a 15% speed loss improved jump and strength; at 30% they did not, with 65% more reps (Pareja-Blanco 2017). 10% against 30% over 8 weeks gave more jump and sprint gain (Rodríguez-Rosell 2020).";

export type DayCaps = {
  /** Heavy reps per lift (sets × reps). */
  heavyRepsPerLift?: number;
  /** Loaded lower-body reps in all (heavy, fast and ballistic lifts), the near-match dose left out. */
  loadedReps?: number;
  /** Jump contacts from the plyometric prescriptions (sets × reps, both sides counted). */
  contacts?: number;
  /** Drop-jump contacts. */
  dropJumpContacts?: number;
  /** Drop height, cm. */
  dropHeightCm?: number;
  /** Minutes in the gym, and after training (MD-4's 8 min). Shown on every day; MD-4 (and the days built like it) is
   *  trimmed to its 25 min by TIME_BUDGET_TRIM (brief §6). */
  minutes?: number;
  minutesAfter?: number;
  /** Velocity-loss cap on loaded lifts, %. */
  vlMax?: number;
};

export type DayRule = {
  md: MdContext | "MD";
  purpose: Bi;
  /** The categories the day is built from (shown to the coach). The validator trims the `bans` and the caps. */
  allowed: DayCategory[];
  intensity: Bi;
  caps: DayCaps;
  notAllowed: Bi[];
  bans: { heavyEccentric?: true; eccentric?: true; heavyLift?: true; goalWork?: true; heavyLegs?: true; everything?: true };
  /** Bar-speed zone set on a loaded squat jump (trap-bar jump squat) that has none (m/s). */
  ballisticZone?: { min: number; max: number | null };
  /** Where this row differs from the coach's table, and why (shown under "Show details"). */
  note?: Bi;
  /** The day the row stands in for (MD-5 / MD+3 / MD+4 use MD-4's row; OFF uses MD+2's). */
  sameAs?: MdContext;
};

const MD4: DayRule = {
  md: "MD-4",
  purpose: { en: "Max strength + power", is: "Hámarksstyrkur + kraftur" },
  allowed: ["heavy", "plyo", "iso", "eccentric", "upper"],
  intensity: { en: "Trap bar 0.55–0.80 m/s · speed loss ≤ 15% · 2+ reps in reserve", is: "Trap bar 0,55–0,80 m/s · hraðatap ≤ 15% · 2+ endurtekningar í varasjóði" },
  caps: { heavyRepsPerLift: 12, contacts: 20, minutes: 25, minutesAfter: 8, vlMax: 15 },
  notAllowed: [
    { en: "Sets to failure", is: "Sett að þroti" },
    { en: "A new exercise, except as a light warm-up intro", is: "Ný æfing, nema sem létt kynning í upphitun" },
  ],
  bans: {},
  note: {
    en: "Over 25 min before training (warm-up and rests in, injury prevention not counted), the upper-body filler goes first, then a C exercise, then one set of B2; B1 is never cut (TIME_BUDGET_TRIM). A new exercise comes in as 2 light warm-up sets first (NEW_EXERCISE_INTRO).",
    is: "Yfir 25 mín. fyrir æfingu (upphitun og hvíldir með, forvörn ekki talin) fer efri hluta fylling fyrst, svo C æfing, svo eitt sett af B2; B1 er aldrei skorin (TIME_BUDGET_TRIM). Ný æfing kemur fyrst inn sem 2 létt sett í upphitun (NEW_EXERCISE_INTRO).",
  },
};

const MD3: DayRule = {
  md: "MD-3",
  purpose: { en: "Speed + power", is: "Hraði + kraftur" },
  allowed: ["fast", "ballistic", "plyo", "sprint"],
  intensity: { en: "Loaded ≥ 0.80 m/s · ballistic ≥ 1.1 m/s · speed loss ≤ 10%", is: "Hlaðið ≥ 0,80 m/s · ballistic ≥ 1,1 m/s · hraðatap ≤ 10%" },
  caps: { loadedReps: 9, contacts: 30, dropJumpContacts: 9, dropHeightCm: 30, minutes: 15, vlMax: 10 },
  // A light loaded jump in a contrast round (≤ 40% of max) counts in the 30 contacts, not the 9 loaded reps (2026-11-23).
  notAllowed: [
    { en: "Heavy eccentric work (Nordic, RDL)", is: "Þung eccentric vinna (Nordic, RDL)" },
    { en: "Drop jumps over 30 cm or over 9 contacts", is: "Fallstökk yfir 30 cm eða yfir 9 snertingar" },
  ],
  bans: { heavyEccentric: true },
  ballisticZone: { min: 1.1, max: null },
  note: {
    en: "The heavy lift that opens a contrast set stays and counts in the 9 loaded reps; a light loaded jump in the same rounds (≤ 40% of max) counts as jumps, not loaded reps; Copenhagen at body weight stays here (the coach's calls, 2026-11-22 and 2026-11-23).",
    is: "Þunga lyftan sem opnar contrast-sett helst og telst með í 9 hlöðnum endurtekningum; létt hlaðið hopp í sömu umferðum (≤ 40% af hámarki) telst sem stökk, ekki hlaðnar endurtekningar; Copenhagen með eigin líkamsþyngd helst hér (ákvarðanir þjálfara, 2026-11-22 og 2026-11-23).",
  },
};

const MD2: DayRule = {
  md: "MD-2",
  purpose: { en: "Maintenance", is: "Viðhald" },
  allowed: ["iso", "upper", "fast", "plyo"],
  intensity: { en: "Legs fast: 1.0–1.3 m/s (40–55% 1RM) · speed loss ≤ 10% · upper body 2 reps in reserve", is: "Fætur hratt: 1,0–1,3 m/s (40–55% 1RM) · hraðatap ≤ 10% · efri hluti 2 endurtekningar í varasjóði" },
  caps: { loadedReps: 6, contacts: 6, minutes: 20, vlMax: 10 },
  notAllowed: [
    { en: "Anything heavy", is: "Neitt þungt" },
    { en: "Goal work", is: "Markmiðsvinna" },
    { en: "Jump volume", is: "Stökkmagn" },
    { en: "Eccentric work", is: "Eccentric vinna" },
  ],
  bans: { goalWork: true, heavyEccentric: true, heavyLift: true },
  note: {
    en: "Fast work only, no heavy lift (the coach's call, 2026-11-23): the week rule's fast dose close to the match (4 × 4 at 1.0–1.3 m/s, Harrison 2019) and the goal lift done at that dose stay; the 6-rep cap is for any other loaded lift. A small jump dose (≤ 6 contacts) stays.",
    is: "Aðeins hröð vinna, engin þung lyfta (ákvörðun þjálfara, 2026-11-23): hraðskammtur vikureglunnar nærri leik (4 × 4 við 1,0–1,3 m/s, Harrison 2019) og markmiðslyfta á þeim skammti haldast; 6 endurtekninga mörkin eiga við aðrar hlaðnar lyftur. Lítill stökkskammtur (≤ 6 snertingar) helst.",
  },
};

const MD1: DayRule = {
  md: "MD-1",
  purpose: { en: "Activation", is: "Virkjun" },
  allowed: ["ballistic", "med_ball"],
  intensity: { en: "≥ 1.1 m/s · speed loss ≤ 10%", is: "≥ 1,1 m/s · hraðatap ≤ 10%" },
  caps: { loadedReps: 6, contacts: 6, minutes: 10, vlMax: 10 },
  notAllowed: [
    { en: "Anything heavy", is: "Neitt þungt" },
    { en: "Eccentric work", is: "Eccentric vinna" },
    { en: "A new exercise", is: "Ný æfing" },
  ],
  bans: { heavyLift: true, eccentric: true },
  note: {
    en: "The week rule's fast dose the day before the match (4 × 4 at ≥ 1.3 m/s, Harrison 2019) stays; the 6-rep cap is for any other loaded lift.",
    is: "Hraðskammtur vikureglunnar daginn fyrir leik (4 × 4 við ≥ 1,3 m/s, Harrison 2019) helst; 6 endurtekninga mörkin eiga við aðrar hlaðnar lyftur.",
  },
};

const MDP1: DayRule = {
  md: "MD+1",
  purpose: { en: "Recovery + maintenance", is: "Endurheimt + viðhald" },
  allowed: ["upper", "iso"],
  intensity: { en: "2–3 reps in reserve", is: "2–3 endurtekningar í varasjóði" },
  caps: { contacts: 6, minutes: 30 },
  notAllowed: [
    { en: "Heavy leg lifts", is: "Þungar fótalyftur" },
    { en: "Sprints", is: "Sprettir" },
  ],
  bans: { heavyLegs: true },
  note: {
    en: "Players with few minutes keep their MD+1 top-up as it is (the existing minutes rule, md1MinutesTier after Carling 2018: under 30 min or did not play = a real strength session); this table does not change it. A small jump dose (≤ 6 contacts) stays.",
    is: "Leikmenn með fáar mínútur halda MD+1 viðbótinni óbreyttri (mínútureglan sem fyrir er, md1MinutesTier eftir Carling 2018: undir 30 mín. eða spilaði ekki = alvöru styrktaræfing); þessi tafla breytir henni ekki. Lítill stökkskammtur (≤ 6 snertingar) helst.",
  },
};

const MDP2: DayRule = {
  md: "MD+2",
  purpose: { en: "Off", is: "Frí" },
  allowed: [],
  intensity: { en: "—", is: "—" },
  caps: {},
  notAllowed: [{ en: "Everything", is: "Allt" }],
  bans: { everything: true },
  note: {
    en: "If the coach chooses a session for this day, it is built (the coach decides last) and the day rule says so.",
    is: "Ef þjálfarinn velur æfingu fyrir daginn er hún sett upp (þjálfarinn ræður síðast) og dagsreglan segir frá því.",
  },
};

/** Match day: never built by the engine; the row is for the coach's table. */
export const MATCH_DAY_RULE: DayRule = {
  md: "MD",
  purpose: { en: "Pre-match", is: "Fyrir leik" },
  allowed: ["sprint", "med_ball"],
  intensity: { en: "Accelerations at 75%", is: "Hraðabreytingar á 75%" },
  caps: { minutes: 5 },
  notAllowed: [{ en: "Everything else", is: "Allt annað" }],
  bans: { everything: true },
};

/** MD-5 / MD+3 / MD+4 are rebuild days built like MD-4; OFF is a day off (MicroPulse's mapping). */
export const DAY_RULES: Record<MdContext, DayRule> = {
  "MD-5": { ...MD4, sameAs: "MD-4" },
  "MD-4": MD4,
  "MD-3": MD3,
  "MD-2": MD2,
  "MD-1": MD1,
  "MD+1": MDP1,
  "MD+2": MDP2,
  "MD+3": { ...MD4, sameAs: "MD-4" },
  "MD+4": { ...MD4, sameAs: "MD-4" },
  OFF: { ...MDP2, sameAs: "MD+2" },
};

/** The order the coach's table shows. */
export const DAY_RULE_TABLE: DayRule[] = [MD4, MD3, MD2, MD1, MATCH_DAY_RULE, MDP1, MDP2];

/** The velocity-loss cap on a heavy lift for a day (the week rule uses it): MD-4's 15%, MD-3's 10%, else 20%. */
export function heavyVelocityLossCapFor(md: MdContext, fallback = 20): number {
  return DAY_RULES[md]?.caps.vlMax ?? fallback;
}

// ─── Reading a prescription ────────────────────────────────────────────────

/** Reps in one set, from the dose line: "3" → 3, "3-5" → 3 (the lower end, as the week rule reads it), "5 + 5 (…)" → 10,
 *  "6 × 1" → 6, a hold ("5s × 1") → 0. */
export function repsOfLine(reps: string): number {
  const s = String(reps ?? "").toLowerCase();
  if (/^\s*\d+\s*(s|sec|min)\b|hold/.test(s)) return 0;
  const sum = s.match(/^\s*(\d+)\s*\+\s*(\d+)/);
  if (sum) return Number(sum[1]) + Number(sum[2]);
  const mul = s.match(/^\s*(\d+)\s*[×x]\s*(\d+)/);
  if (mul) return Number(mul[1]) * Number(mul[2]);
  const n = s.match(/^\s*(\d+)/);
  return n ? Number(n[1]) : 0;
}
const bothSides = (reps: string) => /each (side|leg)|per (side|leg)/i.test(reps);
const repsOf = (ex: PrescribedExercise) => ex.dose.sets * repsOfLine(ex.dose.reps);
const contactsOf = (ex: PrescribedExercise) => repsOf(ex) * (bothSides(ex.dose.reps) ? 2 : 1);

const FALLBACK: Partial<Record<ExerciseCategory, DayCategory>> = {
  EXPLOSIVE_OLYMPIC: "ballistic", PLYOMETRIC: "plyo", BALLISTIC: "ballistic", MED_BALL: "med_ball",
  COMPOUND_STRENGTH: "heavy", UNILATERAL_STRENGTH: "heavy", POSTERIOR_CHAIN: "eccentric", ADDUCTOR: "eccentric",
  ISOMETRIC_MAX: "iso", ISOMETRIC_LONG: "iso", UPPER_BODY: "upper",
};

/** Highest "%" in an intensity line ("85% 1RM / RPE 8" → 85; "30–40% 1RM" → 40), or null. */
function topPct(intensity: string): number | null {
  const nums = [...String(intensity ?? "").matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  const range = String(intensity ?? "").match(/(\d+)\s*[–-]\s*(\d+)\s*%/);
  if (range) nums.push(Number(range[2]));
  return nums.length ? Math.max(...nums) : null;
}

/**
 * The day-rule category of a prescribed exercise. A main lift is "fast" when its dose is light and fast — the week
 * rule's near-match dose, a bar-speed zone from 0.80 m/s, or 60% of max or less — else "heavy". null = not counted.
 */
export function dayCategoryOf(ex: PrescribedExercise): DayCategory | null {
  const base = ex.exerciseId in DAY_CATEGORY ? DAY_CATEGORY[ex.exerciseId] : FALLBACK[ex.category] ?? null;
  if (base !== "heavy") return base;
  const pct = topPct(ex.dose.intensity);
  if (ex.dose.nearMatch || (ex.dose.speedZone && ex.dose.speedZone.min >= 0.8) || (pct != null && pct <= 60)) return "fast";
  return "heavy";
}

const isLoaded = (c: DayCategory | null) => c === "heavy" || c === "fast" || c === "ballistic";

/** The most load (% of max) a jump in a contrast round can carry and still count as a jump (2026-11-23). */
export const CONTRAST_JUMP_MAX_PCT = 40;
/**
 * A light loaded jump inside a contrast block (e.g. a trap-bar jump squat at 20% after the heavy lift): it follows the
 * block's rounds and counts as jump contacts, not as loaded reps (the coach's call, 2026-11-23). Without it the MD-3
 * cap of 9 loaded reps cut the week rule's heavy reps and the jump together.
 */
export function isContrastJump(block: SessionBlock, ex: PrescribedExercise): boolean {
  if (block.type !== "FRENCH_CONTRAST") return false;
  const c = dayCategoryOf(ex);
  if (c !== "ballistic" && c !== "fast") return false;
  const pct = topPct(ex.dose.intensity);
  return pct != null && pct <= CONTRAST_JUMP_MAX_PCT;
}
/** A heavy lift in the week rule's sense (weekRule.ts `isHeavyLift`): a main two-leg lift for 6 reps a set or fewer. */
const isHeavyMainLift = (ex: PrescribedExercise) =>
  dayCategoryOf(ex) === "heavy" && ex.category === "COMPOUND_STRENGTH" && repsOfLine(ex.dose.reps) > 0 && repsOfLine(ex.dose.reps) <= 6;
/** Loaded work the near-match dose holds is its own rule (Harrison 2019), left out of the 6-rep caps. */
const nearMatchDose = (ex: PrescribedExercise) => !!ex.dose.nearMatch || !!ex.goalPlan?.nearMatch;
export const coachOwn = (ex: PrescribedExercise) => /^coach/i.test(ex.modificationReason ?? "");
const HEAVY_ECCENTRIC_IDS = new Set(["ex_nordic_curl", "ex_rdl"]);
const DROP_JUMP_IDS = new Set(["ex_depth_jump"]);
const LOADED_SQUAT_JUMP_IDS = new Set(["ex_trap_bar_jump_squat"]);
/** MD+1 built as a strength day for a player with few minutes (md1Tier "low": the template, or the coach's method). */
const mdPlus1TopUp = (s: StrengthSession) => s.templateId === "mdplus1-strength-v1" || s.templateId.startsWith("struct-");

// ─── The time estimate (one implementation; index.ts uses it) ──────────────

/** Minutes from the blocks: 6 for a warm-up block, 5 for mobility, else sets × (30 s of work + the rest). Rough. */
export function estimateSessionMinutes(blocks: SessionBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    if (block.type === "PREP") total += 6;
    else if (block.type === "MOBILITY") total += 5;
    else {
      for (const ex of block.exercises) {
        const restMatch = ex.dose.rest.match(/(\d+)\s*(min|s)/i);
        const restMin = restMatch ? (restMatch[2].toLowerCase().startsWith("m") ? Number(restMatch[1]) : Number(restMatch[1]) / 60) : 1;
        total += ex.dose.sets * (0.5 + restMin);
      }
    }
  }
  return Math.round(total);
}

// ─── The check ─────────────────────────────────────────────────────────────

type Spot = { b: number; i: number; ex: PrescribedExercise };

const trimLine = (md: string, why: Bi, action: Bi, evidence = DAY_RULES_SOURCE): AppliedAdaptation => ({
  ruleId: DAY_RULE_TRIM,
  triggerEN: `${md} day rule: ${why.en}`,
  triggerIS: `Dagsregla ${md}: ${why.is}`,
  actionEN: action.en,
  actionIS: action.is,
  evidence: `${evidence} MD day from the week setup; counted from today's prescription.`,
});

const doseText = (sets: number, reps: string) => `${sets} × ${reps}`;

/**
 * Takes sets off until `count` is at or under `cap`: one set at a time from each exercise in turn (last first, goal-plan
 * work after the rest), so every exercise keeps a set before any is taken out; then out, in the same order. A coach's
 * own swap is never taken out: it keeps one set. Returns one line per changed exercise.
 */
function trimToCap(
  blocks: SessionBlock[], spots: Spot[], count: (ex: PrescribedExercise) => number, cap: number,
  md: string, why: (total: number) => Bi,
): AppliedAdaptation[] {
  const cur = () => spots.map((s) => blocks[s.b].exercises[s.i]);
  let total = cur().reduce((a, ex) => a + count(ex), 0);
  if (total <= cap) return [];
  const start = total;
  const before = cur().map((ex) => ex.dose.sets);
  const order = [...spots.filter((s) => !s.ex.goalPlan).reverse(), ...spots.filter((s) => s.ex.goalPlan).reverse()];
  const perSet = (s: Spot) => { const ex = blocks[s.b].exercises[s.i]; return count({ ...ex, dose: { ...ex.dose, sets: 1 } }); };
  const take = (s: Spot) => {
    const ex = blocks[s.b].exercises[s.i];
    blocks[s.b].exercises[s.i] = { ...ex, dose: { ...ex.dose, sets: ex.dose.sets - 1 } };
    total -= perSet(s);
  };
  for (const floor of [1, 0]) {
    let moved = true;
    while (total > cap && moved) {
      moved = false;
      for (const s of order) {
        if (total <= cap) break;
        const ex = blocks[s.b].exercises[s.i];
        if (ex.dose.sets > (coachOwn(ex) ? Math.max(floor, 1) : floor) && perSet(s) > 0) { take(s); moved = true; }
      }
    }
  }
  const out: AppliedAdaptation[] = [];
  spots.forEach((s, k) => {
    const ex = blocks[s.b].exercises[s.i];
    if (ex.dose.sets === before[k]) return;
    const swap = coachOwn(ex);
    const name = { en: `${ex.nameEN}${swap ? " (coach's swap, kept)" : ""}`, is: `${ex.nameIS || ex.nameEN}${swap ? " (skipting þjálfara, heldur sér)" : ""}` };
    const from = doseText(before[k], ex.dose.reps), to = doseText(ex.dose.sets, ex.dose.reps);
    out.push(trimLine(md, why(start), ex.dose.sets > 0
      ? { en: `${name.en}: ${from} → ${to}.`, is: `${name.is}: ${from} → ${to}.` }
      : { en: `${name.en} taken out.`, is: `${name.is} tekin út.` }));
  });
  return out;
}

/**
 * Checks a built session against its MD day's rule and trims what breaches it. Returns a new session (the input is
 * not changed) with one `DAY_RULE_TRIM` line per change, and the time note. Never adds an exercise or a set.
 */
export function enforceDayRules(session: StrengthSession | null): StrengthSession | null {
  if (!session || !session.blocks.length) return session;
  const rule = DAY_RULES[session.mdContext];
  if (!rule) return session;
  const md = session.mdContext;
  const blocks: SessionBlock[] = session.blocks.map((b) => ({ ...b, exercises: [...b.exercises] }));
  const out: AppliedAdaptation[] = [];
  const spots = (pred: (ex: PrescribedExercise) => boolean): Spot[] => {
    const r: Spot[] = [];
    // A coach's own swap is counted and capped like any lift: the coach picks the exercise, the day's caps set the dose
    // (2026-11-23). Only the bans (step 1) and the time trim (step 8) leave it alone.
    blocks.forEach((b, bi) => b.exercises.forEach((ex, i) => { if (pred(ex)) r.push({ b: bi, i, ex }); }));
    return r;
  };

  // A day off with a session: only when the coach chose one. The coach decides last; say so, change nothing.
  if (rule.bans.everything) {
    const already = session.appliedAdaptations.some((a) => a.ruleId === DAY_RULE_COACH_DAY_OFF);
    if (already) return session;
    return {
      ...session,
      appliedAdaptations: [...session.appliedAdaptations, {
        ruleId: DAY_RULE_COACH_DAY_OFF,
        triggerEN: `${md} is a day off in the day rules`,
        triggerIS: `${md} er frídagur í dagsreglunum`,
        actionEN: "Built because the coach chose a session for this day; nothing trimmed (the coach decides last).",
        actionIS: "Sett upp því þjálfarinn valdi æfingu fyrir daginn; ekkert klippt (þjálfarinn ræður síðast).",
        evidence: DAY_RULES_SOURCE,
      }],
    };
  }

  // 1. What the day does not allow: out.
  const banned = (ex: PrescribedExercise): Bi | null => {
    const c = dayCategoryOf(ex);
    if (rule.bans.heavyEccentric && HEAVY_ECCENTRIC_IDS.has(ex.exerciseId)) return { en: "no heavy eccentric work", is: "engin þung eccentric vinna" };
    if (rule.bans.eccentric && c === "eccentric") return { en: "no eccentric work", is: "engin eccentric vinna" };
    if (rule.bans.heavyLift && c === "heavy") return { en: "nothing heavy", is: "ekkert þungt" };
    if (rule.bans.goalWork && ex.goalPlan && !nearMatchDose(ex)) return { en: "no goal work", is: "engin markmiðsvinna" };
    if (rule.bans.heavyLegs && c === "heavy" && !mdPlus1TopUp(session)) return { en: "no heavy leg lifts", is: "engar þungar fótalyftur" };
    return null;
  };
  for (const b of blocks) {
    b.exercises = b.exercises.filter((ex) => {
      const why = coachOwn(ex) ? null : banned(ex);
      if (!why) return true;
      out.push(trimLine(md, why, { en: `${ex.nameEN} taken out.`, is: `${ex.nameIS || ex.nameEN} tekin út.` }));
      return false;
    });
  }

  // 2. Never to failure: the set stops with 2 reps in reserve.
  for (const s of spots((ex) => /fail|amrap|rir\s*0\b/i.test(ex.dose.intensity))) {
    const ex = s.ex;
    blocks[s.b].exercises[s.i] = { ...ex, dose: { ...ex.dose, intensity: "RPE 8 (2 reps in reserve)" } };
    out.push(trimLine(md, { en: "no sets to failure", is: "engin sett að þroti" }, { en: `${ex.nameEN}: stop with 2 reps in reserve.`, is: `${ex.nameIS || ex.nameEN}: hætta með 2 endurtekningar í varasjóði.` }));
  }

  // 3. Velocity-loss cap on loaded lifts.
  const vl = rule.caps.vlMax;
  if (vl != null) {
    for (const s of spots((ex) => isLoaded(dayCategoryOf(ex)) && ex.dose.velocityLossCap != null && ex.dose.velocityLossCap > vl)) {
      const ex = s.ex;
      const from = ex.dose.velocityLossCap!;
      const cue = ex.dose.cue?.replace(new RegExp(`${from}% (velocity|speed) loss`, "gi"), `${vl}% $1 loss`);
      blocks[s.b].exercises[s.i] = { ...ex, dose: { ...ex.dose, velocityLossCap: vl as 10 | 15, ...(cue != null ? { cue } : {}) } };
      out.push(trimLine(md, { en: `sets stop at ${vl}% speed loss`, is: `settum er hætt við ${vl}% hraðatap` },
        { en: `${ex.nameEN}: stop at ${vl}% speed loss (was ${from}%).`, is: `${ex.nameIS || ex.nameEN}: hætta við ${vl}% hraðatap (var ${from}%).` }, VL_EVIDENCE));
    }
  }

  // 4. Heavy reps per lift.
  const perLift = rule.caps.heavyRepsPerLift;
  if (perLift != null) {
    for (const s of spots(isHeavyMainLift)) {
      out.push(...trimToCap(blocks, [s], repsOf, perLift, md, (n) => ({ en: `at most ${perLift} heavy reps per lift (${s.ex.nameEN} had ${n})`, is: `mest ${perLift} þungar endurtekningar í lyftu (${s.ex.nameIS || s.ex.nameEN} var með ${n})` })));
    }
  }

  // 5. Loaded reps in all (the near-match dose left out).
  const loaded = rule.caps.loadedReps;
  if (loaded != null) {
    const ss = spots((ex) => isLoaded(dayCategoryOf(ex)) && !nearMatchDose(ex)).filter((s) => !isContrastJump(blocks[s.b], s.ex));
    out.push(...trimToCap(blocks, ss, repsOf, loaded, md, (n) => ({ en: `at most ${loaded} loaded leg reps (had ${n})`, is: `mest ${loaded} hlaðnar fótaendurtekningar (voru ${n})` })));
  }

  // 6. Jump contacts (jumps paired with the near-match lift in its block left out: that pairing is the week rule's).
  const nearBlocks = new Set(blocks.map((b, bi) => (b.exercises.some(nearMatchDose) ? bi : -1)).filter((x) => x >= 0));
  const jumps = spots((ex) => dayCategoryOf(ex) === "plyo").filter((s) => !nearBlocks.has(s.b));
  const dropCap = rule.caps.dropJumpContacts;
  if (dropCap != null) {
    out.push(...trimToCap(blocks, jumps.filter((s) => DROP_JUMP_IDS.has(s.ex.exerciseId)), contactsOf, dropCap, md, (n) => ({ en: `at most ${dropCap} drop-jump contacts (had ${n})`, is: `mest ${dropCap} fallstökks-snertingar (voru ${n})` })));
  }
  const cCap = rule.caps.contacts;
  if (cCap != null) {
    // A light loaded jump in a contrast round counts here, as jumps (isContrastJump).
    const live = spots((ex) => dayCategoryOf(ex) === "plyo" || isLoaded(dayCategoryOf(ex)))
      .filter((s) => !nearBlocks.has(s.b) && (dayCategoryOf(s.ex) === "plyo" || isContrastJump(blocks[s.b], s.ex)));
    out.push(...trimToCap(blocks, live, contactsOf, cCap, md, (n) => ({ en: `at most ${cCap} jump contacts (had ${n})`, is: `mest ${cCap} stökksnertingar (voru ${n})` })));
  }
  const height = rule.caps.dropHeightCm;
  if (height != null) {
    for (const s of spots((ex) => DROP_JUMP_IDS.has(ex.exerciseId) && ex.dose.sets > 0 && !/\d+\s*cm/i.test(`${ex.dose.cue ?? ""} ${ex.dose.intensity}`))) {
      const ex = blocks[s.b].exercises[s.i];
      blocks[s.b].exercises[s.i] = { ...ex, dose: { ...ex.dose, cue: [ex.dose.cue, `Drop from ${height} cm or lower`].filter(Boolean).join(" · ") } };
      out.push(trimLine(md, { en: `drop jumps from ${height} cm at most`, is: `fallstökk mest úr ${height} cm` }, { en: `${ex.nameEN}: drop height ${height} cm or lower.`, is: `${ex.nameIS || ex.nameEN}: fallhæð ${height} cm eða lægri.` }));
    }
  }

  // 7. The day's bar-speed zone on a loaded squat jump that has none (a body-weight jump has no bar to measure).
  const zone = rule.ballisticZone;
  if (zone) {
    for (const s of spots((ex) => LOADED_SQUAT_JUMP_IDS.has(ex.exerciseId) && !ex.dose.speedZone && ex.dose.sets > 0 && !/^body\s*weight/i.test(ex.dose.intensity ?? ""))) {
      const ex = s.ex;
      blocks[s.b].exercises[s.i] = { ...ex, dose: { ...ex.dose, speedZone: zone } };
      const z = zone.max == null ? `${zoneNum(zone.min)} m/s or faster` : `${zoneNum(zone.min)}–${zoneNum(zone.max)} m/s`;
      const zIs = z.replace(".", ",").replace("or faster", "eða hraðar");
      out.push({
        ruleId: DAY_RULE_ZONE,
        triggerEN: `${md} day rule: ballistic lifts at ${z}`,
        triggerIS: `Dagsregla ${md}: ballistic lyftur við ${zIs}`,
        actionEN: `${ex.nameEN}: ${z} on each rep (the speed sets the load).`,
        actionIS: `${ex.nameIS || ex.nameEN}: ${zIs} í hverri endurtekningu (hraðinn ræður þyngdinni).`,
        evidence: `${DAY_RULES_SOURCE} The zone is the coach's, kept as written.`,
      });
    }
  }

  let kept = blocks.map((b) => ({ ...b, exercises: b.exercises.filter((e) => e.dose.sets > 0) })).filter((b) => b.exercises.length > 0);

  // 8. MD-4's time budget (brief §6): over 25 min → upper-body filler out, then the C exercise, then one set of B2.
  const timeTrimmed: NonNullable<StrengthSession["timeTrimmed"]> = [];
  if (md === "MD-4" || rule.sameAs === "MD-4") out.push(...trimForTime(kept, md, session.appliedAdaptations, timeTrimmed));
  const minutes = estimateSessionMinutes(kept);

  // 9. Time: shown, not trimmed (the estimate is rough), past the before + after budget. On MD-4 the time trim above
  //    already said what it cut and what it kept, so this note is left out there once the trim has spoken.
  const budget = (rule.caps.minutes ?? Infinity) + (rule.caps.minutesAfter ?? 0);
  const timeSpoken = [...session.appliedAdaptations, ...out].some((a) => a.ruleId === TIME_BUDGET_TRIM);
  const timeNoted = timeSpoken || session.appliedAdaptations.some((a) => a.ruleId === DAY_RULE_TIME_NOTE);
  if (minutes > budget && !timeNoted) {
    const split = rule.caps.minutesAfter ? { en: ` (${rule.caps.minutes} before training + ${rule.caps.minutesAfter} after)`, is: ` (${rule.caps.minutes} fyrir æfingu + ${rule.caps.minutesAfter} eftir)` } : { en: "", is: "" };
    out.push({
      ruleId: DAY_RULE_TIME_NOTE,
      triggerEN: `${md} day rule: about ${budget} min${split.en}; this session is estimated at ${minutes} min`,
      triggerIS: `Dagsregla ${md}: um ${budget} mín.${split.is}; þessi æfing er metin ${minutes} mín.`,
      actionEN: "Nothing trimmed for time yet: the estimate is rough. Check the rests if the session runs long.",
      actionIS: "Ekkert klippt vegna tíma enn: matið er gróft. Skoðaðu hvíldirnar ef æfingin dregst.",
      evidence: `${DAY_RULES_SOURCE} Estimate: sets × (30 s of work + the rest), 6 min warm-up, 5 min mobility.`,
    });
  }

  if (!out.length) return session;
  kept = kept.filter((b) => b.exercises.length > 0);
  const trimmedAll = [...(session.timeTrimmed ?? []), ...timeTrimmed];
  return { ...session, blocks: kept, durationMin: minutes, appliedAdaptations: [...session.appliedAdaptations, ...out], ...(trimmedAll.length ? { timeTrimmed: trimmedAll } : {}) };
}

// ─── MD-4 time budget (brief §6) ───────────────────────────────────────────

/** The place of an exercise in the coach's A / B1 / B2 / C layout, for the time trim. */
export type TimeRole = "warmup" | "coach" | "prevention" | "A" | "B1" | "B2" | "C" | "upper";

/** Injury prevention (with the §4b test add-ons on them): always applies, never trimmed for time. */
export const PREVENTION_IDS: ReadonlySet<string> = new Set(["ex_nordic_curl", "ex_copenhagen"]);
const STRENGTH_CATS = new Set<ExerciseCategory>(["COMPOUND_STRENGTH", "UNILATERAL_STRENGTH", "POSTERIOR_CHAIN", "ISOMETRIC_MAX"]);

/**
 * Roles in session order: the warm-up, a coach's own swap and the injury-prevention work are never trimmed for time;
 * jumps, throws and fast lifts are A; the first heavy main lift is B1 (else the first strength lift); the next strength
 * lift is B2; upper-body work is the filler; anything else is C.
 */
export function timeRoles(blocks: SessionBlock[]): TimeRole[][] {
  let b1: [number, number] | null = null;
  blocks.forEach((b, bi) => b.exercises.forEach((ex, i) => { if (!b1 && !coachOwn(ex) && isHeavyMainLift(ex)) b1 = [bi, i]; }));
  if (!b1) blocks.forEach((b, bi) => b.exercises.forEach((ex, i) => { if (!b1 && !coachOwn(ex) && STRENGTH_CATS.has(ex.category) && !PREVENTION_IDS.has(ex.exerciseId)) b1 = [bi, i]; }));
  let b2Taken = false;
  return blocks.map((b, bi) => b.exercises.map((ex, i): TimeRole => {
    if (b.type === "PREP" || b.type === "MOBILITY" || ex.category === "MOVEMENT_PREP" || ex.category === "MOBILITY") return "warmup";
    if (coachOwn(ex)) return "coach";
    if (PREVENTION_IDS.has(ex.exerciseId)) return "prevention";
    if (b1 && b1[0] === bi && b1[1] === i) return "B1";
    if (ex.category === "UPPER_BODY") return "upper";
    const c = dayCategoryOf(ex);
    if (c === "plyo" || c === "ballistic" || c === "fast" || c === "med_ball" || c === "sprint") return "A";
    if (STRENGTH_CATS.has(ex.category) && !b2Taken) { b2Taken = true; return "B2"; }
    return "C";
  }));
}

const B2_SET_MARK = "one set of B2";

/**
 * A lighter day (yellow) never keeps an exercise the green day dropped for time: when the green build of the same day
 * took exercises out (`TIME_BUDGET_TRIM`), the upper-body filler and C exercises the green session no longer holds come
 * out here too. Nothing else changes. Returns the session as it was when green trimmed nothing.
 */
export function alignTimeTrimToGreen(session: StrengthSession, green: StrengthSession | null): StrengthSession {
  if (!green || !green.appliedAdaptations.some((a) => a.ruleId === TIME_BUDGET_TRIM && / taken out\.$/.test(a.actionEN))) return session;
  const greenIds = new Set(green.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)));
  const roles = timeRoles(session.blocks);
  const out: AppliedAdaptation[] = [];
  const removed: NonNullable<StrengthSession["timeTrimmed"]> = [];
  const blocks = session.blocks.map((b, bi) => ({
    ...b,
    exercises: b.exercises.filter((ex, i) => {
      const r = roles[bi][i];
      if ((r !== "upper" && r !== "C") || greenIds.has(ex.exerciseId)) return true;
      removed.push({ exerciseId: ex.exerciseId, sets: ex.dose.sets, role: r });
      out.push({
        ruleId: TIME_BUDGET_TRIM,
        triggerEN: `${session.mdContext} time budget: the green day takes ${ex.nameEN} out for time`,
        triggerIS: `Tímarammi ${session.mdContext}: grænn dagur tekur ${ex.nameIS || ex.nameEN} út vegna tíma`,
        actionEN: `${ex.nameEN} taken out here too: a lighter day is never more than a green one.`,
        actionIS: `${ex.nameIS || ex.nameEN} líka tekin út hér: léttari dagur er aldrei meira en grænn.`,
        evidence: TIME_BUDGET_EVIDENCE,
      });
      return false;
    }),
  })).filter((b) => b.exercises.length > 0);
  if (!out.length) return session;
  return { ...session, blocks, durationMin: estimateSessionMinutes(blocks), appliedAdaptations: [...session.appliedAdaptations, ...out], timeTrimmed: [...(session.timeTrimmed ?? []), ...removed] };
}

/** Trims `blocks` in place to the MD-4 budget, in the coach's order. Logs one line per change. Runs once per session:
 *  the upper-body and C cuts are naturally done after one pass, and B2 loses one set at most (`prior` remembers it). */
function trimForTime(blocks: SessionBlock[], md: string, prior: AppliedAdaptation[], removed: NonNullable<StrengthSession["timeTrimmed"]>): AppliedAdaptation[] {
  const out: AppliedAdaptation[] = [];
  const budget = MD4_TIME_BUDGET_MIN;
  // The 25 min before training: everything but the injury-prevention work, which has the 8 min after.
  const est = () => estimateSessionMinutes(blocks
    .map((b) => ({ ...b, exercises: b.exercises.filter((ex) => !PREVENTION_IDS.has(ex.exerciseId)) }))
    .filter((b) => b.exercises.length > 0));
  const start = est();
  if (start <= budget) return out;
  const line = (why: Bi, action: Bi): AppliedAdaptation => ({
    ruleId: TIME_BUDGET_TRIM,
    triggerEN: `${md} time budget: about ${budget} min before training with the warm-up and rests (injury prevention not counted); ${why.en}`,
    triggerIS: `Tímarammi ${md}: um ${budget} mín. fyrir æfingu með upphitun og hvíldum (forvörn ekki talin með); ${why.is}`,
    actionEN: action.en, actionIS: action.is, evidence: TIME_BUDGET_EVIDENCE,
  });
  const take = (role: "upper" | "C", label: Bi) => {
    // Last first, one exercise at a time, until the session fits.
    for (;;) {
      if (est() <= budget) return;
      const roles = timeRoles(blocks);
      let at: [number, number] | null = null;
      roles.forEach((rs, bi) => rs.forEach((r, i) => { if (r === role) at = [bi, i]; }));
      if (!at) return;
      const [bi, i] = at as [number, number];
      const before = est();
      const ex = blocks[bi].exercises[i];
      blocks[bi].exercises.splice(i, 1);
      removed.push({ exerciseId: ex.exerciseId, sets: ex.dose.sets, role });
      out.push(line({ en: `estimated at ${before} min`, is: `metin ${before} mín.` },
        { en: `${ex.nameEN} (${label.en}) taken out.`, is: `${ex.nameIS || ex.nameEN} (${label.is}) tekin út.` }));
    }
  };
  take("upper", { en: "upper-body filler", is: "efri hluta fylling" });
  take("C", { en: "C exercise", is: "C æfing" });
  const b2Done = prior.some((a) => a.ruleId === TIME_BUDGET_TRIM && a.actionEN.includes(B2_SET_MARK));
  if (est() > budget && !b2Done) {
    const roles = timeRoles(blocks);
    let at: [number, number] | null = null;
    roles.forEach((rs, bi) => rs.forEach((r, i) => { if (r === "B2" && !at) at = [bi, i]; }));
    if (at) {
      const [bi, i] = at as [number, number];
      const ex = blocks[bi].exercises[i];
      if (ex.dose.sets > 1) {
        const before = est();
        blocks[bi].exercises[i] = { ...ex, dose: { ...ex.dose, sets: ex.dose.sets - 1 } };
        removed.push({ exerciseId: ex.exerciseId, sets: 1, role: "B2", setOnly: true });
        out.push(line({ en: `estimated at ${before} min`, is: `metin ${before} mín.` },
          { en: `${ex.nameEN}: ${ex.dose.sets - 1} sets (${B2_SET_MARK} off).`, is: `${ex.nameIS || ex.nameEN}: ${ex.dose.sets - 1} sett (eitt sett af B2 tekið af).` }));
      }
    }
  }
  const end = est();
  const noted = prior.some((a) => a.ruleId === TIME_BUDGET_TRIM && /^Kept/.test(a.actionEN));
  if (end > budget && !noted) {
    out.push(line({ en: `still estimated at ${end} min`, is: `enn metin ${end} mín.` },
      { en: "Kept: B1 (the heavy lift) is never cut and the injury-prevention work always stays.", is: "Haldið: B1 (þunga lyftan) er aldrei skorin og meiðslaforvörnin helst alltaf." }));
  }
  return out;
}

/** For the coach's table and tests: the library exercises that have no day category on purpose (warm-up etc.). */
export const UNCOUNTED_IDS = Object.entries(DAY_CATEGORY).filter(([, c]) => c == null).map(([id]) => id);
/** True when every library exercise has a day-category entry. */
export const everyExerciseHasDayCategory = () => [...EXERCISES_BY_ID.keys()].every((id) => id in DAY_CATEGORY);
