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

type Bi = { en: string; is: string };

export const ROLE_MODEL_CITATIONS = [
  "Ju et al. 2022 (Biol Sport) — peak demands by position",
  "Modric et al. 2019 (IJERPH) — running <-> game performance, position-specific",
  "Bradley & Ade 2016 — position- and sub-role-specific physical/tactical demands",
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

// ── Role-Demand Fit demand model (Ju 5-group partition x SUB-ROLE) ────────────
// Position alone under-specifies the demand: a classic winger (stay wide, beat the man)
// and an inverted winger (cut inside, combine) differ in driver signature and demand. So
// the model is keyed position -> subRole, with a `default` sub-role (the more generic of a
// position's variants) used when the sub-role is unknown. Weights 0-1 = demanded importance
// (relative profile, not a distribution — normalised at compute time). Each sub-role also
// carries the DRIVER archetype the IMA signature is checked against (as classifyStyle axes
// speed/agility/volume/aerial) and the ideal OUTPUT metric for the confirmation read. These
// are directional research seeds, coach-tunable per club.
export type SubRoleDemand = {
  weights: Partial<Record<QualityId, number>>;
  /** Plain archetype description (directional bias + accel/decel/CoD profile). */
  driver: Bi;
  /** classifyStyle axes the archetype maps to — the driver-fit check. */
  driverAxes: string[];
  /** The role's ideal output metric(s) for the output-confirmation read (context/provenance). */
  output: Bi;
  cite: string;
};
export type RoleFitModel = { default: string; subRoles: Record<string, SubRoleDemand> };

export const ROLE_DEMAND_FIT: Record<JuGroup, RoleFitModel> = {
  // Winger (WOP) — repeated max sprints + directional creation + peak output.
  WOP: {
    default: "classic",
    subRoles: {
      classic: {
        weights: { speed: 1.0, anaerobic_reserve: 1.0, mechanical_power: 0.9, peak_demands: 0.9, reactive_power: 0.8, robustness: 0.7, aerobic_endurance: 0.6, vbt_power: 0.6 },
        driver: { en: "high top-speed, straight-line, touchline bias", is: "hár topphraði, beinar línur, kant-hneigð" },
        driverAxes: ["speed"],
        output: { en: "goals + assists, xG, successful crosses/dribbles", is: "mörk + stoðsendingar, xG, heppnaðar fyrirgjafir/rekstur" },
        cite: "Modric 2019 (wide sprint r=0.80) + Ju 2022 (wide = highest peak)",
      },
      inverted: {
        weights: { speed: 0.9, mechanical_power: 0.9, anaerobic_reserve: 0.9, reactive_power: 0.9, peak_demands: 0.9, robustness: 0.7, aerobic_endurance: 0.6, vbt_power: 0.6 },
        driver: { en: "high CoD/decel, inside-cut bias", is: "mikil stefnubreyting/hemlun, innskurðar-hneigð" },
        driverAxes: ["agility", "speed"],
        output: { en: "goals, xG, shots, key passes", is: "mörk, xG, skot, lykilsendingar" },
        cite: "Modric 2019 (CoD) + Bradley & Ade 2016 (inside-forward demand)",
      },
    },
  },
  // Full-back (WDP) — overlap + recovery sprints; the most all-round physical role.
  WDP: {
    default: "attacking",
    subRoles: {
      attacking: {
        weights: { aerobic_endurance: 1.0, speed: 0.9, anaerobic_reserve: 0.9, peak_demands: 0.9, mechanical_power: 0.8, reactive_power: 0.7, robustness: 0.7, vbt_power: 0.6 },
        driver: { en: "repeated up-down, high volume", is: "endurtekið upp-niður, mikið magn" },
        driverAxes: ["volume", "speed"],
        output: { en: "progressive carries, crosses, OBV", is: "framdrifin rekstur, fyrirgjafir, OBV" },
        cite: "Modric 2019 (full-back decel) + Bradley & Ade 2016 (overlap = CS)",
      },
      defensive: {
        weights: { aerobic_endurance: 0.9, speed: 0.8, anaerobic_reserve: 0.8, mechanical_power: 0.8, peak_demands: 0.8, robustness: 0.8, reactive_power: 0.7, vbt_power: 0.6 },
        driver: { en: "recovery-run heavy, decel", is: "mikil bakvarðar-hlaup, hemlun" },
        driverAxes: ["volume", "agility"],
        output: { en: "defensive actions, duels", is: "varnaraðgerðir, návígi" },
        cite: "Modric 2019 (full-back decel r=-0.43)",
      },
    },
  },
  // Central mid (CMP) — greatest total volume + sustained engine (Modric: highest distance).
  CMP: {
    default: "box_to_box",
    subRoles: {
      box_to_box: {
        weights: { aerobic_endurance: 1.0, peak_demands: 0.8, mechanical_power: 0.7, anaerobic_reserve: 0.7, reactive_power: 0.7, robustness: 0.8, speed: 0.6, vbt_power: 0.6 },
        driver: { en: "high-volume medium efforts, all directions", is: "mikið magn miðlungs-átaka, allar áttir" },
        driverAxes: ["volume", "agility"],
        output: { en: "OBV, progressive passes, ball recoveries", is: "OBV, framdrifnar sendingar, boltaheimtur" },
        cite: "Modric 2019 (central mid greatest distance)",
      },
      deep_lying: {
        weights: { aerobic_endurance: 0.9, peak_demands: 0.7, mechanical_power: 0.6, anaerobic_reserve: 0.6, reactive_power: 0.6, robustness: 0.8, speed: 0.5, vbt_power: 0.6 },
        driver: { en: "lower peak, positional", is: "lægra hámark, staðsetningarlegt" },
        driverAxes: ["volume", "structural"],
        output: { en: "passes, progressive passes, interceptions", is: "sendingar, framdrifnar sendingar, stöðvanir" },
        cite: "Bradley & Ade 2016 (deep-lying demand)",
      },
      advanced: {
        weights: { mechanical_power: 0.8, anaerobic_reserve: 0.8, reactive_power: 0.8, peak_demands: 0.8, aerobic_endurance: 0.8, speed: 0.7, robustness: 0.7, vbt_power: 0.6 },
        driver: { en: "burst + CoD in tight space", is: "sprengja + stefnubreyting í þröngu rými" },
        driverAxes: ["agility", "speed"],
        output: { en: "xG + xA, key passes, shots", is: "xG + xA, lykilsendingar, skot" },
        cite: "Bradley & Ade 2016 (#10 demand) + Modric 2019 (CoD)",
      },
    },
  },
  // Centre-back (CDP) — lowest peak running (Ju), robustness/aerial carry the role.
  CDP: {
    default: "ball_playing",
    subRoles: {
      ball_playing: {
        weights: { robustness: 0.9, mechanical_power: 0.8, vbt_power: 0.7, speed: 0.6, peak_demands: 0.6, reactive_power: 0.6, aerobic_endurance: 0.6, anaerobic_reserve: 0.5 },
        driver: { en: "low volume, jump/aerial", is: "lítið magn, stökk/loft" },
        driverAxes: ["aerial", "structural"],
        output: { en: "progressive passes, pass %, aerial win %", is: "framdrifnar sendingar, sendinga %, loft-vinningar %" },
        cite: "Ju 2022 (CB lowest peak) + Bradley & Ade 2016 (ball-playing CB)",
      },
      stopper: {
        weights: { robustness: 1.0, mechanical_power: 0.9, vbt_power: 0.8, speed: 0.7, reactive_power: 0.7, peak_demands: 0.6, aerobic_endurance: 0.6, anaerobic_reserve: 0.6 },
        driver: { en: "short sprints, aerial, physical duels", is: "stuttir sprettir, loft, líkamleg návígi" },
        driverAxes: ["aerial", "speed"],
        output: { en: "duels/aerials won, clearances, blocks", is: "návígi/loft unnin, fráköst, blokkeringar" },
        cite: "Modric 2019 (CB HI-accel r=0.49) + Bradley & Ade 2016",
      },
    },
  },
  // Centre-forward (COP) — sprint threat in behind + repeated max efforts + peak output.
  COP: {
    default: "mobile",
    subRoles: {
      target: {
        weights: { mechanical_power: 1.0, speed: 0.8, anaerobic_reserve: 0.8, reactive_power: 0.8, peak_demands: 0.8, vbt_power: 0.8, robustness: 0.8, aerobic_endurance: 0.6 },
        driver: { en: "short bursts, hold-up, aerial", is: "stuttar sprengjur, halda bolta, loft" },
        driverAxes: ["aerial", "speed"],
        output: { en: "goals, xG, shots, aerials", is: "mörk, xG, skot, loft" },
        cite: "Bradley & Ade 2016 (target #9) + Ju 2022 (peak output)",
      },
      mobile: {
        weights: { speed: 1.0, anaerobic_reserve: 1.0, mechanical_power: 0.9, peak_demands: 0.9, reactive_power: 0.8, aerobic_endurance: 0.7, robustness: 0.7, vbt_power: 0.6 },
        driver: { en: "run-in-behind, top-speed", is: "hlaup á bak við, topphraði" },
        driverAxes: ["speed"],
        output: { en: "goals, xG, run-in-behind, sprints", is: "mörk, xG, hlaup á bak við, sprettir" },
        cite: "Modric 2019 (forwards sprint r=0.80) + Ju 2022 (peak output)",
      },
    },
  },
};

/** Resolve a (Ju group, sub-role) to its demand model, falling back to the group's default sub-role. */
export function resolveRoleFit(group: JuGroup, subRole?: string | null): { subRole: string; demand: SubRoleDemand } {
  const model = ROLE_DEMAND_FIT[group];
  const key = subRole && model.subRoles[subRole] ? subRole : model.default;
  return { subRole: key, demand: model.subRoles[key] };
}

/** Sub-roles offered per Ju group (for a coach picker later). */
export const SUB_ROLES: Record<JuGroup, string[]> = {
  WOP: Object.keys(ROLE_DEMAND_FIT.WOP.subRoles),
  WDP: Object.keys(ROLE_DEMAND_FIT.WDP.subRoles),
  CMP: Object.keys(ROLE_DEMAND_FIT.CMP.subRoles),
  CDP: Object.keys(ROLE_DEMAND_FIT.CDP.subRoles),
  COP: Object.keys(ROLE_DEMAND_FIT.COP.subRoles),
};
