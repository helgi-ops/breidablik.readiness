/**
 * The movement screen changes the strength session (strength-day-rules brief §4c, 2026-11-23). Pure.
 *
 *  - SCREEN_OHS_UNILATERAL: the overhead squat showed an ankle restriction (heels rise, or the squat is shallow) or the
 *    knees cave in (valgus), moderate or worse → the heavy two-leg squat-pattern lift becomes a split-stance or
 *    one-leg lift (the coach's first one-leg pick from the team list when there is one). Load and sets stay.
 *  - SCREEN_SLB_WARMUP: poor single-leg balance (a wobbly landing on the single-leg drop jump, an uneven Star
 *    Excursion reach, or not sticking the single-leg hop), moderate or worse → a single-leg balance block in the
 *    warm-up (the corrective "Single-leg balance progression", Ross & Guskiewicz 2005).
 *
 * The screen is read from the coach's latest screen of that test (pose screen or screening form), 56 days at most
 * (the deficit ledger's window). A screen with pain or a red flag goes to a clinician, never into a rule.
 * Individualised builds only (standard mode skips per-player screen work, as the correctives do). Never the
 * readiness colour.
 *
 * What is from a study: the overhead squat's knee read is a validated screen (Post 2017; Krause 2015); the balance
 * block is Ross & Guskiewicz 2005. That a screen finding swaps the heavy lift to split-stance / one leg is the brief's
 * rule (MicroPulse), not from a trial.
 */

import { CORRECTIVE_BY_SLUG } from "@/lib/micropulse/movementScreen/correctives/registry";
import type { AdaptationTrace } from "./adaptationRules";
import { EXERCISES_BY_ID } from "./exerciseLibrary";
import type { AppliedAdaptation, PlayerStrengthSnapshot, SessionBlock, SessionCorrective } from "./types";

export const SCREEN_OHS_UNILATERAL = "SCREEN_OHS_UNILATERAL";
export const SCREEN_SLB_WARMUP = "SCREEN_SLB_WARMUP";
/** Screens older than this are not used (the deficit ledger's window). */
export const SCREEN_RULE_LOOKBACK_DAYS = 56;

type Severity = "ok" | "mild" | "moderate" | "marked";
type Side = "L" | "R" | "both";
const atLeastModerate = (s: Severity | null | undefined) => s === "moderate" || s === "marked";

/** What the screens say, ready for the engine (snapshot field `screenFlags`). */
export type ScreenFlags = {
  ohs?: { date: string; valgus: Side | null; ankle: boolean; via: "pose" | "form" } | null;
  slb?: { date: string; via: "pose" | "form"; what: "landing_sway" | "sebt_reach" | "hop_stick" } | null;
};

/** Raw screen rows the loader hands in (movement_screens / movement_assessment_forms). */
export type ScreenInput = {
  todayIso: string;
  screens: Array<{ testSlug: string; screenDate: string; findings: Array<{ variableKey: string; severity?: Severity | null; leg?: Side | null }>; redFlag?: boolean; painReported?: boolean }>;
  form?: { assessmentDate: string; fired: Array<{ testSlug: string; observationKey: string; side?: Side }> } | null;
};

const DAY = 86_400_000;
const fresh = (date: string, today: string) => {
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / DAY;
  return age >= 0 && age <= SCREEN_RULE_LOOKBACK_DAYS;
};
const mergeSide = (a: Side | null, b: Side | null | undefined): Side | null => (!b ? a : !a ? b : a === b ? a : "both");

