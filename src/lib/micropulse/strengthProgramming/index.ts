/**
 * Strength Programming — Public API
 *
 * Generates per-player, MD-context-aware strength sessions from sport-
 * science templates and player-level data signals.
 *
 * Architecture (Stage 1 — pure module):
 *   1. EXERCISE_LIBRARY — 35+ evidence-based exercises with metadata.
 *   2. MD templates — MD-4 strength, MD-3 power, MD-2 activation.
 *   3. adaptationRules — exercise-level swaps/removes/additions driven
 *      by Sprint Speed Drop, Sprint Exposure, CoD asymmetry, decel
 *      burden, VBT decrement, wellness sore-areas, verdict, congestion.
 *   4. buildStrengthSession — main entry point, ties templates +
 *      adaptations together, returns a complete prescribed session.
 *
 * Sport-science foundation (research/ folder):
 *   - Cluster sets:        Tufano 2017, Hardee 2012, Pareja-Blanco 2017
 *   - French Contrast:     Liu 2023, Bencivenga 2024, Cormie 2011
 *   - Weightlifting deriv: Suchomel 2017, Comfort 2015/2018
 *   - VBT velocity caps:   Pareja-Blanco 2017, Sánchez-Medina 2011
 *   - Nordic hamstring:    van Dyk 2019 (51% injury reduction)
 *   - Copenhagen adductor: Harøy 2019 (41% groin reduction)
 *   - IMTP RFD:            Comfort 2018, Lake 2018
 *   - Microdosing:         Rønnestad 2023
 *   - Edouard 2019:        Sprint speed drop → hamstring risk
 *   - Malone 2018:         Sprint exposure underload → hamstring risk
 *   - Bishop 2020:         L/R CoD asymmetry → non-contact injury
 *   - McBurnie 2022:       Decel burden → eccentric overload
 */

import type {
  AppliedAdaptation,
  ExerciseCategory,
  ExerciseDose,
  MdContext,
  PlayerStrengthSnapshot,
  PrescribedExercise,
  SessionBlock,
  StrengthSession,
} from "./types";
import { buildMd4Strength } from "./mdTemplates/md4Strength";
import { buildMd3Power } from "./mdTemplates/md3Power";
import { buildMd2Activation } from "./mdTemplates/md2Activation";
import { buildMd1Primer } from "./mdTemplates/md1Primer";
import { buildMdPlus1Recovery } from "./mdTemplates/mdPlus1Recovery";
import { buildMdPlus1IsoLower } from "./mdTemplates/mdPlus1IsoLower";
import { md1MinutesTier, type Md1Tier } from "./md1Tier";
import { applyAdaptationRules, newAdaptationTrace, type AdaptationTrace } from "./adaptationRules";
import { EXERCISE_LIBRARY as LIBRARY, EXERCISES_BY_ID, getExercise as lookupExercise } from "./exerciseLibrary";
import { effectivePool, isPlayerPick, type PlayerExercisePicks } from "./playerPicks";
import { applyPlayerGoal } from "./playerGoal";
import { applyGoalGiveBack, applyGoalNearMatch, applyGoalPlanGym, type GoalLiftResult, type GoalOwedLift } from "./goalPlanGym";
import { applyNearMatchDose, applyWeekRule, finishNearMatch, matchWeekHeavyReps, nearMatchAudit, nearMatchDayOf, nearMatchLiftOf, noMatchWeekRule, weekRuleAudit, weekRuleLightAudit, weekRuleSeasonOf, type NearMatchDay, type NoMatchWeekRule, type WeekRuleSeason } from "./weekRule";
import { applyPreventionRule, matchWeekPrevention, noMatchWeekPrevention, preventionAudit } from "./preventionRule";
import { takesPart, type SendMode } from "./sendMode";
import {
  slotForCategory,
  PALETTE_UNILATERAL_ASYMMETRY_PCT,
  type PaletteSlot,
  type PaletteSlots,
} from "./palette";
import { DEFAULT_STRUCTURE_BY_MD, STRUCTURES_ALLOWED_BY_MD, STRUCTURE_LABEL, readinessDowngrade, isRestDay, noMatchDayFor, weekdayOf, NO_MATCH_DAY_MD, NO_MATCH_DAY_LABEL, WEEKDAY_LABEL, type MdStructures, type NoMatchDayKind, type StructureKey } from "./structures";
import { enforceDayRules, estimateSessionMinutes } from "./dayRules";
import { buildStructuredBlocks } from "./structureBuilders";

export * from "./types";
export { EXERCISE_LIBRARY, EXERCISES_BY_ID, getExercise, getExercisesByCategory } from "./exerciseLibrary";
export { applyAdaptationRules, newAdaptationTrace, type AdaptationTrace } from "./adaptationRules";
export { md1MinutesTier, type Md1Tier } from "./md1Tier";

/** Pick the base micro-dose template for the player's MD context.
 *  All templates are ~15-20 minutes by design — MicroPulse's core
 *  philosophy. There is no "full volume" alternative; coaches who want
 *  more stimulus run a second microdose later in the week. */
function pickTemplate(mdContext: MdContext): { id: string; blocks: SessionBlock[] } | null {
  switch (mdContext) {
    case "MD-4":
      return { id: "md4-microdose-v1", blocks: buildMd4Strength() };
    case "MD-3":
      return { id: "md3-microdose-v1", blocks: buildMd3Power() };
    case "MD-2":
      return { id: "md2-microdose-v1", blocks: buildMd2Activation() };
    case "MD-1":
      // Pre-match neural primer (~10 min). Adaptation engine drops the
      // ballistic if sprint speed dropped or VBT suppressed.
      return { id: "md1-primer-v1", blocks: buildMd1Primer() };
    case "MD+1":
      // Post-match recovery / DNP-stim. Starters (verdict=RECOVERY) get
      // the explosive block stripped by Rule 10; DNP players keep it.
      return { id: "mdplus1-recovery-v1", blocks: buildMdPlus1Recovery() };
    // MD+2, MD+3, OFF — no built-in session (return null). On MD+2 / MD+3 a coach
    // may still opt in to a rebuild session by choosing a structure method, which
    // is laid out downstream from the palette.
    default:
      return null;
  }
}

/** Estimate total duration from blocks. */
/** Rough minutes: 6 warm-up, 5 mobility, else sets × (30 s of work + the rest). One implementation (dayRules.ts). */
const estimateDuration = estimateSessionMinutes;

/** Build the one-line summary surfaced in UI. */
function buildSummary(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  appliedCount: number,
): { en: string; is: string } {
  const totalEx = blocks.reduce((s, b) => s + b.exercises.length, 0);
  const dur = estimateDuration(blocks);

  if (totalEx === 0) {
    return {
      en: `No team strength session today (${snap.verdict ?? "—"}). Mobility / recovery only.`,
      is: `Engin styrktaræfing í dag (${snap.verdict ?? "—"}). Mobility / endurheimt eingöngu.`,
    };
  }

  const adaptStr = appliedCount > 0
    ? ` · ${appliedCount} adaptation${appliedCount === 1 ? "" : "s"} applied`
    : "";
  const adaptStrIs = appliedCount > 0
    ? ` · ${appliedCount} sérstilling${appliedCount === 1 ? "" : "ar"}`
    : "";

  // Basketball has no MD microcycle, so label it plainly as a strength session (the context was
  // normalised to MD-4 only to pick a full strength template — "MD-4" would be football jargon here).
  const isBasketball = String(snap.sport ?? "").toLowerCase() === "basketball";
  const ctxEN = isBasketball ? "Strength" : snap.mdContext;
  const ctxIS = isBasketball ? "Styrktar" : snap.mdContext;
  return {
    en: `${ctxEN} session · ${totalEx} exercises · ~${dur} min${adaptStr}.`,
    is: `${ctxIS}æfing · ${totalEx} æfingar · ~${dur} mín${adaptStrIs}.`,
  };
}

/** Compute data-confidence (0-1) based on what signals are present. */
function computeConfidence(snap: PlayerStrengthSnapshot): number {
  let score = 0.3; // Base
  if (snap.verdict) score += 0.15;
  if (snap.sprintSpeedDropPct != null) score += 0.1;
  if (snap.sprintExposureBand && snap.sprintExposureBand !== "INSUFFICIENT_DATA") score += 0.1;
  if (snap.codAsymmetryPct != null) score += 0.1;
  if (snap.decelBurdenBand != null) score += 0.1;
  if (snap.wellness.muscleSoreness != null) score += 0.05;
  if (snap.vbtDecrement != null) score += 0.1;
  return Math.min(1, score);
}

