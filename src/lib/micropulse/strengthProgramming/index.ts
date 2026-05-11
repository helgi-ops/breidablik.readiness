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
  MdContext,
  PlayerStrengthSnapshot,
  SessionBlock,
  StrengthSession,
} from "./types";
import { buildMd4Strength } from "./mdTemplates/md4Strength";
import { buildMd3Power } from "./mdTemplates/md3Power";
import { buildMd2Activation } from "./mdTemplates/md2Activation";
import { buildMd1Primer } from "./mdTemplates/md1Primer";
import { buildMdPlus1Recovery } from "./mdTemplates/mdPlus1Recovery";
import { applyAdaptationRules } from "./adaptationRules";
import { getExercise as lookupExercise } from "./exerciseLibrary";

export * from "./types";
export { EXERCISE_LIBRARY, EXERCISES_BY_ID, getExercise, getExercisesByCategory } from "./exerciseLibrary";
export { applyAdaptationRules } from "./adaptationRules";

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
    // MD+2, OFF — return null (no team strength session)
    default:
      return null;
  }
}

/** Estimate total duration from blocks. */
function estimateDuration(blocks: SessionBlock[]): number {
  // Rough heuristic: 5 min PREP, 5-15 min per main block, 5 min MOBILITY.
  // We compute from exercises × sets, using ~1.5 min per set + rest.
  let total = 0;
  for (const block of blocks) {
    if (block.type === "PREP") total += 6;
    else if (block.type === "MOBILITY") total += 5;
    else {
      for (const ex of block.exercises) {
        // Time per set ≈ rep duration (~30s) + rest (parsed crudely)
        const setTime = 0.5; // 30s of work
        const restMatch = ex.dose.rest.match(/(\d+)\s*(min|s)/i);
        const restMin = restMatch ? (restMatch[2].toLowerCase().startsWith("m") ? Number(restMatch[1]) : Number(restMatch[1]) / 60) : 1;
        total += ex.dose.sets * (setTime + restMin);
      }
    }
  }
  return Math.round(total);
}

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

  return {
    en: `${snap.mdContext} session · ${totalEx} exercises · ~${dur} min${adaptStr}.`,
    is: `${snap.mdContext} æfing · ${totalEx} æfingar · ~${dur} mín${adaptStrIs}.`,
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

/** Main entry — build a complete strength session for one player.
 *  `coachOverrides` is optional and applied after adaptation rules so the
 *  coach has the final word over any engine substitution. */
export function buildStrengthSession(
  snap: PlayerStrengthSnapshot,
  coachOverrides: CoachOverride[] = [],
): StrengthSession | null {
  // Block when MD context isn't a strength day.
  const isStrengthDay = ["MD-4", "MD-3", "MD-2", "MD-1", "MD+1"].includes(snap.mdContext);
  if (!isStrengthDay) return null;

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

  const tmpl = pickTemplate(snap.mdContext);
  if (!tmpl) return null;

  // Apply adaptation rules (mutates blocks in place).
  const audit = applyAdaptationRules(tmpl.blocks, snap);

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

  // Strip empty blocks (where rules removed everything).
  const blocks = tmpl.blocks.filter((b) => b.exercises.length > 0);

  const summary = buildSummary(blocks, snap, audit.length);

  return {
    playerId: snap.playerId,
    playerName: snap.playerName,
    mdContext: snap.mdContext,
    templateId: tmpl.id,
    durationMin: estimateDuration(blocks),
    vbtAutoRegulated: snap.vbtDecrement != null,
    isCompressed: false, // microdose is the only mode — flag retained for type compat
    blocks,
    appliedAdaptations: audit,
    summaryEN: summary.en,
    summaryIS: summary.is,
    confidence: computeConfidence(snap),
  };
}
