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
import {
  slotForCategory,
  PALETTE_UNILATERAL_ASYMMETRY_PCT,
  type PaletteSlot,
  type PaletteSlots,
} from "./palette";
import { DEFAULT_STRUCTURE_BY_MD, STRUCTURES_ALLOWED_BY_MD, STRUCTURE_LABEL, readinessDowngrade, type StructureKey } from "./structures";
import { buildStructuredBlocks } from "./structureBuilders";

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

/** Substitute the coach's team palette into the template's power/strength slots.
 *  The engine keeps the TEMPLATE's MD-tuned dose (periodisation stays intact) and
 *  only swaps WHICH exercise fills each slot to the coach's chosen pool. Symmetry
 *  read: for the lower-body strength slot the engine picks the UNILATERAL pool when
 *  the player is asymmetric (loads the weaker side) and the BILATERAL pool when
 *  symmetric — falling back to the exercise's own slot pool, then to the template
 *  exercise, so a slot is never left empty. Runs in individualised mode only.
 *  Mutates `blocks`; returns the audit entries for what it changed. */
function applyTeamPalette(
  blocks: SessionBlock[],
  palette: PaletteSlots,
  snap: PlayerStrengthSnapshot,
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
  // Per-slot cursor so a second exercise in the same slot takes the coach's second
  // pick (not a duplicate of the first); when the pool is exhausted we leave the
  // template exercise in place.
  const cursor: Partial<Record<PaletteSlot, number>> = {};
  let symmetryDrove = false;

  const pickFrom = (slot: PaletteSlot): string | null => {
    const pool = palette[slot] ?? [];
    const i = cursor[slot] ?? 0;
    if (i >= pool.length) return null;
    cursor[slot] = i + 1;
    return pool[i];
  };

  for (const block of blocks) {
    for (let p = 0; p < block.exercises.length; p++) {
      const ex = block.exercises[p];
      const nativeSlot = slotForCategory(ex.category);
      // Only the power + lower-body strength categories map to a slot. PREP / ISO /
      // MOBILITY and the injury-prevention posterior/adductor block (Nordic van Dyk,
      // Copenhagen Harøy — non-negotiable) own no slot, so they are never substituted.
      if (!nativeSlot) continue;

      // Lower-body strength: the SYMMETRY read chooses which pool fills the slot —
      // unilateral when the player is asymmetric (loads the weaker side), bilateral
      // when symmetric. No cross-pool fallback: if the chosen pool is empty we leave
      // the exercise the template/adaptation put there (the adaptation engine already
      // swaps to a unilateral lift on CoD asymmetry — we must not undo that with a
      // bilateral pick). Non-lower slots (power) just take their own pool.
      let chosenId: string | null;
      let usedSlot: PaletteSlot;
      if (nativeSlot === "bilateral_strength" || nativeSlot === "unilateral_strength") {
        usedSlot = preferUnilateral ? "unilateral_strength" : "bilateral_strength";
        chosenId = pickFrom(usedSlot);
        if (chosenId && preferUnilateral && usedSlot === "unilateral_strength") symmetryDrove = true;
      } else {
        usedSlot = nativeSlot;
        chosenId = pickFrom(nativeSlot);
      }
      if (!chosenId || chosenId === ex.exerciseId) continue;

      let newEx;
      try { newEx = lookupExercise(chosenId); } catch { continue; }
      // Keep the template's MD-tuned dose; fall back to the new exercise's own default.
      const dose = ex.dose ?? newEx.defaultDosing[snap.mdContext];
      if (!dose) continue;
      block.exercises[p] = {
        exerciseId: newEx.id,
        nameEN: newEx.nameEN,
        nameIS: newEx.nameIS,
        category: newEx.category,
        dose,
        modificationReason: usedSlot === "unilateral_strength" && symmetryDrove
          ? `Team palette (unilateral — ${asym?.toFixed(0)}% L/R asymmetry, ${asymSource})`
          : "Team palette (coach's chosen pool)",
        rationale: newEx.evidence,
      };
    }
  }

  const swaps = Object.values(cursor).reduce((s, n) => s + (n ?? 0), 0);
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

/** Main entry — build a complete strength session for one player.
 *  `coachOverrides` is optional and applied after adaptation rules so the
 *  coach has the final word over any engine substitution. */
export function buildStrengthSession(
  snap: PlayerStrengthSnapshot,
  coachOverrides: CoachOverride[] = [],
  opts: { mode?: "individualised" | "standard" } = {},
): StrengthSession | null {
  // Send mode. "individualised" (default) = data + screen driven: the MD template,
  // readiness/MD-tuned, PLUS the player's screen corrective block + deficit-ledger
  // emphases + F-V driver. "standard" = the same MD template, still readiness/MD-
  // tuned, but WITHOUT those per-player layers (a clean squad session). Both honour
  // week-setup (MD) + readiness (verdict/wellness); "standard" just skips the
  // individualisation. The coach chooses (team default, per-send override).
  const individualised = opts.mode !== "standard";

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

  // Template selection. In individualised mode, if the coach chose a NON-default
  // method for this (configurable) MD day, lay that method out instead of the
  // built-in template; the palette / adaptation / override pipeline then runs on it
  // exactly as it does for a template. Every other case → the built-in template,
  // byte-identical to before (default fast-path, standard mode, unconfigurable days).
  let tmpl = pickTemplate(snap.mdContext);
  const dayDefault = DEFAULT_STRUCTURE_BY_MD[snap.mdContext];
  const chosenRaw = individualised ? snap.mdStructures?.[snap.mdContext] : undefined;
  // Explicit coach choice, only if allowed for the day.
  const chosen = chosenRaw && (STRUCTURES_ALLOWED_BY_MD[snap.mdContext] ?? []).includes(chosenRaw) ? chosenRaw : undefined;
  // The method scheduled for the day = the coach's choice, else the day's default.
  let effective: StructureKey | undefined = chosen ?? (individualised ? dayDefault : undefined);
  // Readiness downgrade: a YELLOW player (MODIFIED / REDUCED verdict) steps the
  // method DOWN one rung (French contrast → Contrast). Green keeps it; RED is
  // already emptied to recovery by the adaptation rules. Set-reduction still
  // applies on top of whatever method results.
  const yellow = snap.verdict === "MODIFIED" || snap.verdict === "REDUCED";
  let downgradedFrom: StructureKey | undefined;
  if (individualised && effective && yellow) {
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
  const audit = applyAdaptationRules(tmpl.blocks, individualised ? snap : { ...snap, ledgerEmphases: [] });

  // Substitute the coach's team palette into the power/strength slots (individualised
  // mode only). Symmetry chooses uni vs bi lower-body. Runs after adaptation (so the
  // dose is already MD/readiness-tuned) and before coach overrides (coach's last word).
  if (individualised && snap.teamPalette) {
    audit.push(...applyTeamPalette(tmpl.blocks, snap.teamPalette, snap));
  }

  if (downgradedFrom && effective) {
    const from = STRUCTURE_LABEL[downgradedFrom];
    const to = STRUCTURE_LABEL[effective];
    audit.push({
      ruleId: "STRUCTURE_READINESS_DOWNGRADE",
      triggerEN: `Yellow readiness on ${snap.mdContext} (planned ${from.en})`,
      triggerIS: `Gul readiness á ${snap.mdContext} (áætlað ${from.is})`,
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

  // Strip empty blocks (where rules removed everything).
  const blocks = tmpl.blocks.filter((b) => b.exercises.length > 0);

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
  };
}