/** Coach exercise override (read from strength_session_overrides table).
 *  Applied AFTER the adaptation engine so the coach has the final word.
 *  Each entry replaces the exercise at (block_id, position) with the
 *  override exercise's default dose for the session's MD-context. */
export type CoachOverride = {
  blockId: string;
  position: number;
  overrideExerciseId: string;
  /** Optional coach note explaining the swap (shows in UI as the reason). */
  notes?: string | null;
  /** The exercise the coach swapped out (2026-11-17). When given, the swap only applies while that exercise is
   *  still at (blockId, position): a swap made on another MD-day preview, or before the session changed, never
   *  replaces a different exercise. */
  originalExerciseId?: string | null;
};

function applyCoachOverrides(
  blocks: SessionBlock[],
  overrides: CoachOverride[],
  mdContext: MdContext,
): number {
  let applied = 0;
  for (const ov of overrides) {
    const block = blocks.find((b) => b.id === ov.blockId);
    if (!block) continue;
    if (ov.position < 0 || ov.position >= block.exercises.length) continue;
    if (ov.originalExerciseId && block.exercises[ov.position].exerciseId !== ov.originalExerciseId) continue;
    let newEx;
    try {
      newEx = lookupExercise(ov.overrideExerciseId);
    } catch {
      continue; // unknown exercise id — skip silently
    }
    // Prefer the new exercise's default dose for this MD-context; fall back
    // to the original dose so the slot is never empty.
    const newDose = newEx.defaultDosing[mdContext] ?? block.exercises[ov.position].dose;
    block.exercises[ov.position] = {
      exerciseId: newEx.id,
      nameEN: newEx.nameEN,
      nameIS: newEx.nameIS,
      category: newEx.category,
      dose: newDose,
      modificationReason: ov.notes?.trim()
        ? `Coach override: ${ov.notes.trim()}`
        : "Coach manual swap",
      rationale: newEx.evidence,
    };
    applied++;
  }
  return applied;
}

/** Exercise ids today's safety rules rule out: the trace's bans plus every library exercise whose
 *  contraindications hit today's contras. Sorted; empty when nothing fired. */
function blockedIds(trace: AdaptationTrace): string[] {
  const out = new Set(trace.banned);
  if (trace.contras.size > 0) {
    for (const ex of LIBRARY) {
      if ((ex.contraindications ?? []).some((c) => trace.contras.has(c))) out.add(ex.id);
    }
  }
  return [...out].sort();
}

/** True when a list candidate may NOT be placed today: a safety rule took it out, it is
 *  contraindicated by today's state, or a safety rule already placed it (no duplicate). */
function safetyRulesOut(id: string, trace: AdaptationTrace | undefined): boolean {
  if (!trace) return false;
  if (trace.banned.has(id) || trace.pinned.has(id)) return true;
  if (trace.contras.size === 0) return false;
  let lib;
  try { lib = lookupExercise(id); } catch { return false; }
  return (lib.contraindications ?? []).some((c) => trace.contras.has(c));
}

/** A lift's own library dose for the day (nearest dosed day when that day has none). */
function ownDose(ex: { defaultDosing: Partial<Record<MdContext, ExerciseDose>> }, md: MdContext): ExerciseDose | null {
  for (const m of [md, "MD-3", "MD-4", "MD-2", "MD-1"] as MdContext[]) {
    const d = ex.defaultDosing[m];
    if (d) return d;
  }
  return null;
}

/** Substitute the coach's team palette into the template's power/strength slots.
 *  The engine keeps the TEMPLATE's MD-tuned dose (periodisation stays intact) and
 *  only swaps WHICH exercise fills each slot to the coach's chosen pool. Symmetry
 *  read: for the lower-body strength slot the engine picks the UNILATERAL pool when
 *  the player is asymmetric (loads the weaker side) and the BILATERAL pool when
 *  symmetric — falling back to the exercise's own slot pool, then to the template
 *  exercise, so a slot is never left empty. Runs in individualised mode only.
 *
 *  Safety (2026-11-17, `trace` from applyAdaptationRules): the palette never replaces an
 *  exercise a safety rule swapped in or added, and never places an exercise a safety rule
 *  took out or that today's state contraindicates — it moves on to the next pick, and when
 *  the pool runs out the rule's exercise stays. Mutates `blocks`; returns the audit entries
 *  for what it changed. */
