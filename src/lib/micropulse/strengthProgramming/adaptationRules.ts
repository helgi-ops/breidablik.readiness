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

import { asymmetrySwapAllowed, confirmedNote } from "./asymmetryReview";
import type {
  SessionBlock,
  PrescribedExercise,
  AppliedAdaptation,
  PlayerStrengthSnapshot,
  ContraIndication,
  MdContext,
} from "./types";
import { getExercise } from "./exerciseLibrary";
import { md1MinutesTier } from "./md1Tier";

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
/** Yellow day (rule 11): one set off each lift line outside warm-up / mobility; one-set lines stay. True when anything changed. */
export function yellowOneSetOff(blocks: SessionBlock[]): boolean {
  let changed = false;
  for (const block of blocks) {
    if (block.type === "PREP" || block.type === "MOBILITY") continue;
    block.exercises = block.exercises.map((ex) => {
      if (ex.category === "MOVEMENT_PREP" || ex.category === "MOBILITY" || !(ex.dose.sets > 1)) return ex;
      changed = true;
      return { ...ex, dose: { ...ex.dose, sets: ex.dose.sets - 1 }, modificationReason: "One set off: yellow check-in today" };
    });
  }
  return changed;
}

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

/** What the safety rules did in one build, so later layers (the team palette, a player's own exercise
 *  picks) can never undo it (2026-11-17):
 *   • `pinned`  — exercises a safety rule swapped IN (e.g. front squat for a sore lower back). The palette
 *                 leaves these positions alone and never places them a second time.
 *   • `banned`  — exercises a safety rule took OUT or swapped AWAY today. Never brought back by a list.
 *   • `contras` — today's contraindications (soreness, decel streak, sprint drop …); a list candidate whose
 *                 library `contraindications` hit one is skipped.
 *  Filled by `applyAdaptationRules` when the caller passes it; absent = the old behaviour. */
export type AdaptationTrace = {
  pinned: Set<string>;
  banned: Set<string>;
  contras: Set<ContraIndication>;
};


/** Today's check-in in plain words (the verdict comes from the canonical colour, playerContext fetchVerdict). */
function checkinWordEN(v: PlayerStrengthSnapshot["verdict"]): string {
  if (v === "MODIFIED") return "Today's check-in: yellow";
  if (v === "RECOVERY") return "Today's check-in: red";
  return `Today's readiness: ${String(v ?? "").toLowerCase()}`;
}
function checkinWordIS(v: PlayerStrengthSnapshot["verdict"]): string {
  if (v === "MODIFIED") return "Innskráning í dag: gul";
  if (v === "RECOVERY") return "Innskráning í dag: rauð";
  return `Standið í dag: ${String(v ?? "").toLowerCase()}`;
}

export function newAdaptationTrace(): AdaptationTrace {
  return { pinned: new Set(), banned: new Set(), contras: new Set() };
}

