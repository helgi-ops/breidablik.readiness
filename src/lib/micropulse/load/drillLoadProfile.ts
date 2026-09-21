/**
 * Four-category drill / session load profile — pure, side-effect free.
 *
 * The Session Builder (sessionPlan.ts) predicts ONE PlayerLoad number per drill. A fitness
 * coach also plans against the BALANCE between energy systems — "this session is speed-heavy,
 * light on aerobic." This gives a drill (and a whole session) a load profile split four ways:
 *
 *   aerobic · anaerobic/high-speed · speed · muscular/joint
 *
 * using Magni Mohr's MULTIPLYING-FACTOR model (FIFA Fitness A). Each category = Σ (measure ×
 * factor), where the measure is minutes-in-HR-zone (aerobic), distance-per-100m-in-speed-band
 * (anaerobic), max-speed-effort counts (speed), and accel/decel/impact/turn counts (muscular).
 *
 * HONEST PROVENANCE:
 *   - The multiplying factors are Mohr's PRACTITIONER HEURISTIC, not a validated instrument.
 *     They live in one config object (LoadFactors) so a team can tune them; the output is
 *     presented as LOW-confidence category context, never a score.
 *   - Aerobic is the weak axis: per-drill HR is rarely present, so the value may come from a
 *     mean-%HRmax estimate or a speed-based volume proxy. `aerobicSource` always names which
 *     was used — a proxy aerobic value is never presented as measured.
 *   - A missing axis contributes 0 to its category, never a fabricated value.
 *   - Descriptive coaching aid. NEVER touches the readiness colour, the load target, or the
 *     daily decision (same wall as sessionPlan.ts / peakPeriod.ts).
 *
 * Cite: Mohr M., The Fitness Coach — training-load assessment via multiplying factors (FIFA
 *       Fitness A course, 2025); framework consistent with the Bangsbo/Mohr football-physiology
 *       training taxonomy. Treat the factors as a coaching heuristic, tunable per team.
 */

import type { Bi } from "./peakPeriod";

export type LoadCategory = "aerobic" | "anaerobic" | "speed" | "muscular";

/** The four Mohr multiplying-factor tables — every value editable per team. */
export interface LoadFactors {
  /** Aerobic: minutes in an HR-exertion zone × factor. z1=70–80 … z5=95–100 %HRmax. */
  aerobicHrZone: { z1: number; z2: number; z3: number; z4: number; z5: number };
  /** Anaerobic/high-speed: distance (per 100 m) in a speed band × factor. b1=10–14 … b5=>24 km/h. */
  anaerobicSpeedBand: { b1: number; b2: number; b3: number; b4: number; b5: number };
  /** Speed: count of max-speed efforts by % of the player's max speed × factor. s1=85–90 … s3=95–100 %. */
  speedEffort: { s1: number; s2: number; s3: number };
  /** Muscular/joint: counts × factor. */
  muscular: {
    accelDecel: { low: number; med: number; high: number };
    impacts: { low: number; med: number; high: number };
    /** Per turn in the 95–100% band. */
    turn: number;
  };
}

/** Mohr's default factors (slide 36). Configurable — a team may re-weight to its philosophy. */
export const DEFAULT_LOAD_FACTORS: LoadFactors = {
  aerobicHrZone: { z1: 1, z2: 2, z3: 4, z4: 7, z5: 10 },
  anaerobicSpeedBand: { b1: 1, b2: 2, b3: 4, b4: 7, b5: 10 },
  speedEffort: { s1: 5, s2: 10, s3: 20 },
  muscular: {
    accelDecel: { low: 5, med: 10, high: 20 },
    impacts: { low: 5, med: 10, high: 20 },
    turn: 20,
  },
};

/**
 * Deep-merge a stored (possibly partial or legacy) factor blob over the defaults, keeping
 * only finite numbers. A team with no stored row, or a blob missing keys, safely resolves to
 * the defaults for those keys — so the persisted per-team editor can never produce NaN or a
 * structurally-invalid factor set. Pure.
 */