/** Read the latest overhead squat and single-leg balance findings. Pain / red flag → nothing (clinician). */
export function readScreenFlags(input: ScreenInput): ScreenFlags | null {
  const latest = (slug: string) => input.screens
    .filter((s) => s.testSlug === slug && fresh(s.screenDate, input.todayIso))
    .sort((a, b) => b.screenDate.localeCompare(a.screenDate))[0];
  const usable = <T extends { redFlag?: boolean; painReported?: boolean }>(s: T | undefined) => (s && !s.redFlag && !s.painReported ? s : undefined);
  const form = input.form && fresh(input.form.assessmentDate, input.todayIso) ? input.form : null;

  // Overhead squat: the pose screen first, the screening form when there is no pose screen.
  let ohs: ScreenFlags["ohs"] = null;
  const ohsScreen = latest("overhead_squat_assessment");
  const ohsPose = usable(ohsScreen);
  if (ohsPose) {
    let valgus: Side | null = null;
    for (const f of ohsPose.findings) if (f.variableKey === "knee_valgus" && atLeastModerate(f.severity)) valgus = mergeSide(valgus, f.leg ?? "both");
    const ankle = ohsPose.findings.some((f) => (f.variableKey === "heel_rise" || f.variableKey === "squat_depth") && atLeastModerate(f.severity));
    if (valgus || ankle) ohs = { date: ohsPose.screenDate.slice(0, 10), valgus, ankle, via: "pose" };
  } else if (!ohsScreen && form) {
    let valgus: Side | null = null;
    for (const f of form.fired) if (f.testSlug === "overhead_squat" && f.observationKey === "knees_inward") valgus = mergeSide(valgus, f.side ?? "both");
    const ankle = form.fired.some((f) => f.testSlug === "overhead_squat" && f.observationKey === "heel_rise");
    if (valgus || ankle) ohs = { date: form.assessmentDate.slice(0, 10), valgus, ankle, via: "form" };
  }

  // Single-leg balance: the drop-jump landing (pose), else the form's Star Excursion reach / hop-and-stick.
  let slb: ScreenFlags["slb"] = null;
  const dj = usable(latest("single_leg_drop_jump"));
  if (dj?.findings.some((f) => f.variableKey === "landing_sway" && atLeastModerate(f.severity))) {
    slb = { date: dj.screenDate.slice(0, 10), via: "pose", what: "landing_sway" };
  } else if (form) {
    const sebt = form.fired.some((f) => f.testSlug === "sebt_lower" && f.observationKey === "anterior_asymmetry");
    const stick = form.fired.some((f) => f.testSlug === "single_leg_hop_and_stick" && f.observationKey === "poor_stick");
    if (sebt || stick) slb = { date: form.assessmentDate.slice(0, 10), via: "form", what: sebt ? "sebt_reach" : "hop_stick" };
  }
  return ohs || slb ? { ohs, slb } : null;
}

/** Two-leg squat-pattern lifts → their split-stance / one-leg default (when the team list has no one-leg pick). */
export const HEAVY_TWO_LEG: Record<string, string> = {
  ex_back_squat: "ex_bulgarian_ss",
  ex_front_squat: "ex_bulgarian_ss",
  ex_ssb_squat: "ex_bulgarian_ss",
  ex_belt_squat: "ex_bulgarian_ss",
  ex_trap_bar_dl: "ex_b_stance_rdl",
};

const sideWord = (s: Side | null) => s === "L" ? { en: "left", is: "vinstra" } : s === "R" ? { en: "right", is: "hægra" } : { en: "both", is: "bæði" };

function ohsTrigger(o: NonNullable<ScreenFlags["ohs"]>): { en: string; is: string } {
  const en: string[] = [];
  const is: string[] = [];
  if (o.valgus) { const w = sideWord(o.valgus); en.push(`knees cave in (${w.en})`); is.push(`hné leita inn (${w.is})`); }
  if (o.ankle) { en.push("ankle restriction (heels rise / shallow squat)"); is.push("stirður ökkli (hælar lyftast / grunn hnébeygja)"); }
  const via = o.via === "pose" ? { en: "movement screen", is: "hreyfiskimun" } : { en: "screening form", is: "skimunarblað" };
  return { en: `Overhead squat ${o.date} (${via.en}): ${en.join(", ")}`, is: `Hnébeygja yfir höfði ${o.date} (${via.is}): ${is.join(", ")}` };
}

/**
 * SCREEN_OHS_UNILATERAL: swap the heavy two-leg squat-pattern lift for split-stance / one leg. Mutates `blocks`; the
 * new lift is pinned and the old one banned in `trace`, so the team list and the goal plan do not put it back.
 */