/** Build the contraindication set from snapshot data. */
export function buildContraindications(snap: PlayerStrengthSnapshot): Set<ContraIndication> {
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
  trace?: AdaptationTrace,
  /** Today's heavy two-leg reps set by the week rule (weekRule.ts); null/undefined = the rule did not set them. */
  weekRuleHeavyReps?: number | null,
): AppliedAdaptation[] {
  const audit: AppliedAdaptation[] = [];
  const contras = buildContraindications(snap);
  if (trace) for (const c of contras) trace.contras.add(c);
  // Safety bookkeeping (no-ops without a trace): a ban holds whenever the rule's
  // condition fires, whether or not the exercise was in today's template, so a
  // later list can't bring it in either.
  const ban = (...ids: string[]) => { if (trace) for (const id of ids) trace.banned.add(id); };
  const pin = (id: string) => { if (trace) trace.pinned.add(id); };

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
  // Nordic adds eccentric load; on sore tissue → swap to iso long-duration hamstring
  // bridge (coaching call). The bridge does not replace the Nordic's protective effect
  // (van Dyk 2019), so the Nordic returns when soreness settles.
  if (contras.has("sore_hamstrings") || contras.has("hamstring_injury")) {
    ban("ex_nordic_curl", "ex_b_stance_rdl");
    if (swapExercise(blocks, "ex_nordic_curl", "ex_iso_ham_bridge_long",
        "Swapped from Nordic — sore hamstrings (eccentric load contraindicated)")) {
      pin("ex_iso_ham_bridge_long");
      audit.push({
        ruleId: "SORE_HAM_NORDIC_SWAP",
        triggerEN: "Sore hamstrings",
        triggerIS: "Sárindi í hamstring",
        actionEN: "Nordic curl → Long iso hamstring bridge",
        actionIS: "Nordic curl → Lang iso hamstring bridge",
        evidence: "Sore hamstrings: the eccentric Nordic is swapped for an isometric bridge to keep some loading (coaching call). The bridge doesn't replace the Nordic's protective effect (van Dyk 2019); it returns when soreness settles.",
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
    ban("ex_nordic_curl", "ex_trap_bar_dl");
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
      pin("ex_hip_thrust");
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
    ban("ex_mid_thigh_pull_dynamic", "ex_depth_jump");
    if (swapExercise(blocks, "ex_mid_thigh_pull_dynamic", "ex_imtp_iso",
        `Swapped from dynamic mid-thigh pull — sprint speed dropped ${snap.sprintSpeedDropPct?.toFixed(1)}% vs peak`)) {
      pin("ex_imtp_iso");
      audit.push({
        ruleId: "SPRINT_DROP_MTP_SWAP",
        triggerEN: `Sprint speed −${snap.sprintSpeedDropPct?.toFixed(1)}% vs peak`,
        triggerIS: `Sprintkraftur −${snap.sprintSpeedDropPct?.toFixed(1)}% vs hámark`,
        actionEN: "Dynamic mid-thigh pull → IMTP (iso, same joint angle)",
        actionIS: "Dynamic mid-thigh pull → IMTP (kyrr, sama liðshorn)",
        evidence: "Isometrics keep an RFD stimulus with less fatigue (Lum & Barbosa 2019); skipping max-velocity work on a slow day spares the hamstrings (coaching call).",
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
  // Evidence: none direct — > 15% high-tier CoD asymmetry is MicroPulse's
  // flag (GPS turn-count gaps not tested against injury; Helme 2021). In the microdose template there's no standalone
  // unilateral block, so we swap the main compound lift to a unilateral
  // alternative (Bulgarian SS) and instruct the coach to anchor the
  // weaker side first. Keeps the 20-min budget intact while still
  // delivering the asymmetry-correction stimulus.
  // Brief §4b (2026-11-23): only after the coach confirmed the swap (asymmetryReview.ts); otherwise the core logs
  // ASYMMETRY_REVIEW and the lift stays.
  if (snap.codAsymmetryPct != null && snap.codAsymmetryPct >= 15 && asymmetrySwapAllowed(snap)) {
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
        actionEN: `Main lift → Bulgarian split squat (anchor weaker ${snap.codWeakerSide ?? "?"} side first).${confirmedNote(snap).en}`,
        actionIS: `Aðallyfta → Bulgarian split squat (byrja á veikari ${snap.codWeakerSide ?? "?"} fót).${confirmedNote(snap).is}`,
        evidence: "MicroPulse's rule: one-leg work for a high-intensity CoD gap. GPS turn-count gaps have not been tested against injury (Helme 2021).",
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
        evidence: "Low sprint exposure leaves players under-prepared; moderate exposure is protective (Malone 2017).",
      });
    }
  }

  // ── RULE 8: Sore groin — drop Copenhagen ─────────────────────────────
  if (contras.has("sore_groin") || contras.has("groin_injury")) {
    ban("ex_copenhagen");
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
    ban("ex_trap_bar_dl");
    if (swapExercise(blocks, "ex_trap_bar_dl", "ex_front_squat",
        "Swapped from Trap-bar DL — sore lower back (reduces spinal load)")) {
      pin("ex_front_squat");
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
  // MD+1 exception: for a player who played 60+ min, RECOVERY is the EXPECTED
  // post-match state, and the MD+1 high-minutes tier already prescribes the
  // recovery-appropriate work (protective iso lower-body + fresh-tissue upper
  // strength). Do NOT strip that. HOLD (a real stop) still strips on any day, as
  // does RECOVERY on every other day / MD+1 tier.
  const md1High = snap.mdContext === "MD+1" && md1MinutesTier(snap.lastMatchMinutes, snap.lastMatchDnp) === "high";
  if (snap.verdict === "HOLD" || (snap.verdict === "RECOVERY" && !md1High)) {
    audit.push({
      ruleId: "VERDICT_BLOCK",
      triggerEN: checkinWordEN(snap.verdict),
      triggerIS: checkinWordIS(snap.verdict),
      actionEN: "Recovery day: warm-up and mobility only, no strength work.",
      actionIS: "Endurheimtardagur: upphitun og liðleiki eingöngu, engin styrktaræfing.",
      evidence: "Acute readiness override — engine respects daily decision.",
    });
    // Strip out compound + posterior + unilateral; keep prep + mobility
    for (const block of blocks) {
      if (block.type === "PREP" || block.type === "MOBILITY") continue;
      block.exercises = [];
    }
  }

  // ── RULE 11: Verdict = REDUCED/MODIFIED — one set off each line ──────
  // One yellow rule for lifts everywhere (coach's call 2026-11-23, contradiction 16): one set off each line, the same
  // as a coach's template or hand send on a yellow day and the goal plan's lifts. Warm-up and mobility are left alone;
  // a line of one set stays one set. Before: about 30% off the first main lift of three kinds only.
  if (snap.verdict === "REDUCED" || snap.verdict === "MODIFIED") {
    if (yellowOneSetOff(blocks)) {
      audit.push({
        ruleId: "VERDICT_REDUCED_VOLUME",
        triggerEN: checkinWordEN(snap.verdict),
        triggerIS: checkinWordIS(snap.verdict),
        actionEN: "One set off each lift (a lift of one set stays one set); the warm-up stays.",
        actionIS: "Eitt sett tekið af hverri lyftu (lyfta með eitt sett heldur því); upphitunin helst.",
        evidence: "Training adjusted to how ready the player says he is (autoregulation, Greig 2020). One set off each line is MicroPulse's rule, the same on every surface.",
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
      evidence: "Short 15-20 min sessions keep the week's strength work going in congested weeks; spreading volume over more, shorter sessions gives similar strength gains (Cuthbert 2021).",
    });
  }

  // ── RULE: Deficit-ledger strength emphasis ──────────────────────────
  // The reconciled deficit ledger (movement screen + VALD + IMA …) can bias the
  // session toward a strength emphasis. Moderate+ confidence only (hints don't
  // reach here — the loader filters). Descriptive; the coach can override.
  applyLedgerEmphasisRules(blocks, snap, audit, contras, trace, weekRuleHeavyReps ?? null);

  return audit;
}

/** Ledger emphasis → an accessory to ensure, the MD-days it belongs on, and a
 *  label. Only the emphases buildStrengthPlan currently emits are mapped. */
const LEDGER_EMPHASIS_EX: Record<string, { id: string; gate: MdContext[]; en: string; is: string }> = {
  plyometric: { id: "ex_lateral_bound", gate: ["MD-4", "MD-3"], en: "reactive-strength (plyometric)", is: "viðbragðsstyrks (plyometric)" },
  unilateral: { id: "ex_bulgarian_ss", gate: ["MD-4", "MD-3", "MD-2"], en: "unilateral (weaker side)", is: "einhliða (veikari hlið)" },
  eccentric: { id: "ex_nordic_curl", gate: ["MD-4"], en: "eccentric / braking", is: "eccentric / hemlun" },
  max_strength: { id: "ex_back_squat", gate: ["MD-4"], en: "max-strength (F-V force gap)", is: "hámarks-styrkur (F-V kraft-gat)" },
};
const EMPHASIS_CATEGORY: Record<string, PrescribedExercise["category"]> = {
  plyometric: "PLYOMETRIC", unilateral: "UNILATERAL_STRENGTH", eccentric: "POSTERIOR_CHAIN", max_strength: "COMPOUND_STRENGTH",
};

function applyLedgerEmphasisRules(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  audit: AppliedAdaptation[],
  contras: ReadonlySet<ContraIndication> | readonly ContraIndication[] = [],
  trace?: AdaptationTrace,
  weekRuleHeavyReps: number | null = null,
): void {
  const emphases = snap.ledgerEmphases ?? [];
  if (!emphases.length || !blocks.length) return;
  // A recovery / hold day was emptied by Rule 10 — never add an accessory back onto it (2026-11-17).
  if (snap.verdict === "HOLD" || snap.verdict === "RECOVERY") return;
  const contraSet = new Set<ContraIndication>(contras);

  for (const emphasis of emphases) {
    const spec = LEDGER_EMPHASIS_EX[emphasis];
    if (!spec) continue;                                   // not a mapped strength emphasis
    if (!spec.gate.includes(snap.mdContext)) continue;     // wrong MD-day for this quality
    // Acute deload wins: don't add eccentric braking load on a high decel-burden streak.
    if (emphasis === "eccentric" && snap.decelBurdenHighStreakDays >= 3) continue;
    // Safety wins (2026-11-17): never add back what a safety rule took out today (e.g. the Nordic on a sore
    // hamstring), nor an exercise that is not suitable for today's condition.
    if (trace?.banned.has(spec.id)) continue;
    const specContras = getExercise(spec.id).contraindications ?? [];
    if (specContras.some((c) => contraSet.has(c))) continue;

    // Max strength on a day the week rule set the heavy reps: the week rule's reps are the dose (15 a week in season,
    // 21 in pre-season). No heavy lift is added on top of them, and none is added back after a safety rule changed
    // the main lift (the coach's call, 2026-11-23).
    if (emphasis === "max_strength" && weekRuleHeavyReps != null) {
      audit.push({
        ruleId: "LEDGER_EMPHASIS_CONFIRM",
        triggerEN: `Deficit ledger: ${spec.en} target`,
        triggerIS: `Halla-bók: ${spec.is} markmið`,
        actionEN: `Today's heavy reps come from the week rule (${weekRuleHeavyReps}); no heavy lift added on top`,
        actionIS: `Þungar endurtekningar dagsins koma úr vikureglunni (${weekRuleHeavyReps}); engri þungri lyftu bætt ofan á`,
        evidence: "Reconciled deficit ledger (movement screen / VALD / IMA) — see Total Player Analysis. The week's heavy reps are the week rule's (MicroPulse rule, 2026-11-23).",
      });
      continue;
    }
    const category = EMPHASIS_CATEGORY[emphasis];
    const already = findExerciseByCategory(blocks, category);
    if (already) {
      // The session already trains this — record that the ledger corroborates it.
      audit.push({
        ruleId: "LEDGER_EMPHASIS_CONFIRM",
        triggerEN: `Deficit ledger: ${spec.en} target`,
        triggerIS: `Halla-bók: ${spec.is} markmið`,
        actionEN: `Kept the ${category.replace(/_/g, " ").toLowerCase()} work — corroborated by the ledger`,
        actionIS: `Hélt ${category.replace(/_/g, " ").toLowerCase()} vinnu — staðfest af halla-bókinni`,
        evidence: "Reconciled deficit ledger (movement screen / VALD / IMA) — see Total Player Analysis.",
      });
      continue;
    }
    // Add the accessory to the last (accessory-oriented) block.
    const target = blocks[blocks.length - 1];
    if (addExtraSet(blocks, target.id, spec.id, `Deficit ledger: ${spec.en} emphasis`)) {
      const ex = getExercise(spec.id);
      audit.push({
        ruleId: "LEDGER_EMPHASIS_ADD",
        triggerEN: `Deficit ledger: ${spec.en} target`,
        triggerIS: `Halla-bók: ${spec.is} markmið`,
        actionEN: `Added ${ex.nameEN} (${spec.en})`,
        actionIS: `Bætti við ${ex.nameIS} (${spec.is})`,
        evidence: "Reconciled deficit ledger (movement screen / VALD / IMA) — see Total Player Analysis.",
      });
    }
  }
}
