/**
 * Basketball indoor-load model — pure, side-effect free.
 *
 * Football's Indoor Load scores load from the Football Movement Profile (FMP) via
 * an out-of-repo RPC. Basketball is indoor with no GPS and no FMP, so it reads the
 * sport-neutral signals it genuinely produces: PlayerLoad + high-intensity IMA
 * (accelerations, decelerations, changes of direction) + jump counts. Each
 * component is normalised to the player's OWN 28-day baseline (100 = an average
 * session for that player) — the same personal-norm philosophy as the football
 * composite, which is the only defensible comparison (there are no trustworthy
 * normative basketball benchmarks — Power et al. 2022).
 *
 * HONEST PROVENANCE (this is intent-adapted, not a literal reproduction):
 *   - Tuttle et al. 2024 uses >3.5 m·s⁻² for accel/decel/CoD and >40 cm for jumps.
 *     Catapult's daily aggregates do NOT carry those exact cuts. The closest stored
 *     signal is Band 3 = >3.0 m·s⁻² event counts (ima_band3_accel/decel_count,
 *     ima_cod_*_high). Jumps are a raw COUNT with no height (>40 cm height exists
 *     only in VALD/CMJ, a different data source). So we use Band-3 (>3.0) events and
 *     jump counts as the available proxy and say so — never as Tuttle's exact >3.5.
 *   - The component WEIGHTS and band cutoffs below are PROVISIONAL. No basketball
 *     club has IMA data yet, so nothing here is calibrated. Confidence stays low
 *     until real data arrives; the engine is built to accept re-weighting then.
 *
 * Deliberately NOT modelled (evidence too weak — same as the week model): the ACWR
 * "sweet spot" (Weiss 2017 — "unclear"), normative women's benchmarks (Power 2022),
 * hormonal monitoring (Kamarauskas 2021).
 */

/** A plain-language string in both UI languages. */
export type Bi = { en: string; is: string };

export type LoadBand = "light" | "below_average" | "typical" | "heavy" | "spike";
export type Confidence = "low" | "medium" | "high";

/** One day's basketball-relevant external-load signals for a player. */
export interface BballLoadRow {
  date: string;
  /** player_load ?? total_player_load */
  playerLoad: number | null;
  /** ima_band3_accel_count (>3.0 m·s⁻²) */
  highAccel: number | null;
  /** ima_band3_decel_count (>3.0 m·s⁻²) */
  highDecel: number | null;
  /** ima_cod_left_high + ima_cod_right_high (>3.0 m·s⁻² change-of-direction) */
  highCod: number | null;
  /** jumps — a raw count, no height */
  jumps: number | null;
  /** impacts — foot-strike / collision count (the Titan indoor-IMU mechanical signal). Null for
   *  Catapult-only teams that don't report it. */
  impacts?: number | null;
}

export interface SessionScore {
  date: string;
  /** 0..~150+, where 100 = an average session for this player. Null if uncomputable. */
  score: number | null;
  band: LoadBand | null;
  /** Per-component index vs the player's own baseline (100 = average). */
  components: {
    playerLoad: number | null;
    highIntensityIma: number | null;
    jumps: number | null;
    impacts: number | null;
  };
}

export interface BasketballIndoorLoad {
  latest: SessionScore | null;
  history: SessionScore[];
  baseline: {
    avgPlayerLoad: number | null;
    avgHighIntensityIma: number | null;
    avgJumps: number | null;
    avgImpacts: number | null;
    sessions: number;
  };
  confidence: Confidence;
  dataCoverage: { hasPlayerLoad: boolean; hasIma: boolean; hasJumps: boolean; hasImpacts: boolean; sessions: number };
  citation: string;
  /** Bilingual honesty note — the Band-3 proxy + jump-count + provisional caveats. */
  caveat: Bi;
}

/**
 * Provisional component weights — NOT calibrated to real basketball data.
 * PlayerLoad is the whole-body volume backbone; high-intensity IMA is the
 * mechanical/decel signal that matters most for indoor injury risk (McBurnie 2022
 * lineage); jumps add the vertical component basketball uniquely loads. Renormalised
 * over whichever components a player actually has a baseline for.
 */
export const PROVISIONAL_WEIGHTS = {
  playerLoad: 0.45,
  highIntensityIma: 0.35,
  jumps: 0.20,
  // Titan indoor-IMU mechanical load (foot-strikes / collisions). Only present for Titan teams; the
  // weighted mean renormalises over whichever components exist, so a Catapult-only team (no impacts)
  // scores exactly as before, and a Titan team (no Band-3 IMA) scores on PlayerLoad + impacts + jumps.
  impacts: 0.25,
} as const;

