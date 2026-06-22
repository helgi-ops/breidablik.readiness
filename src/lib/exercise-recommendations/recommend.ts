import { GROUP_OPTIONS } from "./constants";
import { getRecommendationGroupForExercise, normalizeExerciseNameToId } from "./normalize";
import { REASON_CODES } from "./reasons";
import type {
  ExerciseRecommendationInput,
  ExerciseRecommendationResult,
  RecommendationDebugInfo,
  RecommendationGroup,
  SupportedExerciseId,
} from "./types";

// ── Utilities ────────────────────────────────────────────────────────────────

function difference(all: SupportedExerciseId[], allowed: SupportedExerciseId[]): SupportedExerciseId[] {
  return all.filter((id) => !allowed.includes(id));
}

function hasContext(input: ExerciseRecommendationInput): boolean {
  return !!(
    input.readinessState ||
    input.riskState ||
    input.trainingMode ||
    // Phase 1 / 2 flags
    input.neuralSuppressionFlag ||
    input.modifiedOnlyFlag ||
    input.kneeIrritationFlag ||
    // Phase 3 flags
    input.lowerBodySorenessFlag ||
    input.postMatchResidualFlag ||
    input.scheduleCongestionFlag ||
    input.posteriorChainSorenessFlag ||
    input.quadDominantSorenessFlag ||
    input.unilateralDeficitFlag
  );
}

function buildDebugInfo(
  input: ExerciseRecommendationInput,
  group: RecommendationGroup,
  selectedReasonCode: string | null,
  allowedExerciseIds: SupportedExerciseId[]
): RecommendationDebugInfo {
  const flagMap: Record<string, boolean | undefined> = {
    neuralSuppressionFlag: input.neuralSuppressionFlag,
    modifiedOnlyFlag: input.modifiedOnlyFlag,
    kneeIrritationFlag: input.kneeIrritationFlag,
    lowerBodySorenessFlag: input.lowerBodySorenessFlag,
    postMatchResidualFlag: input.postMatchResidualFlag,
    scheduleCongestionFlag: input.scheduleCongestionFlag,
    posteriorChainSorenessFlag: input.posteriorChainSorenessFlag,
    quadDominantSorenessFlag: input.quadDominantSorenessFlag,
    unilateralDeficitFlag: input.unilateralDeficitFlag,
  };

  const activeFlags = Object.entries(flagMap)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const groupExerciseIds = GROUP_OPTIONS[group];
  const exclusions = difference(groupExerciseIds, allowedExerciseIds).map((exerciseId) => ({
    exerciseId,
    reason: selectedReasonCode ?? "restricted_by_context",
  }));

  return { activeFlags, selectedReasonCode, groupExerciseIds, exclusions };
}

function emptyDebugInfo(group: RecommendationGroup | null): RecommendationDebugInfo {
  return {
    activeFlags: [],
    selectedReasonCode: null,
    groupExerciseIds: group ? GROUP_OPTIONS[group] : [],
    exclusions: [],
  };
}

function fallbackResult(
  originalExerciseId: SupportedExerciseId | null,
  group: RecommendationGroup | null
): ExerciseRecommendationResult {
  return {
    originalExerciseId,
    group,
    recommendedExerciseId: originalExerciseId,
    allowedExerciseIds: originalExerciseId ? [originalExerciseId] : [],
    restrictedExerciseIds: [],
    reasonCode: null,
    coachText: null,
    playerText: null,
    shouldRenderRecommendation: false,
    debugInfo: emptyDebugInfo(group),
  };
}

// ── Main recommendation function ─────────────────────────────────────────────

