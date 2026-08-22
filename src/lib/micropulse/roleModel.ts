/**
 * Role-demand model — the single home for position -> physical-quality demand weights.
 *
 * Two cited weight tables live here so role weights are never scattered across engines:
 *
 *  1. GAME_PLAN_ROLE_DEMAND — the matchday capacity weighting consumed by Game-Plan Fit
 *     (role x opponent x capacity x readiness). Offensive/athletic axes, keyed by the
 *     6-group RoleGroup partition (RW/LW folded into AM). Moved verbatim from gamePlanFit
 *     so that engine is byte-for-byte unchanged; it now imports this constant.
 *
 *  2. ROLE_DEMAND_FIT — the development/scouting demand model for Role-Demand Fit. Keyed
 *     by Ju et al.'s 5 outfield groups (winger WOP split from centre-forward COP), over a
 *     HOLISTIC quality set that includes the durability base (aerobic_endurance, robustness)
 *     the game-plan table intentionally omits — so a winger's endurance/durability can
 *     surface as a demand-weighted watch-item, which the offensive table can never show.
 *
 * These encode DIFFERENT questions (match capacity vs holistic role demand) over DIFFERENT
 * position partitions, so they are two tables by design, not a duplicated one. Every weight
 * cites its basis. Pure data — no I/O, never touches the readiness colour or daily decision.
 *
 * Scientific basis:
 *  - Ju et al. 2022 (Biol Sport 39(4):973-983) — peak demands by position: wide players
 *    (winger, full-back) carry the highest peak running; centre-backs the lowest.
 *  - Modric et al. 2019 (IJERPH 16:4032) — which running quality drives game performance is
 *    position-specific (forwards sprint; full-backs decel; centre-backs HI-accel + distance;
 *    central mids greatest total distance).
 *  - Bradley & Ade — read physical capacity against the tactical role, not a generic average.
 */

import type { QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { JuGroup } from "@/lib/micropulse/positionStyle";

export const ROLE_MODEL_CITATIONS = [
  "Ju et al. 2022 (Biol Sport) — peak demands by position",
  "Modric et al. 2019 (IJERPH) — running <-> game performance, position-specific",
  "Bradley & Ade — role-contextualised physical capacity",
];

// ── Game-Plan Fit capacity weights (6-group RoleGroup partition) ──────────────
// Base weights need not sum to 1 (normalised at compute time). GK is intentionally unscored.
export const GAME_PLAN_ROLE_DEMAND: Record<"CB" | "FB" | "CM" | "AM" | "CF", Partial<Record<QualityId, number>>> = {
  // Forward: sprint threat behind the line (Modric r=0.80) + D' for repeated run-in-behind + aerial.
  CF: { speed: 0.40, anaerobic_reserve: 0.30, acceleration: 0.15, reactive_power: 0.15 },
  // Full-back: braking on the recovery + repeatable overlap (Modric decel r=-0.43; Ade overlap = CS).
  FB: { deceleration: 0.35, aerobic_endurance: 0.30, speed: 0.20, change_of_direction: 0.15 },
  // Centre-back: high-intensity acceleration + covering distance (Modric r=0.49 / r=0.42) + aerial.
  CB: { acceleration: 0.30, work_capacity: 0.25, aerobic_endurance: 0.25, reactive_power: 0.20 },
  // Central midfield: greatest total volume + sustained engine + multidirectional (Modric distance).
  CM: { work_capacity: 0.30, aerobic_endurance: 0.30, change_of_direction: 0.25, acceleration: 0.15 },
  // Wide / attacking midfield: multidirectional creation + repeated sprints (Ade wide HI profile).
  AM: { change_of_direction: 0.30, speed: 0.30, acceleration: 0.20, anaerobic_reserve: 0.20 },
};

// ── Role-Demand Fit demand model (Ju 5-group partition) ───────────────────────
// Holistic role demand 0-1 per quality — includes the durability base (aerobic, robustness).
// Weights are demanded-importance, not a distribution (normalised at compute time).
export type RoleFitDemand = { weights: Partial<Record<QualityId, number>>; cite: string };

export const ROLE_DEMAND_FIT: Record<JuGroup, RoleFitDemand> = {
  // Winger (WOP): repeated max sprints + directional creation + peak output; endurance/durability
  // are the base that sustains the repeated peaks (Ju: wide players highest peak demands).
  WOP: {
    weights: { speed: 1.0, anaerobic_reserve: 1.0, mechanical_power: 0.9, peak_demands: 0.9, robustness: 0.7, aerobic_endurance: 0.6 },
    cite: "Ju 2022 (wide = highest peak) + Modric 2019 (forwards/wide sprint)",
  },
  // Full-back (WDP): overlap + recovery sprints demand BOTH speed and a big aerobic base (Modric decel;
  // Ade overlap = critical speed) — the most all-round physical role.
  WDP: {
    weights: { speed: 0.9, aerobic_endurance: 0.9, anaerobic_reserve: 0.9, peak_demands: 0.9, mechanical_power: 0.8, robustness: 0.7 },
    cite: "Modric 2019 (full-back decel) + Bradley & Ade (overlap = CS)",
  },
  // Central mid (CMP): greatest total volume + sustained engine (Modric: highest distance).
  CMP: {
    weights: { aerobic_endurance: 1.0, peak_demands: 0.8, mechanical_power: 0.7, anaerobic_reserve: 0.7, robustness: 0.7, speed: 0.6 },
    cite: "Modric 2019 (central mid greatest distance)",
  },
  // Centre-back (CDP): lowest peak running (Ju), but robustness/durability + explosive first steps
  // + covering distance carry the role.
  CDP: {
    weights: { robustness: 0.9, mechanical_power: 0.8, peak_demands: 0.6, speed: 0.6, aerobic_endurance: 0.6, anaerobic_reserve: 0.5 },
    cite: "Ju 2022 (CB lowest peak) + Modric 2019 (CB HI-accel + distance)",
  },
  // Centre-forward (COP): sprint threat in behind + repeated max efforts + peak output.
  COP: {
    weights: { speed: 0.9, mechanical_power: 0.9, anaerobic_reserve: 0.9, peak_demands: 0.8, robustness: 0.7, aerobic_endurance: 0.6 },
    cite: "Modric 2019 (forwards sprint r=0.80) + Ju 2022 (peak output)",
  },
};