export function mergeLoadFactors(stored: unknown): LoadFactors {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const numOr = (v: unknown, fallback: number): number => (typeof v === "number" && isFinite(v) && v >= 0 ? v : fallback);
  const grp = (key: string): Record<string, unknown> => {
    const g = s[key];
    return g && typeof g === "object" ? (g as Record<string, unknown>) : {};
  };
  const d = DEFAULT_LOAD_FACTORS;
  const ahz = grp("aerobicHrZone"), asb = grp("anaerobicSpeedBand"), se = grp("speedEffort"), mus = grp("muscular");
  const musAd = (mus.accelDecel && typeof mus.accelDecel === "object" ? mus.accelDecel : {}) as Record<string, unknown>;
  const musIm = (mus.impacts && typeof mus.impacts === "object" ? mus.impacts : {}) as Record<string, unknown>;
  return {
    aerobicHrZone: {
      z1: numOr(ahz.z1, d.aerobicHrZone.z1), z2: numOr(ahz.z2, d.aerobicHrZone.z2), z3: numOr(ahz.z3, d.aerobicHrZone.z3),
      z4: numOr(ahz.z4, d.aerobicHrZone.z4), z5: numOr(ahz.z5, d.aerobicHrZone.z5),
    },
    anaerobicSpeedBand: {
      b1: numOr(asb.b1, d.anaerobicSpeedBand.b1), b2: numOr(asb.b2, d.anaerobicSpeedBand.b2), b3: numOr(asb.b3, d.anaerobicSpeedBand.b3),
      b4: numOr(asb.b4, d.anaerobicSpeedBand.b4), b5: numOr(asb.b5, d.anaerobicSpeedBand.b5),
    },
    speedEffort: { s1: numOr(se.s1, d.speedEffort.s1), s2: numOr(se.s2, d.speedEffort.s2), s3: numOr(se.s3, d.speedEffort.s3) },
    muscular: {
      accelDecel: { low: numOr(musAd.low, d.muscular.accelDecel.low), med: numOr(musAd.med, d.muscular.accelDecel.med), high: numOr(musAd.high, d.muscular.accelDecel.high) },
      impacts: { low: numOr(musIm.low, d.muscular.impacts.low), med: numOr(musIm.med, d.muscular.impacts.med), high: numOr(musIm.high, d.muscular.impacts.high) },
      turn: numOr(mus.turn, d.muscular.turn),
    },
  };
}

export interface DrillLoadInputs {
  durationMin: number;
  /** Aerobic — minutes in each %HRmax zone (70–80 … 95–100). Preferred aerobic source. */
  hrZoneMinutes?: Partial<Record<"z1" | "z2" | "z3" | "z4" | "z5", number>>;
  /** Aerobic fallback — a single mean %HRmax for the drill (→ its whole duration at that zone). */
  meanPctHrMax?: number | null;
  /** Anaerobic — distance (m) in each Mohr speed band (10–14 … >24 km/h). */
  speedBandDistanceM?: Partial<Record<"b1" | "b2" | "b3" | "b4" | "b5", number>>;
  /** Speed — count of max-speed efforts by %-of-max band (85–90 / 90–95 / 95–100). */
  maxSpeedEffortsByBand?: Partial<Record<"s1" | "s2" | "s3", number>>;
  /** Muscular — accel/decel effort counts by intensity. */
  accelDecel?: { low: number; med: number; high: number };
  /** Muscular — impact counts by intensity. */
  impacts?: { low: number; med: number; high: number };
  /** Muscular — turns in the 95–100% band. */
  turns?: number;
  /** Subjective (optional) — VAS breathing/cardio (1) and legs/muscular (2), coach/player entered. */
  vas1?: number | null;
  vas2?: number | null;
}

export type AerobicSource = "hr_zones" | "mean_hr" | "speed_proxy" | "none";

export interface DrillLoadProfile {
  byCategory: Record<LoadCategory, number>;
  /** Σ categories — a coarse single number for ordering, NOT the PlayerLoad. */
  total: number;
  /** The heaviest energy system. */
  dominant: LoadCategory;
  aerobicSource: AerobicSource;
  vas1: number | null;
  vas2: number | null;
  note: Bi;
}

const CATEGORY_LABEL: Record<LoadCategory, Bi> = {
  aerobic: { en: "aerobic", is: "loftháð" },
  anaerobic: { en: "high-speed", is: "háhraða" },
  speed: { en: "speed", is: "hraða" },
  muscular: { en: "muscular–joint", is: "vöðva–liða" },
};

const AEROBIC_SOURCE_LABEL: Record<AerobicSource, Bi> = {
  hr_zones: { en: "HR zones", is: "púlssvæðum" },
  mean_hr: { en: "a mean-HR estimate", is: "meðalpúls-mati" },
  speed_proxy: { en: "a speed-based proxy", is: "hraðaáætlun" },
  none: { en: "no aerobic input", is: "engum loftháðum gögnum" },
};

const fin = (x: number | null | undefined): number => (typeof x === "number" && isFinite(x) ? x : 0);
const r0 = (n: number) => Math.round(n);
const vas = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);

/** Which %HRmax zone a mean %HRmax falls in (for the mean-HR aerobic fallback). Below 70 → none. */
function zoneOfMeanHr(pct: number): keyof LoadFactors["aerobicHrZone"] | null {
  if (!isFinite(pct)) return null;
  if (pct >= 95) return "z5";
  if (pct >= 90) return "z4";
  if (pct >= 85) return "z3";
  if (pct >= 80) return "z2";
  if (pct >= 70) return "z1";
  return null;
}

