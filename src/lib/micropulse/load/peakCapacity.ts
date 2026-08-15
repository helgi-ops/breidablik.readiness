/**
 * "% of peak capacity" — how hard a drill/period was as a share of the player's OWN peak
 * at that duration. Pure, side-effect free.
 *
 * The coaching label ADI popularised: "that 4-minute possession was 94% of his 4-minute
 * peak PlayerLoad." It needs two things — a drill's intensity (per-minute rate + duration,
 * from player_drill_load, which we have) and a CEILING at that duration.
 *
 * The ceiling has two sources, and this engine takes either:
 *   - TRUE power curve (peakPeriod.ts) once the Catapult peak-period export is ingested, or
 *   - a PROXY reference built here from the player's own drill history — his robust peak
 *     per-minute in the duration band the drill falls in (`buildCapacityReference`). This
 *     lets the label go live on data we already hold, and upgrade to the true curve later —
 *     the same honest proxy pattern as peakIntensity → peakPeriod.
 *
 * Duration matters: a 3-min drill naturally runs a higher per-minute rate than a 90-min
 * session, so the comparison is always duration-matched (same band), never a flat number.
 *
 * HONEST PROVENANCE:
 *   - The proxy ceiling is the p90 of his real drills in the band (outlier-resistant), not a
 *     true rolling peak. Above his p90 → >100% → a genuinely peak-level drill.
 *   - Read on the player's OWN capacity, never cross-athlete. Descriptive load context — it
 *     never touches the readiness colour, the load target, or the daily decision.
 *
 * Cite: Delaney 2017 (peak locomotor demands) · the peak-capacity / % of max framing (ADI / Catapult).
 */

export type Bi = { en: string; is: string };
export type CapacityLevel = "peak" | "high" | "moderate" | "low" | "insufficient";

/** One drill/period's load (from player_drill_load). */
export interface DrillLoad {
  durationMin: number | null;
  /** Per-minute rate of the metric (e.g. player_load_per_min). */
  valuePerMin: number | null;
  label?: string | null;
  date?: string | null;
}

/** Duration bands (minutes) — a drill's ceiling comes from his drills in the same band. */
export const DURATION_BANDS: Array<[number, number, string]> = [
  [0, 5, "0-5"],
  [5, 15, "5-15"],
  [15, 30, "15-30"],
  [30, 60, "30-60"],
  [60, Infinity, "60+"],
];

/** ≥ this % of his peak → a peak-level drill; then high / moderate / low. Provisional. */
export const PEAK_PCT = 95;
export const HIGH_PCT = 80;
export const MODERATE_PCT = 60;
/** A band needs at least this many drills for its p90 ceiling to mean anything. */
export const MIN_BAND_DRILLS = 4;

/** The player's peak-per-minute ceiling per duration band (p90), + an overall fallback. */
export interface CapacityReference {
  byBand: Record<string, number | null>;
  overall: number | null;
  drills: number;
}

const CITATION = "Delaney 2017 (peak locomotor demands) · ADI / Catapult (peak-capacity / % of max)";

