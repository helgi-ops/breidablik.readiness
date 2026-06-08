/**
 * src/lib/client/readinessAdjust
 *
 * Turns today's readiness verdict into a concrete adjustment of the prescribed
 * session — so "today adjusted to how you feel (−15%)" is a real change to the
 * numbers the athlete sees, not just advisory copy.
 *
 * Honesty (manifesto): we only mark `applied` when the band actually scales the
 * session (yellow/red + a deload action). A red "recovery" day is a session-
 * level swap, not a percentage trim, so it reports `action:"recovery"` with
 * `applied:false` — the UI says "recovery day", never a fake "−X%".
 *
 * Canonical color source: readiness_entries.color (same value the coach view
 * v_coach_readiness_today_v8.final_color is built from).
 */

export type ReadinessZone = "green" | "yellow" | "red";

export type ReadinessBand = {
  enabled: boolean;
  /** % of prescribed volume to keep on a deload (e.g. 85 = trim 15%). */
  deloadVolumePct: number;
  /** % of prescribed load to keep on a deload (e.g. 90 = 10% lighter). */
  deloadIntensityPct: number;
  yellowAction: "normal" | "deload";
  redAction: "skip" | "recovery" | "deload";
};

export type ReadinessAdjustment = {
  /** True only when the numbers were actually scaled (a real deload). */
  applied: boolean;
  zone: ReadinessZone;
  volumePct: number;    // 100 = unchanged
  intensityPct: number; // 100 = unchanged
  action: "normal" | "deload" | "recovery" | "skip";
};

/** Default policy for programmes with no per-plan readiness config (the
 *  pt_explosive starter/explosive path). Power work keeps near-full load but
 *  trims volume on a yellow day; a red day becomes recovery. */
export const DEFAULT_PT_BAND: ReadinessBand = {
  enabled: true,
  deloadVolumePct: 85,
  deloadIntensityPct: 90,
  yellowAction: "deload",
  redAction: "recovery",
};

export function zoneFromColor(color?: string | null): ReadinessZone | null {
  const c = (color ?? "").toUpperCase();
  if (c === "GREEN") return "green";
  if (c === "YELLOW") return "yellow";
  if (c === "RED") return "red";
  return null; // GRAY / no check-in → can't adapt
}

export function computeReadinessAdjustment(zone: ReadinessZone, band: ReadinessBand): ReadinessAdjustment {
  const none = (action: ReadinessAdjustment["action"]): ReadinessAdjustment => ({ applied: false, zone, volumePct: 100, intensityPct: 100, action });
  if (!band.enabled || zone === "green") return none("normal");

  const deload = (): ReadinessAdjustment => ({
    applied: true, zone,
    volumePct: clampPct(band.deloadVolumePct),
    intensityPct: clampPct(band.deloadIntensityPct),
    action: "deload",
  });

  if (zone === "yellow") return band.yellowAction === "deload" ? deload() : none("normal");
  // red
  if (band.redAction === "deload") return deload();
  return none(band.redAction); // "recovery" | "skip" — session-level, no scaling
}

function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 100;
  return Math.max(40, Math.min(100, Math.round(p)));
}

/** Scale a prescribed set count by the volume %, never below 1. */
export function scaleSets(sets: number, volumePct: number): number {
  if (!(sets > 0) || volumePct >= 100) return sets;
  return Math.max(1, Math.round(sets * (volumePct / 100)));
}

/** Scale a target load (kg) by the intensity %, rounded to the nearest 2.5 kg. */
export function scaleLoadKg(kg: number, intensityPct: number): number {
  if (!(kg > 0) || intensityPct >= 100) return kg;
  return Math.round((kg * (intensityPct / 100)) / 2.5) * 2.5;
}
