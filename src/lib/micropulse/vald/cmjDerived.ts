/**
 * Derived CMJ metrics for the fatigue read (item 4).
 *
 * Pure, side-effect free. Two derivations the CV gate then treats like any other
 * phase metric:
 *
 *  - FT:CT (flight-time : contraction-time). Edwards 2018: FT:CT is fatigue-
 *    sensitive in team-sport athletes. Flight time is recovered from the measured
 *    jump height via the projectile relation h = g·t_f²/8 → t_f = √(8h/g) — the
 *    same relation a jump mat uses to report height — so FT:CT is available from
 *    data already stored, and supersedes it with a directly measured flight time
 *    when VALD provides one.
 *
 *  - Normalised early RFD. D'Emanuele 2021 / Maffiuletti: report RFD as a windowed
 *    slope normalised to peak force, never instantaneous peak. Here: rfd / peakForce.
 */

const G = 9.81; // m·s⁻²

/** Flight time (ms) implied by a flight-method jump height (cm). null when absent. */
export function flightTimeMsFromJumpHeightCm(jumpHeightCm: number | null | undefined): number | null {
  if (typeof jumpHeightCm !== "number" || !Number.isFinite(jumpHeightCm) || jumpHeightCm <= 0) return null;
  const hM = jumpHeightCm / 100;
  return Math.sqrt((8 * hM) / G) * 1000;
}

/**
 * FT:CT ratio. Prefers a measured flight time (ms); otherwise derives it from the
 * jump height. Returns null when contraction time is missing/zero or neither flight
 * source is available.
 */
export function ftCtRatio(args: {
  flightTimeMs?: number | null;
  jumpHeightCm?: number | null;
  contractionTimeMs?: number | null;
}): number | null {
  const ct = args.contractionTimeMs;
  if (typeof ct !== "number" || !Number.isFinite(ct) || ct <= 0) return null;
  const ft =
    typeof args.flightTimeMs === "number" && Number.isFinite(args.flightTimeMs) && args.flightTimeMs > 0
      ? args.flightTimeMs
      : flightTimeMsFromJumpHeightCm(args.jumpHeightCm);
  if (ft == null) return null;
  return ft / ct;
}

/** Early RFD normalised to peak force (Maffiuletti). null when either is missing. */
export function normalizedRfd(rfdNS: number | null | undefined, peakForceN: number | null | undefined): number | null {
  if (typeof rfdNS !== "number" || !Number.isFinite(rfdNS)) return null;
  if (typeof peakForceN !== "number" || !Number.isFinite(peakForceN) || peakForceN <= 0) return null;
  return rfdNS / peakForceN;
}
