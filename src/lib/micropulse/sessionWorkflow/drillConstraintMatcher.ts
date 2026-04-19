/**
 * Drill-Constraint Matcher
 *
 * Matches player training constraints (from MicroPulse decisions)
 * against session block exposure tags. Produces per-block warnings
 * telling the coach which players should skip, reduce, or modify
 * each drill/block in a shared team session.
 *
 * This is a pure function — no side effects, no DB calls.
 */

import type { SessionDraftBlock, SessionExposureTag } from "@/lib/micropulse/autoSessionBuilder";

// ── Player constraint input ─────────────────────────────────────────

export type PlayerConstraintInput = {
  playerId: string;
  playerName: string;
  /** Final color: GREEN / YELLOW / RED / GRAY */
  flag: "GREEN" | "YELLOW" | "RED" | "GRAY";
  /** Exposure tags this player should NOT do (from SessionDraft.exposureLimits) */
  exposureLimits: SessionExposureTag[];
  /** Volume reduction percentage (0–100). E.g. 25 means -25% volume. */
  volumeReductionPercent: number | null;
  /** Intensity cap. CAP_LOW = very restricted, CAP_MODERATE = moderate. */
  intensityCap: "NO_CAP" | "CAP_HIGH" | "CAP_MODERATE" | "CAP_LOW" | "RECOVERY_ONLY" | null;
  /** Neural load state — triggers contact reduction */
  neuralLoad?: "STABLE" | "RISING" | "HIGH" | "CRITICAL" | null;
  /** Contact reduction percentage from neural bias (0–25) */
  contactReductionPercent?: number | null;
  /** Human-readable constraint reasons (from explanationLines) */
  constraintReasons?: string[];
};

// ── Output types ────────────────────────────────────────────────────

export type BlockConflictAction = "skip" | "reduce_half" | "reduce_volume" | "reduce_contact" | "lower_intensity";

export type PlayerBlockConflict = {
  playerId: string;
  playerName: string;
  flag: "GREEN" | "YELLOW" | "RED" | "GRAY";
  action: BlockConflictAction;
  /** Why this player should modify this block */
  reason: string;
  /** Icelandic reason for UI */
  reasonIs: string;
};

export type BlockConflictResult = {
  blockId: string;
  blockTitle: string;
  blockType: string;
  exposureTags: SessionExposureTag[];
  /** Players with conflicts on this block */
  conflicts: PlayerBlockConflict[];
  /** Total number of players who should skip entirely */
  skipCount: number;
  /** Total number of players who should reduce */
  reduceCount: number;
  /** Severity: "none" | "warning" | "danger" */
  severity: "none" | "warning" | "danger";
};

export type TeamBlockConflictSummary = {
  /** Per-block conflict results */
  blocks: BlockConflictResult[];
  /** Total distinct players with at least one conflict */
  totalPlayersAffected: number;
  /** Total conflicts across all blocks */
  totalConflicts: number;
  /** Blocks with at least one conflict */
  blocksWithConflicts: number;
  /** Whether any RED player has a CONTACT or HIGH block included */
  hasCriticalConflict: boolean;
};

// ── Exposure tag → constraint matching ──────────────────────────────

/**
 * Map from exposure tag to the constraint reason and recommended action.
 */
const TAG_CONFLICT_MAP: Record<
  SessionExposureTag,
  { action: BlockConflictAction; reason: string; reasonIs: string } | null
> = {
  MAX_SPEED: {
    action: "skip",
    reason: "HSR/speed exposure restricted",
    reasonIs: "Háhraðahlaup takmarkað",
  },
  HIGH_DECEL: {
    action: "reduce_half",
    reason: "High deceleration load restricted",
    reasonIs: "Há hæging takmarkuð",
  },
  CONTACT: {
    action: "skip",
    reason: "Contact/collision restricted",
    reasonIs: "Snerting/árekstrar takmörkuð",
  },
  PLYOS: {
    action: "reduce_half",
    reason: "Plyometric/eccentric load restricted",
    reasonIs: "Plyó/eccentric álag takmarkað",
  },
  HEAVY_GYM: {
    action: "lower_intensity",
    reason: "Heavy gym work restricted",
    reasonIs: "Þung lyftingavinna takmörkuð",
  },
  FIELD_MINUTES: {
    action: "reduce_volume",
    reason: "Total field minutes should be reduced",
    reasonIs: "Heildartími á velli ætti að minnka",
  },
  TECHNICAL_ONLY: null, // No conflict — this is a safe tag
  RECOVERY_ONLY: null, // No conflict — recovery is always safe
};

