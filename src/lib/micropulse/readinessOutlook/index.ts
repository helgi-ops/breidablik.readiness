/**
 * Readiness Outlook — the orchestrator. Pure: takes prepared per-player histories + the
 * planned week, returns per-player per-day wellness-class forecasts. Single source for
 * every surface (Week Setup, Load Intelligence). Never reads/writes the canonical verdict.
 *
 * Pipeline (Perri 2021 template, Rossi/Rothschild interpretable-model guidance):
 *  1. Build walk-forward training samples per player (features.ts).
 *  2. Per-player z-score, pool, fit ONE ordinal model (ordinal.ts).
 *  3. Time-split holdout → per-player within-±1 (feeds the confidence gate).
 *  4. Forecast each planned future day at its PLANNED load → a ±1-class band.
 *  5. Plain why (dominant coefficient×feature), mandatory counterfactual (re-run at −15%
 *     planned load), and the 3-part confidence (confidence.ts).
 */

import { fitOrdinal, predictClass, predictProba, type OrdinalModel } from "./ordinal";
import {
  buildTrainingSamples, buildRawFeatures, fitNorm, applyNorm,
  FEATURE_KEYS, type PlayerHistory, type RawFeatures, type NormParams, type TrainingSample, type FeatureKey,
} from "./features";
import { classLabel, classTone, type WellnessClass, type Bi } from "./target";
import { computeOutlookConfidence, type OutlookConfidence } from "./confidence";

export interface OutlookPlayerInput {
  playerId: string;
  playerName: string;
  history: PlayerHistory;
  /** Weeks of the club's data for this player (for the maturity gate). */
  weeksOfData: number;
  /** Recent weekly total sRPE load (for the microcycle-stability read). */
  weeklyLoads: number[];
}

export interface PlannedDay {
  date: string;
  /** MD offset (MD = 0, MD-2 = −2, MD+1 = +1). */
  mdOffset: number;
  /** Planned sRPE load for the day (from planSessionLoad / Week Setup). */
  plannedLoad: number;
  /** Optional display label ("MD-2"). */
  mdLabel?: string;
}

export interface DayForecast {
  date: string;
  mdLabel: string | null;
  plannedLoad: number;
  /** Most-likely class (internal; never shown as an exact fact). */
  classArgmax: WellnessClass;
  /** Honest ±1 band actually shown to the coach. */
  bandLow: WellnessClass;
  bandHigh: WellnessClass;
  probs: number[];
  tone: "good" | "watch" | "concern";
  dip: boolean;
}

export interface PlayerOutlook {
  playerId: string;
  playerName: string;
  confidence: OutlookConfidence;
  days: DayForecast[];
  worstDay: DayForecast | null;
  /** True when a day is likely to dip AND confidence isn't withheld. */
  flagged: boolean;
  why: Bi | null;
  counterfactual: Bi | null;
}

export interface TeamOutlook {
  players: PlayerOutlook[];
  /** Overall walk-forward within-±1 accuracy (null if no holdout was possible). */
  modelWithin1: number | null;
  sampleCount: number;
  citation: string;
}

export const OUTLOOK_CITATION =
  "Perri 2021 (ordinal load→wellness) · Rossi 2022 (chronic load) · Rothschild 2024 (interpretable model)";

/** Lowest probability-weighted expected class across a player's forecast days (the dip). */
export function expectedFromDays(days: DayForecast[]): number | null {
  if (!days.length) return null;
  const exp = (p: number[]) => p.reduce((s, v, i) => s + v * (i + 1), 0);
  return Math.min(...days.map((d) => exp(d.probs)));
}

const clampClass = (n: number): WellnessClass => Math.max(1, Math.min(4, Math.round(n))) as WellnessClass;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Plain "why" clause for the dominant driver, given its z-sign. */
function driverClause(key: FeatureKey, z: number): Bi {
  const high = z > 0;
  switch (key) {
    case "plannedLoad": return high
      ? { en: "the load you've planned for that day is heavy for him", is: "álagið sem þú hefur planað þann dag er þungt fyrir hann" }
      : { en: "the planned day is light", is: "planaði dagurinn er léttur" };
    case "chronic28": return high
      ? { en: "his 4-week load is already high", is: "4-vikna álag hans er þegar hátt" }
      : { en: "his 4-week load is low", is: "4-vikna álag hans er lágt" };
    case "acute7": return high
      ? { en: "this week's load is high", is: "álag vikunnar er hátt" }
      : { en: "this week's load is light", is: "álag vikunnar er létt" };
    case "wellnessLag1": return high
      ? { en: "he's coming in fresh", is: "hann kemur ferskur inn" }
      : { en: "he's already coming in flat", is: "hann kemur nú þegar flatur inn" };
    case "wellnessLag7": return high
      ? { en: "he felt good a week ago", is: "honum leið vel fyrir viku" }
      : { en: "he was flat a week ago", is: "hann var flatur fyrir viku" };
    case "mdOffset": return { en: "of where the day sits in the week", is: "af stöðu dagsins í vikunni" };
  }
}