function applyTeamPalette(
  blocks: SessionBlock[],
  palette: PaletteSlots,
  snap: PlayerStrengthSnapshot,
  trace?: AdaptationTrace,
): AppliedAdaptation[] {
  const audit: AppliedAdaptation[] = [];
  // Substitute whenever the coach has picked ANY exercise (including an
  // isometric-only palette used with an isometric structure). `paletteIsUsable`
  // is the stricter "enough to build a whole session" check, used elsewhere.
  if (!Object.values(palette).some((ids) => (ids?.length ?? 0) > 0)) return audit;

  // Symmetry read from TWO sources: IMA change-of-direction (Catapult) and VALD
  // limb asymmetry (NordBord / ForceFrame). Prefer unilateral if EITHER flags
  // ≥ threshold; the more severe drives the % + the source label.
  const cod = snap.codAsymmetryPct ?? null;
  const vald = snap.valdAsymmetryPct ?? null;
  const asym = cod == null && vald == null ? null : Math.max(cod ?? 0, vald ?? 0);
  const asymSource = vald != null && (cod == null || vald >= cod) ? "VALD" : "IMA CoD";
  const preferUnilateral = asym != null && asym >= PALETTE_UNILATERAL_ASYMMETRY_PCT;
  // Per-slot "used" set so a second exercise in the same slot takes the coach's next
  // pick (not a duplicate of the first); when the pool is exhausted we leave the
  // template exercise in place. A pick the safety rules rule out is passed over,
  // never placed.
  // The power slot holds four kinds (Olympic pull, plyometric, ballistic, med ball) and
  // a method's positions are of one kind each (French contrast: heavy → plyo → loaded
  // jump → throw; power contrast: loaded pull → plyo). So each power position takes the
  // first pick of ITS kind in the coach's order, and only when the list has none of
  // that kind the next pick of any kind (2026-11-17: the structure is the frame).
  const used: Partial<Record<PaletteSlot, Set<string>>> = {};
  let filled = 0;
  let symmetryDrove = false;

  // The player's own picks (when the coach turned picks on) go first in their group, then the rest of the
  // coach's list in the coach's order. No picks → exactly the coach's list.
  const picks: PlayerExercisePicks | undefined = snap.playerExercisePicks;
  const pools: Partial<Record<PaletteSlot, string[]>> = {};
  const poolOf = (slot: PaletteSlot) => (pools[slot] ??= effectivePool(slot, palette, picks));
  const usedPicks: string[] = [];

  const pickFrom = (slot: PaletteSlot, preferCategory?: ExerciseCategory): string | null => {
    const taken = (used[slot] ??= new Set<string>());
    const open = poolOf(slot).filter((id) => !taken.has(id) && !safetyRulesOut(id, trace));
    if (!open.length) return null;
    const sameKind = preferCategory ? open.find((id) => EXERCISES_BY_ID.get(id)?.category === preferCategory) : undefined;
    const id = sameKind ?? open[0];
    taken.add(id);
    filled++;
    return id;
  };

  for (const block of blocks) {
    for (let p = 0; p < block.exercises.length; p++) {
      const ex = block.exercises[p];
      const nativeSlot = slotForCategory(ex.category);
      // Only the power + lower-body strength categories map to a slot. PREP / ISO /
      // MOBILITY and the injury-prevention posterior/adductor block (Nordic van Dyk,
      // Copenhagen Harøy — non-negotiable) own no slot, so they are never substituted.
      if (!nativeSlot) continue;
      // A safety rule put this exercise here (a swap-in or an added set) — keep it.
      if (ex.isAdaptiveAddition || trace?.pinned.has(ex.exerciseId)) continue;

      // Lower-body strength: the SYMMETRY read chooses which pool fills the slot —
      // unilateral when the player is asymmetric (loads the weaker side), bilateral
      // when symmetric. When ASYMMETRIC and the unilateral pool is empty we leave the
      // template/adaptation exercise (the adaptation engine already swaps to a
      // unilateral lift on CoD asymmetry — never fall back to bilateral and undo it).
      // When SYMMETRIC (or no IMA/VALD data — the Lite/Core case) and the coach
      // curated ONLY a unilateral pool, honour it (fall bilateral → unilateral) so a
      // team without symmetry data still gets the coach's chosen lift. Non-lower
      // slots (power) just take their own pool.
      let chosenId: string | null;
      let usedSlot: PaletteSlot;
      if (nativeSlot === "bilateral_strength" || nativeSlot === "unilateral_strength") {
        usedSlot = preferUnilateral ? "unilateral_strength" : "bilateral_strength";
        chosenId = pickFrom(usedSlot);
        if (chosenId && preferUnilateral && usedSlot === "unilateral_strength") symmetryDrove = true;
        if (!chosenId && !preferUnilateral) {
          // Symmetric / no data + no bilateral pick → use a unilateral-only palette.
          const alt = pickFrom("unilateral_strength");
          if (alt) { chosenId = alt; usedSlot = "unilateral_strength"; }
        }
      } else {
        usedSlot = nativeSlot;
        chosenId = pickFrom(nativeSlot, nativeSlot === "power_explosive" ? ex.category : undefined);
      }
      if (!chosenId) continue;
      const mine = isPlayerPick(usedSlot, chosenId, picks);
      if (mine) usedPicks.push(chosenId);
      if (chosenId === ex.exerciseId) {
        if (mine) block.exercises[p] = { ...ex, playerPick: true };
        continue;
      }

      let newEx;
      try { newEx = lookupExercise(chosenId); } catch { continue; }
      // Keep the template's MD-tuned dose (sets, rest: the method's periodisation). When the
      // new lift is of another kind than the position (no pick of that kind on the list), its
      // reps / load / cue come from the lift itself, never another kind's ("4-6 kg each side"
      // of a throw on a jump shrug).
      const own = ownDose(newEx, snap.mdContext);
      const dose = !ex.dose
        ? own
        : newEx.category !== ex.category && own
          ? { ...ex.dose, reps: own.reps, intensity: own.intensity, cue: own.cue, intraRepRestSec: ex.dose.intraRepRestSec }
          : ex.dose;
      if (!dose) continue;
      block.exercises[p] = {
        exerciseId: newEx.id,
        nameEN: newEx.nameEN,
        nameIS: newEx.nameIS,
        category: newEx.category,
        dose,
        modificationReason: mine
          ? usedSlot === "unilateral_strength" && symmetryDrove
            ? `Player's pick from the team list (one leg at a time — ${asym?.toFixed(0)}% L/R asymmetry, ${asymSource})`
            : "Player's pick from the team list"
          : usedSlot === "unilateral_strength" && symmetryDrove
            ? `Team palette (unilateral — ${asym?.toFixed(0)}% L/R asymmetry, ${asymSource})`
            : "Team palette (coach's chosen pool)",
        rationale: newEx.evidence,
        ...(mine ? { playerPick: true as const } : {}),
      };
    }
  }

  // Picks actually drawn from the pool (a pick equal to the template exercise counts as filled).
  const swaps = filled;
  if (swaps > 0) {
    audit.push({
      ruleId: "TEAM_PALETTE_APPLIED",
      triggerEN: `Team exercise palette (${swaps} slot${swaps === 1 ? "" : "s"} filled from the coach's pool)`,
      triggerIS: `Æfingasafn liðsins (${swaps} reit${swaps === 1 ? "" : "ir"} fylltir úr vali þjálfara)`,
      actionEN: "Built the power / strength slots from the team's chosen exercises, keeping the MD-tuned dose.",
      actionIS: "Byggði afl- / styrktarreitina úr völdum æfingum liðsins, hélt MD-stilltu skammtinum.",
      evidence: "Coach-curated exercise pool — the coach picks WHICH lifts, the engine keeps the periodised dose.",
    });
  }
  if (usedPicks.length > 0) audit.push(playerPickAudit(usedPicks));
  if (symmetryDrove) {
    audit.push({
      ruleId: "PALETTE_SYMMETRY_UNILATERAL",
      triggerEN: `L/R asymmetry ${asym?.toFixed(0)}% ≥ ${PALETTE_UNILATERAL_ASYMMETRY_PCT}% (${asymSource})`,
      triggerIS: `L/R ósamhverfa ${asym?.toFixed(0)}% ≥ ${PALETTE_UNILATERAL_ASYMMETRY_PCT}% (${asymSource})`,
      actionEN: "Chose the unilateral lower-body lift from the palette to load the weaker side.",
      actionIS: "Valdi einhliða neðri-líkama lyftu úr safninu til að hlaða veikari hlið.",
      evidence: "Bishop 2020 — inter-limb asymmetry ≥ ~10-15% is performance/injury-relevant; unilateral work targets the deficit side.",
    });
  }
  return audit;
}

/** Audit line for the player's own picks that made it into the session (only when at least one did). */
function playerPickAudit(ids: string[]): AppliedAdaptation {
  const names = (lang: "en" | "is") => ids.map((id) => {
    try { const e = lookupExercise(id); return lang === "is" ? e.nameIS || e.nameEN : e.nameEN; } catch { return id; }
  }).join(", ");
  return {
    ruleId: "PLAYER_PICK_APPLIED",
    triggerEN: `Player's own picks from the team list: ${names("en")}`,
    triggerIS: `Val leikmanns af lista liðsins: ${names("is")}`,
    actionEN: "Used the player's picks first in their group; the dose, the injury-prevention block and the safety rules are unchanged.",
    actionIS: "Notaði val leikmanns fyrst í flokknum; skammtur, meiðslaforvörn og öryggisreglur óbreytt.",
    evidence: "Choice within limits the coach sets (the team list); choice may support motivation and adherence (self-determination theory, Ntoumanis et al. 2021 meta-analysis).",
  };
}

/** The upper-body pool for this player: their pick first (if any), then the team list; minus anything today's
 *  safety rules rule out. */
function upperPool(snap: PlayerStrengthSnapshot, trace?: AdaptationTrace): string[] {
  const palette = snap.teamPalette ?? {};
  return effectivePool("upper_body", palette, snap.playerExercisePicks).filter((id) => !safetyRulesOut(id, trace));
}

/** Append an upper-body block from the team palette, gated by sport + season phase
 *  into three tiers: basketball → PRIMARY (2 lifts, before the injury-prevention
 *  block); football pre-season → ACCESSORY (2 lifts, at the end); football in-season
 *  → MAINTENANCE (1 lift, ≤2 sets, at the end — keeps upper strength without adding
 *  fatigue). Taper days (MD-2/1/+1) and an empty upper palette → nothing. Mutates
 *  `blocks`. */
type UpperPlan = { block: SessionBlock; primary: boolean; audit: AppliedAdaptation[] };

/** Puts a built upper-body block in the session (`buildUpperBody`). Mutates `blocks`. */
function appendUpperBody(blocks: SessionBlock[], upper: UpperPlan | null): AppliedAdaptation[] {
  if (!upper || upper.block.exercises.length === 0) return [];
  if (upper.primary) {
    const idx = blocks.findIndex((b) => b.type === "POSTERIOR" || b.type === "ADDUCTOR");
    if (idx >= 0) blocks.splice(idx, 0, upper.block);
    else blocks.push(upper.block);
  } else {
    blocks.push(upper.block);
  }
  return upper.audit;
}

/** The upper-body block, built before the goal-plan merge (2026-11-18) so a lower-body goal lift can take one of its
 *  spots; put in the session later by `appendUpperBody`, after the coach's swaps, as before. */
