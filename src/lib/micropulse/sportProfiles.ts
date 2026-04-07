/**
 * Sport profiles — centralized config for what MicroPulse features and
 * metrics apply to each supported sport.
 *
 * Used by GPS tabs, decision engine, drill engine, SSG calculator,
 * check-in flow, and issue modules / fix modules.
 */

// ── Supported sports ──────────────────────────────────────────────────────

export type SportId = "football" | "basketball";

export interface SportProfile {
  id: SportId;
  nameIS: string;
  nameEN: string;
  environment: "outdoor" | "indoor" | "both";

  /** Primary GPS / wearable metrics for this sport (ordered by importance) */
  primaryMetrics: SportMetric[];

  /** Which check-in dimensions are most relevant (all are always asked, but these get extra weight in decision engine) */
  checkInWeights: {
    muscleSoreness: number;   // 0–1 relative weight
    fatigue: number;
    sleepQuality: number;
    sleepDuration: number;
    stressMood: number;
  };

  /** Most common injury areas for this sport (used by fix modules priority) */
  commonInjuryTags: string[];

  /** Whether SSG / drill calculator applies */
  hasSsgCalculator: boolean;

  /** Whether GPS provider integration is expected */
  hasGpsIntegration: boolean;

  /** Sport-specific notes (IS + EN) shown in coach dashboard */
  notesIS: string;
  notesEN: string;
}

export interface SportMetric {
  key: string;
  labelIS: string;
  labelEN: string;
  shortLabel: string;
  unit: string;
  /** Catapult / STATSports field aliases */
  aliases: string[];
  digits: number;
}

// ── Football ──────────────────────────────────────────────────────────────

const FOOTBALL_METRICS: SportMetric[] = [
  { key: "totalDistance",              labelIS: "Heildarvegalengd",          labelEN: "Total Distance",           shortLabel: "Tot Dist",    unit: "m",    aliases: ["totalDistance", "total_distance"],                                                                        digits: 0 },
  { key: "velocityBand5TotalDistance", labelIS: "Hraðasvið 5 vegalengd",    labelEN: "Vel Band 5 Distance",      shortLabel: "Vel B5",      unit: "m",    aliases: ["velocityBand5TotalDistance", "velocity_band5_total_distance"],                                             digits: 0 },
  { key: "velocityBand6TotalDistance", labelIS: "Hraðasvið 6 vegalengd",    labelEN: "Vel Band 6 Distance",      shortLabel: "Vel B6",      unit: "m",    aliases: ["velocityBand6TotalDistance", "velocity_band6_total_distance"],                                             digits: 0 },
  { key: "totalAccelerations",        labelIS: "Hröðun (fjöldi)",           labelEN: "Total Accelerations",      shortLabel: "Tot Accels",  unit: "#",    aliases: ["totalAccelerations", "total_accelerations", "tot_as", "totAs"],                                            digits: 0 },
  { key: "totalDecelerations",        labelIS: "Hægðun (fjöldi)",           labelEN: "Total Decelerations",      shortLabel: "Tot Decels",  unit: "#",    aliases: ["totalDecelerations", "total_decelerations", "tot_ds", "totDs"],                                            digits: 0 },
  { key: "accelBand2to3Efforts",      labelIS: "Hröðun B2-3",              labelEN: "Accel B2-3 Efforts",       shortLabel: "Accel B2-3",  unit: "#",    aliases: ["accelBand2to3Efforts", "accel_band2to3_efforts", "accel_b2_3_tot_effs_gen2", "accelB23TotEffsGen2"],        digits: 0 },
  { key: "decelBand2to3Efforts",      labelIS: "Hægðun B2-3",              labelEN: "Decel B2-3 Efforts",       shortLabel: "Decel B2-3",  unit: "#",    aliases: ["decelBand2to3Efforts", "decel_band2to3_efforts", "decel_b2_3_tot_effs_gen2", "decelB23TotEffsGen2"],        digits: 0 },
  { key: "maxVel",                    labelIS: "Hámarkshraði",              labelEN: "Max Velocity",             shortLabel: "Max Vel",     unit: "km/h", aliases: ["maxVel", "max_vel", "max_velocity"],                                                                       digits: 1 },
  { key: "sprintDistance",            labelIS: "Sprettvegalengd",           labelEN: "Sprint Distance",          shortLabel: "Sprint Dist", unit: "m",    aliases: ["sprintDistance", "sprint_distance"],                                                                       digits: 0 },
  { key: "totalPlayerLoad",           labelIS: "Player Load",               labelEN: "Player Load",              shortLabel: "PL",          unit: "AU",   aliases: ["totalPlayerLoad", "total_player_load"],                                                                    digits: 1 },
];

