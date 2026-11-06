/**
 * The research standard for IMA accelerations, decelerations and change of direction, per day-type. One
 * table read by BOTH the Meso calendar (what is planned) and "Did we do enough?" (what is judged), kept in
 * its own small file so the post-training card doesn't pull the periodization engine into its bundle.
 */
import type { CalType } from "./index";

// IMA TOTAL counts (accelerations, decelerations, CoD) per day-type, as a share of the match — the RESEARCH
// STANDARD, one table for every team. Separate from `accdec` in CAL_SHARE, which is for the Band 2–3 HIGH-INTENSITY
// subset (that can overshoot the match on a mechanical day). A share of the players' own match is the only
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
