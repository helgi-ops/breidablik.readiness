/**
 * HRV recovery trend — pure, side-effect free.
 *
 * Morning RMSSD (root mean square of successive R-R differences) is the
 * parasympathetic recovery index of choice. Single-day HRV is noisy, so we read
 * a 7-DAY ROLLING MEAN against the player's OWN band and flag only when it sits
 * below-band for consecutive days (García-Ortega 2023 meta; Frontiers 2018).
 *
 * A labelled "recovery trend" (steady / watch / elevated) that sits BESIDE the
 * readiness colour — never merged into it, never a verdict on its own. A companion
 * to the parasympathetic picture: pair with sleep + soreness, don't headline HRV.
 * Descriptive/advisory. Cite: García-Ortega et al. 2023 · Frontiers 2018.
 */

export type Bi = { en: string; is: string };
export type HrvLevel = "steady" | "watch" | "elevated";
export type Confidence = "low" | "medium" | "high";

export interface HrvDaily {
  date: string;                 // ISO yyyy-mm-dd (morning measurement)
  rmssd: number | null;         // morning RMSSD (ms)
  restingHr: number | null;     // morning resting HR (bpm), optional companion
}

/** Meaningful-decrease threshold = 0.5 × baseline SD (HRVrest SWC, Frontiers 2018). */
export const HRV_SWC_SD_FRACTION = 0.5;
/** Consecutive below-band days at which a watch becomes elevated. */
export const HRV_ELEVATED_DAYS = 3;
export const HRV_CITATION = "García-Ortega et al. 2023 (HRV training meta-analysis) · Frontiers 2018 (HR team-sport framework)";

export interface HrvRecoveryRead {
  rolling7: number | null;                                  // latest 7-day rolling-mean RMSSD
  baseline: { mean: number; sd: number; lo: number } | null; // personal norm + lower band (mean − 0.5·SD)
  belowBandDays: number;                                     // consecutive recent days the rolling mean sat below `lo`
  level: HrvLevel;
  verdict: Bi;
  confidence: Confidence;
  nDays: number;
  citation: string;
  caveat: Bi;
}

const CAVEAT: Bi = {
  en: "HRV is a companion signal, not a verdict — a below-band trend suggests suppressed recovery, but heat, illness, alcohol and late meals all move it. Read the 7-day trend (not one morning) alongside sleep and soreness. Descriptive — never the readiness colour.",
  is: "HRV er fylgimerki, ekki dómur — þróun undir bandi bendir til skertrar endurheimtar, en hiti, veikindi, áfengi og seinar máltíðir hreyfa það líka. Lestu 7-daga þróunina (ekki einn morgun) samhliða svefni og strengjum. Lýsandi — aldrei readiness-liturinn.",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[], m: number): number => (xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compute the HRV recovery trend from a player's morning RMSSD series. Feed a
 * ~28-day window (any order). Baseline = mean±SD of RMSSD EXCLUDING the last 7
 * days (so a current dip doesn't contaminate the reference). Pure — no I/O.
 */
export function computeHrvRecoveryTrend(dailyIn: HrvDaily[]): HrvRecoveryRead {
  const daily = [...(dailyIn ?? [])]
    .filter((d) => d && typeof d.date === "string" && isNum(d.rmssd) && d.rmssd > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const base: HrvRecoveryRead = {
    rolling7: null, baseline: null, belowBandDays: 0, level: "steady",
    verdict: { en: "", is: "" }, confidence: "low", nDays: daily.length,
    citation: HRV_CITATION, caveat: CAVEAT,
  };

  // Need a reference (≥10 baseline days) + at least a few recent days to roll.
  if (daily.length < 10) {
    return { ...base, verdict: { en: "Not enough morning HRV yet to read a recovery trend.", is: "Ekki næg morgun-HRV enn til að lesa endurheimtar-þróun." } };
  }

  const dates = daily.map((d) => d.date);
  const rmssdByDate = new Map(daily.map((d) => [d.date, d.rmssd as number]));

  // 7-day rolling mean per day (needs ≥3 values in the trailing 7 calendar days).
  const rollingByDate = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) {
    const end = dates[i];
    const startD = new Date(`${end}T00:00:00Z`); startD.setUTCDate(startD.getUTCDate() - 6);
    const start = startD.toISOString().slice(0, 10);
    const vals = daily.filter((d) => d.date >= start && d.date <= end).map((d) => d.rmssd as number);
    if (vals.length >= 3) rollingByDate.set(end, mean(vals)!);
  }

  // Baseline = RMSSD excluding the last 7 calendar days (established norm).
  const lastDate = dates[dates.length - 1];
  const cutD = new Date(`${lastDate}T00:00:00Z`); cutD.setUTCDate(cutD.getUTCDate() - 7);
  const cut = cutD.toISOString().slice(0, 10);
  const baseVals = daily.filter((d) => d.date < cut).map((d) => d.rmssd as number);
  if (baseVals.length < 7) {
    return { ...base, verdict: { en: "Building the HRV baseline — a trend needs ~2+ weeks of history.", is: "Byggi HRV-viðmið — þróun þarf ~2+ vikna sögu." } };
  }
  const bMean = mean(baseVals)!;
  const bSd = sd(baseVals, bMean);
  const lo = bMean - HRV_SWC_SD_FRACTION * bSd;

  // Consecutive recent days the rolling mean sat below the lower band.
  let belowBandDays = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const roll = rollingByDate.get(dates[i]);
    if (roll == null) continue;
    if (roll < lo) belowBandDays++;
    else break;
  }
  const rolling7 = rollingByDate.get(lastDate) ?? null;

  const level: HrvLevel = belowBandDays >= HRV_ELEVATED_DAYS ? "elevated" : belowBandDays >= 1 ? "watch" : "steady";

  const rTxt = rolling7 != null ? Math.round(rolling7) : "—";
  const bTxt = Math.round(bMean);
  const verdict: Bi =
    level === "elevated"
      ? { en: `Recovery trend down — 7-day HRV (${rTxt} ms) below his norm (${bTxt} ms) for ${belowBandDays} days. Pair with sleep/soreness before loading.`, is: `Endurheimtar-þróun niður — 7-daga HRV (${rTxt} ms) undir venju (${bTxt} ms) í ${belowBandDays} daga. Berðu saman við svefn/strengi áður en álag er aukið.` }
      : level === "watch"
      ? { en: `HRV dipped below his band (7-day ${rTxt} vs norm ${bTxt} ms) — watch, not yet a trend.`, is: `HRV fór undir bandið (7-daga ${rTxt} vs venja ${bTxt} ms) — fylgstu með, ekki þróun enn.` }
      : { en: `HRV steady — 7-day mean within his personal band (${rTxt} vs ${bTxt} ms).`, is: `HRV stöðugt — 7-daga meðaltal innan bandsins (${rTxt} vs ${bTxt} ms).` };

  const confidence: Confidence = baseVals.length >= 14 ? "high" : baseVals.length >= 10 ? "medium" : "low";

  return {
    rolling7: rolling7 == null ? null : r1(rolling7),
    baseline: { mean: r1(bMean), sd: r1(bSd), lo: r1(lo) },
    belowBandDays, level, verdict, confidence, nDays: daily.length, citation: HRV_CITATION, caveat: CAVEAT,
  };
}