// ── Basketball ────────────────────────────────────────────────────────────

const BASKETBALL_METRICS: SportMetric[] = [
  { key: "totalPlayerLoad",     labelIS: "Player Load",               labelEN: "Player Load",              shortLabel: "PL",          unit: "AU",   aliases: ["totalPlayerLoad", "total_player_load"],                   digits: 1 },
  { key: "playerLoadPerMinute", labelIS: "Player Load / min",         labelEN: "Player Load / min",        shortLabel: "PL/min",      unit: "AU/m", aliases: ["playerLoadPerMinute", "player_load_per_minute"],           digits: 2 },
  { key: "imaCod",              labelIS: "Stefnubreytingar (IMA)",    labelEN: "Changes of Direction",     shortLabel: "IMA COD",     unit: "#",    aliases: ["imaCod", "ima_cod", "cod_events"],                        digits: 0 },
  { key: "imaAccel",            labelIS: "IMA hröðun",                labelEN: "IMA Accelerations",        shortLabel: "IMA Accels",  unit: "#",    aliases: ["imaAccel", "ima_accel"],                                  digits: 0 },
  { key: "imaDecel",            labelIS: "IMA hægðun",                labelEN: "IMA Decelerations",        shortLabel: "IMA Decels",  unit: "#",    aliases: ["imaDecel", "ima_decel"],                                  digits: 0 },
  { key: "totalDistance",       labelIS: "Heildarvegalengd",          labelEN: "Total Distance",           shortLabel: "Tot Dist",    unit: "m",    aliases: ["totalDistance", "total_distance"],                        digits: 0 },
  { key: "maxVel",              labelIS: "Hámarkshraði",              labelEN: "Max Velocity",             shortLabel: "Max Vel",     unit: "km/h", aliases: ["maxVel", "max_vel", "max_velocity"],                      digits: 1 },
  { key: "jumpCount",           labelIS: "Stokkfjöldi",               labelEN: "Jump Count",               shortLabel: "Jumps",       unit: "#",    aliases: ["jumpCount", "jump_count", "jumps"],                       digits: 0 },
  { key: "highIma",             labelIS: "High-IMA (≥3.5 m/s²)",     labelEN: "High-IMA (≥3.5 m/s²)",    shortLabel: "Hi-IMA",      unit: "#",    aliases: ["highIma", "high_ima"],                                    digits: 0 },
];

// ── Profile registry ──────────────────────────────────────────────────────

export const SPORT_PROFILES: Record<SportId, SportProfile> = {
  football: {
    id: "football",
    nameIS: "Fótbolti",
    nameEN: "Football",
    environment: "outdoor",
    primaryMetrics: FOOTBALL_METRICS,
    checkInWeights: {
      muscleSoreness: 0.9,
      fatigue: 0.85,
      sleepQuality: 0.7,
      sleepDuration: 0.65,
      stressMood: 0.5,
    },
    commonInjuryTags: [
      "HAMSTRING_TIGHTNESS",
      "HIP_STIFFNESS",
      "ADDUCTOR_GROIN",
      "CALF_ACHILLES_SORENESS",
      "ANTERIOR_KNEE_PAIN",
    ],
    hasSsgCalculator: true,
    hasGpsIntegration: true,
    notesIS: "GPS mælikvarðar frá Catapult/STATSports: hraðasvið, hröðun/hægðun, ACWR, sprettvegalengd og Player Load.",
    notesEN: "GPS metrics from Catapult/STATSports: velocity bands, accel/decel, ACWR, sprint distance and Player Load.",
  },

  basketball: {
    id: "basketball",
    nameIS: "Körfubolti",
    nameEN: "Basketball",
    environment: "indoor",
    primaryMetrics: BASKETBALL_METRICS,
    checkInWeights: {
      muscleSoreness: 0.85,
      fatigue: 0.9,
      sleepQuality: 0.75,
      sleepDuration: 0.7,
      stressMood: 0.55,
    },
    commonInjuryTags: [
      "ANTERIOR_KNEE_PAIN",
      "CALF_ACHILLES_SORENESS",
      "LOW_BACK_TIGHTNESS",
      "SHOULDER_TIGHTNESS",
      "HIP_STIFFNESS",
    ],
    hasSsgCalculator: false,
    hasGpsIntegration: true,
    notesIS: "Player Load, IMA stefnubreytingar, hröðun/hægðun og Max Velocity frá Catapult innanhúss. Hraðasvið eiga ekki við innanhúss.",
    notesEN: "Player Load, IMA changes of direction, accel/decel and Max Velocity from Catapult indoor. Velocity bands not applicable indoors.",
  },

};

