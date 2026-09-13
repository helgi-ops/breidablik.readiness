/**
 * MD+1 recovery-vs-rebuild tier — from the player's last-match exposure.
 *
 * The day after a match, the right stimulus depends on how much the player
 * actually played (Carling 2018 — ~60 min match exposure calls for a recovery
 * day next; Nédélec 2012 — post-match fatigue persists 24–48h). One squad-wide
 * MD+1 session under- or over-doses the two ends of the bench, so the engine
 * reads each player's minutes and picks a tier:
 *
 *   - "high"     (≥ 60 min): the lower body absorbed the match's eccentric load
 *                → protect it (isometric lower-body only, no eccentric compound)
 *                and train the FRESH upper body (real strength). "iso á neðri
 *                hluta og styrktaræfingar á efri."
 *   - "moderate" (30–59 min): a partial dose → the measured recovery stim
 *                (the default MD+1 template — light primer + tendon iso).
 *   - "low"      (< 30 min, or DNP): the player MISSED match load → give a real
 *                strength stimulus so they don't fall behind the week
 *                (Rønnestad 2023 — microdose keeps the non-starter pool from
 *                de-training across congested fixtures).
 *
 * Returns null when minutes are unknown (no recent match, or minutes never
 * entered) — the caller then keeps the fixed recovery template. Pure — no IO.
 */

export type Md1Tier = "high" | "moderate" | "low";

/** Minutes at or above which MD+1 is a recovery day (Carling 2018). */
export const MD1_HIGH_MINUTES = 60;
/** Minutes below which MD+1 becomes a rebuild / strength day (missed match load). */
export const MD1_LOW_MINUTES = 30;

export function md1MinutesTier(minutes: number | null | undefined, isDnp: boolean | undefined): Md1Tier | null {
  if (isDnp) return "low";
  if (minutes == null) return null;
  if (minutes >= MD1_HIGH_MINUTES) return "high";
  if (minutes >= MD1_LOW_MINUTES) return "moderate";
  return "low";
}