/** Provisional band cutoffs (mirror the football composite, pending calibration). */
export const BAND_CUTOFFS = { spike: 140, heavy: 110, typical: 90, belowAverage: 60 } as const;

/** Baselines built from fewer than this many sessions are treated as immature. */
export const MIN_MATURE_SESSIONS = 6;

/**
 * Minimum baseline-average impacts for the impacts component to be a defensible load
 * index. Titan "impacts" are often sparse single-digit counts (e.g. 0–6/session); a ratio
 * of such small integers is noise, not load — a session with 1 impact vs a 3-impact norm is
 * "33%" by arithmetic but means nothing physiologically, yet at weight 0.25 it can drag an
 * otherwise-normal session into "below average". So impacts only join the composite (and the
 * per-component tile) when the player's baseline is impact-rich enough for the ratio to be
 * stable; below that they're shown only as a raw count in the Titan strip, never scored.
 */
export const MIN_IMPACTS_FOR_INDEX = 10;

const CITATION = "Tuttle et al. 2024 (thresholds, adapted) · Conte 2018 · Salazar 2020";

const CAVEAT: Bi = {
  en: "Provisional, not yet calibrated to real basketball data. Accel/decel/CoD use Catapult Band 3 (>3.0 m·s⁻²) as the available proxy for Tuttle's >3.5; jumps are counts, not >40 cm heights; impacts (Titan indoor IMU) are counts of high-g impact events (hard landings / contacts above a threshold) — discrete collision events, not continuous load, so they only enter the score when a player's baseline is impact-rich (≥10/session); below that they're shown as a raw count only, never scored (a ratio of single-digit counts is noise). Read on personal norm, low confidence until a squad's own data accrues.",
  is: "Til bráðabirgða, ekki enn kvarðað við raunveruleg körfuboltagögn. Hröðun/hægðun/stefnubreytingar nota Catapult Band 3 (>3.0 m·s⁻²) sem tiltækan staðgengil fyrir >3.5 hjá Tuttle; stökk eru talning, ekki >40 cm hæð; impacts (Titan innidyra-IMU) eru talning á há-g höggum (hörð lending / snerting yfir þröskuldi) — stök árekstra-atvik, ekki samfellt álag, svo þau fara aðeins í skorið þegar grunnlína leikmanns er högg-rík (≥10/æfingu); annars eru þau sýnd sem hrá tala eingöngu, aldrei skoruð (hlutfall eins-stafa talna er hávaði). Lesið á persónulegri viðmiðun, lítil vissa þar til gögn liðsins safnast.",
};

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

