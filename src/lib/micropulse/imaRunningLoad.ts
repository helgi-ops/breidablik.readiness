/**
 * IMA Free Running distance — load spike detection (ACWR + personal-z).
 *
 * High-intensity running distance (IMA band 5-8) is a primary driver of
 * hamstring / soft-tissue injury, so a sharp week-to-week jump is a real risk
 * signal. This computes the acute:chronic workload ratio (Gabbett / Williams
 * rolling-average method) on the IMA band 5-8 distance, plus a personal z-score
 * of today's session vs the player's recent training days.
 *
 * Confidence gate (manifesto): a 28-day chronic baseline needs enough real days
 * before the ratio means anything — with too few, we say "building" rather than
 * showing a number we can't stand behind.
 *
 * Pure / deterministic — no IO.
 */

export type ImaDayRow = {
  date: string;        // YYYY-MM-DD
  total: number;       // IMA band 5-8 total distance (m)
  band5?: number;
  band6?: number;
  band7?: number;
  band8?: number;
};

export type ImaRunStatus = "insufficient" | "low" | "optimal" | "high" | "spike";

export type ImaRunningLoad = {
  date: string;
  today: number;            // today's IMA band 5-8 distance (m), 0 if none
  acute7: number;           // mean daily over the last 7 days (rest days = 0)
  chronic28: number;        // mean daily over the last 28 days (rest days = 0)
  acwr: number | null;      // acute7 / chronic28
  status: ImaRunStatus;
  confident: boolean;       // chronic window has enough real days to trust the ratio
  chronicDays: number;      // days WITH high-intensity running in the chronic window
  z: number | null;         // today vs the player's recent training-day distribution
  dominantBand: 5 | 6 | 7 | 8 | null; // band carrying the most distance today
};

// 0.8–1.3 = familiar load-change range (Gabbett 2016); >1.5 = large spike.
// NB: ACWR is a spike-size descriptor, not a validated injury predictor
// (Impellizzeri 2020) — see the Methodology page for the framing.
const ACWR_LOW = 0.8;
const ACWR_HIGH = 1.3;
const ACWR_SPIKE = 1.5;
const MIN_CHRONIC_DAYS = 14; // need ~2 weeks of real data before the ratio is trustworthy
const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso + "T00:00:00Z");
  const b = Date.parse(bIso + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function computeImaRunningLoad(rows: ImaDayRow[], refDateIso: string): ImaRunningLoad {
  // Map date -> total (only rows up to and including the reference date).
  const byDate = new Map<string, ImaDayRow>();
  for (const r of rows ?? []) {
    if (!r?.date) continue;
    if (daysBetween(r.date, refDateIso) < 0) continue; // future of ref → ignore
    byDate.set(r.date, r);
  }

  let acuteSum = 0;
  let chronicSum = 0;
  let chronicDays = 0;
  const sessionTotals: number[] = []; // training-day totals in the chronic window (for z)

  for (let i = 0; i < CHRONIC_DAYS; i++) {
    const d = new Date(Date.parse(refDateIso + "T00:00:00Z") - i * 86_400_000)
      .toISOString().slice(0, 10);
    const v = Number(byDate.get(d)?.total ?? 0) || 0;
    chronicSum += v;
    if (i < ACUTE_DAYS) acuteSum += v;
    if (v > 0) { chronicDays += 1; sessionTotals.push(v); }
  }

  const acute7 = acuteSum / ACUTE_DAYS;
  const chronic28 = chronicSum / CHRONIC_DAYS;
  const acwr = chronic28 > 0 ? acute7 / chronic28 : null;
  const confident = chronicDays >= MIN_CHRONIC_DAYS;

  let status: ImaRunStatus;
  if (!confident || acwr == null) status = "insufficient";
  else if (acwr >= ACWR_SPIKE) status = "spike";
  else if (acwr >= ACWR_HIGH) status = "high";
  else if (acwr < ACWR_LOW) status = "low";
  else status = "optimal";

  // Personal z of today vs the player's recent training days (exclude rest-day
  // zeros so the comparison is "vs a typical session", not "vs the average day").
  const todayRow = byDate.get(refDateIso);
  const today = Number(todayRow?.total ?? 0) || 0;
  let z: number | null = null;
  const others = sessionTotals.filter((_, idx) => idx >= 0); // all training days incl today
  if (today > 0 && others.length >= 4) {
    const mean = others.reduce((s, x) => s + x, 0) / others.length;
    const variance = others.reduce((s, x) => s + (x - mean) ** 2, 0) / others.length;
    const sd = Math.sqrt(variance);
    z = sd > 0 ? round((today - mean) / sd, 1) : null;
  }

  // Which band carried the most distance today.
  let dominantBand: ImaRunningLoad["dominantBand"] = null;
  if (todayRow) {
    const bands: Array<[5 | 6 | 7 | 8, number]> = [
      [5, Number(todayRow.band5 ?? 0) || 0],
      [6, Number(todayRow.band6 ?? 0) || 0],
      [7, Number(todayRow.band7 ?? 0) || 0],
      [8, Number(todayRow.band8 ?? 0) || 0],
    ];
    bands.sort((a, b) => b[1] - a[1]);
    if (bands[0][1] > 0) dominantBand = bands[0][0];
  }

  return {
    date: refDateIso,
    today: round(today, 0),
    acute7: round(acute7, 0),
    chronic28: round(chronic28, 0),
    acwr: acwr == null ? null : round(acwr, 2),
    status,
    confident,
    chronicDays,
    z,
    dominantBand,
  };
}
