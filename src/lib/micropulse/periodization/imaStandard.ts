/**
 * The research standard for IMA accelerations, decelerations and change of direction, per day-type. One
 * table read by BOTH the Meso calendar (what is planned) and "Did we do enough?" (what is judged), kept in
 * its own small file so the post-training card doesn't pull the periodization engine into its bundle.
 */
import type { CalType } from "./index";

// IMA TOTAL counts (accelerations, decelerations, CoD) per day-type, as a share of the match — the RESEARCH
// STANDARD, one table for every team. Separate from CAL_SHARE_HI below, which is for the Band 2–3 HIGH-INTENSITY
// subset. A share of the players' own match is the only
// form that transfers between tracking systems: Silva 2022 (systematic review, 42 studies) could not pool
// absolute counts because devices and thresholds differ.
//   Stevens 2017 (Eredivisie, medium+high counts, accel / decel): MD-4 87/87%, MD-3 56/56%, MD-2 56/56%,
//     MD-1 36/40%, non-starters' MD+1 56/56%. Same tracking system in training and match.
//   Martín-García 2018 (La Liga reserve side, >3 m/s²): MD-4 71–72%, MD-3 62–69%, MD-2 56–61%, compensatory MD+1 80–86%.
// Mapping onto day-types: Mechanical = the week's biggest acc/dec day, Mixed = mid-week, Activation = MD-1,
// Top-up = non-starters' MD+1. Locomotive has NO measured value: it comes from Buchheit 2019's framework (a
// running day is deliberately light on mechanical work), so it is labelled as framework, not measurement.
// No study reports IMA CoD: it follows the same share as a mechanical-work proxy.
// These studies DESCRIBE elite teams, they do not prove an optimum (Clemente 2019 says which ratio is best is
// still unresearched), so each value carries a range in CAL_SHARE_IMA_REF. A week built from these shares
// lands near the published 3.1–3.9 matches per week (Stevens, training + match).
// Replaced team-percentile targets 2026-11-06: a team's own percentiles are circular as a target ("what you
// usually do" becomes "what you should do"), so they are now only compared to this standard.
export const CAL_SHARE_IMA: Record<CalType, { accel: number; decel: number; cod: number }> = {
  mechanical: { accel: 0.80, decel: 0.80, cod: 0.80 },
  mixed: { accel: 0.60, decel: 0.60, cod: 0.60 },
  topup: { accel: 0.55, decel: 0.55, cod: 0.55 },
  locomotive: { accel: 0.50, decel: 0.50, cod: 0.50 },
  activation: { accel: 0.38, decel: 0.38, cod: 0.38 },
  match: { accel: 1, decel: 1, cod: 1 },
  rest: { accel: 0, decel: 0, cod: 0 },
};

export type ImaVar = "accel" | "decel" | "cod";
export type ImaTrainingDayType = "mechanical" | "mixed" | "locomotive" | "activation" | "topup";
/** The published range behind each CAL_SHARE_IMA value, with how strong that evidence is. */
export const CAL_SHARE_IMA_REF: Record<ImaTrainingDayType, { range: [number, number]; evidence: "measured" | "framework"; source: string }> = {
  mechanical: { range: [0.70, 0.90], evidence: "measured", source: "Stevens 2017; Martín-García 2018" },
  mixed: { range: [0.55, 0.70], evidence: "measured", source: "Stevens 2017; Martín-García 2018" },
  topup: { range: [0.50, 0.85], evidence: "measured", source: "Stevens 2017; Martín-García 2018" },
  activation: { range: [0.33, 0.43], evidence: "measured", source: "Stevens 2017" },
  locomotive: { range: [0.45, 0.60], evidence: "framework", source: "Buchheit 2019" },
};