function highIntensityIma(row: BballLoadRow): number | null {
  const parts = [num(row.highAccel), num(row.highDecel), num(row.highCod)];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((a, p) => a + (p ?? 0), 0);
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function bandFor(score: number): LoadBand {
  if (score >= BAND_CUTOFFS.spike) return "spike";
  if (score >= BAND_CUTOFFS.heavy) return "heavy";
  if (score >= BAND_CUTOFFS.typical) return "typical";
  if (score >= BAND_CUTOFFS.belowAverage) return "below_average";
  return "light";
}

/** Round to 0.1 for stable display/tests. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compute a basketball indoor-load read for ONE player from their recent daily
 * rows (oldest → newest or any order; the last chronological row is "latest").
 * Pure: no I/O. Feed it the ~28–35 day window; it derives the personal baseline
 * from every row it's given.
 */
export function computeBasketballIndoorLoad(rows: BballLoadRow[]): BasketballIndoorLoad {
  const sorted = [...(rows ?? [])].filter((r) => r && typeof r.date === "string").sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const plVals = sorted.map((r) => num(r.playerLoad)).filter((v): v is number => v !== null);
  const imaVals = sorted.map((r) => highIntensityIma(r)).filter((v): v is number => v !== null);
  const jmpVals = sorted.map((r) => num(r.jumps)).filter((v): v is number => v !== null);
  const impVals = sorted.map((r) => num(r.impacts)).filter((v): v is number => v !== null);

  const avgPl = mean(plVals);
  const avgIma = mean(imaVals);
  const avgJmp = mean(jmpVals);
  const avgImp = mean(impVals);

  const baseline = {
    avgPlayerLoad: avgPl === null ? null : r1(avgPl),
    avgHighIntensityIma: avgIma === null ? null : r1(avgIma),
    avgJumps: avgJmp === null ? null : r1(avgJmp),
    avgImpacts: avgImp === null ? null : r1(avgImp),
    sessions: sorted.length,
  };

  const dataCoverage = {
    hasPlayerLoad: plVals.length > 0,
    hasIma: imaVals.length > 0,
    hasJumps: jmpVals.length > 0,
    hasImpacts: impVals.length > 0,
    sessions: sorted.length,
  };

  function scoreSession(row: BballLoadRow): SessionScore {
    const plRaw = num(row.playerLoad);
    const imaRaw = highIntensityIma(row);
    const jmpRaw = num(row.jumps);
    const impRaw = num(row.impacts);

    // Per-component index vs the player's own average (100 = average session).
    const plIdx = plRaw !== null && avgPl && avgPl > 0 ? (plRaw / avgPl) * 100 : null;
    const imaIdx = imaRaw !== null && avgIma && avgIma > 0 ? (imaRaw / avgIma) * 100 : null;
    const jmpIdx = jmpRaw !== null && avgJmp && avgJmp > 0 ? (jmpRaw / avgJmp) * 100 : null;
    // Only index impacts when the baseline is impact-rich enough for the ratio to be
    // stable — sparse single-digit counts are noise, not a load signal (see MIN_IMPACTS_FOR_INDEX).
    const impIdx = impRaw !== null && avgImp && avgImp >= MIN_IMPACTS_FOR_INDEX ? (impRaw / avgImp) * 100 : null;

    // Weighted mean over the components that actually have a baseline; renormalise.
    const parts: Array<[number, number]> = [];
    if (plIdx !== null) parts.push([plIdx, PROVISIONAL_WEIGHTS.playerLoad]);
    if (imaIdx !== null) parts.push([imaIdx, PROVISIONAL_WEIGHTS.highIntensityIma]);
    if (jmpIdx !== null) parts.push([jmpIdx, PROVISIONAL_WEIGHTS.jumps]);
    if (impIdx !== null) parts.push([impIdx, PROVISIONAL_WEIGHTS.impacts]);

    const wsum = parts.reduce((a, [, w]) => a + w, 0);
    const score = wsum > 0 ? parts.reduce((a, [v, w]) => a + v * w, 0) / wsum : null;

    return {
      date: row.date,
      score: score === null ? null : r1(score),
      band: score === null ? null : bandFor(score),
      components: {
        playerLoad: plIdx === null ? null : r1(plIdx),
        highIntensityIma: imaIdx === null ? null : r1(imaIdx),
        jumps: jmpIdx === null ? null : r1(jmpIdx),
        impacts: impIdx === null ? null : r1(impIdx),
      },
    };
  }

  const history = sorted.map(scoreSession);
  const latest = history.length ? history[history.length - 1] : null;

  // Honest confidence: needs a mature baseline AND at least one mechanical signal — Band-3 IMA
  // (Catapult) OR impacts (Titan). A thin baseline or neither mechanical signal caps it low.
  const hasMechanical = dataCoverage.hasIma || dataCoverage.hasImpacts;
  let confidence: Confidence = "low";
  if (dataCoverage.sessions >= MIN_MATURE_SESSIONS && hasMechanical) {
    confidence = dataCoverage.hasJumps && dataCoverage.sessions >= MIN_MATURE_SESSIONS * 2 ? "high" : "medium";
  }

  return {
    latest,
    history,
    baseline,
    confidence,
    dataCoverage,
    citation: CITATION,
    caveat: CAVEAT,
  };
}

// ── Per-player plain-language read (explainability L1) ───────────────────────
// Reads ONE player's latest session straight from their own indexed numbers and writes a
// short coach sentence: the verdict (band + score), what drove it (the signals furthest
// from their 100 norm), and the honest caveats (impacts too sparse to score, thin
// baseline). Rule-based and cited — no AI, never invents a number it wasn't given.

/** Describe how far an index sits from the player's 100 norm, in plain words. */
function devWord(idx: number, isIS: boolean): string {
  if (idx >= 120) return isIS ? "langt yfir" : "well above";
  if (idx >= 110) return isIS ? "yfir" : "above";
  if (idx >= 90) return isIS ? "um það bil í" : "about";
  if (idx >= 80) return isIS ? "aðeins undir" : "a little below";
  return isIS ? "langt undir" : "well below";
}

export function explainBasketballIndoorLoad(load: BasketballIndoorLoad): Bi | null {
  const s = load.latest;
  if (!s || s.score == null || s.band == null) return null;
  const c = s.components;
  const sig = (en: string, is: string) => ({ en, is });
  const NAMES: Record<"playerLoad" | "highIntensityIma" | "jumps" | "impacts", Bi> = {
    playerLoad: sig("load volume", "álag"),
    highIntensityIma: sig("high-intensity work", "háálags-vinna"),
    jumps: sig("jumps", "stökk"),
    impacts: sig("impacts", "högg"),
  };
  const present: Array<{ key: keyof typeof NAMES; idx: number }> = [];
  (Object.keys(NAMES) as Array<keyof typeof NAMES>).forEach((k) => {
    const idx = c[k];
    if (idx != null) present.push({ key: k, idx });
  });

  // Headline: band + score, naming the signal furthest from the norm in the band's direction.
  const low = [...present].sort((a, b) => a.idx - b.idx)[0];
  const high = [...present].sort((a, b) => b.idx - a.idx)[0];
  const sc = s.score;
  let enHead = "", isHead = "";
  if (s.band === "typical") {
    enHead = `Typical session (${sc}) — overall load in line with the 28-day norm.`;
    isHead = `Týpísk æfing (${sc}) — heildarálag í takt við 28-daga viðmiðun.`;
  } else if (s.band === "below_average") {
    enHead = `Lighter than usual (${sc})${low ? `, mainly ${NAMES[low.key].en} ${devWord(low.idx, false)} norm (${low.idx}%)` : ""}.`;
    isHead = `Léttari en vanalega (${sc})${low ? `, einkum ${NAMES[low.key].is} ${devWord(low.idx, true)} viðmiðun (${low.idx}%)` : ""}.`;
  } else if (s.band === "light") {
    enHead = `Light session (${sc}) — well below the player's norm${low ? ` (${NAMES[low.key].en} ${low.idx}%)` : ""}.`;
    isHead = `Létt æfing (${sc}) — langt undir viðmiðun leikmannsins${low ? ` (${NAMES[low.key].is} ${low.idx}%)` : ""}.`;
  } else if (s.band === "heavy") {
    enHead = `Heavy session (${sc})${high ? `, driven by ${NAMES[high.key].en} ${devWord(high.idx, false)} norm (${high.idx}%)` : ""}.`;
    isHead = `Þung æfing (${sc})${high ? `, drifin af ${NAMES[high.key].is} ${devWord(high.idx, true)} viðmiðun (${high.idx}%)` : ""}.`;
  } else {
    enHead = `Load spike (${sc}) — well above the norm${high ? ` (${NAMES[high.key].en} ${high.idx}%)` : ""}; watch recovery.`;
    isHead = `Álags-spike (${sc}) — langt yfir viðmiðun${high ? ` (${NAMES[high.key].is} ${high.idx}%)` : ""}; fylgstu með endurheimt.`;
  }

  // Signal line: each present component read vs the 100 norm.
  const parts = present.map((p) => `${NAMES[p.key].en} ${p.idx}%`);
  const partsIs = present.map((p) => `${NAMES[p.key].is} ${p.idx}%`);
  const enSignals = parts.length ? `Signals: ${parts.join(", ")} (100 = their norm).` : "";
  const isSignals = partsIs.length ? `Merki: ${partsIs.join(", ")} (100 = viðmiðun þeirra).` : "";

  // Caveats: impacts present but too sparse to score; thin baseline.
  const caveats: string[] = [];
  const caveatsIs: string[] = [];
  if (load.dataCoverage.hasImpacts && c.impacts == null) {
    const avg = load.baseline.avgImpacts;
    caveats.push(`impacts too sparse to score${avg != null ? ` (~${avg}/session)` : ""} — shown raw only`);
    caveatsIs.push(`högg of strjál til að skora${avg != null ? ` (~${avg}/æfingu)` : ""} — sýnd hrá eingöngu`);
  }
  if (load.baseline.sessions < MIN_MATURE_SESSIONS) {
    caveats.push(`baseline still thin (${load.baseline.sessions} session${load.baseline.sessions === 1 ? "" : "s"}) — read as a trend`);
    caveatsIs.push(`grunnlína enn þunn (${load.baseline.sessions} æfing${load.baseline.sessions === 1 ? "" : "ar"}) — lestu sem leitni`);
  }
  const enCav = caveats.length ? ` Note: ${caveats.join("; ")}.` : "";
  const isCav = caveatsIs.length ? ` Ath: ${caveatsIs.join("; ")}.` : "";

  return {
    en: `${enHead}${enSignals ? ` ${enSignals}` : ""}${enCav}`,
    is: `${isHead}${isSignals ? ` ${isSignals}` : ""}${isCav}`,
  };
}