function buildUpperBody(snap: PlayerStrengthSnapshot, md1Tier: Md1Tier | null = null, trace?: AdaptationTrace): UpperPlan | null {
  const upperPicks = upperPool(snap, trace);
  // MD-4 / MD-3 are strength days; on MD+1 the LOW tier (DNP / < 30 min) is a
  // rebuild day, so it takes the same season-gated upper add.
  const strengthDay = snap.mdContext === "MD-4" || snap.mdContext === "MD-3"
    || (snap.mdContext === "MD+1" && md1Tier === "low");
  if (upperPicks.length === 0 || !strengthDay) return null;

  const isBasketball = String(snap.sport ?? "").toLowerCase() === "basketball";
  const isPreseason = String(snap.seasonPhase ?? "").toLowerCase() === "preseason";
  const tier: "primary" | "accessory" | "maintenance" = isBasketball ? "primary" : isPreseason ? "accessory" : "maintenance";
  const maxEx = tier === "maintenance" ? 1 : 2;

  const exercises: PrescribedExercise[] = [];
  for (const id of upperPicks.slice(0, maxEx)) {
    let lib;
    try { lib = lookupExercise(id); } catch { continue; }
    const base = lib.defaultDosing[snap.mdContext] ?? lib.defaultDosing["MD-4"] ?? lib.defaultDosing["MD-3"];
    if (!base) continue;
    // Maintenance keeps it low-volume: cap at 2 sets.
    const dose = tier === "maintenance" ? { ...base, sets: Math.min(base.sets, 2) } : base;
    const mine = isPlayerPick("upper_body", lib.id, snap.playerExercisePicks);
    exercises.push({
      exerciseId: lib.id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose, rationale: lib.evidence,
      ...(mine ? { playerPick: true as const, modificationReason: "Player's pick from the team list" } : {}),
    });
  }
  if (exercises.length === 0) return null;

  const titleEN = tier === "primary" ? "Upper body (primary)" : tier === "accessory" ? "Upper body (accessory)" : "Upper body (maintenance)";
  const titleIS = tier === "primary" ? "Efri líkami (aðal)" : tier === "accessory" ? "Efri líkami (auka)" : "Efri líkami (viðhald)";
  const noteEN =
    tier === "primary" ? "Primary for basketball — contact, rebounding and shooting robustness."
    : tier === "accessory" ? "Pre-season strength window — more time off the pitch for upper-body work."
    : "In-season maintenance — one lift, low volume, keeps upper-body strength without adding fatigue.";
  const noteIS =
    tier === "primary" ? "Aðal fyrir körfubolta — snerting, fráköst og skotþol."
    : tier === "accessory" ? "Undirbúningstímabil — meiri tími utan vallar fyrir efri-líkama vinnu."
    : "Viðhald á keppnistímabili — ein æfing, lítið magn, heldur efri-líkama styrk án þreytu.";

  const block: SessionBlock = { id: "upper-body", titleEN, titleIS, type: "ACCESSORY", exercises, noteEN, noteIS };
  const picked = exercises.filter((e) => e.playerPick).map((e) => e.exerciseId);

  const triggerEN = tier === "primary" ? `Basketball — upper body is primary (${snap.mdContext})`
    : tier === "accessory" ? `Football pre-season — upper-body accessory (${snap.mdContext})`
    : `Football in-season — light upper-body maintenance (${snap.mdContext})`;
  const triggerIS = tier === "primary" ? `Körfubolti — efri líkami er aðal (${snap.mdContext})`
    : tier === "accessory" ? `Fótbolti undirbúningstímabil — efri-líkama auki (${snap.mdContext})`
    : `Fótbolti keppnistímabil — létt efri-líkama viðhald (${snap.mdContext})`;

  return { block, primary: tier === "primary", audit: [...(picked.length ? [playerPickAudit(picked)] : []), {
    ruleId: "UPPER_BODY_ADDED",
    triggerEN,
    triggerIS,
    actionEN: `Added an upper-body ${tier} block from the team palette (${exercises.length} exercise${exercises.length === 1 ? "" : "s"}).`,
    actionIS: `Bætti við efri-líkama ${tier === "primary" ? "aðal" : tier === "accessory" ? "auka" : "viðhalds"} blokk úr palette liðsins (${exercises.length} æfing${exercises.length === 1 ? "" : "ar"}).`,
    evidence: "Sport + season-phase context: primary for basketball, a pre-season accessory and a light in-season maintenance dose for football.",
  }] };
}

/** MD+1 HIGH tier (played ≥ 60 min): the upper body is FRESH while the lower body
 *  is on protective iso only, so the day's real strength stimulus is the upper
 *  block (2 lifts, MD-4 dose). Palette-first; falls back to a canonical push/pull
 *  when the coach hasn't curated an upper pool (clearly noted). Mutates `blocks`. */
function appendMdPlus1UpperStrength(blocks: SessionBlock[], snap: PlayerStrengthSnapshot, trace?: AdaptationTrace): AppliedAdaptation[] {
  const picks = upperPool(snap, trace);
  const usedDefault = picks.length === 0;
  const ids = (usedDefault ? ["ex_db_bench_press", "ex_db_row"] : picks).slice(0, 2);

  const exercises: PrescribedExercise[] = [];
  for (const id of ids) {
    let lib;
    try { lib = lookupExercise(id); } catch { continue; }
    const base = lib.defaultDosing["MD-4"] ?? lib.defaultDosing["MD-3"] ?? Object.values(lib.defaultDosing)[0];
    if (!base) continue;
    const mine = !usedDefault && isPlayerPick("upper_body", lib.id, snap.playerExercisePicks);
    exercises.push({
      exerciseId: lib.id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose: base, rationale: lib.evidence,
      ...(mine ? { playerPick: true as const, modificationReason: "Player's pick from the team list" } : {}),
    });
  }
  if (exercises.length === 0) return [];
  const picked = exercises.filter((e) => e.playerPick).map((e) => e.exerciseId);

  blocks.push({
    id: "mdplus1-upper",
    titleEN: "Upper body (strength — fresh tissue)",
    titleIS: "Efri líkami (styrkur — óþreytt)",
    type: "ACCESSORY",
    exercises,
    noteEN: usedDefault
      ? "Played 60+ min → the lower body recovers (iso only) while the fresh upper body trains. Default push/pull — add upper-body lifts to the team palette to choose your own."
      : "Played 60+ min → the lower body recovers (iso only) while the fresh upper body trains, from the team palette.",
    noteIS: usedDefault
      ? "Spilaði 60+ mín → neðri líkami endurheimtist (aðeins iso) meðan óþreyttur efri líkami æfir. Sjálfgefið ýta/toga — bættu efri-líkama lyftum í palette liðsins til að velja sjálf/ur."
      : "Spilaði 60+ mín → neðri líkami endurheimtist (aðeins iso) meðan óþreyttur efri líkami æfir, úr palette liðsins.",
  });

  return [...(picked.length ? [playerPickAudit(picked)] : []), {
    ruleId: "MDPLUS1_UPPER_STRENGTH",
    triggerEN: `Played ≥ 60 min (${snap.lastMatchMinutes ?? "?"} min) — MD+1 recovery day`,
    triggerIS: `Spilaði ≥ 60 mín (${snap.lastMatchMinutes ?? "?"} mín) — MD+1 endurheimtardagur`,
    actionEN: `Kept the lower body on protective isometrics and put the strength stimulus on the fresh upper body (${exercises.length} lift${exercises.length === 1 ? "" : "s"}${usedDefault ? ", engine default" : ""}).`,
    actionIS: `Hélt neðri líkama á verndandi ísómetríu og setti styrktar-áreitið á óþreyttan efri líkama (${exercises.length} lyft${exercises.length === 1 ? "a" : "ur"}${usedDefault ? ", sjálfgefið" : ""}).`,
    evidence: "Carling 2018 / Nédélec 2012 — the lower body absorbed the match's eccentric load; the upper body is fresh and trainable the day after.",
  }];
}

/** Drop the player's own input when they don't take part under the build's mode. A snapshot without
 *  `playerChoiceAccess` (built by hand) is used as given. */
function withoutPlayerInputUnlessTakingPart(snap: PlayerStrengthSnapshot, mode: SendMode | undefined): PlayerStrengthSnapshot {
  const access = snap.playerChoiceAccess;
  if (!access) return snap;
  const buildMode: SendMode = mode ?? (access.teamMode === "individualised_goals" ? "individualised_goals" : "individualised");
  if (takesPart(buildMode, access)) return snap;
  if (!snap.playerExercisePicks && !snap.playerStrengthGoal && !snap.goalPlanGym) return snap;
  const rest = { ...snap };
  delete rest.playerExercisePicks;
  delete rest.playerStrengthGoal;
  delete rest.goalPlanGym;
  return rest;
}