// ── Core matching function ──────────────────────────────────────────

/**
 * Match a single player's constraints against a single block.
 * Returns conflicts (possibly empty).
 */
function matchPlayerToBlock(
  player: PlayerConstraintInput,
  block: SessionDraftBlock,
): PlayerBlockConflict[] {
  if (!block.included) return []; // Block is already excluded, no conflict

  const conflicts: PlayerBlockConflict[] = [];
  const blockTags = block.exposureTags ?? [];

  // 1. RED players should skip all non-recovery/non-prep blocks
  if (player.flag === "RED" && block.type !== "PREP" && block.type !== "MOBILITY" && block.type !== "DOWNREGULATION" && block.type !== "RECOVERY" && block.type !== "AEROBIC_FLUSH") {
    conflicts.push({
      playerId: player.playerId,
      playerName: player.playerName,
      flag: player.flag,
      action: "skip",
      reason: "RED status — recovery only",
      reasonIs: "Rauð staða — aðeins bætiferli",
    });
    return conflicts; // No need to check further — skip everything
  }

  // 2. GRAY players should skip all high-intensity blocks
  if (player.flag === "GRAY" && block.intensity === "HIGH") {
    conflicts.push({
      playerId: player.playerId,
      playerName: player.playerName,
      flag: player.flag,
      action: "skip",
      reason: "GRAY status — technique only, no high intensity",
      reasonIs: "Grá staða — tækni eingöngu, ekkert hátt álag",
    });
    return conflicts;
  }

  // 3. Exposure limit matching (most important for YELLOW players)
  for (const tag of blockTags) {
    if (player.exposureLimits.includes(tag)) {
      const mapping = TAG_CONFLICT_MAP[tag];
      if (mapping) {
        // Avoid duplicates (same action from different tags)
        if (!conflicts.some((c) => c.action === mapping.action)) {
          conflicts.push({
            playerId: player.playerId,
            playerName: player.playerName,
            flag: player.flag,
            action: mapping.action,
            reason: mapping.reason,
            reasonIs: mapping.reasonIs,
          });
        }
      }
    }
  }

  // 4. Neural load → contact reduction
  if (
    player.neuralLoad &&
    (player.neuralLoad === "HIGH" || player.neuralLoad === "CRITICAL") &&
    blockTags.includes("CONTACT")
  ) {
    const pct = player.contactReductionPercent ?? (player.neuralLoad === "CRITICAL" ? 25 : 15);
    if (!conflicts.some((c) => c.action === "skip" && blockTags.includes("CONTACT"))) {
      conflicts.push({
        playerId: player.playerId,
        playerName: player.playerName,
        flag: player.flag,
        action: player.neuralLoad === "CRITICAL" ? "skip" : "reduce_contact",
        reason: `Neural load ${player.neuralLoad} — contact -${pct}%`,
        reasonIs: `Taugaálag ${player.neuralLoad} — snerting -${pct}%`,
      });
    }
  }

  // 5. Intensity cap conflicts
  if (player.intensityCap && block.intensity === "HIGH") {
    if (player.intensityCap === "CAP_LOW" || player.intensityCap === "RECOVERY_ONLY") {
      if (!conflicts.some((c) => c.action === "skip")) {
        conflicts.push({
          playerId: player.playerId,
          playerName: player.playerName,
          flag: player.flag,
          action: "skip",
          reason: `Intensity capped at ${player.intensityCap === "RECOVERY_ONLY" ? "recovery" : "low"}`,
          reasonIs: `Álagsstyrkur takmarkaður við ${player.intensityCap === "RECOVERY_ONLY" ? "bætiferli" : "lágt"}`,
        });
      }
    } else if (player.intensityCap === "CAP_MODERATE") {
      if (!conflicts.some((c) => c.action === "lower_intensity")) {
        conflicts.push({
          playerId: player.playerId,
          playerName: player.playerName,
          flag: player.flag,
          action: "lower_intensity",
          reason: "Intensity capped at moderate",
          reasonIs: "Álagsstyrkur takmarkaður við meðal",
        });
      }
    }
  }

  // 6. Volume reduction → affects FIELD_MINUTES and CONDITIONING blocks
  if (
    player.volumeReductionPercent &&
    player.volumeReductionPercent >= 25 &&
    (block.type === "CONDITIONING" || block.type === "MAIN" || blockTags.includes("FIELD_MINUTES"))
  ) {
    if (!conflicts.some((c) => c.action === "reduce_volume" || c.action === "skip" || c.action === "reduce_half")) {
      conflicts.push({
        playerId: player.playerId,
        playerName: player.playerName,
        flag: player.flag,
        action: player.volumeReductionPercent >= 40 ? "reduce_half" : "reduce_volume",
        reason: `Volume reduced -${player.volumeReductionPercent}%`,
        reasonIs: `Magn minnkað um ${player.volumeReductionPercent}%`,
      });
    }
  }

  return conflicts;
}

