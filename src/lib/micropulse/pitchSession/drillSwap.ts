/**
 * pitchSession / drillSwap
 *
 * Slice 2 of Move 2: when a session drill conflicts with yellow/red players'
 * readiness caps (e.g. it's high-HSR or high-decel), suggest a concrete
 * lower-load alternative the coach could swap in — a same-category drill whose
 * load on the DRIVING KPIs is meaningfully lower. Suggestion only; the coach
 * swaps manually (never auto-applied). Descriptive, never a readiness colour.
 *
 * Same-category is required so the swap still trains the intended format/quality
 * (a possession drill for a possession drill), just at a lower dose on the axis
 * the cap is about. Pure — no IO. Reuses the Slice-1 `drillKpiLoad` bridge.
 */

import type { LoadKpi } from "@/lib/micropulse/loadPlan";
import { drillKpiLoad } from "./drillLoad";

export type DrillRowLike = Record<string, unknown>;

export type SwapSuggestion = {
  id: string;
  name: string;
  /** Per driving-KPI change vs the current drill; negative = lower load. */
  deltas: Array<{ kpi: LoadKpi; pct: number }>;
  /** The largest reduction (most negative pct) across the driving KPIs — for ranking/labels. */
  maxReductionPct: number;
};

/**
 * Same-category candidates that are lower-load than `current` on `drivingKpis`.
 * A candidate qualifies when it is NOT higher on any driving KPI the current
 * drill loads, and is at least `minReductionPct`% lower on at least one. Ranked
 * by ascending driving-KPI load (lightest first); top `limit` returned.
 */
export function suggestLowerLoadSwap(
  current: DrillRowLike,
  candidates: DrillRowLike[],
  drivingKpis: LoadKpi[],
  opts?: { minReductionPct?: number; limit?: number },
): SwapSuggestion[] {
  const minRed = opts?.minReductionPct ?? 15;
  const limit = opts?.limit ?? 2;
  const category = String(current.category ?? "");
  const currentId = String(current.id ?? "");
  const curLoad = drillKpiLoad(current);
  const curDriving = drivingKpis.reduce((s, k) => s + (curLoad[k] ?? 0), 0);
  if (curDriving <= 0) return []; // current doesn't load the driving KPI → nothing to reduce

  const scored: Array<{ sug: SwapSuggestion; drivingSum: number }> = [];
  for (const c of candidates) {
    if (String(c.id ?? "") === currentId) continue;
    if (String(c.category ?? "") !== category) continue; // keep the intended format/quality
    const cLoad = drillKpiLoad(c);
    const deltas: Array<{ kpi: LoadKpi; pct: number }> = [];
    let disqualified = false;
    let hasReduction = false;
    let drivingSum = 0;
    for (const k of drivingKpis) {
      const cand = cLoad[k] ?? 0;
      drivingSum += cand;
      const cur = curLoad[k];
      if (cur == null || cur <= 0) continue; // current doesn't load this KPI → ignore for delta
      const pct = Math.round(((cand - cur) / cur) * 100); // negative = lower than current
      deltas.push({ kpi: k, pct });
      if (pct > 0) { disqualified = true; break; } // higher on a driving KPI → not a lower-load swap
      if (pct <= -minRed) hasReduction = true;
    }
    if (disqualified || !hasReduction) continue;
    const maxReductionPct = Math.min(...deltas.map((d) => d.pct));
    scored.push({
      sug: { id: String(c.id ?? ""), name: String(c.drill_name ?? c.id ?? ""), deltas, maxReductionPct },
      drivingSum,
    });
  }
  scored.sort((a, b) => a.drivingSum - b.drivingSum); // lightest driving-KPI load first
  return scored.slice(0, limit).map((s) => s.sug);
}