/** Argmax class for a raw feature vector under a model + the player's norm. */
function classOf(model: OrdinalModel, norm: NormParams, raw: RawFeatures): WellnessClass {
  return predictClass(model, applyNorm(raw, norm)) as WellnessClass;
}

/** Split samples by date at `frac`; returns [train, test]. */
function timeSplit(samples: TrainingSample[], frac: number): [TrainingSample[], TrainingSample[]] {
  const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date));
  const cut = Math.floor(sorted.length * frac);
  return [sorted.slice(0, cut), sorted.slice(cut)];
}

export function computeTeamOutlook(players: OutlookPlayerInput[], plannedDays: PlannedDay[]): TeamOutlook {
  // ── Build per-player samples + norms ──────────────────────────────────────
  const perPlayer = players.map((p) => {
    const samples = buildTrainingSamples(p.history);
    return { input: p, samples, norm: samples.length ? fitNorm(samples.map((s) => s.raw)) : null };
  });

  const sampleCount = perPlayer.reduce((s, pp) => s + pp.samples.length, 0);

  // ── Holdout (time split) for per-player predictability + overall accuracy ──
  const holdoutWithin1 = new Map<string, number>();
  let modelWithin1: number | null = null;
  if (sampleCount >= 30) {
    const trainZ: { x: number[]; y: WellnessClass }[] = [];
    const testByPlayer = new Map<string, { x: number[]; y: WellnessClass }[]>();
    for (const pp of perPlayer) {
      if (pp.samples.length < 4) continue;
      const [tr, te] = timeSplit(pp.samples, 0.7);
      if (tr.length < 3) continue;
      const norm = fitNorm(tr.map((s) => s.raw)); // fit on TRAIN only — no leakage
      for (const s of tr) trainZ.push({ x: applyNorm(s.raw, norm), y: s.y });
      const teZ = te.map((s) => ({ x: applyNorm(s.raw, norm), y: s.y }));
      if (teZ.length) testByPlayer.set(pp.input.playerId, teZ);
    }
    if (trainZ.length >= 20) {
      const hModel = fitOrdinal(trainZ, { k: 4, l2: 1.0 });
      let hit = 0, tot = 0;
      for (const [pid, te] of testByPlayer) {
        let pHit = 0;
        for (const s of te) { const pred = predictClass(hModel, s.x); if (Math.abs(pred - s.y) <= 1) { pHit++; hit++; } tot++; }
        if (te.length >= 3) holdoutWithin1.set(pid, pHit / te.length);
      }
      modelWithin1 = tot > 0 ? hit / tot : null;
    }
  }

  // ── Final model: per-player norm on ALL samples, one pooled fit ────────────
  const finalZ = perPlayer.flatMap((pp) => (pp.norm ? pp.samples.map((s) => ({ x: applyNorm(s.raw, pp.norm!), y: s.y })) : []));
  const model = finalZ.length >= 12 ? fitOrdinal(finalZ, { k: 4, l2: 1.0 }) : null;

  const out: PlayerOutlook[] = perPlayer.map((pp) => {
    const conf = computeOutlookConfidence({
      weeksOfData: pp.input.weeksOfData,
      sampleCount: pp.samples.length,
      weeklyLoads: pp.input.weeklyLoads,
      holdoutWithin1: holdoutWithin1.get(pp.input.playerId) ?? null,
    });

    // Withheld / no model / no norm → no forecast (no-data, never a green).
    if (conf.level === "withheld" || !model || !pp.norm) {
      return { playerId: pp.input.playerId, playerName: pp.input.playerName, confidence: conf, days: [], worstDay: null, flagged: false, why: null, counterfactual: null };
    }
    const norm = pp.norm;

    // Augment the load series with the PLANNED future loads — so a future day's acute/
    // chronic EWMA reflects the plan leading into it (this is what makes it a forecast,
    // not a nowcast). Wellness is driven by PRIOR load (Perri's day-lag), so a heavy day
    // dips the days that FOLLOW it, via this augmented series.
    const augLoad = new Map(pp.input.history.loadByDate);
    for (const pd of plannedDays) augLoad.set(pd.date, pd.plannedLoad);
    const forecastFor = (loadByDate: Map<string, number>, pd: PlannedDay) =>
      buildRawFeatures({ ...pp.input.history, loadByDate }, pd.date, pd.plannedLoad, pd.mdOffset);

    const days: DayForecast[] = [];
    for (const pd of plannedDays) {
      const raw = forecastFor(augLoad, pd);
      if (!raw) continue;
      const x = applyNorm(raw, norm);
      const argmax = predictClass(model, x) as WellnessClass;
      days.push({
        date: pd.date, mdLabel: pd.mdLabel ?? null, plannedLoad: pd.plannedLoad,
        classArgmax: argmax, bandLow: clampClass(argmax - 1), bandHigh: clampClass(argmax + 1),
        probs: predictProba(model, x), tone: classTone(argmax), dip: argmax <= 2,
      });
    }

    const worstDay = days.reduce<DayForecast | null>((w, d) => (w == null || d.classArgmax < w.classArgmax ? d : w), null);
    const flagged = !!worstDay && worstDay.dip;

    let why: Bi | null = null;
    let counterfactual: Bi | null = null;
    if (worstDay) {
      const wd = plannedDays.find((pd) => pd.date === worstDay.date)!;
      const raw = forecastFor(augLoad, wd);
      if (raw) {
        const x = applyNorm(raw, norm);
        // Dominant driver = the feature pushing the latent DOWN the most (β·x most negative).
        let worstKey: FeatureKey = FEATURE_KEYS[0], worstContrib = Infinity, worstZ = 0;
        FEATURE_KEYS.forEach((k, i) => { const c = model.beta[i] * x[i]; if (c < worstContrib) { worstContrib = c; worstKey = k; worstZ = x[i]; } });
        const clause = driverClause(worstKey, worstZ);
        why = flagged
          ? { en: `Likely to dip mainly because ${clause.en}.`, is: `Líklega niðri aðallega því ${clause.is}.` }
          : { en: `Holding up — ${clause.en}.`, is: `Heldur sér — ${clause.is}.` };

        if (flagged) {
          // Counterfactual: ease the heaviest PLANNED day leading into the dip (its
          // driver, not the dipping day itself), re-run the model at −15%.
          const leadIn = plannedDays.filter((pd) => pd.date < worstDay.date && daysBetween(pd.date, worstDay.date) <= 7);
          const driver = leadIn.reduce<PlannedDay | null>((m, pd) => (m == null || pd.plannedLoad > m.plannedLoad ? pd : m), null);
          if (driver && driver.plannedLoad > 0) {
            const eased = new Map(augLoad); eased.set(driver.date, driver.plannedLoad * 0.85);
            const easedRaw = forecastFor(eased, wd);
            const easedClass = easedRaw ? classOf(model, norm, easedRaw) : worstDay.classArgmax;
            const dLabel = driver.mdLabel ?? "that earlier day";
            counterfactual = easedClass > worstDay.classArgmax
              ? { en: `Reduce ${dLabel} load ~15% → ${worstDay.mdLabel ?? "the dip"} outlook lifts toward ${classLabel(easedClass).en.toLowerCase()}.`, is: `Lækkaðu ${dLabel}-álag ~15% → horfur fyrir ${worstDay.mdLabel ?? "dýfuna"} hækka í átt að ${classLabel(easedClass).is.toLowerCase()}.` }
              : { en: `Even easing ${dLabel} ~15% barely moves it — this dip is driven more by his accumulated load than one session.`, is: `Jafnvel að lækka ${dLabel} ~15% breytir litlu — þessi dýfa ræðst meira af uppsöfnuðu álagi en einni lotu.` };
          } else {
            counterfactual = { en: "This dip is driven by his recent accumulated load, not a single planned session — spread the load in the days before it.", is: "Þessi dýfa ræðst af nýlegu uppsöfnuðu álagi, ekki einni planaðri lotu — dreifðu álaginu dagana á undan." };
          }
        }
      }
    }

    return { playerId: pp.input.playerId, playerName: pp.input.playerName, confidence: conf, days, worstDay, flagged, why, counterfactual };
  });

  return { players: out, modelWithin1, sampleCount, citation: OUTLOOK_CITATION };
}