// ── Team-level matching ─────────────────────────────────────────────

/**
 * Match all players' constraints against all blocks in a session.
 *
 * @param blocks - The session blocks (shared team session)
 * @param players - All players with their constraints
 * @returns Per-block conflict results and a team summary
 */
export function matchTeamConstraintsToBlocks(
  blocks: SessionDraftBlock[],
  players: PlayerConstraintInput[],
): TeamBlockConflictSummary {
  const affectedPlayerIds = new Set<string>();
  let totalConflicts = 0;
  let blocksWithConflicts = 0;
  let hasCriticalConflict = false;

  const blockResults: BlockConflictResult[] = blocks.map((block) => {
    const conflicts: PlayerBlockConflict[] = [];

    for (const player of players) {
      const playerConflicts = matchPlayerToBlock(player, block);
      conflicts.push(...playerConflicts);
      if (playerConflicts.length > 0) {
        affectedPlayerIds.add(player.playerId);
      }
    }

    const skipCount = new Set(conflicts.filter((c) => c.action === "skip").map((c) => c.playerId)).size;
    const reduceCount = new Set(conflicts.filter((c) => c.action !== "skip").map((c) => c.playerId)).size;

    // Check for critical: RED player with non-skip conflict on CONTACT or HIGH block
    if (conflicts.some((c) => c.flag === "RED" && c.action === "skip") && block.included) {
      hasCriticalConflict = true;
    }

    const severity: "none" | "warning" | "danger" =
      skipCount >= 3 || hasCriticalConflict ? "danger" : conflicts.length > 0 ? "warning" : "none";

    totalConflicts += conflicts.length;
    if (conflicts.length > 0) blocksWithConflicts++;

    return {
      blockId: block.id,
      blockTitle: block.title,
      blockType: block.type,
      exposureTags: block.exposureTags ?? [],
      conflicts,
      skipCount,
      reduceCount,
      severity,
    };
  });

  return {
    blocks: blockResults,
    totalPlayersAffected: affectedPlayerIds.size,
    totalConflicts,
    blocksWithConflicts,
    hasCriticalConflict,
  };
}

// ── Action labels ───────────────────────────────────────────────────

const ACTION_LABELS: Record<BlockConflictAction, { en: string; is: string }> = {
  skip: { en: "Skip", is: "Sleppa" },
  reduce_half: { en: "Half volume", is: "Helmingur" },
  reduce_volume: { en: "Reduce", is: "Minnka" },
  reduce_contact: { en: "Less contact", is: "Minni snerting" },
  lower_intensity: { en: "Lower intensity", is: "Lægra álag" },
};

export function getActionLabel(action: BlockConflictAction, lang: "IS" | "EN" = "IS"): string {
  return lang === "IS" ? ACTION_LABELS[action].is : ACTION_LABELS[action].en;
}

const SEVERITY_LABELS = {
  none: { en: "No conflicts", is: "Engir árekstrar" },
  warning: { en: "Conflicts found", is: "Árekstrar fundust" },
  danger: { en: "Critical conflicts", is: "Alvarlegir árekstrar" },
};

