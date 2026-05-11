/**
 * Adaptation Rules — Per-player exercise-level modifications
 *
 * Each rule reads a `PlayerStrengthSnapshot` and conditionally:
 *   • Removes an exercise (contraindication)
 *   • Swaps an exercise for an evidence-based alternative
 *   • Adds an exercise (e.g. asymmetry-driven extra set)
 *   • Reduces dose
 *
 * Rules are run in order: each rule can read the current blocks and either
 * mutate them or skip. Audit trail (AppliedAdaptation[]) captures what
 * fired and why, surfaced in the UI tooltip ("Why this swap?").
 *
 * Evidence base for each rule is documented in the rule itself.
 */

import type {
  SessionBlock,
  PrescribedExercise,
  AppliedAdaptation,
  PlayerStrengthSnapshot,
  ContraIndication,
} from "./types";
import { getExercise } from "./exerciseLibrary";

/** Helper — find first matching exercise in any block. */
function findExerciseByCategory(
  blocks: SessionBlock[],
  category: PrescribedExercise["category"],
): { block: SessionBlock; idx: number } | null {
  for (const block of blocks) {
    const idx = block.exercises.findIndex((e) => e.category === category);
    if (idx >= 0) return { block, idx };
  }
  return null;
}

/** Helper — swap a prescribed exercise in-place. */
function swapExercise(
  blocks: SessionBlock[],
  fromId: string,
  toId: string,
  modificationReason: string,
): boolean {
  for (const block of blocks) {
    const idx = block.exercises.findIndex((e) => e.exerciseId === fromId);
    if (idx < 0) continue;
    const newEx = getExercise(toId);
    const oldDose = block.exercises[idx].dose;
    // Keep the original dose but use new exercise's metadata
    block.exercises[idx] = {
      exerciseId: newEx.id,
      nameEN: newEx.nameEN,
      nameIS: newEx.nameIS,
      category: newEx.category,
      dose: oldDose,
      modificationReason,
      rationale: newEx.evidence,
    };
    return true;
  }
  return false;
}

/** Helper — remove a prescribed exercise. */
function removeExercise(
  blocks: SessionBlock[],
  exerciseId: string,
): boolean {
  for (const block of blocks) {
    const idx = block.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (idx < 0) continue;
    block.exercises.splice(idx, 1);
    return true;
  }
  return false;
}

/** Helper — duplicate an exercise into a block as an extra set with a reason. */
function addExtraSet(
  blocks: SessionBlock[],
  blockId: string,
  exerciseId: string,
  reason: string,
): boolean {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return false;
  const ex = getExercise(exerciseId);
  const baseDose = ex.defaultDosing["MD-4"] ?? ex.defaultDosing["MD-3"];
  if (!baseDose) return false;
  block.exercises.push({
    exerciseId: ex.id,
    nameEN: ex.nameEN,
    nameIS: ex.nameIS,
    category: ex.category,
    dose: { ...baseDose, sets: 1, reps: baseDose.reps, intensity: baseDose.intensity, rest: baseDose.rest },
    isAdaptiveAddition: true,
    modificationReason: reason,
    rationale: ex.evidence,
  });
  return true;
}

/** Helper — reduce sets on the first exercise of a given category by a ratio. */
function reduceVolume(
  blocks: SessionBlock[],
  category: PrescribedExercise["category"],
  ratio: number,
  reason: string,
): boolean {
  const hit = findExerciseByCategory(blocks, category);
  if (!hit) return false;
  const ex = hit.block.exercises[hit.idx];
  const newSets = Math.max(1, Math.round(ex.dose.sets * ratio));
  if (newSets === ex.dose.sets) return false;
  hit.block.exercises[hit.idx] = {
    ...ex,
    dose: { ...ex.dose, sets: newSets },
    modificationReason: reason,
  };
  return true;
}

