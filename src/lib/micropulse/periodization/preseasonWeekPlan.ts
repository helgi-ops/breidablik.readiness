/**
 * Distribute a pre-season week's KPI + load targets across the planned days by each day's INTENT.
 *
 * The weekly target (from `preseasonStartRamp`) is a total; this splits it into per-day targets so the
 * day plan the coach builds reflects the numbers. Each day-intent carries a load weight + a per-KPI
 * emphasis (a velocity day pulls the sprint bands, a force day the accel/decel + PlayerLoad), and each
 * KPI's daily slices sum back to the weekly KPI target. Rest/off/game days take no training slice.
 *
 * Pure, deterministic, null-safe. Advisory — the coach edits the day plan. Descriptive: never the
 * readiness colour. Reuses the weekly-load KPI vocabulary; imports no readiness/decision/load-target.
 *
 * Citations: Martín-García 2018 (MD-relative day taper) · Owen 2017 (positional mesocycle) · Foster (sRPE).
 */

import type { WeeklyLoadMetricKey } from "../externalLoad/weeklyLoadTypes";

export type DayLoadProfile = {
  /** Relative session load (drives overall load + sRPE split). 0 = not a training slice. */
  loadWeight: number;
  /** Per-KPI relative emphasis; a KPI missing here falls back to loadWeight. */
  kpi?: Partial<Record<WeeklyLoadMetricKey, number>>;
  training: boolean;
};

// Intent keys mirror Week setup's NoMatchIntent values (MD-relative pre-season day types).
export const PRESEASON_INTENT_PROFILE: Record<string, DayLoadProfile> = {
  FORCE_LIGHT:  { loadWeight: 0.9, training: true,  kpi: { accelB23: 1.0, decelB23: 1.0, totalPlayerLoad: 0.9, totalDistance: 0.8, velocityBand5: 0.6, velocityBand6: 0.4 } },
  FORCE:        { loadWeight: 1.1, training: true,  kpi: { accelB23: 1.3, decelB23: 1.3, totalPlayerLoad: 1.1, totalDistance: 1.0, velocityBand5: 0.8, velocityBand6: 0.6 } },
  NEURAL_VELOCITY: { loadWeight: 1.0, training: true, kpi: { velocityBand6: 1.4, velocityBand5: 1.1, totalDistance: 1.0, totalPlayerLoad: 1.0, accelB23: 0.9, decelB23: 0.8 } },
  VELOCITY:     { loadWeight: 0.9, training: true,  kpi: { velocityBand6: 1.3, velocityBand5: 1.0, totalDistance: 0.8, totalPlayerLoad: 0.9, accelB23: 0.7, decelB23: 0.7 } },
  POLISH_CALM:  { loadWeight: 0.6, training: true,  kpi: { velocityBand6: 0.6, velocityBand5: 0.6, totalDistance: 0.6, totalPlayerLoad: 0.6, accelB23: 0.5, decelB23: 0.5 } },
  ACTIVATION:   { loadWeight: 0.5, training: true,  kpi: { velocityBand6: 0.5, velocityBand5: 0.5, totalDistance: 0.5, totalPlayerLoad: 0.5, accelB23: 0.4, decelB23: 0.4 } },
  RECOVERY:     { loadWeight: 0.35, training: true, kpi: {} },
  RECOVERY_MD1: { loadWeight: 0.35, training: true, kpi: {} },
  RECOVERY_MD2: { loadWeight: 0.4, training: true,  kpi: {} },
  RECOVERY_PLUS:{ loadWeight: 0.45, training: true, kpi: {} },
  GAME:         { loadWeight: 0, training: false },
  OFF:          { loadWeight: 0, training: false },
};

const DEFAULT_PROFILE: DayLoadProfile = { loadWeight: 0.8, training: true, kpi: {} };
export const profileForIntent = (intent: string): DayLoadProfile => PRESEASON_INTENT_PROFILE[intent] ?? DEFAULT_PROFILE;

export type PerDayKpiTarget = {
  dayIndex: number;              // 0 = Monday
  intent: string;
  training: boolean;
  sharePct: number;             // this day's % of the week's overall load
  loadTarget: number | null;    // PL slice (null if no weekly load)
  srpeTarget: number | null;    // sRPE/AU slice
  byKpi: Partial<Record<WeeklyLoadMetricKey, number>>;
};

/**
 * Split the weekly totals across the 7 days by intent. Overall load + sRPE use each day's loadWeight;
 * each KPI uses its own per-day emphasis (falling back to loadWeight), so each KPI's daily targets sum
 * to the weekly KPI target and land on the days that actually train that quality.
 */
export function distributeWeekKpis(opts: {
  intents: string[];
  weeklyLoad: number | null;
  weeklySrpe: number | null;
  weeklyKpi: Partial<Record<WeeklyLoadMetricKey, number>>;
}): PerDayKpiTarget[] {
  const intents = opts.intents.slice(0, 7);
  const profiles = intents.map(profileForIntent);
  const totalLoadWeight = profiles.reduce((s, p) => s + Math.max(0, p.loadWeight), 0);

  // Per-KPI weight totals (across training days), for KPI-specific distribution.
  const kpiKeys = Object.keys(opts.weeklyKpi) as WeeklyLoadMetricKey[];
  const kpiWeightTotal: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const k of kpiKeys) {
    let sum = 0;
    for (const p of profiles) { if (!p.training) continue; sum += Math.max(0, p.kpi?.[k] ?? p.loadWeight); }
    kpiWeightTotal[k] = sum;
  }

  return intents.map((intent, i) => {
    const p = profiles[i];
    const w = Math.max(0, p.loadWeight);
    const share = totalLoadWeight > 0 ? w / totalLoadWeight : 0;
    const loadTarget = opts.weeklyLoad != null ? Math.round(opts.weeklyLoad * share) : null;
    const srpeTarget = opts.weeklySrpe != null ? Math.round(opts.weeklySrpe * share) : null;
    const byKpi: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    if (p.training) {
      for (const k of kpiKeys) {
        const wk = Math.max(0, p.kpi?.[k] ?? p.loadWeight);
        const tot = kpiWeightTotal[k] ?? 0;
        const weekly = opts.weeklyKpi[k];
        if (tot > 0 && weekly != null && wk > 0) byKpi[k] = Math.round(weekly * (wk / tot));
      }
    }
    return { dayIndex: i, intent, training: p.training, sharePct: Math.round(share * 100), loadTarget, srpeTarget, byKpi };
  });
}
