/**
 * intensityVerdict — "how hard was today vs his own usual day?", from the signals
 * a club actually has. Capability-driven (NOT tier-hardcoded): the primary signal
 * is player_load_per_minute (work rate); high_metabolic_load_distance_m (HML) and
 * high-speed-running distance (HSR) corroborate. di Prampero metabolic_power is
 * deliberately excluded (empty on Core, contested in football).
 *
 * Reuses flagAgainstBaseline() (z + SD-band vs the player's OWN rolling baseline)
 * and the mature-baseline rule from playerLoadAcwr / movementSignature: a baseline
 * needs ≥ MIN_DAYS training days; 8–13 days calibrate with wider bands, ≥14 give
 * full sensitivity. Confidence DEGRADES when fewer of the three signals are
 * present — a Core club covering only PL/min reads lower than a Pro club with all
 * three, honestly, never faked.
 *
 * This is a LOAD/intensity dimension, surfaced as a distinct labelled signal — it
 * never touches the canonical readiness colour (CLAUDE.md).
 */

import { flagAgainstBaseline, type AthleteMetricBaseline, type BaselineStatus, type SdBandFlag } from "../baselines";

export const MIN_DAYS = 8;   // mature-baseline floor (mirrors movementSignature)
const ACTIVE_DAYS = 14;      // ≥ this = full sensitivity

export type IntensitySignal = "pl_per_min" | "hml" | "hsr";

const SIGNAL_META: Record<IntensitySignal, { metricKey: string; plain: { EN: string; IS: string }; tooltip: { EN: string; IS: string } }> = {
  pl_per_min: {
    metricKey: "external.player_load_per_minute",
    plain: { EN: "work rate", IS: "ákefð" },
    tooltip: { EN: "Player Load per minute — how hard the minutes were, not just how many.", IS: "Player Load á mínútu — hversu ákafar mínúturnar voru, ekki bara hversu margar." },
  },
  hml: {
    metricKey: "external.high_metabolic_load_distance_m",
    plain: { EN: "high-metabolic running", IS: "háorku-hlaup" },
    tooltip: { EN: "High Metabolic Load Distance — metres at high metabolic power (di Prampero 2015).", IS: "Háorku-vegalengd — metrar á háu efnaskiptaafli (di Prampero 2015)." },
  },
  hsr: {
    metricKey: "external.high_speed_distance",
    plain: { EN: "high-speed running", IS: "háhraðahlaup" },
    tooltip: { EN: "High-speed-running distance (Malone 2017).", IS: "Háhraðahlaups-vegalengd (Malone 2017)." },
  },
};

export type IntensityBand = "spiking" | "elevated" | "typical" | "easier" | null;

export type IntensityDriver = {
  key: IntensitySignal;
  plain: { EN: string; IS: string };
  tooltip: { EN: string; IS: string };
  z: number | null;
  flag: SdBandFlag;
};

export type IntensityVerdict = {
  /** True only when the PRIMARY signal (PL/min) has a mature baseline + today's value. */
  available: boolean;
  band: IntensityBand;
  /** Signed z of the primary signal vs own baseline (positive = harder than usual). */
  z: number | null;
  /** Baseline mature (≥14 days) vs calibrating. */
  confident: boolean;
  baselineDays: number;
  /** 0..1 — fraction of the three signals with a usable (mature) baseline + today. */
  coverage: number;
  drivers: IntensityDriver[];
  headline: { EN: string; IS: string } | null;
  counterfactual: { EN: string; IS: string } | null;
};

function mean(xs: number[]) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function sd(xs: number[], m: number) { return xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); }

/** Build an AthleteMetricBaseline from a window series (today excluded). */
export function buildIntensityBaseline(playerId: string, metricKey: string, values: number[]): AthleteMetricBaseline {
  const n = values.length;
  const m = mean(values);
  const status: BaselineStatus = n < MIN_DAYS ? "insufficient_data" : n < ACTIVE_DAYS ? "calibrating" : "active";
  return {
    player_id: playerId, metric_key: metricKey, n_observations: n,
    mean: m, sd: sd(values, m), cv: m ? sd(values, m) / m : null, median: null,
    window_days: 28, status, computed_at: "",
  };
}

