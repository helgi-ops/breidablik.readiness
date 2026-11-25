/**
 * Map a match unit (per-axis typicals) to the weekly-load KPI vocabulary, so the pre-season start
 * ramp + per-day distribution can scale every main variable. Shared by the hub and Week setup.
 * velocityBand5 = HSR − sprint(band6) when both are present. Pure; type-only import.
 */

import type { MatchUnit } from "./index";
import type { WeeklyLoadMetricKey } from "../externalLoad/weeklyLoadTypes";

/** `ima: true` adds the IMA KPIs (CoD, long-run distance, long-run strides) the hub's pre-season ramp and
 *  meso tables carry. They are appended last so the headline columns (the first two keys) don't change. */
export type KpiMapOpts = { ima?: boolean };

export function kpiAvgFromUnit(mu: MatchUnit, opts: KpiMapOpts = {}): Partial<Record<WeeklyLoadMetricKey, number>> {
  const o: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  if (mu.load.typical != null) o.totalPlayerLoad = mu.load.typical;
  if (mu.distance.typical != null) o.totalDistance = mu.distance.typical;
  if (mu.sprint.typical != null) o.velocityBand6 = mu.sprint.typical;
  if (mu.hsr.typical != null && mu.sprint.typical != null && mu.hsr.typical > mu.sprint.typical) o.velocityBand5 = Math.round(mu.hsr.typical - mu.sprint.typical);
  if (mu.accel.typical != null) o.accelB23 = mu.accel.typical;
  if (mu.decel.typical != null) o.decelB23 = mu.decel.typical;
  if (opts.ima) {
    if (mu.imaCod?.typical != null) o.imaCod = mu.imaCod.typical;
    if (mu.imaFr?.typical != null) o.imaFrDistance = mu.imaFr.typical;
    if (mu.stride?.typical != null) o.imaStrideHi = mu.stride.typical;
  }
  return o;
}

/** Team KPI average across the match units that carry each KPI (mean per KPI). */
export function teamKpiAvg(units: MatchUnit[], opts: KpiMapOpts = {}): Partial<Record<WeeklyLoadMetricKey, number>> {
  const sums: Partial<Record<WeeklyLoadMetricKey, { s: number; n: number }>> = {};
  for (const mu of units) {
    const k = kpiAvgFromUnit(mu, opts);
    for (const key of Object.keys(k) as WeeklyLoadMetricKey[]) {
      const v = k[key]; if (v == null) continue;
      const a = sums[key] ?? { s: 0, n: 0 }; a.s += v; a.n += 1; sums[key] = a;
    }
  }
  const o: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of Object.keys(sums) as WeeklyLoadMetricKey[]) { const a = sums[key]!; o[key] = Math.round(a.s / a.n); }
  return o;
}
