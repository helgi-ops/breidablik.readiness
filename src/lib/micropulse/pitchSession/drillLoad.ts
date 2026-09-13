/**
 * pitchSession / drillLoad
 *
 * The bridge between the football drill library and the load-target engine: it
 * sums a session's drills into the SAME per-KPI vocabulary (`LoadKpi`) that
 * `buildLoadPlan` targets use, so the pitch-session builder can show "planned =
 * X% of the MD-N target" per KPI (train-like-you-play).
 *
 * This is the reusable foundation for north-star Move 2: Slice 1 renders the
 * target comparison; Slices 2–4 (readiness caps that swap by per-KPI load, drill
 * recommendations that close a per-KPI gap, plan-vs-actual recalibration) all read
 * the same summed-load vocabulary.
 *
 * Units: `drill_library` load columns are per-player template values (Catapult
 * period means), so summing across a session × sets yields ONE player's planned
 * session load — the same per-player scale as `buildLoadPlan`'s `adjustedTargets`,
 * making the comparison unit-consistent. Descriptive only; never a readiness colour.
 *
 * Pure — no IO. Safe to import from client components.
 */

import type { LoadKpi, KpiTarget } from "@/lib/micropulse/loadPlan";
import { statusOf, type PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";

/**
 * drill_library column → LoadKpi. Only columns with a direct target counterpart
 * are mapped; metabolic / hmld / accel_total etc. have no LoadKpi target and are
 * left to the existing historical `MetricComparison` panel. `hir_total` overlaps
 * `hsr` (vel_b5) so it is intentionally NOT mapped to avoid double-counting.
 */
export const DRILL_COLUMN_TO_KPI: Record<string, LoadKpi> = {
  distance_m: "totalDistance",
  player_load: "playerLoad",
  vel_b5: "hsr",
  vel_b6: "sprint",
  accel_b23: "accel",
  decel_b23: "decel",
  ima_cod_total: "imaCod",
  high_ima: "ima",
  jump_count: "jumps",
};

export type SessionDrillItem = { drill: Record<string, unknown>; sets: number };

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Sum a session's drills into per-KPI planned load (per player), multiplying each
 * drill's column by its `sets`. Only KPIs with at least one contributing drill
 * appear in the result. Pure.
 */
export function sumSessionDrillLoad(items: SessionDrillItem[]): Partial<Record<LoadKpi, number>> {
  const out: Partial<Record<LoadKpi, number>> = {};
  for (const { drill, sets } of items) {
    const mult = typeof sets === "number" && Number.isFinite(sets) && sets > 0 ? sets : 1;
    for (const col in DRILL_COLUMN_TO_KPI) {
      const v = num(drill?.[col]);
      if (v == null) continue;
      const kpi = DRILL_COLUMN_TO_KPI[col];
      out[kpi] = (out[kpi] ?? 0) + v * mult;
    }
  }
  return out;
}

export type KpiComparison = {
  kpi: LoadKpi;
  planned: number | null;
  target: number | null;
  pctOfTarget: number | null;
  /** Fine-grained adherence status (shared thresholds). */
  status: PvaStatus;
  /** Collapsed under/on/over chip for the panel. */
  band: "under" | "on" | "over" | "na";
};

function toBand(s: PvaStatus): KpiComparison["band"] {
  if (s === "on") return "on";
  if (s === "over" || s === "well_over") return "over";
  if (s === "under" || s === "well_under") return "under";
  return "na";
}

/**
 * Compare planned session load against the MD target (train-like-you-play).
 * `pct = plannedSession / target`, reusing the shared 85–115% "on" bands via
 * `statusOf(target, plannedSession)`. One row per target KPI the session actually
 * loads; a null/zero target yields a `na` band (planned shown, no comparison).
 */
export function comparePlannedToTarget(
  planned: Partial<Record<LoadKpi, number>>,
  targets: KpiTarget[],
): KpiComparison[] {
  const out: KpiComparison[] = [];
  for (const t of targets) {
    const p = planned[t.kpi];
    if (p == null) continue; // the session doesn't load this KPI → nothing to compare
    // statusOf(planned, actual) computes actual/planned; here target is the
    // denominator and the summed session is the numerator.
    const { pct, status } = statusOf(t.target, p);
    out.push({
      kpi: t.kpi,
      planned: Math.round(p),
      target: t.target != null ? Math.round(t.target) : null,
      pctOfTarget: pct,
      status,
      band: toBand(status),
    });
  }
  return out;
}
