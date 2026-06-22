/**
 * Layer 3 — verdict synthesizer (docs/interpretation-architecture.md).
 *
 * Consumes the AVAILABLE dimensions (not hard-coded signal names) → one plain
 * verdict + named drivers + confidence. Identical UX for every tier; lower tiers
 * simply present fewer dimensions and lower confidence, shown honestly. A braking
 * spike reads the same sentence whether it came from IMA decel (Pro) or Gen2
 * efforts (Core) — the sentence names the DIMENSION, not the column.
 *
 * Rules decide (ACWR > ~1.5 OR any dimension spike → SPIKING, etc.). Contested
 * signals (di Prampero metabolic power) can never trigger a band on their own.
 * This extends `loadVerdict` to be capability-driven; it does not recompute load.
 */

import type { LoadVerdictBand } from "../loadVerdict";
import { DIMENSION_LABELS, getMetric, type Dimension } from "./registry";
import type { MetricBand } from "./interpretMetric";

export type DimensionSignal = {
  dimension: Dimension;
  metricKey: string;       // the underlying column chosen for this dimension (drill-down)
  z: number | null;
  band: MetricBand;
  contested?: boolean;
};

export type SynthInput = {
  subject?: { name?: string };
  dimensions: DimensionSignal[];
  acwr?: { ratio: number | null } | null;
  /** Baseline maturity (training days) and 5-dimension coverage feed confidence. */
  baselineDays?: number;
  dimensionsCovered?: number; // of 5
};

export type VerdictDriver = {
  dimension: Dimension;
  metricKey: string;
  plain: { EN: string; IS: string };  // dimension-level label (coach-facing)
  z: number | null;
  band: MetricBand;
  tooltip: { EN: string; IS: string };  // names the underlying column + citation
};

export type SynthVerdict = {
  band: LoadVerdictBand;
  sentence: { EN: string; IS: string };
  drivers: VerdictDriver[];
  confidence: { level: "high" | "moderate" | "low"; dimensionsCovered: number; baselineDays: number };
};

const ACWR_SPIKE = 1.5;
const ACWR_WATCH_LO = 1.3;
const ACWR_UNDER = 0.8;
const absZ = (z: number | null) => (z == null ? 0 : Math.abs(z));

function driverOf(s: DimensionSignal): VerdictDriver {
  const label = DIMENSION_LABELS[s.dimension];
  const metric = getMetric(s.metricKey);
  return {
    dimension: s.dimension,
    metricKey: s.metricKey,
    plain: label,
    z: s.z,
    band: s.band,
    // The "why this dimension says what it says" — underlying column + its citation.
    tooltip: metric?.tooltip ?? { EN: s.metricKey, IS: s.metricKey },
  };
}

export function synthesizeVerdict(input: SynthInput): SynthVerdict {
  const dims = input.dimensions ?? [];
  // Contested signals never originate a band (integrity guardrail).
  const decisive = dims.filter((d) => !d.contested);
  const spikes = decisive.filter((d) => d.band === "spike").sort((a, b) => absZ(b.z) - absZ(a.z));
  const highs = decisive.filter((d) => d.band === "high").sort((a, b) => absZ(b.z) - absZ(a.z));
  const lows = decisive.filter((d) => d.band === "low");

  const ratio = input.acwr?.ratio ?? null;
  const acwrSpike = ratio != null && ratio > ACWR_SPIKE;
  const acwrWatch = ratio != null && ratio >= ACWR_WATCH_LO && ratio <= ACWR_SPIKE;
  const acwrUnder = ratio != null && ratio < ACWR_UNDER;

  let band: LoadVerdictBand;
  if (acwrSpike || spikes.length > 0) band = "SPIKING";
  else if (acwrWatch || highs.length > 0) band = "BUILDING";
  else if (acwrUnder || (lows.length > 0 && lows.length === decisive.length)) band = "UNDER";
  else band = "SUSTAINABLE";

  // Drivers = the dimensions that triggered the band, strongest first.
  const drivers: VerdictDriver[] =
    band === "SPIKING" ? spikes.map(driverOf)
    : band === "BUILDING" ? highs.map(driverOf)
    : band === "UNDER" ? lows.map(driverOf)
    : [];

  const name = input.subject?.name?.trim();
  const prefix = (s: string) => (name ? `${name}: ${s}` : s);
  const top = drivers[0];
  const lc = (l?: { EN: string; IS: string }) => ({ EN: (l?.EN ?? "").toLowerCase(), IS: (l?.IS ?? "").toLowerCase() });
  const d = lc(top?.plain);

  let sentence: { EN: string; IS: string };
  switch (band) {
    case "SPIKING":
      sentence = {
        EN: prefix(top ? `load is spiking — ${d.EN} well above the usual range.` : "acute load is spiking versus the chronic baseline."),
        IS: prefix(top ? `álagið er að rjúka upp — ${d.IS} langt yfir venju.` : "bráðaálag að rjúka upp m.v. grunnlínu."),
      };
      break;
    case "BUILDING":
      sentence = {
        EN: prefix(top ? `load is building — ${d.EN} above the usual range.` : "load is building versus the baseline."),
        IS: prefix(top ? `álagið er að byggjast upp — ${d.IS} yfir venju.` : "álag að byggjast upp m.v. grunnlínu."),
      };
      break;
    case "UNDER":
      sentence = {
        EN: prefix("under-loaded — training is below the usual range."),
        IS: prefix("undir-hlaðið — þjálfun undir venju."),
      };
      break;
    default:
      sentence = {
        EN: prefix("load is sustainable — within the usual range."),
        IS: prefix("álag er sjálfbært — innan venju."),
      };
  }

  const covered = input.dimensionsCovered ?? dims.length;
  const coverage = covered / 5;
  const baselineDays = input.baselineDays ?? 0;
  const level: "high" | "moderate" | "low" =
    coverage >= 0.66 && baselineDays >= 19 ? "high"
    : coverage >= 0.5 && baselineDays >= 8 ? "moderate"
    : "low";

  return { band, sentence, drivers, confidence: { level, dimensionsCovered: covered, baselineDays } };
}