/** Build the contraindication set from snapshot data. */
function buildContraindications(snap: PlayerStrengthSnapshot): Set<ContraIndication> {
  const out = new Set<ContraIndication>();

  if (snap.injuryStatus === "injured" || snap.injuryStatus === "rehabilitation") {
    // All structural — no team strength session
    out.add("hamstring_injury"); // covers most; actual rule below blocks the session
  }

  if (snap.decelBurdenHighStreakDays >= 3) out.add("high_decel_burden");
  if (snap.vbtDecrement != null && snap.vbtDecrement <= -0.20) out.add("vbt_suppressed");
  if (snap.sprintSpeedDropPct != null && snap.sprintSpeedDropPct >= 7) out.add("sprint_speed_dropped");

  // Sore areas from wellness questionnaire (free-text but kerfið normaliserar)
  for (const area of snap.wellness.soreAreas) {
    const key = area.toLowerCase();
    if (key.includes("hamstring")) out.add("sore_hamstrings");
    if (key.includes("lower_back") || key.includes("lower back") || key.includes("mjóhrygg")) out.add("sore_lower_back");
    if (key.includes("quad") || key.includes("lær")) out.add("sore_quads");
    if (key.includes("groin") || key.includes("nár")) out.add("sore_groin");
  }

  // Heavy soreness (1-5 scale; 1-2 = sore)
  if (snap.wellness.muscleSoreness != null && snap.wellness.muscleSoreness <= 2) {
    // Generic soreness — engine adds caution but doesn't pinpoint area
    // Other rules will catch specific areas above
  }

  return out;
}