export function applyScreenHeavySlot(blocks: SessionBlock[], snap: PlayerStrengthSnapshot, trace: AdaptationTrace): AppliedAdaptation[] {
  const o = snap.screenFlags?.ohs;
  if (!o) return [];
  const present = new Set(blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)));
  const coachPick = (snap.teamPalette?.unilateral_strength ?? []).find((id) => EXERCISES_BY_ID.has(id) && !trace.banned.has(id) && !present.has(id)) ?? null;
  const swapped: Array<{ from: string; to: string }> = [];
  for (const block of blocks) {
    if (block.type === "PREP" || block.type === "MOBILITY") continue;
    block.exercises.forEach((ex, i) => {
      const fallback = HEAVY_TWO_LEG[ex.exerciseId];
      if (!fallback || trace.pinned.has(ex.exerciseId)) return;
      const toId = swapped.length === 0 && coachPick ? coachPick : fallback;
      const lib = EXERCISES_BY_ID.get(toId);
      if (!lib) return;
      block.exercises[i] = {
        exerciseId: lib.id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose: ex.dose,
        modificationReason: `Movement screen: split stance / one leg instead of ${ex.nameEN}`,
        rationale: lib.evidence,
      };
      trace.banned.add(ex.exerciseId);
      trace.pinned.add(lib.id);
      swapped.push({ from: ex.nameEN, to: lib.nameEN });
    });
  }
  if (!swapped.length) return [];
  const t = ohsTrigger(o);
  const list = swapped.map((s) => `${s.from} → ${s.to}`).join("; ");
  return [{
    ruleId: SCREEN_OHS_UNILATERAL, triggerEN: t.en, triggerIS: t.is,
    actionEN: `Heavy slot as split stance / one leg: ${list}${coachPick ? " (the team list's one-leg pick)" : ""}. Same sets and load.`,
    actionIS: `Þunga sætið í klofstöðu / á einum fæti: ${list}${coachPick ? " (einfóta val liðsins)" : ""}. Sömu sett og þyngd.`,
    evidence: "The overhead squat's knee read is a validated screen (Post 2017; Krause 2015). Moving the heavy lift to split stance / one leg on that finding is MicroPulse's rule (brief 2026-11-23), not from a trial. Re-screen to lift it.",
  }];
}

const SLB_WHAT = {
  landing_sway: { en: "wobbly landing on the single-leg drop jump", is: "óstöðug lending í einfætta fallhoppinu" },
  sebt_reach: { en: "uneven Star Excursion reach", is: "ójöfn teygja í Star Excursion prófinu" },
  hop_stick: { en: "could not stick the single-leg hop", is: "náði ekki að festa einfætta hoppið" },
} as const;

/**
 * SCREEN_SLB_WARMUP: the single-leg balance block for the warm-up (front corrective block). Null when the screen
 * does not call for it or the screen's own correctives already hold it (then the audit says so).
 */
export function screenWarmupBlock(snap: PlayerStrengthSnapshot, existing: SessionCorrective[]): { add: SessionCorrective | null; audit: AppliedAdaptation } | null {
  const s = snap.screenFlags?.slb;
  if (!s) return null;
  const ex = CORRECTIVE_BY_SLUG["single_leg_balance"];
  if (!ex) return null;
  const via = s.via === "pose" ? { en: "movement screen", is: "hreyfiskimun" } : { en: "screening form", is: "skimunarblað" };
  const triggerEN = `Single-leg balance ${s.date} (${via.en}): ${SLB_WHAT[s.what].en}`;
  const triggerIS = `Jafnvægi á öðrum fæti ${s.date} (${via.is}): ${SLB_WHAT[s.what].is}`;
  const evidence = `${ex.citation}. Putting it in the warm-up on that finding is MicroPulse's rule (brief 2026-11-23).`;
  if (existing.some((c) => c.slug === ex.slug)) {
    return { add: null, audit: { ruleId: SCREEN_SLB_WARMUP, triggerEN, triggerIS,
      actionEN: `${ex.name.en} is already in the warm-up from the screen's correctives.`,
      actionIS: `${ex.name.is} er þegar í upphitun úr leiðréttingaræfingum skimunarinnar.`, evidence } };
  }
  return {
    add: {
      slug: ex.slug, nameEN: ex.name.en, nameIS: ex.name.is, doseEN: ex.dose.en, doseIS: ex.dose.is, cueEN: ex.cue.en, cueIS: ex.cue.is,
      sourceNoteEN: `Single-leg balance (${s.date})`, sourceNoteIS: `Jafnvægi á öðrum fæti (${s.date})`,
    },
    audit: { ruleId: SCREEN_SLB_WARMUP, triggerEN, triggerIS,
      actionEN: `Added ${ex.name.en} (${ex.dose.en}) to the warm-up.`,
      actionIS: `Bætti ${ex.name.is} (${ex.dose.is}) við upphitun.`, evidence },
  };
}