const CAVEAT: Bi = {
  en: "% of peak capacity compares a drill's per-minute intensity to the player's own peak at that duration. Until the Catapult peak-period export lands, the ceiling is a proxy — the p90 of his real drills in the same duration band (outlier-resistant), so a drill above it reads over 100% (a genuinely peak-level effort). It's duration-matched and read on his own capacity, never cross-athlete. Descriptive — it never changes the readiness verdict or the daily plan.",
  is: "% af hámarksgetu ber saman ákefð æfingar á mínútu við eigin hámark leikmannsins á þeirri lengd. Þar til Catapult peak-period útflutningurinn kemur er þakið nálgun — p90 af raunverulegum æfingum hans í sama lengdar-bandi (útlaga-þolið), svo æfing yfir því les yfir 100% (raunverulega hámarks-átak). Það er lengdar-jafnað og lesið á hans eigin getu, aldrei milli leikmanna. Lýsandi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

function percentile(xs: number[], q: number): number | null {
  const vals = xs.filter((v) => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
  if (!vals.length) return null;
  if (vals.length === 1) return vals[0];
  const pos = q * (vals.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (pos - lo);
}

export function bandOf(durationMin: number): string {
  for (const [lo, hi, name] of DURATION_BANDS) if (durationMin >= lo && durationMin < hi) return name;
  return DURATION_BANDS[DURATION_BANDS.length - 1][2];
}

/**
 * Build the proxy capacity reference from a player's drill history: the p90 per-minute rate
 * in each duration band, plus an overall p90 fallback for thin bands. Pure.
 */
export function buildCapacityReference(history: DrillLoad[]): CapacityReference {
  const byBandVals = new Map<string, number[]>();
  const all: number[] = [];
  for (const d of history ?? []) {
    const dur = num(d.durationMin), v = num(d.valuePerMin);
    if (dur === null || dur <= 0 || v === null) continue;
    all.push(v);
    const b = bandOf(dur);
    (byBandVals.get(b) ?? byBandVals.set(b, []).get(b)!).push(v);
  }
  const byBand: Record<string, number | null> = {};
  for (const [, , name] of DURATION_BANDS) {
    const vals = byBandVals.get(name) ?? [];
    byBand[name] = vals.length >= MIN_BAND_DRILLS ? percentile(vals, 0.9) : null;
  }
  return { byBand, overall: all.length ? percentile(all, 0.9) : null, drills: all.length };
}

/** The ceiling per-minute value for a duration — the band p90, else the overall fallback. */
export function ceilingFor(ref: CapacityReference, durationMin: number): number | null {
  const b = ref.byBand[bandOf(durationMin)];
  return b ?? ref.overall;
}

export interface CapacityRead {
  durationMin: number | null;
  valuePerMin: number | null;
  ceiling: number | null;
  pctOfPeak: number | null;
  level: CapacityLevel;
  band: string | null;
  verdict: Bi;
  citation: string;
  caveat: Bi;
}

function levelFor(pct: number | null): CapacityLevel {
  if (pct === null) return "insufficient";
  if (pct >= PEAK_PCT) return "peak";
  if (pct >= HIGH_PCT) return "high";
  if (pct >= MODERATE_PCT) return "moderate";
  return "low";
}

function verdictFor(level: CapacityLevel, pct: number | null): Bi {
  const p = pct === null ? "—" : `${Math.round(pct)}%`;
  switch (level) {
    case "peak": return { en: `Peak-level drill — ${p} of his peak capacity at this duration.`, is: `Hámarks-æfing — ${p} af hámarksgetu hans á þessari lengd.` };
    case "high": return { en: `High intensity — ${p} of his peak capacity at this duration.`, is: `Há ákefð — ${p} af hámarksgetu hans á þessari lengd.` };
    case "moderate": return { en: `Moderate — ${p} of his peak capacity at this duration.`, is: `Miðlungs — ${p} af hámarksgetu hans á þessari lengd.` };
    case "low": return { en: `Low intensity — ${p} of his peak capacity at this duration.`, is: `Lág ákefð — ${p} af hámarksgetu hans á þessari lengd.` };
    default: return { en: "Not enough comparable drills yet to place this against his peak.", is: "Ekki nægar sambærilegar æfingar enn til að staðsetja þetta gegn hámarki hans." };
  }
}

/**
 * "% of peak capacity" for ONE drill. `ceiling` is the reference peak per-min at this
 * duration — pass ceilingFor(ref, duration) for the proxy, or the interpolated power-curve
 * value once real peak-period data exists. Pure.
 */
export function pctOfPeakCapacity(drill: DrillLoad, ceiling: number | null): CapacityRead {
  const dur = num(drill.durationMin);
  const v = num(drill.valuePerMin);
  const c = num(ceiling);
  const pct = v !== null && c !== null && c > 0 ? (v / c) * 100 : null;
  const level = levelFor(pct);
  return {
    durationMin: dur, valuePerMin: v, ceiling: c === null ? null : r1(c),
    pctOfPeak: pct === null ? null : Math.round(pct),
    level, band: dur !== null ? bandOf(dur) : null,
    verdict: verdictFor(level, pct), citation: CITATION, caveat: CAVEAT,
  };
}

/**
 * Convenience: score every drill in a session against a capacity reference (proxy or curve).
 * Returns the reads in input order, each carrying its label/date.
 */
export function scoreSessionDrills(
  drills: DrillLoad[],
  ref: CapacityReference,
): Array<CapacityRead & { label: string | null; date: string | null }> {
  return (drills ?? []).map((d) => {
    const dur = num(d.durationMin);
    const ceiling = dur !== null ? ceilingFor(ref, dur) : ref.overall;
    return { ...pctOfPeakCapacity(d, ceiling), label: d.label ?? null, date: d.date ?? null };
  });
}
