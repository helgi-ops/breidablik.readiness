/**
 * Estimate Metabolic Power / HMLD / Time > HML for a drill from its player_load.
 *
 * Calibration fitted on Breiðablik's own player_external_load_daily data (n=335):
 *   HMLD_m                 ≈ 3.4 × player_load          (Pearson r = 0.54)
 *   time_above_threshold_s ≈ 0.6 × player_load (≥ 0)    (Pearson r = 0.72)
 *
 * Peak/Avg MetPwr: no reliable calibration in current data (peak has no
 * significant correlation with PL; avg is never populated in ETL). Caller
 * should manually enter these if needed.
 *
 * Use this for estimated defaults only — prefer Catapult-measured values
 * when available and set `metabolic_estimated = false` in that case.
 */

export const METABOLIC_CALIBRATION = {
  hmldPerPl: 3.4,           // HMLD_m ≈ 3.4 × player_load
  timeAbovePerPl: 0.6,      // time > HML (s) ≈ 0.6 × player_load
  hmldR: 0.544,             // correlation from fit
  timeAboveR: 0.722,        // correlation from fit
  sampleSize: 335,          // player×date pairs used
} as const;

export type MetabolicEstimate = {
  hmld_m: number;
  time_above_threshold_s: number;
};

export function estimateMetabolicFromPl(playerLoad: number): MetabolicEstimate {
  return {
    hmld_m: Math.round(METABOLIC_CALIBRATION.hmldPerPl * playerLoad),
    time_above_threshold_s: Math.max(
      0,
      Math.round(METABOLIC_CALIBRATION.timeAbovePerPl * playerLoad),
    ),
  };
}
