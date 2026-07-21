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
  };
}

export interface BasketballIndoorLoad {
  latest: SessionScore | null;
  history: SessionScore[];
  baseline: {
    avgPlayerLoad: number | null;
    avgHighIntensityIma: number | null;
    avgJumps: number | null;
    sessions: number;
  };
  confidence: Confidence;
  dataCoverage: { hasPlayerLoad: boolean; hasIma: boolean; hasJumps: boolean; sessions: number };
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
} as const;

/** Provisional band cutoffs (mirror the football composite, pending calibration). */
export const BAND_CUTOFFS = { spike: 140, heavy: 110, typical: 90, belowAverage: 60 } as const;

/** Baselines built from fewer than this many sessions are treated as immature. */
export const MIN_MATURE_SESSIONS = 6;

const CITATION = "Tuttle et al. 2024 (thresholds, adapted) · Conte 2018 · Salazar 2020";

const CAVEAT: Bi = {
  en: "Provisional, not yet calibrated to real basketball data. Accel/decel/CoD use Catapult Band 3 (>3.0 m·s⁻²) as the available proxy for Tuttle's >3.5; jumps are counts, not >40 cm heights. Read on personal norm, low confidence until a squad's own data accrues.",
  is: "Til bráðabirgða, ekki enn kvarðað við raunveruleg körfuboltagögn. Hröðun/hægðun/stefnubreytingar nota Catapult Band 3 (>3.0 m·s⁻²) sem tiltækan staðgengil fyrir >3.5 hjá Tuttle; stökk eru talning, ekki >40 cm hæð. Lesið á persónulegri viðmiðun, lítil vissa þar til gögn liðsins safnast.",
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

  const avgPl = mean(plVals);
  const avgIma = mean(imaVals);
  const avgJmp = mean(jmpVals);

  const baseline = {
    avgPlayerLoad: avgPl === null ? null : r1(avgPl),
    avgHighIntensityIma: avgIma === null ? null : r1(avgIma),
    avgJumps: avgJmp === null ? null : r1(avgJmp),
    sessions: sorted.length,
  };

  const dataCoverage = {
    hasPlayerLoad: plVals.length > 0,
    hasIma: imaVals.length > 0,
    hasJumps: jmpVals.length > 0,
    sessions: sorted.length,
  };

  function scoreSession(row: BballLoadRow): SessionScore {
    const plRaw = num(row.playerLoad);
    const imaRaw = highIntensityIma(row);
    const jmpRaw = num(row.jumps);

    // Per-component index vs the player's own average (100 = average session).
    const plIdx = plRaw !== null && avgPl && avgPl > 0 ? (plRaw / avgPl) * 100 : null;
    const imaIdx = imaRaw !== null && avgIma && avgIma > 0 ? (imaRaw / avgIma) * 100 : null;
    const jmpIdx = jmpRaw !== null && avgJmp && avgJmp > 0 ? (jmpRaw / avgJmp) * 100 : null;

    // Weighted mean over the components that actually have a baseline; renormalise.
    const parts: Array<[number, number]> = [];
    if (plIdx !== null) parts.push([plIdx, PROVISIONAL_WEIGHTS.playerLoad]);
    if (imaIdx !== null) parts.push([imaIdx, PROVISIONAL_WEIGHTS.highIntensityIma]);
    if (jmpIdx !== null) parts.push([jmpIdx, PROVISIONAL_WEIGHTS.jumps]);

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
      },
    };
  }

  const history = sorted.map(scoreSession);
  const latest = history.length ? history[history.length - 1] : null;

  // Honest confidence: needs a mature baseline AND at least the IMA signal present.
  // Missing IMA (the sport's defining mechanical signal) or a thin baseline caps it low.
  let confidence: Confidence = "low";
  if (dataCoverage.sessions >= MIN_MATURE_SESSIONS && dataCoverage.hasIma) {
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