/** Apply all adaptation rules in order. Returns audit trail. */
export function applyAdaptationRules(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
): AppliedAdaptation[] {
  const audit: AppliedAdaptation[] = [];
  const contras = buildContraindications(snap);

  // ── RULE 1: Injury — block session entirely ──────────────────────────
  // The session builder should NOT call this engine for actively injured
  // players; it produces a rehab-only stub instead. We still log.
  if (snap.injuryStatus === "injured" || snap.injuryStatus === "rehabilitation") {
    audit.push({
      ruleId: "INJURY_BLOCK",
      triggerEN: `Active injury status (${snap.injuryStatus})`,
      triggerIS: `Virkur meiðslastatus (${snap.injuryStatus})`,
      actionEN: "Team strength session blocked — physio rehab program only.",
      actionIS: "Team styrktaræfing blokkuð — physio rehab plan eingöngu.",
      evidence: "RTP consensus — no high-load training before physio clearance.",
    });
    return audit;
  }

  // ── RULE 2: Sore hamstrings — drop Nordic, swap to long iso ham ──────
  // Evidence: Nordic adds eccentric load; on sore tissue → swap to iso
  // long-duration hamstring bridge (Lim 2020).
  if (contras.has("sore_hamstrings") || contras.has("hamstring_injury")) {
    if (swapExercise(blocks, "ex_nordic_curl", "ex_iso_ham_bridge_long",
        "Swapped from Nordic — sore hamstrings (eccentric load contraindicated)")) {
      audit.push({
        ruleId: "SORE_HAM_NORDIC_SWAP",
        triggerEN: "Sore hamstrings",
        triggerIS: "Sárindi í hamstring",
        actionEN: "Nordic curl → Long iso hamstring bridge",
        actionIS: "Nordic curl → Lang iso hamstring bridge",
        evidence: "Eccentric contraindicated on sore tissue; iso adaptations preserved (Lim 2020).",
      });
    }
    // Also drop B-stance RDL if present (also hinge-heavy on hamstrings)
    if (removeExercise(blocks, "ex_b_stance_rdl")) {
      audit.push({
        ruleId: "SORE_HAM_RDL_REMOVE",
        triggerEN: "Sore hamstrings",
        triggerIS: "Sárindi í hamstring",
        actionEN: "Removed B-stance RDL (additional hinge load)",
        actionIS: "Fjarlægði B-stance RDL (auka hinge álag)",
        evidence: "Multiple hinge exposures compound hamstring strain risk when sore.",
      });
    }
  }

  // ── RULE 3: High decel burden — reduce eccentric volume ──────────────
  // Evidence: McBurnie 2022 — eccentric load accumulates fatigue; 3+ HIGH
  // days indicates need for concentric-dominant work.
  if (contras.has("high_decel_burden")) {
    // Drop Nordic if still present
    if (removeExercise(blocks, "ex_nordic_curl")) {
      audit.push({
        ruleId: "DECEL_BURDEN_NORDIC_REMOVE",
        triggerEN: `Decel burden HIGH ${snap.decelBurdenHighStreakDays} days`,
        triggerIS: `Decel burden HIGH ${snap.decelBurdenHighStreakDays} dagar`,
        actionEN: "Removed Nordic — eccentric overload risk",
        actionIS: "Fjarlægði Nordic — eccentric ofálag",
        evidence: "Eccentric overload signal — concentric work preferred (McBurnie 2022).",
      });
    }
    // Swap trap-bar DL → hip thrust (eliminates eccentric)
    if (swapExercise(blocks, "ex_trap_bar_dl", "ex_hip_thrust",
        "Swapped from Trap-bar DL — decel burden HIGH (concentric-dominant preferred)")) {
      audit.push({
        ruleId: "DECEL_BURDEN_DL_SWAP",
        triggerEN: `Decel burden HIGH ${snap.decelBurdenHighStreakDays} days`,
        triggerIS: `Decel burden HIGH ${snap.decelBurdenHighStreakDays} dagar`,
        actionEN: "Trap-bar DL → Hip thrust (concentric-dominant)",
        actionIS: "Trap-bar DL → Hip thrust (concentric)",
        evidence: "Concentric hip extension maintains posterior chain stim without eccentric load.",
      });
    }
  }

  // ── RULE 4: Sprint Speed Drop > 7% — swap dynamic explosive → iso ────
  // Evidence: Edouard 2019 — speed drop indicates mechanical fatigue.
  // Max-velocity work elevates hamstring injury risk; use iso (same joint
  // angle, no max-velocity demand).
  if (contras.has("sprint_speed_dropped")) {
    if (swapExercise(blocks, "ex_mid_thigh_pull_dynamic", "ex_imtp_iso",
        `Swapped from dynamic mid-thigh pull — sprint speed dropped ${snap.sprintSpeedDropPct?.toFixed(1)}% vs peak`)) {
      audit.push({
        ruleId: "SPRINT_DROP_MTP_SWAP",
        triggerEN: `Sprint speed −${snap.sprintSpeedDropPct?.toFixed(1)}% vs peak`,
        triggerIS: `Sprintkraftur −${snap.sprintSpeedDropPct?.toFixed(1)}% vs hámark`,
        actionEN: "Dynamic mid-thigh pull → IMTP (iso, same joint angle)",
        actionIS: "Dynamic mid-thigh pull → IMTP (kyrr, sama liðshorn)",
        evidence: "Iso preserves RFD stim without max-velocity hamstring risk (Comfort 2018).",
      });
    }
    // Drop depth jump and single-leg box jump (high-velocity SSC)
    if (removeExercise(blocks, "ex_depth_jump")) {
      audit.push({
        ruleId: "SPRINT_DROP_PLYO_REMOVE",
        triggerEN: `Sprint speed −${snap.sprintSpeedDropPct?.toFixed(1)}%`,
        triggerIS: `Sprintkraftur −${snap.sprintSpeedDropPct?.toFixed(1)}%`,
        actionEN: "Removed depth jump (max-velocity SSC)",
        actionIS: "Fjarlægði depth jump (max-velocity SSC)",
        evidence: "High-velocity SSC contraindicated when speed expression is suppressed.",
      });
    }
  }

  // ── RULE 5: VBT suppressed — reduce load on main lifts ───────────────
  // Evidence: Pareja-Blanco 2017 — VBT decrement > 20% indicates neural
  // suppression. Drop load% by 5-7% (or one RPE point) but keep volume.
  if (contras.has("vbt_suppressed")) {
    const hit = findExerciseByCategory(blocks, "COMPOUND_STRENGTH");
    if (hit) {
      const ex = hit.block.exercises[hit.idx];
      const newIntensity = ex.dose.intensity.includes("RPE")
        ? "RPE 7 (was RPE 8)"
        : ex.dose.intensity.replace(/\d+/, (n) => String(Math.max(60, Number(n) - 7)));
      hit.block.exercises[hit.idx] = {
        ...ex,
        dose: { ...ex.dose, intensity: newIntensity },
        modificationReason: `Load reduced — VBT decrement ${(snap.vbtDecrement! * 100).toFixed(0)}%`,
      };
      audit.push({
        ruleId: "VBT_LOAD_REDUCTION",
        triggerEN: `VBT velocity ${(snap.vbtDecrement! * 100).toFixed(0)}% below baseline`,
        triggerIS: `VBT hraði ${(snap.vbtDecrement! * 100).toFixed(0)}% undir baseline`,
        actionEN: "Main lift load reduced ~7% (volume preserved)",
        actionIS: "Aðallyfta lækkuð um ~7% (volume haldið)",
        evidence: "VBT auto-regulation — neural readiness drives load (Pareja-Blanco 2017).",
      });
    }
  }

  // ── RULE 6: CoD L/R asymmetry > 15% — swap main lift to unilateral ───
  // Evidence: Bishop 2020 — high-tier CoD asymmetry → 3× non-contact
  // injury risk. In the microdose template there's no standalone
  // unilateral block, so we swap the main compound lift to a unilateral
  // alternative (Bulgarian SS) and instruct the coach to anchor the
  // weaker side first. Keeps the 20-min budget intact while still
  // delivering the asymmetry-correction stimulus.
  if (snap.codAsymmetryPct != null && snap.codAsymmetryPct >= 15) {
    const swappedDl = swapExercise(blocks, "ex_trap_bar_dl", "ex_bulgarian_ss",
      `Swapped to unilateral — L/R CoD asymmetry ${snap.codAsymmetryPct.toFixed(1)}%. Anchor weaker ${snap.codWeakerSide ?? "?"} side first.`);
    const swappedBackSq = swappedDl
      ? false
      : swapExercise(blocks, "ex_back_squat", "ex_bulgarian_ss",
          `Swapped to unilateral — L/R CoD asymmetry ${snap.codAsymmetryPct.toFixed(1)}%. Anchor weaker ${snap.codWeakerSide ?? "?"} side first.`);
    const swappedFrontSq = (swappedDl || swappedBackSq)
      ? false
      : swapExercise(blocks, "ex_front_squat", "ex_bulgarian_ss",
          `Swapped to unilateral — L/R CoD asymmetry ${snap.codAsymmetryPct.toFixed(1)}%. Anchor weaker ${snap.codWeakerSide ?? "?"} side first.`);
    if (swappedDl || swappedBackSq || swappedFrontSq) {
      audit.push({
        ruleId: "COD_ASYM_MAIN_LIFT_SWAP",
        triggerEN: `L/R CoD asymmetry ${snap.codAsymmetryPct.toFixed(1)}%`,
        triggerIS: `L/R CoD ósamhverfa ${snap.codAsymmetryPct.toFixed(1)}%`,
        actionEN: `Main lift → Bulgarian split squat (anchor weaker ${snap.codWeakerSide ?? "?"} side first)`,
        actionIS: `Aðallyfta → Bulgarian split squat (byrja á veikari ${snap.codWeakerSide ?? "?"} fót)`,
        evidence: "Unilateral correction for non-contact injury risk (Bishop 2020).",
      });
    }
  }

  // ── RULE 7: Sprint Exposure UNDERLOAD — emphasize hamstring work ──────
  // Evidence: Malone 2018 — underloaded sprint exposure → 3× hamstring risk.
  // Player needs more posterior chain stim, not less.
  if (snap.sprintExposureBand === "UNDERLOAD") {
    // If Nordic was already removed by another rule, skip; else add extra set
    if (!removeExercise(blocks, "ex_nordic_curl_already_present") &&
        findExerciseByCategory(blocks, "POSTERIOR_CHAIN")) {
      audit.push({
        ruleId: "SPRINT_EXPOSURE_UNDERLOAD",
        triggerEN: "Sprint Exposure UNDERLOAD (< 50% of match demand)",
        triggerIS: "Sprint Exposure UNDERLOAD (< 50% af leikdags-meðaltali)",
        actionEN: "Posterior chain volume preserved — undertraining is the primary risk",
        actionIS: "Aftari keðju volume haldið — undertraining er aðal-áhættan",
        evidence: "3× hamstring risk for undertrained players (Malone 2018).",
      });
    }
  }

  // ── RULE 8: Sore groin — drop Copenhagen ─────────────────────────────
  if (contras.has("sore_groin") || contras.has("groin_injury")) {
    if (removeExercise(blocks, "ex_copenhagen")) {
      audit.push({
        ruleId: "SORE_GROIN_COPENHAGEN_REMOVE",
        triggerEN: "Sore groin / groin injury",
        triggerIS: "Sárindi í nára / nárameiðsl",
        actionEN: "Removed Copenhagen adduction",
        actionIS: "Fjarlægði Copenhagen adduction",
        evidence: "Eccentric adductor work contraindicated on sore tissue.",
      });
    }
  }

  // ── RULE 9: Sore lower back — swap trap-bar DL → front squat ─────────
  if (contras.has("sore_lower_back")) {
    if (swapExercise(blocks, "ex_trap_bar_dl", "ex_front_squat",
        "Swapped from Trap-bar DL — sore lower back (reduces spinal load)")) {
      audit.push({
        ruleId: "SORE_LB_DL_SWAP",
        triggerEN: "Sore lower back",
        triggerIS: "Sárindi í mjóhrygg",
        actionEN: "Trap-bar DL → Front squat (lower spinal compression)",
        actionIS: "Trap-bar DL → Fram-hnébeygja (minni hryggál.)",
        evidence: "Front squat reduces lumbar shear vs hinge patterns (Gullett 2009).",
      });
    }
  }

  // ── RULE 10: Verdict = RECOVERY/HOLD — block strength entirely ───────
  if (snap.verdict === "RECOVERY" || snap.verdict === "HOLD") {
    audit.push({
      ruleId: "VERDICT_BLOCK",
      triggerEN: `Today's verdict: ${snap.verdict}`,
      triggerIS: `Verdict í dag: ${snap.verdict}`,
      actionEN: "Strength session not prescribed — mobility/recovery only.",
      actionIS: "Engin styrktaræfing — mobility/recovery eingöngu.",
      evidence: "Acute readiness override — engine respects daily decision.",
    });
    // Strip out compound + posterior + unilateral; keep prep + mobility
    for (const block of blocks) {
      if (block.type === "PREP" || block.type === "MOBILITY") continue;
      block.exercises = [];
    }
  }

  // ── RULE 11: Verdict = REDUCED/MODIFIED — cut volume 30% ─────────────
  if (snap.verdict === "REDUCED" || snap.verdict === "MODIFIED") {
    let changed = false;
    for (const cat of ["COMPOUND_STRENGTH", "POSTERIOR_CHAIN", "UNILATERAL_STRENGTH"] as const) {
      if (reduceVolume(blocks, cat, 0.7, "Volume reduced 30% — REDUCED verdict")) changed = true;
    }
    if (changed) {
      audit.push({
        ruleId: "VERDICT_REDUCED_VOLUME",
        triggerEN: `Today's verdict: ${snap.verdict}`,
        triggerIS: `Verdict í dag: ${snap.verdict}`,
        actionEN: "Volume reduced 30% across main blocks",
        actionIS: "Volume lækkað um 30% á aðalblokkum",
        evidence: "Volume modulation matches readiness state (Gabbett 2017).",
      });
    }
  }

  // ── RULE 12: Foster Strain HIGH — drop main compound to 2 cluster sets ─
  // Evidence: Foster 1998 — high strain indicates accumulated weekly load.
  // Microdose has no accessory block to cut, so we drop the main compound
  // from 3 cluster sets to 2 (keeping intensity, just trimming volume).
  if (snap.fosterStrain != null && snap.fosterStrain >= 6000) {
    if (reduceVolume(blocks, "COMPOUND_STRENGTH", 0.67,
        `Main lift cut to 2 sets — Foster Strain ${snap.fosterStrain.toFixed(0)} (HIGH)`)) {
      audit.push({
        ruleId: "FOSTER_STRAIN_VOLUME_CUT",
        triggerEN: `Foster Strain ${snap.fosterStrain.toFixed(0)} (HIGH)`,
        triggerIS: `Foster Strain ${snap.fosterStrain.toFixed(0)} (HÁTT)`,
        actionEN: "Main lift trimmed to 2 cluster sets (intensity preserved)",
        actionIS: "Aðallyfta minnkuð í 2 cluster sett (intensitet haldið)",
        evidence: "Strain accumulation marker — preserve intensity, trim volume (Foster 1998).",
      });
    }
  }

  // ── RULE 13: Congested week — inform coach about reduced frequency ───
  // All MicroPulse strength sessions are already micro-dosed (~20 min)
  // so no template swap is needed. The flag is purely informational so
  // the coach knows the engine is aware of the calendar.
  if (snap.isCongestedWeek) {
    audit.push({
      ruleId: "CONGESTED_WEEK_FLAG",
      triggerEN: "Congested week — ≥ 2 matches in 7 days",
      triggerIS: "Þétt vika — ≥ 2 leikir á 7 dögum",
      actionEN: "Already micro-dosed — keep injury-prevention block (Nordic + Copenhagen) only if time is tight.",
      actionIS: "Nú þegar micro-dosed — haldið meiðslaforvarnar-blokk (Nordic + Copenhagen) ef tíminn er knappur.",
      evidence: "Microdose 15-20 min preserves strength stim in congested weeks (Rønnestad 2023).",
    });
  }

  return audit;
}