/** Main entry — build a complete strength session for one player.
 *  `coachOverrides` is optional and applied after adaptation rules so the
 *  coach has the final word over any engine substitution. */
export function buildStrengthSession(
  snapIn: PlayerStrengthSnapshot,
  coachOverrides: CoachOverride[] = [],
  opts: { mode?: SendMode } = {},
): StrengthSession | null {
  // The day rule is checked last, on what would be delivered (dayRules.ts): it only trims, never adds. Football only.
  // Each build below is checked, so the yellow / green comparison is made on what would really go out.
  const isBasketball = String(snapIn.sport ?? "").toLowerCase() === "basketball";
  const core = (snap: PlayerStrengthSnapshot, keep: boolean) => {
    const built = buildStrengthSessionCore(snap, coachOverrides, opts, keep);
    return isBasketball ? built : enforceDayRules(built);
  };
  const s = core(snapIn, false);
  if (!s || !s.appliedAdaptations.some((a) => a.ruleId === "STRUCTURE_READINESS_DOWNGRADE")) return s;
  // Yellow step-down cap (2026-11-18, coach's call): a yellow day steps the method down one rung only when the lower
  // rung really is lighter. If it would mean more loaded reps, more reps in all, or more exercises than the same day
  // on green (e.g. contrast 3×3 @85% → cluster 2×12 @80%), today's method stays and the yellow set cut lightens it.
  // Loaded reps are counted on their own: dropping the jumps must not buy a heavier main lift.
  const green = core({ ...snapIn, verdict: "FULL" }, false);
  if (!green) return s;
  const a = workOf(s), g = workOf(green);
  if (a.loadedReps <= g.loadedReps && a.reps <= g.reps && a.exercises <= g.exercises) return s;
  const kept = core(snapIn, true);
  if (!kept) return s;
  const from = s.appliedAdaptations.find((x) => x.ruleId === "STRUCTURE_READINESS_DOWNGRADE");
  kept.appliedAdaptations.push({
    ruleId: "STRUCTURE_READINESS_DOWNGRADE_SKIPPED",
    triggerEN: "Today's check-in: yellow",
    triggerIS: "Innskráning í dag: gul",
    actionEN: "Kept today's method with fewer sets: the lighter method would have meant more work than a green day.",
    actionIS: "Hélt aðferð dagsins með færri settum: léttari aðferðin hefði þýtt meiri vinnu en grænn dagur.",
    evidence: `The coach's rule: a yellow day is never more work than a green one (${from?.actionEN ?? "step-down"}).`,
  });
  return kept;
}

/** Working volume (warm-up and mobility left out): reps (sets × reps; a timed hold = 1 per set), the loaded part of
 *  them (a % of max or an RPE), and exercises. */
function workOf(s: StrengthSession): { reps: number; loadedReps: number; exercises: number } {
  let reps = 0, loadedReps = 0, exercises = 0;
  for (const b of s.blocks) {
    if (b.type === "PREP" || b.type === "MOBILITY") continue;
    for (const e of b.exercises) {
      exercises++;
      const r = String(e.dose.reps ?? "");
      const timed = /^\s*\d+\s*s\b/.test(r);
      const m = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?/.exec(r);
      const n = e.dose.sets * (timed || !m ? 1 : Number(m[2] ?? m[1]));
      reps += n;
      if (/%|RPE/i.test(String(e.dose.intensity ?? ""))) loadedReps += n;
    }
  }
  return { reps, loadedReps, exercises };
}

/** Another day of this week by the week rule alone: the MD day it is built as, and its heavy reps (null = not a heavy
 *  day). A day with no match near follows the coach's weekday plan. Null = no session that day by the rule. */
function ruleDayOf(snap: PlayerStrengthSnapshot, date: string, md: string | null, season: WeekRuleSeason): { md: MdContext; reps: number | null } | null {
  if (md) return { md: md as MdContext, reps: matchWeekHeavyReps(md as MdContext, season) };
  const rule = noMatchWeekRule(date, snap.noMatchWeek, season);
  if (!rule || rule.kind === "rest") return null;
  return { md: NO_MATCH_DAY_MD[rule.kind], reps: rule.heavyReps };
}

/** The frame of an MD day by the rule alone: the team's method for that day with the week rule's heavy reps. Nothing
 *  of the player's day (readiness, team list, safety rules) is in it. Null = the team does not lift that day. */
function ruleFrameFor(snap: PlayerStrengthSnapshot, md: MdContext, dayReps: number | null): SessionBlock[] | null {
  const pick = snap.mdStructures?.[md];
  if (isRestDay(pick)) return null;
  const dayDefault = DEFAULT_STRUCTURE_BY_MD[md];
  const chosen = pick && (STRUCTURES_ALLOWED_BY_MD[md] ?? []).includes(pick) ? pick : undefined;
  const effective = chosen ?? dayDefault;
  const structured = effective && effective !== dayDefault ? buildStructuredBlocks(effective, md) : null;
  const blocks = structured && structured.length > 0 ? structured : pickTemplate(md)?.blocks ?? null;
  if (!blocks) return null;
  if (dayReps != null) applyWeekRule(blocks, dayReps, snap.mdRepsPerSet?.[md] ?? null, md);
  return blocks;
}

/**
 * The week rule's give-back for the player's 8-week goal (2026-11-19). Forward only, by rule: nothing is read from what
 * the player did. For each of the week's goal gym sessions on another day, that day's frame says how many sets each
 * lift gets there (a spot holds no more than the team exercise's sets; a heavy lift no more than the day's heavy
 * reps). What the plan says beyond that is owed, and is done on ONE day: the week's heavy day without a goal session
 * that holds the most heavy reps (the earliest of equals). Empty when today is not that day, or nothing is owed.
 */
function goalGiveBackOwed(snap: PlayerStrengthSnapshot, todayHeavyReps: number | null, season: WeekRuleSeason, upper: SessionBlock | null): GoalOwedLift[] {
  const g = snap.goalPlanGym;
  const gb = g?.giveBack;
  if (!g || !gb || todayHeavyReps == null) return [];
  const goalDates = new Set(gb.sessions.map((x) => x.date));
  let best: { date: string; reps: number } | null = null;
  for (const d of gb.weekDays) {
    if (goalDates.has(d.date)) continue;
    const day = ruleDayOf(snap, d.date, d.md, season);
    // Only a day the team lifts on: the give-back takes the place of team exercises, so a day with no session has none.
    if (!day || day.reps == null || !ruleFrameFor(snap, day.md, day.reps)) continue;
    if (!best || day.reps > best.reps || (day.reps === best.reps && d.date < best.date)) best = { date: d.date, reps: day.reps };
  }
  if (!best || best.date !== snap.todayIso) return [];

  const owed = new Map<string, GoalOwedLift & { reps: number }>();
  for (const x of gb.sessions) {
    const day = ruleDayOf(snap, x.date, x.md, season);
    const frame = day ? ruleFrameFor(snap, day.md, day.reps) : null;
    if (!day || !frame) continue;
    const results: GoalLiftResult[] = [];
    const later = upper ? [JSON.parse(JSON.stringify(upper)) as SessionBlock] : [];
    const goalDay: PlayerStrengthSnapshot = { ...snap, mdContext: day.md, verdict: "FULL", goalPlanGym: { ...g, slot: x.slot, lifts: x.lifts, giveBack: undefined } };
    const said = applyGoalPlanGym(frame, goalDay, () => false, () => false, later, { results, dayHeavyReps: day.reps });
    // Not in that day's session (its method has no heavy lift): the plan session is done from the goal card, in full.
    if (!said.some((a) => a.ruleId === "GOAL_PLAN_GYM_MERGED")) continue;
    for (const r of results) {
      if (r.sets >= r.planSets) continue;
      const owedSets = r.planSets - r.sets;
      const reps = owedSets * (Number(/^\s*(\d+)/.exec(r.lift.reps)?.[1]) || 1);
      // Two sessions owing the same kind of lift: the one that owes more reps (the first of equals).
      const prev = owed.get(r.lift.profile);
      if (!prev || reps > prev.reps) owed.set(r.lift.profile, { lift: r.lift, owedSets, fromSlot: x.slot, reps });
    }
  }
  return [...owed.values()].map((o) => ({ lift: o.lift, owedSets: o.owedSets, fromSlot: o.fromSlot }));
}

