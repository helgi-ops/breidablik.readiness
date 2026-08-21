/**
 * Basketball shot zones — shared by the shot-chart UI and the server-side league
 * baseline. One classifier and one set of expected FG% baselines so the on-screen
 * heat map and the computed league averages always agree.
 *
 * Zones: restricted / paint / mid (L·C·R) / three (left corner · left wing · top ·
 * right wing · right corner). Geometry matches the drawn half-court (basket at the
 * top-centre, feed coords folded onto one half). Descriptive only.
 */

import { foldShot } from "./fibaLiveStats";

export type ZoneName =
  | "restricted" | "paint" | "midLeft" | "midCentre" | "midRight"
  | "threeLC" | "threeLW" | "threeTop" | "threeRW" | "threeRC";

export const ZONE_ORDER: ZoneName[] = [
  "restricted", "paint", "midLeft", "midCentre", "midRight",
  "threeLC", "threeLW", "threeTop", "threeRW", "threeRC",
];

/** Built-in expected FG% per spot (typical league averages) — the fallback baseline
 *  used until the ingested shot database is large enough to compute real ones. */
export const EXPECTED_FG: Record<ZoneName, number> = {
  restricted: 60, paint: 42, midLeft: 39, midCentre: 40, midRight: 39,
  threeLC: 38, threeLW: 35, threeTop: 35, threeRW: 35, threeRC: 38,
};

/** Classify a shot into a court zone. `isThree` from the feed; coords are the feed's
 *  0-100 scale. No coords → a sensible fallback (3PT → top, 2PT → mid centre). */
export function zoneOf(x: number | null | undefined, y: number | null | undefined, isThree: boolean): ZoneName {
  if (x == null || y == null) return isThree ? "threeTop" : "midCentre";
  const f = foldShot(x, y);
  const cx = (f.y / 100) * 150, cy = (f.x / 50) * 140; // chart plotting coords
  if (isThree) {
    const a = Math.atan2(cx - 75, cy - 15.75) * 180 / Math.PI; // 0 straight ahead, + right, - left
    if (a <= -55) return "threeLC";
    if (a <= -20) return "threeLW";
    if (a < 20) return "threeTop";
    if (a < 55) return "threeRW";
    return "threeRC";
  }
  if (Math.hypot(cx - 75, cy - 15.75) <= 12.5) return "restricted"; // basket (75, 15.75), RA r=1.25 m
  if (cx >= 50.5 && cx <= 99.5 && cy <= 58) return "paint";
  return cx < 50.5 ? "midLeft" : cx > 99.5 ? "midRight" : "midCentre";
}

export type ZoneAgg = Record<ZoneName, { m: number; a: number }>;
export function emptyZoneAgg(): ZoneAgg {
  return Object.fromEntries(ZONE_ORDER.map((k) => [k, { m: 0, a: 0 }])) as ZoneAgg;
}

/** Tally made/attempts per zone from coord-bearing, resolved shots. */
export function aggregateZones(shots: Array<{ x: number | null; y: number | null; isThree: boolean; made: boolean }>): ZoneAgg {
  const z = emptyZoneAgg();
  for (const s of shots) {
    if (s.x == null || s.y == null) continue; // only coord-bearing shots inform the baseline
    const zn = z[zoneOf(s.x, s.y, s.isThree)];
    zn.a++; if (s.made) zn.m++;
  }
  return z;
}

/** Resolve expected FG% per zone: use the league value where the sample is big enough,
 *  else the built-in default. Returns the merged map + which zones are league-derived. */
export function resolveExpected(
  league: ZoneAgg | null,
  opts: { minPerZone?: number; minTotal?: number } = {},
): { expected: Record<ZoneName, number>; leagueZones: ZoneName[]; leagueTotal: number } {
  const minPerZone = opts.minPerZone ?? 40;
  const minTotal = opts.minTotal ?? 600;
  const expected = { ...EXPECTED_FG };
  const leagueZones: ZoneName[] = [];
  const leagueTotal = league ? ZONE_ORDER.reduce((n, k) => n + league[k].a, 0) : 0;
  if (league && leagueTotal >= minTotal) {
    for (const k of ZONE_ORDER) {
      if (league[k].a >= minPerZone) { expected[k] = (league[k].m / league[k].a) * 100; leagueZones.push(k); }
    }
  }
  return { expected, leagueZones, leagueTotal };
}