// High-intensity efforts, high-speed running and sprint per day-type, as a share of the player's own match. Same idea as above,
// weaker evidence, so each variable says what backs it.
//   Acc/Dec B2-3, from Stevens 2017 (high, >3 m/s², accel / decel): MD-4 108/84%, MD-3 72/52%, MD-2 74/50%, MD-1 43/40%,
//     non-starters' MD+1 57-66/45-47%; Martín-García 2018 (>3 m/s²): MD-4 71-72%, MD-3 62-69%, MD-2 56-61%,
//     compensatory MD+1 80-86%. Each value is the midpoint between the two studies. Locomotive has no measured value.
//   HSR (>19.8 km/h), from Stevens 2017: MD-4 34%, MD-3 38%, MD-2 24%, MD-1 14%, non-starters' MD+1 10-39%; Martín-García
//     2018's biggest day (MD-4): 43%. Mixed = midpoint of MD-3 and MD-2; Activation = MD-1; Top-up = the non-starters;
//     Locomotive = the biggest day measured, rounded up. No study isolates a dedicated running day, so 45% may be low for a
//     team that wants more. Mechanical is DERIVED: those MD-4 figures average whole sessions, and a tight-space day is
//     meant to stay light on HSR (Buchheit 2019), so it sits under Mixed. Five such days sum to 1.40× a match a week,
//     inside the published 0.2-2.3 (Gualtieri 2023; Stevens 1.1, Martín-García 1.7).
//   Sprint is thin: the only measured per-day figure is Martín-García 2018's biggest day, 45% of a match (>25.2 km/h).
//     Mechanical = the rate in small-sided games, 6-12% of a match's sprint per minute (Dalen 2019). Mixed and Activation
//     are DERIVED: that 45% scaled by Stevens 2017's HSR taper (MD-3 38%, MD-2 24%, MD-1 14%). Top-up = Stevens'
//     non-starter HSR (10-39%). Five such days sum to 1.25× a match a week, inside the published 0.03-1.3 (Gualtieri 2023).
// Sprint is the least certain number in this file: read it as a sensible starting point, not a finding.
export const CAL_SHARE_HI: Record<CalType, { accHi: number; decHi: number; hsr: number; sprint: number }> = {
  mechanical: { accHi: 0.90, decHi: 0.80, hsr: 0.25, sprint: 0.10 },
  mixed: { accHi: 0.65, decHi: 0.60, hsr: 0.30, sprint: 0.30 },
  topup: { accHi: 0.70, decHi: 0.65, hsr: 0.25, sprint: 0.25 },
  locomotive: { accHi: 0.45, decHi: 0.45, hsr: 0.45, sprint: 0.45 },
  activation: { accHi: 0.43, decHi: 0.40, hsr: 0.15, sprint: 0.15 },
  match: { accHi: 1, decHi: 1, hsr: 1, sprint: 1 },
  rest: { accHi: 0, decHi: 0, hsr: 0, sprint: 0 },
};

export type HiVar = "accHi" | "decHi" | "hsr" | "sprint";
export type HiEvidence = "measured" | "derived" | "framework";
/** The published range behind each CAL_SHARE_HI value, and how strong that evidence is. */
export const CAL_SHARE_HI_REF: Record<ImaTrainingDayType, Record<HiVar, { range: [number, number]; evidence: HiEvidence }>> = {
  mechanical: {
    accHi: { range: [0.70, 1.10], evidence: "measured" },
    decHi: { range: [0.70, 0.85], evidence: "measured" },
    hsr: { range: [0.15, 0.34], evidence: "derived" },
    sprint: { range: [0.05, 0.15], evidence: "derived" },
  },
  mixed: {
    accHi: { range: [0.55, 0.75], evidence: "measured" },
    decHi: { range: [0.50, 0.70], evidence: "measured" },
    hsr: { range: [0.24, 0.38], evidence: "measured" },
    sprint: { range: [0.25, 0.40], evidence: "derived" },
  },
  topup: {
    accHi: { range: [0.55, 0.85], evidence: "measured" },
    decHi: { range: [0.45, 0.85], evidence: "measured" },
    hsr: { range: [0.10, 0.39], evidence: "measured" },
    sprint: { range: [0.10, 0.40], evidence: "derived" },
  },
  locomotive: {
    accHi: { range: [0.35, 0.55], evidence: "framework" },
    decHi: { range: [0.35, 0.55], evidence: "framework" },
    hsr: { range: [0.38, 0.45], evidence: "measured" },
    sprint: { range: [0.35, 0.55], evidence: "measured" },
  },
  activation: {
    accHi: { range: [0.38, 0.48], evidence: "measured" },
    decHi: { range: [0.35, 0.45], evidence: "measured" },
    hsr: { range: [0.10, 0.20], evidence: "measured" },
    sprint: { range: [0.10, 0.20], evidence: "derived" },
  },
};

/** In-season light week: volume about 20% under that week's own ramp, intensity held. Fessi 2016 tapered
 *  weeks (load -25.5%, intensity unchanged, higher match running after) and Moalla 2021 (3 standard + 1 taper,
 *  about -18%). Both observational, one club each, so it's the coach's call and never automatic. */
export const LIGHT_WEEK_VOL = 0.8;