function buildStrengthSessionCore(
  snapIn: PlayerStrengthSnapshot,
  coachOverrides: CoachOverride[],
  opts: { mode?: SendMode },
  noReadinessDowngrade: boolean,
): StrengthSession | null {
  // Send mode. "individualised" (default) = data + screen driven: the MD template,
  // readiness/MD-tuned, PLUS the player's screen corrective block + deficit-ledger
  // emphases + F-V driver. "standard" = the same MD template, still readiness/MD-
  // tuned, but WITHOUT those per-player layers (a clean squad session). Both honour
  // week-setup (MD) + readiness (verdict/wellness); "standard" just skips the
  // individualisation. The coach chooses (team default, per-send override).
  const individualised = opts.mode !== "standard";
  // "individualised_goals" (2026-11-17) = individualised + the player's own input (picks, strength goal, the 8-week
  // goal's gym session). Whether a player takes part is decided here, once, from the mode of this build (or the
  // team's mode when none is given) and the coach's setting for the player (sendMode.ts). Not taking part → that
  // input is dropped before anything is built, so the session is exactly the data + screen session.
  snapIn = withoutPlayerInputUnlessTakingPart(snapIn, opts.mode);

  // A week without a match (2026-11-17): the coach's weekday plan says what kind of day today is. Rest → no
  // session; strength / power / light → built as MD-4 / MD-3 / MD-2, so that MD row's method applies. A rest marker
  // on that MD row belongs to match weeks (the traditional lift days) and is not used here, nor is its volume
  // concentration. Football, individualised modes, no match near and no hand-picked MD day (noMatchNearby) only.
  // The week rule (2026-11-19, weekRule.ts): such a week holds at most three heavy days, never two in a row, and the
  // same heavy reps as a match week; the other days are light, also a weekday the plan leaves out (it was built as a
  // full MD-3 session before). A team with no weekday plan at all is built as before.
  let noMatchKind: Exclude<NoMatchDayKind, "rest"> | null = null;
  let noMatchRule: NoMatchWeekRule | null = null;
  if (individualised && snapIn.noMatchNearby && String(snapIn.sport ?? "").toLowerCase() !== "basketball") {
    noMatchRule = noMatchWeekRule(snapIn.todayIso, snapIn.noMatchWeek, weekRuleSeasonOf(snapIn));
    const kind = noMatchRule ? noMatchRule.kind : noMatchDayFor(snapIn.todayIso, snapIn.noMatchWeek);
    if (kind === "rest") return null;
    if (kind) {
      noMatchKind = kind;
      const methodsOnly: MdStructures = {};
      for (const [md, v] of Object.entries(snapIn.mdStructures ?? {})) {
        if (v && !isRestDay(v)) methodsOnly[md as MdContext] = v;
      }
      snapIn = { ...snapIn, mdContext: NO_MATCH_DAY_MD[kind], mdStructures: methodsOnly };
    }
  }

  // BASKETBALL: an indoor team has no football MD microcycle, so the taper templates (MD-2 light, MD-1
  // primer, MD+1 recovery) don't apply. A non-rest training day is a full STRENGTH day → normalise the
  // context to MD-4 so the engine builds a full strength template, then the usual per-player layers (team
  // palette, movement-screen correctives, deficit-ledger emphases, readiness easing, and the basketball
  // upper-body-primary block) run on top. The real day's rest/OFF + injury state is checked FIRST, so an
  // explicit rest still yields no session. Football is untouched (snap === snapIn).
  const isBasketball = String(snapIn.sport ?? "").toLowerCase() === "basketball";
  const realRest = isRestDay(snapIn.mdStructures?.[snapIn.mdContext]);
  const injured = snapIn.injuryStatus === "injured" || snapIn.injuryStatus === "rehabilitation";
  const snap: PlayerStrengthSnapshot =
    isBasketball && !realRest && !injured ? { ...snapIn, mdContext: "MD-4" } : snapIn;

  // Block when MD context isn't a strength day. MD+2 / MD+3 are strength days only
  // in the sense that a coach MAY schedule a rebuild session on them — pickTemplate
  // returns null (no built-in session), so with no chosen method the build still
  // ends as null below (Default = rest), but a chosen method builds a structure.
  const isStrengthDay = ["MD-5", "MD-4", "MD-3", "MD-2", "MD-1", "MD+1", "MD+2", "MD+3", "MD+4"].includes(snap.mdContext);
  if (!isStrengthDay) return null;

  // Coach marked this MD day OFF (the traditional approach concentrates onto 1–4 lift days and
  // rests the others; also an explicit rest day in any mode) → no team strength session today.
  // A pure opt-out — returns null like an unconfigured rebuild day; no writer, no readiness touch.
  if (isRestDay(snap.mdStructures?.[snap.mdContext])) return null;

  // Block when player is actively injured (rehab program is the relevant tool).
  if (snap.injuryStatus === "injured" || snap.injuryStatus === "rehabilitation") {
    return {
      playerId: snap.playerId,
      playerName: snap.playerName,
      mdContext: snap.mdContext,
      templateId: "rehab-only",
      durationMin: 0,
      vbtAutoRegulated: false,
      isCompressed: false,
      blocks: [],
      appliedAdaptations: [
        {
          ruleId: "INJURY_BLOCK",
          triggerEN: `Active injury status (${snap.injuryStatus})`,
          triggerIS: `Virkur meiðslastatus (${snap.injuryStatus})`,
          actionEN: "Team strength session blocked — physio rehab program only.",
          actionIS: "Team styrktaræfing blokkuð — physio rehab plan eingöngu.",
          evidence: "RTP consensus — no high-load training before physio clearance.",
        },
      ],
      summaryEN: "Player on physio rehab — no team strength session today.",
      summaryIS: "Leikmaður á physio rehab — engin styrktaræfing í dag.",
      confidence: 1.0,
    };
  }

  // Template selection. In individualised mode, if the coach chose a NON-default
  // method for this (configurable) MD day, lay that method out instead of the
  // built-in template; the palette / adaptation / override pipeline then runs on it
  // exactly as it does for a template. Every other case → the built-in template,
  // byte-identical to before (default fast-path, standard mode, unconfigurable days).
  let tmpl = pickTemplate(snap.mdContext);

  // MD+1 is minutes-aware in individualised mode (Carling 2018 — post-match
  // recovery scales with match exposure). The tier picks the template; the fixed
  // recovery template stands for standard mode or unknown minutes.
  //   high  (≥60 min) → protective iso lower-body (+ fresh upper strength, appended below)
  //   low   (<30 / DNP) → a real MD-4-dosed strength stimulus (missed match load)
  //   moderate / null → the default recovery stim (unchanged)
  const md1Tier: Md1Tier | null = individualised && snap.mdContext === "MD+1"
    ? md1MinutesTier(snap.lastMatchMinutes, snap.lastMatchDnp)
    : null;
  if (md1Tier === "low") {
    tmpl = { id: "mdplus1-strength-v1", blocks: buildMd4Strength() };
  } else if (md1Tier === "high") {
    tmpl = { id: "mdplus1-iso-upper-v1", blocks: buildMdPlus1IsoLower() };
  }

  const dayDefault = DEFAULT_STRUCTURE_BY_MD[snap.mdContext];
  // Rest days already returned null above; filter the marker out so `chosenRaw` is a method.
  const dayPick = snap.mdStructures?.[snap.mdContext];
  const chosenRaw = individualised && dayPick && !isRestDay(dayPick) ? dayPick : undefined;
  // MD+1 is minutes-gated: a chosen method is honoured ONLY for the LOW tier (DNP /
  // <30 min), where MD+1 is a real strength stimulus. For a player who PLAYED (high /
  // moderate / unknown), post-match recovery is mandatory, so the chosen method is
  // IGNORED and the minutes-aware recovery template stands. Every other day: unguarded.
  const md1AllowsStructure = snap.mdContext !== "MD+1" || md1Tier === "low";
  // Explicit coach choice, only if allowed for the day (and, on MD+1, only for the low tier).
  const chosen = chosenRaw && md1AllowsStructure && (STRUCTURES_ALLOWED_BY_MD[snap.mdContext] ?? []).includes(chosenRaw) ? chosenRaw : undefined;
  // The method scheduled for the day = the coach's choice, else the day's default.
  let effective: StructureKey | undefined = chosen ?? (individualised ? dayDefault : undefined);
  // Readiness downgrade: a YELLOW player (MODIFIED / REDUCED verdict) steps the
  // method DOWN one rung (French contrast → Contrast). Green keeps it; RED is
  // already emptied to recovery by the adaptation rules. Set-reduction still
  // applies on top of whatever method results.
  const yellow = snap.verdict === "MODIFIED" || snap.verdict === "REDUCED";
  let downgradedFrom: StructureKey | undefined;
  if (individualised && effective && yellow && !noReadinessDowngrade) {
    const lower = readinessDowngrade(effective, snap.mdContext);
    if (lower && lower !== effective) { downgradedFrom = effective; effective = lower; }
  }
  // Build the structure only when the effective method differs from the day's
  // built-in template method; otherwise the (richer) template stands.
  const structureBlocks = effective && effective !== dayDefault ? buildStructuredBlocks(effective, snap.mdContext) : null;
  if (structureBlocks && structureBlocks.length > 0 && effective) {
    tmpl = { id: `struct-${effective}-${snap.mdContext}`, blocks: structureBlocks };
  }
  if (!tmpl) return null;

  // Apply adaptation rules (mutates blocks in place). In standard mode the ledger
  // emphases are dropped so the deficit-driven accessories don't fire — readiness /
  // load / soreness rules still apply (they are the MD/readiness tuning, not the
  // per-player individualisation).
  // The trace records what the safety rules did, so the palette below can't undo it.
  // The week rule sets today's heavy lower-body reps from the day's place in the week, before the readiness rules
  // (which may still take sets off). Individualised modes, football only (basketball has no MD week).
  const weekAudit: AppliedAdaptation[] = [];
  const season = weekRuleSeasonOf(snap);
  /** Today's heavy reps by the week rule; null = not a heavy day (or the rule does not run: standard, basketball). */
  let todayHeavyReps: number | null = null;
  /** The near-match day this build is (MD-2 zone or MD-1 zone); null = not a day close to the match. */
  let nearDay: NearMatchDay | null = null;
  let finishNear: (() => void) | null = null;
  if (individualised && !isBasketball) {
    const dayReps = noMatchRule ? noMatchRule.heavyReps : snap.noMatchNearby ? null : matchWeekHeavyReps(snap.mdContext, season);
    todayHeavyReps = dayReps;
    if (dayReps != null) {
      // The coach's reps a set for this day, when set (a week without a match builds as MD-4 / MD-3, so it follows).
      const applied = applyWeekRule(tmpl.blocks, dayReps, snap.mdRepsPerSet?.[snap.mdContext] ?? null, snap.mdContext);
      if (applied) weekAudit.push(weekRuleAudit({ md: snap.mdContext, season, dayReps, applied, noMatch: noMatchRule }));
    }
    const light = noMatchRule ? weekRuleLightAudit(noMatchRule) : null;
    if (light) weekAudit.push(light);
    // Close to the match (and a light day in a week without one): the small fast dose, no heavy lift.
    const noMatchLight = noMatchRule?.kind === "light";
    if (noMatchLight || (!snap.noMatchNearby && (snap.mdContext === "MD-2" || snap.mdContext === "MD-1"))) {
      nearDay = nearMatchDayOf(noMatchLight ? "MD-2" : snap.mdContext);
      const near = applyNearMatchDose(tmpl.blocks, nearDay);
      if (near) {
        // Written again at the end of the build, for the lift that is then in the spot (`finishNear`).
        const said = nearMatchAudit(snap.mdContext, near, noMatchLight, nearMatchLiftOf(tmpl.blocks));
        weekAudit.push(said);
        finishNear = () => Object.assign(said, nearMatchAudit(snap.mdContext, near, noMatchLight, nearMatchLiftOf(tmpl.blocks)));
      }
    }
    // Prevention: Nordic and Copenhagen once a week, each on its own heavy day with the week's reps (never the same
    // eccentric work two days in a row). A team with no weekday plan in a week without a match is left as it was.
    const preventionToday = noMatchRule
      ? noMatchWeekPrevention(snap.todayIso, snap.noMatchWeek, season)
      : snap.noMatchNearby ? null : matchWeekPrevention(snap.mdContext, (d) => isRestDay(snap.mdStructures?.[d]));
    if (preventionToday) {
      const prevention = preventionAudit(snap.mdContext, applyPreventionRule(tmpl.blocks, preventionToday), !!noMatchRule);
      if (prevention) weekAudit.push(prevention);
    }
  }

  const trace = newAdaptationTrace();
  const audit = applyAdaptationRules(tmpl.blocks, individualised ? snap : { ...snap, ledgerEmphases: [] }, trace);
  audit.unshift(...weekAudit);

  // Substitute the coach's team palette into the power/strength slots (individualised
  // mode only). Symmetry chooses uni vs bi lower-body. Runs after adaptation (so the
  // dose is already MD/readiness-tuned) and before coach overrides (coach's last word).
  if (individualised && snap.teamPalette) {
    audit.push(...applyTeamPalette(tmpl.blocks, snap.teamPalette, snap, trace));
  }

  // The player's own strength goal: +1 set of the matching exercise on the goal's days (individualised only).
  // After the team list (which keeps the template dose), before the coach's manual swaps (coach's last word).
  // The player's 8-week goal plan, session B (gym): in pre-/off-season its lifts take the place of the matching team
  // exercises on the day the plan places it. Before the strength goal, so that +1 set skips a goal-plan lift.
  // The upper-body block is built here (it reads only the team list, the picks and today's safety rules) so the goal's
  // lower-body lift can take one of its spots; it is put in the session further down, after the coach's swaps.
  // MD+1 HIGH (played 60+) has its own upper block; a red / hold day has none.
  const upper = individualised && md1Tier !== "high" && snap.verdict !== "RECOVERY" && snap.verdict !== "HOLD"
    ? buildUpperBody(snap, md1Tier, trace)
    : null;
  if (individualised) {
    audit.push(...applyGoalPlanGym(tmpl.blocks, snap, (id) => safetyRulesOut(id, trace), (id) => trace.pinned.has(id), upper ? [upper.block] : [], { dayHeavyReps: todayHeavyReps }));
    // The week rule's give-back: on the week's other heavy day, the sets the goal day could not hold.
    const owed = goalGiveBackOwed(snap, todayHeavyReps, season, upper?.block ?? null);
    if (owed.length) {
      audit.push(...applyGoalGiveBack(tmpl.blocks, snap, owed, (id) => safetyRulesOut(id, trace), (id) => trace.pinned.has(id), upper ? [upper.block] : [], todayHeavyReps));
    }
  }
  // Close to the match: the fast lift's dose is written again for the lift the team list put there (its load line,
  // and the day's bar-speed zone on a lift with a bar), then a player on an 8-week goal gets the goal's lift there.
  if (nearDay) {
    finishNearMatch(tmpl.blocks, nearDay);
    audit.push(...applyGoalNearMatch(tmpl.blocks, snap, (id) => safetyRulesOut(id, trace), (id) => trace.pinned.has(id), nearDay));
    finishNear?.();
  }
  if (individualised) {
    audit.push(...applyPlayerGoal(tmpl.blocks, snap, (id) => safetyRulesOut(id, trace), (id) => trace.pinned.has(id)));
  }

  if (noMatchKind) {
    const wd = weekdayOf(snap.todayIso);
    const k = NO_MATCH_DAY_LABEL[noMatchKind];
    const method = effective ? STRUCTURE_LABEL[effective] : null;
    audit.push({
      ruleId: "NO_MATCH_WEEK_DAY",
      triggerEN: `No match this week: ${wd ? WEEKDAY_LABEL[wd].en : "today"} is set as a ${k.en.toLowerCase()}`,
      triggerIS: `Enginn leikur í vikunni: ${wd ? WEEKDAY_LABEL[wd].is : "dagurinn"} er stilltur sem ${k.is.toLowerCase()}`,
      actionEN: `Built with the ${snap.mdContext} setup${method ? ` (${method.en})` : ""}, then tuned to today.`,
      actionIS: `Sett upp eftir ${snap.mdContext} uppsetningunni${method ? ` (${method.is})` : ""} og stillt að deginum.`,
      evidence: "The coach's weekday plan for weeks without a match (Structure per MD day). Which day is strength, power or light is the coach's call, not from a study.",
    });
  }

  if (downgradedFrom && effective) {
    const from = STRUCTURE_LABEL[downgradedFrom];
    const to = STRUCTURE_LABEL[effective];
    audit.push({
      ruleId: "STRUCTURE_READINESS_DOWNGRADE",
      triggerEN: `Today's check-in: yellow (${snap.mdContext}, planned ${from.en})`,
      triggerIS: `Innskráning í dag: gul (${snap.mdContext}, áætlað ${from.is})`,
      actionEN: `Stepped the method down from ${from.en} to ${to.en} — lower neural/coordination demand for a day the player isn't fully recovered.`,
      actionIS: `Lækkaði aðferðina úr ${from.en} í ${to.en} — minna tauga-/samhæfingarálag þegar leikmaður er ekki fullendurheimtur.`,
      evidence: "Readiness-driven method downgrade — same principle as the set-reduction: reduce demand when the athlete is under-recovered.",
    });
  } else if (structureBlocks && structureBlocks.length > 0 && chosen && chosen !== dayDefault) {
    const label = STRUCTURE_LABEL[chosen];
    audit.push({
      ruleId: "STRUCTURE_APPLIED",
      triggerEN: `Coach chose ${label.en} for ${snap.mdContext}`,
      triggerIS: `Þjálfari valdi ${label.is} fyrir ${snap.mdContext}`,
      actionEN: `Laid the session out as ${label.en} (instead of the default ${snap.mdContext} method), then tuned it to today.`,
      actionIS: `Setti æfinguna upp sem ${label.is} (í stað sjálfgefinnar ${snap.mdContext} aðferðar) og stillti að deginum.`,
      evidence: "Coach-selected training structure per MD day — the method is the coach's call; the dose still follows the taper + readiness.",
    });
  }

  // Apply coach manual overrides AFTER the engine. Coach has final word.
  const overridesApplied = applyCoachOverrides(tmpl.blocks, coachOverrides, snap.mdContext);
  if (overridesApplied > 0) {
    audit.push({
      ruleId: "COACH_OVERRIDE_APPLIED",
      triggerEN: `${overridesApplied} manual swap${overridesApplied === 1 ? "" : "s"}`,
      triggerIS: `${overridesApplied} handvirk skipti`,
      actionEN: "Coach manually swapped exercise(s) — preserved as-is",
      actionIS: "Þjálfari skipti á æfingu(m) handvirkt — varðveitt",
      evidence: "Coach has final authority — engine recommendations are decision support, not prescriptions.",
    });
  }

  // Upper-body block (individualised only) — sport + season-phase gated, from the
  // team palette. Basketball = primary, football = pre-season accessory. On MD+1
  // the minutes tier decides: HIGH (played 60+) → upper is the day's strength
  // stimulus (fresh tissue); LOW (DNP / <30) → the normal season-gated add, unless
  // the session was recovery-stripped for a non-load reason (illness etc.).
  if (individualised) {
    if (md1Tier === "high") {
      // HOLD still strips (Rule 10); RECOVERY at 60+ min keeps the fresh-upper add.
      if (snap.verdict !== "HOLD") audit.push(...appendMdPlus1UpperStrength(tmpl.blocks, snap, trace));
    } else {
      // Built above (`upper`). MD+1 LOW: a DNP / <30 min player flagged RECOVERY/HOLD for a non-load reason (illness
      // etc.) is genuinely recovery-stripped — no upper block on top. Red check-in = warm-up and mobility only: no
      // upper-body lift either (coach's call, 2026-11-18).
      audit.push(...appendUpperBody(tmpl.blocks, upper));
    }
  }

  // Strip empty blocks (where rules removed everything).
  const blocks = tmpl.blocks.filter((b) => b.exercises.length > 0);
  const blocked = blockedIds(trace);

  const summary = buildSummary(blocks, snap, audit.length);

  // Merge the screen-driven correctives as the session's FRONT block (serialized by
  // strengthSessionToTodayStructure). Low-load activation/mobility — NOT readiness
  // set-reduced (like the isometric primer). De-dup vs the ledger emphases: where a
  // corrective corroborates an emphasis the strength blocks already add, keep it and
  // RECORD the corroboration (CONFIRM), don't drop or double-count.
  const correctives = individualised ? (snap.correctives ?? []) : [];
  if (!individualised) {
    audit.push({
      ruleId: "STANDARD_MODE",
      triggerEN: "Send mode: standard (coach choice)",
      triggerIS: "Sendingar-hamur: staðlað (val þjálfara)",
      actionEN: "MD template, readiness- and MD-tuned — the per-player screen corrective + deficit-ledger emphases were not applied (standard mode).",
      actionIS: "MD-sniðmát, readiness- og MD-stillt — per-leikmanns skimunar-corrective + halla-áherslur ekki beitt (staðlaður hamur).",
      evidence: "Coach chose the standard squad session over the individualised (data + screen) build.",
    });
  }
  if (correctives.length > 0) {
    const corroborated = (snap.correctiveEmphases ?? []).filter((e) => (snap.ledgerEmphases ?? []).includes(e));
    audit.push(corroborated.length > 0
      ? {
          ruleId: "CORRECTIVE_CORROBORATES_EMPHASIS",
          triggerEN: `Corrective block + a matching strength emphasis (${corroborated.join(", ")})`,
          triggerIS: `Corrective blokk + samsvarandi styrktar-áhersla (${corroborated.join(", ")})`,
          actionEN: "Kept the corrective (movement-quality) alongside the strength emphasis and recorded the corroboration — one session, no double-count.",
          actionIS: "Hélt corrective (hreyfigæði) samhliða styrktar-áherslunni og skráði samræmið — ein æfing, ekkert tvítalið.",
          evidence: "Two consumers, one reconciled ledger — corrective = movement-quality; strength = force-quality (see Total Player Analysis).",
        }
      : {
          ruleId: "CORRECTIVE_MERGED",
          triggerEN: `${correctives.length} screen-driven corrective${correctives.length === 1 ? "" : "s"}`,
          triggerIS: `${correctives.length} corrective úr hreyfiskimun`,
          actionEN: "Merged the movement-screen corrective as the session's front activation/mobility block — not readiness-reduced.",
          actionIS: "Bætti hreyfiskimunar-corrective við sem fremstu virkjunar/liðkunar blokk — ekki readiness-minnkað.",
          evidence: "Corrective (movement-quality) + strength (force-quality) are the two consumers of one reconciled ledger.",
        });
  }

  return {
    playerId: snap.playerId,
    playerName: snap.playerName,
    mdContext: snap.mdContext,
    contextLabel: isBasketball ? "Strength" : noMatchKind ? NO_MATCH_DAY_LABEL[noMatchKind].en : snap.mdContext,
    templateId: tmpl.id,
    durationMin: estimateDuration(blocks),
    vbtAutoRegulated: snap.vbtDecrement != null,
    isCompressed: false, // microdose is the only mode — flag retained for type compat
    blocks,
    appliedAdaptations: audit,
    summaryEN: summary.en,
    summaryIS: summary.is,
    confidence: computeConfidence(snap),
    correctives: correctives.length > 0 ? correctives : undefined,
    // Restrict swaps to the coach's chosen pool in BOTH modes. The palette only
    // BUILDS the session in individualised mode, but it is the team's approved
    // exercise set, so it governs swaps for a standard session too — a player is
    // never offered an exercise the coach didn't approve.
    teamPalette: snap.teamPalette,
    // The per-MD Off/lift map — so the meso layer can equate the weekly volume onto the
    // traditional lift days (the dropped Off days' volume is piled onto the lift days).
    mdStructures: snap.mdStructures,
    // What today's safety rules rule out — the serializer keeps these out of the swap options.
    blockedExerciseIds: blocked.length > 0 ? blocked : undefined,
  };
}
