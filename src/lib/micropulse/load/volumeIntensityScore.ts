/**
 * Owen multimodal Volume × Intensity session score — pure, side-effect free.
 *
 * Adam Owen's contemporary multi-modal approach scores a session on TWO independent axes
 * instead of a single metric:
 *   - Volume    = accumulated mechanical work (PlayerLoad / total distance / HI distance /
 *                 accel+decel counts) relative to a rolling reference.
 *   - Intensity = the RATE / peak of that work (PlayerLoad·min⁻¹ / distance·min⁻¹ /
 *                 %max-speed / HI-accel·min⁻¹) relative to a rolling reference.
 * A session becomes a point in the volume–intensity plane; a week's sessions trace the
 * TAPER SHAPE (MD-4 high volume, MD-1 low on both), Owen's signature microcycle read.
 *
 * Each axis is anchored on the best AVAILABLE multimodal metric (PlayerLoad first — itself an
 * accelerometer-derived multi-planar load, exactly Owen's mechanical construct — then a
 * documented fallback order), and scaled so the rolling reference maps to 50 (2× reference =
 * 100). This keeps a single per-axis reference meaningful across mixed units without inventing
 * per-metric magic scales.
 *
 * HONEST PROVENANCE:
 *   - Both axes are RELATIVE to the player's (else the team's) rolling reference.
 *   - A missing axis is null, never fabricated → quadrant "unknown".
 *   - Descriptive load context. NEVER the readiness colour, the load target, or the daily decision.
 *
 * Cite: Owen et al. 2017 (multi-modal mechanical volume/intensity monitoring; mesocycle taper +
 *       positional demands) · Owen et al. 2024 (CUPs; between-microcycle variability) ·
 *       Djaoui/Owen 2022 (congestion Acc/Dec by position).
 */

import type { Bi } from "./peakPeriod";

export interface SessionLoadInputs {
  // volume-side (accumulated work)
  totalDistanceM?: number | null;
  hiDistanceM?: number | null;
  playerLoad?: number | null;
  accelDecelCount?: number | null;
  // intensity-side (rate / peak)
  distancePerMin?: number | null;
  playerLoadPerMin?: number | null;
  pctMaxSpeed?: number | null;
  hiAccelPerMin?: number | null;
  durationMin?: number | null;
}

export type VolumeIntensityQuadrant =
  | "high_vol_high_int"
  | "high_vol_low_int"
  | "low_vol_high_int"
  | "low_vol_low_int"
  | "unknown";

export type MdExpectation = "as_expected" | "above" | "below" | "unknown";

export interface VolumeIntensityScore {
  /** 0–100 vs the reference (50 = the rolling reference; 100 = 2× it). Null if no volume input. */
  volume: number | null;
  /** 0–100 vs the reference. Null if no intensity input. */
  intensity: number | null;
  quadrant: VolumeIntensityQuadrant;
  vsMdExpectation: MdExpectation;
  note: Bi;
}

const fin = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const firstFinite = (...xs: (number | null | undefined)[]): number | null => {
  for (const x of xs) { const v = fin(x); if (v !== null) return v; }
  return null;
};

/** The session's volume magnitude — the best available multimodal accumulated-work metric. */
export function volumeMagnitude(inp: SessionLoadInputs): number | null {
  return firstFinite(inp.playerLoad, inp.totalDistanceM, inp.hiDistanceM, inp.accelDecelCount);
}
/** The session's intensity magnitude — the best available rate/peak metric. */
export function intensityMagnitude(inp: SessionLoadInputs): number | null {
  return firstFinite(inp.playerLoadPerMin, inp.distancePerMin, inp.hiAccelPerMin, inp.pctMaxSpeed);
}

/** Scale a magnitude so the reference maps to 50, clamped to 0–100. Null-safe. */
function scaleToRef(mag: number | null, ref: number | null | undefined): number | null {
  const r = fin(ref);
  if (mag === null || r === null || r <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((mag / r) * 50)));
}

const HI = 50; // the reference midpoint: at/above the rolling reference = "high"

function quadrantOf(volume: number | null, intensity: number | null): VolumeIntensityQuadrant {
  if (volume === null || intensity === null) return "unknown";
  const hv = volume >= HI, hi = intensity >= HI;
  return hv && hi ? "high_vol_high_int" : hv && !hi ? "high_vol_low_int" : !hv && hi ? "low_vol_high_int" : "low_vol_low_int";
}

