/**
 * Critical Speed (CS) + D′ — the running (field-sport) form of the critical-power model,
 * fitted from the DISTANCE power curve we already populate. CS is a speed (the pace he can
 * sustain), D′ is a distance reserve in metres (work available above CS). The watts form
 * (critical power / W′) is NOT available on a GPS feed — see the feasibility brief — so this
 * is CS/D′ only.
 *
 * MODEL — two-parameter critical-speed, distance–time linear form:
 *   D(t) = D′ + CS · t          (t = window length, D = peak distance in that window)
 * fitted by ordinary least squares over the player's season-best distance curve.
 *
 * ⚠️ UNITS: peakPeriod.ts stores the distance curve value as PER-MINUTE intensity (m/min),
 * i.e. point.value = D(t) / t (miiPeakPeriod.ts divides the cumulative interval by windowMin).
 * So we reconstruct D_i = point.value × point.windowMin before regressing. CS comes out in
 * m/min → also exposed as km/h (×0.06) and m/s (÷60); D′ in metres.
 *
 * Descriptive load/conditioning context ONLY — it must NEVER feed the readiness colour, the
 * load target, or the daily decision (same rule as peakPeriod.ts). Pure, no I/O.
 *
 * Cite: Pettitt 2016 (CS & D′ from distance) · Monod & Scherrer 1965 (power-duration) ·
 * Morton & Billat 2004 (intermittent running).
 */

import type { PowerCurve, Bi, Confidence } from "./peakPeriod";
import { MIN_MATURE_PEAKPERIOD_SESSIONS } from "./peakPeriod";

export interface CriticalSpeedRead {
  metric: string;                 // "distance"
  csMetresPerMin: number | null;  // slope
  csKmh: number | null;           // csMetresPerMin × 0.06
  csMs: number | null;            // csMetresPerMin ÷ 60
  dPrimeM: number | null;         // intercept, metres
  rSquared: number | null;        // fit quality 0–1
  nPoints: number;                // windows used in the fit
  csPercentile: number | null;    // vs squad, when squad CS values supplied
  dPrimePercentile: number | null;
  confidence: Confidence;         // "low" | "medium" | "high"
  verdict: Bi;                    // one plain-language line, EN + IS
  citation: string;
  caveat: Bi;
}

const CITATION = "Pettitt 2016 (critical speed & D′ from distance) · Monod & Scherrer 1965 (power-duration) · Morton & Billat 2004 (intermittent running)";

const CAVEAT: Bi = {
  en: "CS/D′ is the running form of the critical-power model, fitted from the peak distance at each window (1/3/5 min). It's a field estimate from maximal observed efforts, not a test to exhaustion — and with only three points in the 1–5 min band, D′ (the intercept) is the uncertain parameter. Descriptive context — it never changes the readiness verdict or the daily plan.",
  is: "CS/D′ er hlaupa-útgáfa critical-power líkansins, metin úr hámarks-vegalengd í hverjum glugga (1/3/5 mín). Þetta er vallar-mat úr hámarks-átökum sem sáust, ekki próf til örmögnunar — og með aðeins þrjá punkta í 1–5 mín bandinu er D′ (skurðpunkturinn) óvissi þátturinn. Lýsandi samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

const INSUFFICIENT: Bi = {
  en: "Not enough of a curve yet to fit critical speed reliably.",
  is: "Ekki næg kúrfa enn til að meta critical speed áreiðanlega.",
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Percentile rank (0–100) of `target` within `pool` (self-inclusive). Null if pool < 2. */
function percentile(target: number, pool: Array<number | null>): number | null {
  const vals = pool.filter((v): v is number => num(v) !== null);
  if (vals.length <= 1) return null;
  let below = 0, equal = 0;
  for (const v of vals) { if (v < target) below += 1; else if (v === target) equal += 1; }
  const rank = below + 0.5 * Math.max(0, equal - 1);
  return Math.round((rank / (vals.length - 1)) * 100);
}

function insufficientRead(metric: string, nPoints: number): CriticalSpeedRead {
  return {
    metric, csMetresPerMin: null, csKmh: null, csMs: null, dPrimeM: null, rSquared: null,
    nPoints, csPercentile: null, dPrimePercentile: null, confidence: "low",
    verdict: INSUFFICIENT, citation: CITATION, caveat: CAVEAT,
  };
}

/** Fit CS + D′ from ONE metric's power curve (default "distance"). Pure. */
export function computeCriticalSpeed(
  curve: PowerCurve | null | undefined,
  opts?: { sessions?: number; squadCs?: Array<number | null>; squadDPrime?: Array<number | null> },
): CriticalSpeedRead {
  const metric = curve?.metric ?? "distance";
  const sessions = opts?.sessions ?? 0;

  // Reconstruct distance (m) from per-minute intensity: D_i = value × windowMin.
  const pts = (curve?.points ?? [])
    .map((p) => ({ t: num(p.windowMin), D: num(p.value) != null && (p.value as number) > 0 ? (p.value as number) * (p.windowMin as number) : null }))
    .filter((p): p is { t: number; D: number } => p.t != null && p.t > 0 && p.D != null);
  if (pts.length < 2) return insufficientRead(metric, pts.length);

  const n = pts.length;
  const tBar = pts.reduce((s, p) => s + p.t, 0) / n;
  const DBar = pts.reduce((s, p) => s + p.D, 0) / n;
  let sxx = 0, sxy = 0;
  for (const p of pts) { sxx += (p.t - tBar) ** 2; sxy += (p.t - tBar) * (p.D - DBar); }
  if (sxx <= 0) return insufficientRead(metric, n); // all windows identical — can't fit

  const cs = sxy / sxx;                 // m/min (slope)
  const dPrime = DBar - cs * tBar;      // metres (intercept)

  let ssRes = 0, ssTot = 0;
  for (const p of pts) { const pred = dPrime + cs * p.t; ssRes += (p.D - pred) ** 2; ssTot += (p.D - DBar) ** 2; }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1; // distinct windows → ssTot>0

  // Physiologically valid fit: a downward speed curve gives CS>0 and a small positive D′.
  if (!(cs > 0) || dPrime < 0) return insufficientRead(metric, n);

  let confidence: Confidence;
  if (sessions < MIN_MATURE_PEAKPERIOD_SESSIONS || n < 3 || rSquared < 0.90) confidence = "low";
  else if (sessions >= 2 * MIN_MATURE_PEAKPERIOD_SESSIONS && n >= 3 && rSquared >= 0.95) confidence = "high";
  else confidence = "medium";

  const csKmh = cs * 0.06;
  const csMs = cs / 60;
  const kmhEn = csKmh.toFixed(1);
  const kmhIs = kmhEn.replace(".", ",");
  const dpr = Math.round(dPrime);
  const verdict: Bi = {
    en: `Critical speed ≈ ${kmhEn} km/h — the pace he can sustain — with a ~${dpr} m reserve above it.`,
    is: `Critical speed ≈ ${kmhIs} km/klst — hraðinn sem hann heldur — með ~${dpr} m forða yfir henni.`,
  };

  return {
    metric,
    csMetresPerMin: r1(cs), csKmh: r1(csKmh), csMs: r2(csMs), dPrimeM: Math.round(dPrime),
    rSquared: r3(rSquared), nPoints: n,
    csPercentile: opts?.squadCs ? percentile(cs, opts.squadCs) : null,
    dPrimePercentile: opts?.squadDPrime ? percentile(dPrime, opts.squadDPrime) : null,
    confidence, verdict, citation: CITATION, caveat: CAVEAT,
  };
}
