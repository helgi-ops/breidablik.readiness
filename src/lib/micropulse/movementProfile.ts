/**
 * Sport-aware "movement profile" label.
 *
 * Catapult's inertial movement profile is branded "Football Movement Profile
 * (FMP)". For a basketball audience that reads wrong, so surface it as
 * "Basketball Movement Profile (BMP)" instead. One helper so every coach-facing
 * label stays consistent.
 */

export function movementProfileLabel(isBasketball: boolean | null | undefined): {
  abbr: string;
  fullEn: string;
  fullIs: string;
} {
  return isBasketball
    ? { abbr: "BMP", fullEn: "Basketball Movement Profile", fullIs: "Basketball Movement Profile" }
    : { abbr: "FMP", fullEn: "Football Movement Profile", fullIs: "Football Movement Profile" };
}