/** Compute the four-category load profile for one drill from explicit measures. Pure. */
export function computeDrillLoadProfile(inp: DrillLoadInputs, factors: LoadFactors = DEFAULT_LOAD_FACTORS): DrillLoadProfile {
  // ── Aerobic — hr_zones → mean_hr → speed_proxy → none, in that preference order.
  let aerobic = 0;
  let aerobicSource: AerobicSource = "none";
  const hz = inp.hrZoneMinutes;
  const hasHrZones = hz != null && (["z1", "z2", "z3", "z4", "z5"] as const).some((k) => typeof hz[k] === "number" && isFinite(hz[k] as number));
  if (hasHrZones) {
    aerobicSource = "hr_zones";
    const f = factors.aerobicHrZone;
    aerobic = fin(hz!.z1) * f.z1 + fin(hz!.z2) * f.z2 + fin(hz!.z3) * f.z3 + fin(hz!.z4) * f.z4 + fin(hz!.z5) * f.z5;
  } else if (typeof inp.meanPctHrMax === "number" && isFinite(inp.meanPctHrMax)) {
    const zone = zoneOfMeanHr(inp.meanPctHrMax);
    if (zone) {
      aerobicSource = "mean_hr";
      aerobic = fin(inp.durationMin) * factors.aerobicHrZone[zone];
    }
  }

  // ── Anaerobic / high-speed — distance (per 100 m) × band factor.
  const sb = inp.speedBandDistanceM;
  const af = factors.anaerobicSpeedBand;
  const anaerobic = sb
    ? (fin(sb.b1) * af.b1 + fin(sb.b2) * af.b2 + fin(sb.b3) * af.b3 + fin(sb.b4) * af.b4 + fin(sb.b5) * af.b5) / 100
    : 0;

  // Aerobic speed-proxy fallback: low-speed running volume (10–17 km/h) as an aerobic-volume stand-in.
  if (aerobicSource === "none" && sb) {
    const proxy = (fin(sb.b1) * af.b1 + fin(sb.b2) * af.b2) / 100;
    if (proxy > 0) {
      aerobic = proxy;
      aerobicSource = "speed_proxy";
    }
  }

  // ── Speed — max-speed effort counts × band factor.
  const se = inp.maxSpeedEffortsByBand;
  const sf = factors.speedEffort;
  const speed = se ? fin(se.s1) * sf.s1 + fin(se.s2) * sf.s2 + fin(se.s3) * sf.s3 : 0;

  // ── Muscular / joint — accel/decel + impacts + turns × factor.
  const mf = factors.muscular;
  const ad = inp.accelDecel;
  const im = inp.impacts;
  const muscular =
    (ad ? fin(ad.low) * mf.accelDecel.low + fin(ad.med) * mf.accelDecel.med + fin(ad.high) * mf.accelDecel.high : 0) +
    (im ? fin(im.low) * mf.impacts.low + fin(im.med) * mf.impacts.med + fin(im.high) * mf.impacts.high : 0) +
    fin(inp.turns) * mf.turn;

  const byCategory: Record<LoadCategory, number> = {
    aerobic: r0(aerobic),
    anaerobic: r0(anaerobic),
    speed: r0(speed),
    muscular: r0(muscular),
  };
  const total = byCategory.aerobic + byCategory.anaerobic + byCategory.speed + byCategory.muscular;
  const dominant = dominantOf(byCategory);

  const dl = CATEGORY_LABEL[dominant];
  const asl = AEROBIC_SOURCE_LABEL[aerobicSource];
  const note: Bi = {
    en: `${dl.en}-dominant · aerobic from ${asl.en} · Mohr multiplying-factor heuristic (tunable) — descriptive, never the readiness colour.`,
    is: `mest ${dl.is} · loftháð frá ${asl.is} · Mohr margföldunarstuðla-viðmið (stillanlegt) — lýsandi, aldrei viðbragðsliturinn.`,
  };

  return { byCategory, total, dominant, aerobicSource, vas1: vas(inp.vas1), vas2: vas(inp.vas2), note };
}

/** The largest category; ties resolve aerobic → anaerobic → speed → muscular. */
function dominantOf(by: Record<LoadCategory, number>): LoadCategory {
  const order: LoadCategory[] = ["aerobic", "anaerobic", "speed", "muscular"];
  let best: LoadCategory = "aerobic";
  for (const c of order) if (by[c] > by[best]) best = c;
  return best;
}

/** A completed GPS drill row (subset of player_drill_load) → the four-category profile. */
export interface DrillLoadRow {
  duration_min: number | null;
  distance_m: number | null;
  hir_total: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  max_velocity: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_total: number | null;
  decel_total: number | null;
}

