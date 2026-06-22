/**
 * Layer 1 — per-metric interpretation primitive
 * (docs/interpretation-architecture.md). value + the player's own rolling baseline
 * → z + band + plain language + confidence.
 *
 * WRAPS the existing `flagAgainstBaseline()` (the one place that computes "vs his
 * own norm", Robertson 2017) — does not rebuild it. We only translate its
 * green/yellow/red flag into the low/normal/high/spike vocabulary the dimension
 * layer uses, and attach the metric's plain label from the registry.
 */

import { flagAgainstBaseline, type AthleteMetricBaseline } from "../baselines";
import { getMetric } from "./registry";

export type MetricBand = "low" | "normal" | "high" | "spike";

export type InterpretedMetric = {
  metricKey: string;
  z: number | null;
  band: MetricBand;
  plain: { EN: string; IS: string };
  confidence: { baselineDays: number; mature: boolean };
};

// Mirror loadVerdict's MIN_BASELINE / the baselines 'calibrating' floor: below this
// we never call something a spike (honest — thin baseline can't earn high certainty).
const MIN_MATURE = 8;

function phrase(label: { EN: string; IS: string }, band: MetricBand): { EN: string; IS: string } {
  switch (band) {
    case "spike": return { EN: `${label.EN} well above his usual`, IS: `${label.IS} langt yfir venju` };
    case "high":  return { EN: `${label.EN} above his usual`,      IS: `${label.IS} yfir venju` };
    case "low":   return { EN: `${label.EN} below his usual`,      IS: `${label.IS} undir venju` };
    default:      return { EN: `${label.EN} around his usual`,     IS: `${label.IS} í kringum venju` };
  }
}

export function interpretMetric(
  metricKey: string,
  todayValue: number | null,
  baseline: AthleteMetricBaseline | null,
): InterpretedMetric {
  const label = getMetric(metricKey)?.plain ?? { EN: metricKey, IS: metricKey };
  const baselineDays = baseline?.n_observations ?? 0;
  const mature = baselineDays >= MIN_MATURE;

  if (todayValue == null) {
    return { metricKey, z: null, band: "normal", plain: phrase(label, "normal"), confidence: { baselineDays, mature } };
  }

  const { z, flag } = flagAgainstBaseline(todayValue, baseline, metricKey);
  let band: MetricBand;
  if (z == null) band = "normal";
  else if (flag === "red" && mature) band = "spike";        // ≥2 SD on a mature baseline
  else if (flag === "red" || flag === "yellow") band = "high"; // elevated, or ≥2 SD but baseline still thin
  else if (z <= -1.0) band = "low";                          // notably below own norm (under-load)
  else band = "normal";

  return { metricKey, z, band, plain: phrase(label, band), confidence: { baselineDays, mature } };
}