export function getSeverityLabel(severity: "none" | "warning" | "danger", lang: "IS" | "EN" = "IS"): string {
  return lang === "IS" ? SEVERITY_LABELS[severity].is : SEVERITY_LABELS[severity].en;
}

// ── Drill-level matching (for SessionBuilder) ─────────────────────
// These functions work with drill_library rows instead of SessionDraftBlocks,
// converting drill GPS metrics → exposure tags via the classifier.

import {
  classifyDrillExposureTags,
  estimateDrillIntensity,
  drillCategoryToBlockType,
  type DrillLike,
} from "@/lib/micropulse/drillExposureClassifier";

/**
 * A single drill selected in SessionBuilder.
 */
export type DrillSessionItem = {
  uid: string;
  drill: DrillLike & { id: string; drill_name: string };
  sets: number;
};

/**
 * Match all players' constraints against all drills in a SessionBuilder session.
 *
 * Converts each drill to a pseudo-block using the exposure classifier,
 * then runs the same matching logic as matchTeamConstraintsToBlocks.
 */
export function matchTeamConstraintsToDrills(
  items: DrillSessionItem[],
  players: PlayerConstraintInput[],
): TeamBlockConflictSummary {
  // Convert drills → pseudo-blocks
  const pseudoBlocks: SessionDraftBlock[] = items.map((item) => ({
    id: item.uid,
    type: drillCategoryToBlockType(item.drill.category) as SessionDraftBlock["type"],
    title: item.drill.drill_name,
    exposureTags: classifyDrillExposureTags(item.drill),
    included: true,
    durationMin: item.drill.duration_min ?? null,
    sets: item.sets,
    reps: null,
    intensity: estimateDrillIntensity(item.drill) as SessionDraftBlock["intensity"],
    modificationReason: null,
  }));

  return matchTeamConstraintsToBlocks(pseudoBlocks, players);
}

// ── Convert team decisions API response → PlayerConstraintInput[] ──

type PlayerDecisionLike = {
  athleteId: string;
  athleteName: string;
  state: "GREEN" | "YELLOW" | "RED" | "GRAY";
  constraints: string[];
  loadAdjustment: number | null;
};

/**
 * Constraint string → exposure limit mapping.
 */
const CONSTRAINT_TO_EXPOSURE: Record<string, SessionExposureTag[]> = {
  limit_high_speed_running: ["MAX_SPEED"],
  limit_accel_decel_density: ["HIGH_DECEL"],
  avoid_eccentric_overload: ["PLYOS"],
};

/**
 * Convert a player decision (from /api/team/decisions) to a PlayerConstraintInput
 * suitable for the drill-constraint matcher.
 */
export function playerDecisionToConstraintInput(p: PlayerDecisionLike): PlayerConstraintInput {
  const exposureLimits: SessionExposureTag[] = [];
  let volumeReductionPercent: number | null = null;
  let intensityCap: PlayerConstraintInput["intensityCap"] = null;

  for (const c of p.constraints) {
    // Exposure limits
    const mapped = CONSTRAINT_TO_EXPOSURE[c];
    if (mapped) {
      for (const tag of mapped) {
        if (!exposureLimits.includes(tag)) exposureLimits.push(tag);
      }
    }
    // Intensity caps
    if (c === "recovery_only") intensityCap = "RECOVERY_ONLY";
    else if (c === "technique_only" && intensityCap !== "RECOVERY_ONLY") intensityCap = "CAP_LOW";
    else if (c === "avoid_max_intensity" && !intensityCap) intensityCap = "CAP_MODERATE";

    // Volume reduction
    if (c === "limit_total_volume") volumeReductionPercent = 25;
  }

  // If loadAdjustment is negative, use it as volume reduction
  if (p.loadAdjustment != null && p.loadAdjustment < 0) {
    const pct = Math.abs(p.loadAdjustment);
    if (volumeReductionPercent == null || pct > volumeReductionPercent) {
      volumeReductionPercent = pct;
    }
  }

  return {
    playerId: p.athleteId,
    playerName: p.athleteName,
    flag: p.state,
    exposureLimits,
    volumeReductionPercent,
    intensityCap,
  };
}