const QUADRANT_NOTE: Record<VolumeIntensityQuadrant, Bi> = {
  high_vol_high_int: { en: "high volume + high intensity — a heavy day (MD-5/reload type)", is: "hátt magn + há ákefð — þungur dagur (MD-5/álagsdagur)" },
  high_vol_low_int: { en: "high-volume, low-intensity — an MD-4-type session", is: "hátt magn, lág ákefð — MD-4 dagur" },
  low_vol_high_int: { en: "low-volume, high-intensity — an MD-3/sharpening type session", is: "lágt magn, há ákefð — MD-3/skerpudagur" },
  low_vol_low_int: { en: "low volume and intensity — a taper (MD-1-type) session", is: "lágt magn og ákefð — niðurtröppun (MD-1 dagur)" },
  unknown: { en: "not enough load data to score volume × intensity", is: "ekki næg álagsgögn til að meta magn × ákefð" },
};

/**
 * Score a session on the volume–intensity plane.
 *
 * @param reference   rolling volume/intensity reference (per player, else team); each maps to 50.
 * @param mdContext   the session's MD day (e.g. "MD-1") — for the descriptive note only.
 * @param mdExpectedVolume  optional expected VOLUME (0–100) for this MD day, from the existing
 *        match_demand_template band (Part 2). When given, sets vsMdExpectation (±15 pts tolerance).
 */
export function scoreVolumeIntensity(
  inp: SessionLoadInputs,
  reference: { volumeRef: number; intensityRef: number } | null,
  mdContext?: string | null,
  mdExpectedVolume?: number | null,
): VolumeIntensityScore {
  const volume = scaleToRef(volumeMagnitude(inp), reference?.volumeRef ?? null);
  const intensity = scaleToRef(intensityMagnitude(inp), reference?.intensityRef ?? null);
  const quadrant = quadrantOf(volume, intensity);

  let vsMdExpectation: MdExpectation = "unknown";
  const exp = fin(mdExpectedVolume);
  if (exp !== null && volume !== null) {
    vsMdExpectation = volume > exp + 15 ? "above" : volume < exp - 15 ? "below" : "as_expected";
  }

  const base = QUADRANT_NOTE[quadrant];
  const md = (mdContext ?? "").trim();
  const note: Bi = md
    ? { en: `${base.en} · ${md}. Descriptive (Owen 2017) — never the readiness colour.`, is: `${base.is} · ${md}. Lýsandi (Owen 2017) — aldrei viðbragðsliturinn.` }
    : { en: `${base.en}. Descriptive (Owen 2017) — never the readiness colour.`, is: `${base.is}. Lýsandi (Owen 2017) — aldrei viðbragðsliturinn.` };

  return { volume, intensity, quadrant, vsMdExpectation, note };
}

/** One session's point on the taper plane, tagged with its MD day — for the microcycle view. */
export interface TaperPoint {
  mdDay: string;
  date: string;
  score: VolumeIntensityScore;
}

/**
 * Read a week's taper shape from its per-MD-day points. Descriptive: is MD-1 the low-low
 * corner (a proper taper), or is it still mid-intensity (under-tapered)? Pure.
 */
export function readTaperShape(points: TaperPoint[]): { tapered: boolean | null; note: Bi } {
  const md1 = (points ?? []).find((p) => /(^|\D)MD-?1(\D|$)/i.test(p.mdDay) && !/MD-?1[0-9]/.test(p.mdDay));
  if (!md1 || md1.score.intensity === null) return { tapered: null, note: { en: "No MD-1 session to read the taper yet.", is: "Enginn MD-1 dagur til að meta niðurtröppun enn." } };
  const lowInt = md1.score.intensity < HI;
  const lowVol = (md1.score.volume ?? 0) < HI;
  const tapered = lowInt && lowVol;
  return {
    tapered,
    note: tapered
      ? { en: "MD-1 sits low-volume / low-intensity — a proper taper into the match.", is: "MD-1 er lágt magn / lág ákefð — rétt niðurtröppun fyrir leik." }
      : { en: `MD-1 is ${lowInt ? "" : "still mid/high-intensity"}${!lowInt && !lowVol ? " and " : ""}${lowVol ? "" : "high-volume"} — under-tapered vs Owen's model.`, is: "MD-1 er ekki fulltröppuð niður miðað við líkan Owen." },
  };
}