export function getExerciseRecommendation(input: ExerciseRecommendationInput): ExerciseRecommendationResult {
  const originalExerciseId = input.originalExerciseName
    ? normalizeExerciseNameToId(input.originalExerciseName)
    : null;
  const group = originalExerciseId ? getRecommendationGroupForExercise(originalExerciseId) : null;

  if (!originalExerciseId || !group) return fallbackResult(originalExerciseId, group);
  if (!hasContext(input)) return fallbackResult(originalExerciseId, group);

  const isEN = (input.lang ?? "IS") === "EN";

  let recommendedExerciseId: SupportedExerciseId = originalExerciseId;
  let reasonCode: string | null = null;
  let coachText: string | null = null;
  let playerText: string | null = null;

  // ── EXPLOSIVE ACCESSORY decision tree ─────────────────────────────────────
  if (group === "EXPLOSIVE_ACCESSORY") {
    if (
      input.trainingMode === "PROTECT" ||
      input.trainingMode === "REGENERATE" ||
      input.modifiedOnlyFlag ||
      input.neuralSuppressionFlag ||
      input.readinessState === "RED"
    ) {
      // Tier 1 (existing): most protective state
      recommendedExerciseId = "ISO_MID_THIGH_PULL";
      reasonCode = input.neuralSuppressionFlag
        ? REASON_CODES.NEURAL_PROTECTIVE
        : REASON_CODES.PROTECTIVE_EXPLOSIVE;
      coachText = "Valin er ISO Mid-Thigh Pull sem verndandi útgáfa í dag.";
      playerText = input.neuralSuppressionFlag
        ? isEN
          ? "Today we select a lighter option to reduce neural load."
          : "Í dag veljum við einfaldari útgáfu til að minnka álag á taugakerfi."
        : isEN
          ? "Today we select a protective option to reduce load."
          : "Í dag veljum við verndandi útgáfu til að minnka álag.";
    } else if (input.postMatchResidualFlag) {
      // Phase 3: Post-match residual — down-regulate explosive CNS demand
      // Applies even when wellness shows GREEN; post-match fatigue is structural.
      // Neuromuscular output (CMJ, sprint) and muscle-damage markers (CK) stay
      // depressed/elevated up to ~72 h post-match regardless of how the athlete
      // feels, so we protect the CNS in that window even on a GREEN day.
      //   Refs: Nédélec M et al. Recovery in Soccer, Part I & II. Sports Med
      //         2012;42(12):997 / 2013;43(1):9.
      recommendedExerciseId = "ISO_MID_THIGH_PULL";
      reasonCode = REASON_CODES.POST_MATCH_RESIDUAL;
      coachText =
        "Post-match residual fatigue detected. ISO Mid-Thigh Pull selected to minimise CNS demand in the recovery window.";
      playerText = isEN
        ? "Today we select a lighter option to reduce post-match load."
        : "Í dag veljum við léttari útgáfu til að minnka álag eftir leik.";
    } else if (input.readinessState === "YELLOW" || input.riskState === "MODERATE") {
      if (input.scheduleCongestionFlag) {
        // Phase 3: Dense fixture schedule — bias further toward Mid-Thigh Pull
        recommendedExerciseId = "MID_THIGH_PULL";
        reasonCode = REASON_CODES.SCHEDULE_CONGESTION_EXPLOSIVE;
        coachText =
          "Dense match schedule detected. Mid-Thigh Pull selected to conserve CNS output across a congested fixture run.";
        playerText = isEN
          ? "Congested fixture schedule — we reduce CNS load and select Mid-Thigh Pull today."
          : "Þétt leikáætlun í gangi — við drögum úr CNS álagi og veljum Mid-Thigh Pull í dag.";
      } else {
        recommendedExerciseId = "JUMP_SHRUGS";
        reasonCode = REASON_CODES.MODERATE_EXPLOSIVE;
        coachText =
          "Jump Shrugs selected as the preferred explosive option due to moderate fatigue and lower technical cost than DB Snatch.";
        playerText = isEN
          ? "Today we select Jump Shrugs to maintain explosive power with a simpler, safer movement."
          : "Í dag veljum við Jump Shrugs til að halda sprengikrafti með einfaldari og öruggari framkvæmd.";
      }
    } else if (input.readinessState === "GREEN" && input.riskState === "LOW") {
      if (input.lowerBodySorenessFlag) {
        // Phase 3: Lower body soreness in GREEN state — bias away from DB Snatch impact load
        recommendedExerciseId = "JUMP_SHRUGS";
        reasonCode = REASON_CODES.LOWER_BODY_SORENESS_EXPLOSIVE;
        coachText =
          "Lower body soreness detected despite green readiness. Jump Shrugs selected to maintain explosive stimulus with reduced impact load.";
        playerText = isEN
          ? "Despite good readiness scores, Jump Shrugs is recommended today due to lower body soreness."
          : "Þrátt fyrir góðar líðanartölur er mælt með Jump Shrugs í dag vegna þreytu í neðri líkama.";
      } else {
        recommendedExerciseId = "DB_SNATCH";
        reasonCode = REASON_CODES.GREEN_EXPLOSIVE;
        coachText = "DB Snatch mælt með í dag fyrir hærri sprengikraftsörvun.";
        playerText = isEN
          ? "Today you are free to choose within the approved options."
          : "Í dag máttu velja frjálsar innan samþykktra valkosta.";
      }
    }
  }

  // ── UNILATERAL STRENGTH ACCESSORY decision tree ───────────────────────────
  if (group === "UNILATERAL_STRENGTH_ACCESSORY") {
    if (
      input.trainingMode === "PROTECT" ||
      input.trainingMode === "REGENERATE" ||
      input.modifiedOnlyFlag ||
      input.readinessState === "RED"
    ) {
      // Tier 1 (existing): most protective state
      recommendedExerciseId = "ISOMETRIC_SPLIT_SQUAT_HOLD";
      reasonCode = REASON_CODES.PROTECTIVE_UNILATERAL;
      coachText = "Valinn er Isometric Split Squat Hold sem verndandi útgáfa í dag.";
      playerText = isEN
        ? "Today we select a protective option to reduce load."
        : "Í dag veljum við verndandi útgáfu til að minnka álag.";
    } else if (input.kneeIrritationFlag) {
      // Tier 2 (existing): knee irritation — RFESS contraindicated
      recommendedExerciseId = "SPLIT_STANCE_TRAP_BAR_DEADLIFT";
      reasonCode = REASON_CODES.KNEE_IRRITATION_BIAS;
      coachText =
        "RFESS er ekki ráðlagt í dag vegna ertingar í hné; Split Stance Trap Bar Deadlift valið í staðinn.";
      playerText = isEN
        ? "Today we select a more stable option to protect the knee."
        : "Í dag veljum við stöðugri útgáfu til að vernda hnéð.";
    } else if (input.posteriorChainSorenessFlag) {
      // Phase 3: Posterior chain soreness — reduce hip-hinge demand of RFESS
      recommendedExerciseId = "SPLIT_STANCE_TRAP_BAR_DEADLIFT";
      reasonCode = REASON_CODES.POSTERIOR_CHAIN_SORENESS_BIAS;
      coachText =
        "Posterior chain soreness detected. Split Stance Trap Bar Deadlift selected to reduce hip-hinge load while maintaining unilateral stimulus.";
      playerText = isEN
        ? "Today we select Split Stance Trap Bar Deadlift to protect the posterior chain."
        : "Í dag veljum við Split Stance Trap Bar Deadlift til að hlífa bakhluta.";
    } else if (input.quadDominantSorenessFlag) {
      // Phase 3: Quad-dominant soreness — maintain stimulus without eccentric quad load
      recommendedExerciseId = "ISOMETRIC_SPLIT_SQUAT_HOLD";
      reasonCode = REASON_CODES.QUAD_SORENESS_BIAS;
      coachText =
        "Quad-dominant soreness detected. Isometric Split Squat Hold selected to maintain unilateral stimulus without eccentric quad loading.";
      playerText = isEN
        ? "Today we select Isometric Split Squat Hold to protect the quads."
        : "Í dag veljum við Isometric Split Squat Hold til að hlífa lærismöglum.";
    } else if (input.readinessState === "YELLOW" || input.riskState === "MODERATE") {
      if (input.unilateralDeficitFlag) {
        // Phase 3: Asymmetry detected — prioritise RFESS for targeted correction
        recommendedExerciseId = "RFESS";
        reasonCode = REASON_CODES.UNILATERAL_DEFICIT_FOCUS;
        coachText =
          "Unilateral strength deficit flagged. RFESS prioritised to address asymmetry within a managed load.";
        playerText = isEN
          ? "We are training RFESS specifically today to address the strength difference between sides."
          : "Við þjálfum RFESS sérstaklega í dag til að jafna mun á milli hliða.";
      } else {
        recommendedExerciseId = "RFESS";
        reasonCode = REASON_CODES.MODERATE_UNILATERAL;
        coachText = "RFESS valið í dag til að halda gæðum háum með hóflegra álagi.";
        playerText = isEN
          ? "Today we select a simpler option to maintain quality."
          : "Í dag veljum við einfaldari útgáfu til að halda gæðum háum.";
      }
    } else if (input.readinessState === "GREEN" && input.riskState === "LOW") {
      recommendedExerciseId = "SPLIT_STANCE_TRAP_BAR_DEADLIFT";
      reasonCode = REASON_CODES.GREEN_UNILATERAL;
      coachText = "Split Stance Trap Bar Deadlift mælt með í dag fyrir unilateral styrk.";
      playerText = isEN
        ? "Today you are free to choose within the approved options."
        : "Í dag máttu velja frjálsar innan samþykktra valkosta.";
    }
  }

  // ── Allowed / restricted exercise list ───────────────────────────────────
  //
  // Tier logic: each tier is more permissive than the one above it.
  // Post-filter overrides (knee irritation, posterior chain, quad soreness)
  // are applied after the tier cascade.

  let allowedExerciseIds: SupportedExerciseId[] = GROUP_OPTIONS[group];

  if (
    input.trainingMode === "PROTECT" ||
    input.trainingMode === "REGENERATE" ||
    input.modifiedOnlyFlag ||
    input.readinessState === "RED"
  ) {
    // Tier 1 (most restrictive): single isometric / lowest-demand option
    allowedExerciseIds =
      group === "EXPLOSIVE_ACCESSORY" ? ["ISO_MID_THIGH_PULL"] : ["ISOMETRIC_SPLIT_SQUAT_HOLD"];
  } else if (input.postMatchResidualFlag) {
    // Phase 3 Tier 1b: post-match residual — same restriction as Tier 1
    allowedExerciseIds =
      group === "EXPLOSIVE_ACCESSORY" ? ["ISO_MID_THIGH_PULL"] : ["ISOMETRIC_SPLIT_SQUAT_HOLD"];
  } else if (input.readinessState === "YELLOW" || input.riskState === "MODERATE" || input.neuralSuppressionFlag) {
    // Tier 2: moderate state — exclude highest-demand options
    if (input.scheduleCongestionFlag && group === "EXPLOSIVE_ACCESSORY") {
      // Phase 3: schedule congestion further restricts explosive to lower CNS options
      allowedExerciseIds = ["MID_THIGH_PULL", "ISO_MID_THIGH_PULL"];
    } else {
      allowedExerciseIds =
        group === "EXPLOSIVE_ACCESSORY"
          ? ["JUMP_SHRUGS", "MID_THIGH_PULL", "ISO_MID_THIGH_PULL"]
          : ["RFESS", "ISOMETRIC_SPLIT_SQUAT_HOLD"];
    }
  } else if (input.lowerBodySorenessFlag && group === "EXPLOSIVE_ACCESSORY") {
    // Phase 3: lower body soreness in GREEN state — exclude DB Snatch
    allowedExerciseIds = ["JUMP_SHRUGS", "MID_THIGH_PULL", "ISO_MID_THIGH_PULL"];
  }

  // ── Post-filter overrides ────────────────────────────────────────────────
  // These are applied after the main tier cascade because they add biological
  // constraints that are independent of readiness state.

  if (input.kneeIrritationFlag && group === "UNILATERAL_STRENGTH_ACCESSORY") {
    // RFESS contraindicated regardless of tier result
    allowedExerciseIds = ["SPLIT_STANCE_TRAP_BAR_DEADLIFT", "ISOMETRIC_SPLIT_SQUAT_HOLD"];
  }

  if (input.posteriorChainSorenessFlag && group === "UNILATERAL_STRENGTH_ACCESSORY") {
    // Phase 3: Remove RFESS; ensure at least one valid option remains
    allowedExerciseIds = allowedExerciseIds.filter((id) => id !== "RFESS");
    if (allowedExerciseIds.length === 0) {
      allowedExerciseIds = ["SPLIT_STANCE_TRAP_BAR_DEADLIFT", "ISOMETRIC_SPLIT_SQUAT_HOLD"];
    }
  }

  if (input.quadDominantSorenessFlag && group === "UNILATERAL_STRENGTH_ACCESSORY") {
    // Phase 3: Eccentric quad load contraindicated — restrict to isometric only
    allowedExerciseIds = ["ISOMETRIC_SPLIT_SQUAT_HOLD"];
  }

  const restrictedExerciseIds = difference(GROUP_OPTIONS[group], allowedExerciseIds);
  const debugInfo = buildDebugInfo(input, group, reasonCode, allowedExerciseIds);

  return {
    originalExerciseId,
    group,
    recommendedExerciseId,
    allowedExerciseIds,
    restrictedExerciseIds,
    reasonCode,
    coachText,
    playerText,
    shouldRenderRecommendation: true,
    debugInfo,
  };
}