/**
 * Profile a completed GPS drill row against the player's max sprint speed (MSS, km/h).
 *
 * Band-edge approximation (stated in the note): Catapult's vel_b5 (~19.8–25.2 km/h) maps to
 * Mohr's 21–24 band and vel_b6 (>25.2) to the >24 band; the sub-19.8 running distance is not
 * band-split by this daily-summary row, so the low speed bands (10–21 km/h) are 0 here. With
 * no per-drill HR the aerobic axis is unresolved from this row (aerobicSource = "none").
 */
export function profileFromDrillLoadRow(row: DrillLoadRow, mssKmh: number | null, factors: LoadFactors = DEFAULT_LOAD_FACTORS): DrillLoadProfile {
  // High-speed distance bands we can actually resolve from the row.
  const speedBandDistanceM = { b4: fin(row.vel_b5), b5: fin(row.vel_b6) };

  // Speed — max_velocity vs his MSS → the %-of-max band; count 1 (row records the peak, not a tally).
  let maxSpeedEffortsByBand: DrillLoadInputs["maxSpeedEffortsByBand"] | undefined;
  const mv = fin(row.max_velocity);
  if (mssKmh != null && isFinite(mssKmh) && mssKmh > 0 && mv > 0) {
    const pct = (mv / mssKmh) * 100;
    if (pct >= 95) maxSpeedEffortsByBand = { s3: 1 };
    else if (pct >= 90) maxSpeedEffortsByBand = { s2: 1 };
    else if (pct >= 85) maxSpeedEffortsByBand = { s1: 1 };
  }

  // Muscular — accel_b23 + decel_b23 are the high-intensity (≥3 m/s²) efforts; the remainder
  // of accel_total + decel_total is the lower-intensity pool (not split further → "low").
  const high = fin(row.accel_b23) + fin(row.decel_b23);
  const rest = Math.max(0, fin(row.accel_total) + fin(row.decel_total) - high);
  const accelDecel = { low: rest, med: 0, high };

  const base = computeDrillLoadProfile(
    { durationMin: fin(row.duration_min), speedBandDistanceM, maxSpeedEffortsByBand, accelDecel },
    factors,
  );
  const dl = CATEGORY_LABEL[base.dominant];
  return {
    ...base,
    note: {
      en: `${dl.en}-dominant · high-speed bands only (vel_b5→21–24, vel_b6→>24; lower running not band-split) · no per-drill HR → aerobic unresolved · Mohr heuristic, never the readiness colour.`,
      is: `mest ${dl.is} · aðeins háhraðabönd (vel_b5→21–24, vel_b6→>24; hægari hlaup ekki bandaskipt) · enginn púls per æfingu → loftháð óleyst · Mohr-viðmið, aldrei viðbragðsliturinn.`,
    },
  };
}

/** Roll a session up: Σ per category over its drills + the balance read. Pure. */
export function sessionLoadProfile(drills: DrillLoadProfile[]): {
  byCategory: Record<LoadCategory, number>;
  total: number;
  dominant: LoadCategory;
  balance: Bi;
} {
  const byCategory: Record<LoadCategory, number> = { aerobic: 0, anaerobic: 0, speed: 0, muscular: 0 };
  for (const d of drills ?? []) {
    byCategory.aerobic += fin(d.byCategory?.aerobic);
    byCategory.anaerobic += fin(d.byCategory?.anaerobic);
    byCategory.speed += fin(d.byCategory?.speed);
    byCategory.muscular += fin(d.byCategory?.muscular);
  }
  const total = byCategory.aerobic + byCategory.anaerobic + byCategory.speed + byCategory.muscular;
  const dominant = dominantOf(byCategory);
  const pct = (c: LoadCategory) => (total > 0 ? Math.round((byCategory[c] / total) * 100) : 0);
  const dl = CATEGORY_LABEL[dominant];
  const balance: Bi = total > 0
    ? {
        en: `${dl.en}-dominant session — aerobic ${pct("aerobic")}% · high-speed ${pct("anaerobic")}% · speed ${pct("speed")}% · muscular ${pct("muscular")}%. Descriptive balance (Mohr heuristic), coach-owned.`,
        is: `mest ${dl.is} æfing — loftháð ${pct("aerobic")}% · háhraða ${pct("anaerobic")}% · hraða ${pct("speed")}% · vöðva ${pct("muscular")}%. Lýsandi jafnvægi (Mohr-viðmið), í höndum þjálfara.`,
      }
    : { en: "No load inputs yet — add drills or estimates to see the category balance.", is: "Engin álagsgögn enn — bættu við æfingum eða mati til að sjá jafnvægið." };
  return { byCategory, total, dominant, balance };
}
