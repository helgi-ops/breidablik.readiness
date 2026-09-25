/**
 * Map a match unit (per-axis typicals) to the weekly-load KPI vocabulary, so the pre-season start
 * ramp + per-day distribution can scale every main variable. Shared by the hub and Week setup.
 * velocityBand5 = HSR − sprint(band6) when both are present. Pure; type-only import.
 */

import type { MatchUnit } from "./index";
import type { WeeklyLoadMetricKey } from "../externalLoad/weeklyLoadTypes";

export function kpiAvgFromUnit(mu: MatchUnit): Partial<Record<WeeklyLoadMetricKey, number>> {
  const o: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  if (mu.load.typical != null) o.totalPlayerLoad = mu.load.typical;
  if (mu.distance.typical != null) o.totalDistance = mu.distance.typical;
  if (mu.sprint.typical != null) o.velocityBand6 = mu.sprint.typical;
  if (mu.hsr.typical != null && mu.sprint.typical != null && mu.hsr.typical > mu.sprint.typical) o.velocityBand5 = Math.round(mu.hsr.typical - mu.sprint.typical);
  if (mu.accel.typical != null) o.accelB23 = mu.accel.typical;
  if (mu.decel.typical != null) o.decelB23 = mu.decel.typical;
  return o;
}

/** Team KPI average across the match units that carry each KPI (mean per KPI). */
export function teamKpiAvg(units: MatchUnit[]): Partial<Record<WeeklyLoadMetricKey, number>> {
  const sums: Partial<Record<WeeklyLoadMetricKey, { s: number; n: number }>> = {};
  for (const mu of units) {
    const k = kpiAvgFromUnit(mu);
    for (const key of Object.keys(k) as WeeklyLoadMetricKey[]) {
      const v = k[key]; if (v == null) continue;
      const a = sums[key] ?? { s: 0, n: 0 }; a.s += v; a.n += 1; sums[key] = a;
    }
  }
  const o: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of Object.keys(sums) as WeeklyLoadMetricKey[]) { const a = sums[key]!; o[key] = Math.round(a.s / a.n); }
  return o;
}