// ── Helpers ───────────────────────────────────────────────────────────────

export function getSportProfile(sport: string | null | undefined): SportProfile {
  if (sport && sport in SPORT_PROFILES) return SPORT_PROFILES[sport as SportId];
  return SPORT_PROFILES.football; // default fallback
}

export function isIndoorSport(sport: string | null | undefined): boolean {
  const profile = getSportProfile(sport);
  return profile.environment === "indoor";
}

export function getMetricsForSport(sport: string | null | undefined): SportMetric[] {
  return getSportProfile(sport).primaryMetrics;
}

export function getCommonInjuryTags(sport: string | null | undefined): string[] {
  return getSportProfile(sport).commonInjuryTags;
}

/** Feature availability matrix — what each sport can use in MicroPulse */
export interface SportFeatureMatrix {
  feature: string;
  featureIS: string;
  football: boolean | string;
  basketball: boolean | string;
}

export const FEATURE_MATRIX: SportFeatureMatrix[] = [
  { feature: "Daily check-in (readiness)",       featureIS: "Daglegt check-in (readiness)",       football: true,  basketball: true  },
  { feature: "RPE tracking",                     featureIS: "RPE mælingar",                       football: true,  basketball: true  },
  { feature: "GPS load monitoring (ACWR)",       featureIS: "GPS álagsmælingar (ACWR)",            football: true,  basketball: true  },
  { feature: "Velocity bands",                   featureIS: "Hraðasvið",                          football: true,  basketball: false },
  { feature: "Sprint distance",                  featureIS: "Sprettvegalengd",                    football: true,  basketball: false },
  { feature: "Player Load",                      featureIS: "Player Load",                        football: true,  basketball: true  },
  { feature: "Player Load / min",                featureIS: "Player Load / mín",                  football: false, basketball: true  },
  { feature: "IMA (COD, accel, decel)",          featureIS: "IMA (stefnubreyt., hröðun, hægðun)", football: false, basketball: true  },
  { feature: "Jump count",                       featureIS: "Stokkfjöldi",                        football: false, basketball: true  },
  { feature: "SSG / drill calculator",           featureIS: "SSG / drill reiknivél",              football: true,  basketball: false },
  { feature: "FULL / REDUCED / RECOVERY",        featureIS: "FULL / REDUCED / RECOVERY",          football: true,  basketball: true  },
  { feature: "Mechanical Load Index (MLI)",      featureIS: "Mechanical Load Index (MLI)",        football: true,  basketball: "PL-based" },
  { feature: "Metabolic Load Score",             featureIS: "Metabolic Load Score",               football: true,  basketball: false },
  { feature: "MET / fix modules (injury prev.)", featureIS: "MET / fix modules (meiðslafov.)",   football: true,  basketball: true  },
  { feature: "VALD force plate (CMJ)",           featureIS: "VALD kraftplata (CMJ)",              football: true,  basketball: true  },
  { feature: "VBT / GymAware",                   featureIS: "VBT / GymAware",                    football: true,  basketball: true  },
  { feature: "Adaptive Training Engine",         featureIS: "Adaptive Training Engine",           football: true,  basketball: true  },
  { feature: "Match-week periodization",         featureIS: "Leikvikulotur (MD-/+)",              football: true,  basketball: true  },
  { feature: "Catapult integration",             featureIS: "Catapult tenging",                   football: true,  basketball: true  },
  { feature: "STATSports integration",           featureIS: "STATSports tenging",                 football: true,  basketball: false },
  { feature: "Kinexon integration",              featureIS: "Kinexon tenging",                    football: false, basketball: "Coming" },
];
