/**
 * Power-curve SHAPE classification — Explosive / Engine / Balanced / Under-conditioned.
 * Pure, side-effect free.
 *
 * A player's power curve (peakPeriod.ts) plots his peak value at each rolling window (5–15 s
 * up to 5–15 min). Its SHAPE is a coaching signal that a single number misses:
 *   - EXPLOSIVE — a high short-window peak that drops away fast (big 5–15 s ceiling, poor
 *     retention over minutes): a short-burst athlete.
 *   - ENGINE — a flatter curve that holds a high fraction of the short peak over long windows:
 *     a sustained/repeatable-effort athlete.
 *   - BALANCED — between the two.
 *   - UNDER-CONDITIONED — low peaks across ALL windows vs his peers (a low ceiling everywhere,
 *     not a shape preference): a development priority. Needs a squad benchmark to call.
 *
 * The measure is RETENTION = long-window peak ÷ short-window peak (× 100) = how much of his
 * short-burst intensity he holds over minutes. This is the classic power-duration idea
 * (Monod & Scherrer 1965; critical-power), applied to a Catapult metric rather than watts.
 *
 * HONEST PROVENANCE:
 *   - Needs a real power curve — the peak-period export (player_load_peak_period). It returns
 *     "insufficient" on the peakIntensity session-summary proxy (no window dimension).
 *   - The retention thresholds are PROVISIONAL until calibrated against real curves; they're
 *     named constants at the top, and the caveat says so.
 *   - Descriptive load context — it never touches the readiness colour, load target, or the
 *     daily decision.
 *
 * Cite: Monod & Scherrer 1965 (power-duration / critical power) · Delaney 2017 (peak locomotor demands).
 */

import type { PowerCurve } from "./peakPeriod";

export type Bi = { en: string; is: string };
export type CurveShape = "explosive" | "engine" | "balanced" | "under_conditioned" | "insufficient";

export interface CurveShapeRead {
  shape: CurveShape;
  metric: string;
  /** The short window used (minutes) — the smallest available at/under SHORT_WINDOW_MAX. */
  shortWindowMin: number | null;
  /** The long window used (minutes) — the largest available at/over LONG_WINDOW_MIN. */
  longWindowMin: number | null;
  shortValue: number | null;
  longValue: number | null;
  /** long ÷ short × 100 — how much of his short-burst peak he holds over minutes. */
  retentionPct: number | null;
  /** His short/long peak vs the squad (0–100), when squad peaks are supplied. */
  shortPercentile: number | null;
  longPercentile: number | null;
  verdict: Bi;
  citation: string;
  caveat: Bi;
}

/** A window ≤ this (minutes) counts as the "short-burst" end of the curve (~≤30 s). */
export const SHORT_WINDOW_MAX = 0.5;
/** A window ≥ this (minutes) counts as the "sustained" end of the curve. */
export const LONG_WINDOW_MIN = 5;
/** Retention at/above this % → holds intensity well → engine. PROVISIONAL. */
export const ENGINE_RETENTION = 55;
/** Retention at/below this % → drops away fast → explosive. PROVISIONAL. */
export const EXPLOSIVE_RETENTION = 40;
/** Both short & long peaks below this squad percentile → under-conditioned (low ceiling). */
export const UNDERCONDITIONED_PCTL = 35;

const CITATION = "Monod & Scherrer 1965 (power-duration) · Delaney 2017 (peak locomotor demands)";