export type IntensityInput = {
  playerId: string;
  firstName?: string;
  today: Partial<Record<IntensitySignal, number | null>>;
  /** Window history per signal (today EXCLUDED); training days only. */
  history: Partial<Record<IntensitySignal, number[]>>;
};

export function computeIntensityVerdict(input: IntensityInput): IntensityVerdict {
  const drivers: IntensityDriver[] = [];
  let usable = 0;

  // Evaluate each signal vs its own baseline (higher = harder; flagAgainstBaseline
  // defaults to higher_is_worse, so a positive z lights up yellow/red).
  const evals: Partial<Record<IntensitySignal, { z: number | null; flag: SdBandFlag; days: number; mature: boolean }>> = {};
  for (const key of ["pl_per_min", "hml", "hsr"] as IntensitySignal[]) {
    const todayVal = input.today[key];
    const series = (input.history[key] ?? []).filter((v) => Number.isFinite(v));
    const baseline = buildIntensityBaseline(input.playerId, SIGNAL_META[key].metricKey, series);
    const mature = baseline.status !== "insufficient_data";
    if (todayVal == null || !Number.isFinite(todayVal) || !mature) {
      evals[key] = { z: null, flag: "green", days: series.length, mature };
      continue;
    }
    usable += 1;
    const { z, flag } = flagAgainstBaseline(todayVal, baseline, SIGNAL_META[key].metricKey);
    evals[key] = { z, flag, days: series.length, mature: baseline.status === "active" ? true : mature };
    if (flag !== "green") {
      drivers.push({ key, plain: SIGNAL_META[key].plain, tooltip: SIGNAL_META[key].tooltip, z, flag });
    }
  }

  const coverage = Math.round((usable / 3) * 100) / 100;
  const primary = evals.pl_per_min;
  const primaryReady = primary != null && primary.z != null;

  if (!primaryReady) {
    return {
      available: false, band: null, z: null,
      confident: false, baselineDays: primary?.days ?? 0, coverage, drivers: [],
      headline: null, counterfactual: null,
    };
  }

  const z = primary!.z as number;
  const flag = primary!.flag;
  const band: IntensityBand =
    flag === "red" ? "spiking"
      : flag === "yellow" ? "elevated"
        : z <= -1 ? "easier"
          : "typical";

  // Baseline maturity: PL/min active (≥14 days) → confident.
  const plSeriesLen = (input.history.pl_per_min ?? []).filter((v) => Number.isFinite(v)).length;
  const confident = plSeriesLen >= ACTIVE_DAYS;

  drivers.sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  const name = input.firstName ?? "He";
  const driverEN = drivers.length ? ` — driven by ${drivers.map((d) => d.plain.EN).join(", ")}` : "";
  const driverIS = drivers.length ? ` — vegna ${drivers.map((d) => d.plain.IS).join(", ")}` : "";

  const headline = {
    EN:
      band === "spiking" ? `${name}'s work rate is well above his usual day (z ${z})${driverEN}.`
        : band === "elevated" ? `${name}'s work rate is above his usual day (z ${z})${driverEN}.`
          : band === "easier" ? `${name}'s work rate is easier than his usual day (z ${z}).`
            : `${name}'s work rate is in his usual range (z ${z}).`,
    IS:
      band === "spiking" ? `Ákefð ${name} er langt yfir hans venjulega degi (z ${z})${driverIS}.`
        : band === "elevated" ? `Ákefð ${name} er yfir hans venjulega degi (z ${z})${driverIS}.`
          : band === "easier" ? `Ákefð ${name} er léttari en hans venjulegi dagur (z ${z}).`
            : `Ákefð ${name} er innan hans venju (z ${z}).`,
  };

  const counterfactual = (band === "spiking" || band === "elevated")
    ? {
        EN: `Flagged only because it's outside his own usual range — at his typical work rate this would not appear.`,
        IS: `Flaggað aðeins því það er utan hans venju — á venjulegri ákefð myndi þetta ekki birtast.`,
      }
    : null;

  return { available: true, band, z, confident, baselineDays: plSeriesLen, coverage, drivers, headline, counterfactual };
}