const CAVEAT: Bi = {
  en: "Curve shape reads the power curve from the Catapult peak-period feed — how much of his shortest-window peak he holds over his longest window (retention = long ÷ short). The windows are whatever the feed reports (1/3/5 min today; set wider ones in OpenField's MII config to span short-burst → sustained). Explosive = high short peak that fades fast; Engine = holds a high fraction over long windows; Under-conditioned = a low ceiling at every window vs his peers. Retention thresholds are provisional until calibrated on real curves. Descriptive — it never changes the readiness verdict or the daily plan.",
  is: "Kúrfu-lögun les afl-kúrfuna úr Catapult peak-period straumnum — hversu miklu af hámarki stysta gluggans hann heldur yfir lengsta gluggann (retention = langur ÷ stuttur). Gluggarnir eru þeir sem straumurinn skilar (1/3/5 mín núna; stilltu víðari í MII-stillingu OpenField til að spanna skammtíma-sprengju → úthald). Explosive = hátt skammtíma-hámark sem dvínar hratt; Engine = heldur háu hlutfalli yfir langa glugga; Under-conditioned = lágt þak í öllum gluggum m.v. jafningja. Retention-mörkin eru til bráðabirgða þar til þau eru kvörðuð á raunverulegum kúrfum. Lýsandi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

function verdictFor(shape: CurveShape, metric: string): Bi {
  switch (shape) {
    case "explosive":
      return {
        en: `Explosive shape — a high short-burst ceiling on ${metric} that fades fast over minutes. Suits short, sharp efforts; build repeatability if the role demands it.`,
        is: `Explosive lögun — hátt skammtíma-þak á ${metric} sem dvínar hratt yfir mínútur. Hentar stuttum, snörpum átökum; byggðu endurtekningu ef hlutverkið krefst.`,
      };
    case "engine":
      return {
        en: `Engine shape — holds a high fraction of his peak ${metric} over long windows. A repeatable-effort athlete; develop top-end burst if you want more explosiveness.`,
        is: `Engine lögun — heldur háu hlutfalli af hámarks ${metric} yfir langa glugga. Endurtekninga-íþróttamaður; þróaðu topp-sprengikraft ef þú vilt meira.`,
      };
    case "under_conditioned":
      return {
        en: `Under-conditioned — a low ${metric} ceiling across every window vs his peers. A development priority, not a shape preference.`,
        is: `Under-conditioned — lágt ${metric} þak í öllum gluggum m.v. jafningja. Þróunar-forgangur, ekki lögunar-val.`,
      };
    case "balanced":
      return {
        en: `Balanced shape — no strong bias between short-burst and sustained ${metric}.`,
        is: `Jafnvægis-lögun — engin sterk slagsíða milli skammtíma og viðvarandi ${metric}.`,
      };
    default:
      return {
        en: "Not enough of a power curve yet to read its shape — needs the peak-period export at several window lengths.",
        is: "Ekki næg afl-kúrfa enn til að lesa lögun — þarf peak-period útflutning við nokkrar gluggalengdir.",
      };
  }
}

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/** Percentile of `target` within `pool` (higher = better), ties share the midpoint. 0–100. */
function percentile(target: number, pool: Array<number | null>): number | null {
  const vals = pool.filter((v): v is number => num(v) !== null);
  if (vals.length <= 1) return null;
  let below = 0, equal = 0;
  for (const v of vals) { if (v < target) below += 1; else if (v === target) equal += 1; }
  const rank = below + 0.5 * Math.max(0, equal - 1);
  return Math.round((rank / (vals.length - 1)) * 100);
}

/**
 * Classify one metric's power curve. `squadShort` / `squadLong` are every player's peak at
 * the matched short / long window (for the under-conditioned + percentile reads); omit them
 * to classify by retention only. Pure.
 */
export function classifyCurveShape(
  curve: PowerCurve | null | undefined,
  opts: { squadShort?: Array<number | null>; squadLong?: Array<number | null> } = {},
): CurveShapeRead {
  const metric = curve?.metric ?? "load";
  const base = (shape: CurveShape, extra: Partial<CurveShapeRead> = {}): CurveShapeRead => ({
    shape, metric,
    shortWindowMin: null, longWindowMin: null, shortValue: null, longValue: null,
    retentionPct: null, shortPercentile: null, longPercentile: null,
    verdict: verdictFor(shape, metric), citation: CITATION, caveat: CAVEAT, ...extra,
  });

  const points = (curve?.points ?? []).filter((p) => num(p.value) !== null);
  if (points.length < 2) return base("insufficient");

  // Short = smallest window at/under the short cap; long = largest at/over the long floor.
  const shortP = points.filter((p) => p.windowMin <= SHORT_WINDOW_MAX).sort((a, b) => a.windowMin - b.windowMin)[0]
    ?? points.slice().sort((a, b) => a.windowMin - b.windowMin)[0];
  const longP = points.filter((p) => p.windowMin >= LONG_WINDOW_MIN).sort((a, b) => b.windowMin - a.windowMin)[0]
    ?? points.slice().sort((a, b) => b.windowMin - a.windowMin)[0];
  if (!shortP || !longP || shortP.windowMin >= longP.windowMin) return base("insufficient");

  const shortValue = num(shortP.value);
  const longValue = num(longP.value);
  if (shortValue === null || longValue === null || shortValue <= 0) return base("insufficient");

  const retentionPct = Math.round((longValue / shortValue) * 100);
  const shortPercentile = opts.squadShort ? percentile(shortValue, opts.squadShort) : null;
  const longPercentile = opts.squadLong ? percentile(longValue, opts.squadLong) : null;

  let shape: CurveShape;
  if (shortPercentile !== null && longPercentile !== null
      && shortPercentile <= UNDERCONDITIONED_PCTL && longPercentile <= UNDERCONDITIONED_PCTL) {
    shape = "under_conditioned";
  } else if (retentionPct >= ENGINE_RETENTION) {
    shape = "engine";
  } else if (retentionPct <= EXPLOSIVE_RETENTION) {
    shape = "explosive";
  } else {
    shape = "balanced";
  }

  return base(shape, {
    shortWindowMin: shortP.windowMin, longWindowMin: longP.windowMin,
    shortValue, longValue, retentionPct, shortPercentile, longPercentile,
  });
}
