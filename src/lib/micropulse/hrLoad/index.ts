/**
 * HR internal-load read — pure, side-effect free.
 *
 * The app's internal load is Foster sRPE (RPE × minutes) — a SUBJECTIVE signal.
 * Now that Catapult HR belts flow (avg HR, 8 time-in-zone bands, %HRmax), we can
 * add an OBJECTIVE internal-load estimate and use it as a CROSS-CHECK on sRPE, not
 * as a replacement. The insight is divergence: a session the player rated easy that
 * the heart says was hard (hidden load), or a high RPE the heart didn't echo (low
 * cardiac demand, e.g. strength — or over-reporting).
 *
 * HR load = Edwards' summated-heart-rate-zone method (Edwards 1993): Σ (minutes in
 * band i × weight i). Edwards uses 5 zones weighted 1–5; Catapult sends EIGHT bands,
 * so we adapt the weights to the band ORDINAL (1..8). This is intent-adapted, not a
 * literal reproduction — the exact %HRmax boundaries of Catapult's bands aren't
 * confirmed, so the absolute AU is NOT comparable to sRPE AU or to Edwards-5-zone AU.
 * Everything is therefore read on the player's OWN baseline (personal norm), which is
 * the only defensible comparison and matches the rest of the system.
 *
 * HONEST PROVENANCE:
 *   - Weights = band ordinal, PROVISIONAL (not calibrated %HRmax cuts).
 *   - %HRmax needs each athlete's HRmax set in OpenField; absent → null, not 0.
 *   - Belt coverage is partial (only players who wore the belt on skin have HR); the
 *     per-player read is null when HR is absent, and the squad coverage ("N of M
 *     wore the belt") is surfaced at the call site, never hidden as a blank.
 *   - Cross-method absolute comparison is deliberately NOT done — only personal-norm
 *     indices are compared, so the incomparable AU scales never mislead.
 *
 * Deliberately NOT modelled here: HRex / submaximal-HR fitness trend (Buchheit —
 * "Maximizing the submaximal"), which needs a standardised repeated submaximal effort
 * the club doesn't run yet. Noted so it isn't confused with this load cross-check.
 *
 * Cite: Edwards 1993 (summated-HR-zone TRIMP, adapted) · Buchheit 2024 (HR monitoring).
 */

/** A plain-language string in both UI languages. */
export type Bi = { en: string; is: string };
export type Confidence = "low" | "medium" | "high";

/**
 * How the objective HR load compares to the subjective sRPE for the latest session.
 *  - aligned            — heart and RPE agree (within the personal-norm noise band)
 *  - hidden_load        — HR much higher than RPE said → possible under-reported load
 *  - low_cardio_response— RPE much higher than HR → low cardiac demand or over-report
 *  - insufficient       — no HR, no sRPE, or baseline too thin to compare
 */
export type LoadAlignment = "aligned" | "hidden_load" | "low_cardio_response" | "insufficient";

/** One day's cross-check inputs for a player. */
export interface HrLoadRow {
  date: string;
  /** Foster sRPE session load (RPE × min) — session_rpe_entries.session_load. Null if unlogged. */
  srpeLoad: number | null;
  /** Time-in-zone durations in SECONDS, band 1..8 (heart_rate_bandN_total_duration). Missing → null. */
  hrZonesSec: Array<number | null>;
  /** %HRmax for the session — present only when athlete_max_hr is set. Gates confidence. */
  pctMaxHr: number | null;
}

export interface HrLoadSession {
  date: string;
  /** Edwards-adapted summated-HR-zone load in AU (personal-norm use only). Null if no zone data. */
  hrLoad: number | null;
  /** HR load vs the player's own baseline (100 = average session). */
  hrLoadIndex: number | null;
  srpeLoad: number | null;
  /** sRPE vs the player's own baseline (100 = average). */
  srpeIndex: number | null;
  alignment: LoadAlignment;
  /** Signed personal-norm gap = hrLoadIndex − srpeIndex (positive = heart harder than RPE said). */
  gap: number | null;
  verdict: Bi;
}

export interface HrLoadRead {
  latest: HrLoadSession | null;
  history: HrLoadSession[];
  baseline: { avgHrLoad: number | null; avgSrpeLoad: number | null; hrSessions: number; srpeSessions: number };
  confidence: Confidence;
  dataCoverage: { hasHr: boolean; hasSrpe: boolean; hasPctMax: boolean; sessions: number };
  citation: string;
  caveat: Bi;
}

/** Edwards weight per band = the band ordinal (1..8). Provisional; see file header. */
export function bandWeight(bandIndex1Based: number): number {
  return bandIndex1Based;
}

/** Where an athlete's HRmax came from — provenance for the %HRmax it produces. */
export type HrMaxSource = "set" | "observed" | "estimated" | "none";

export const HRMAX_CITATION =
  "Tanaka 2001 (HRmax = 208 − 0.7·age) · Gulati 2010 (women, 206 − 0.88·age)";

/**
 * Age-predicted HRmax — a labelled FALLBACK, never a measured value.
 *  - Tanaka 2001 (208 − 0.7·age) is the modern default: more accurate than the old
 *    Fox 220−age, which overestimates the young and underestimates the old.
 *  - Gulati 2010 (206 − 0.88·age) fits women better (validated in a large female cohort).
 * Both are population estimates (SEE ≈ 7–11 bpm), so an observed belt peak — when a
 * genuine maximal effort was captured — should be preferred over this. Returns null
 * for an implausible/absent age rather than fabricating a number.
 */
export function estimateHrMax(age: number | null | undefined, sex?: "M" | "F" | null): number | null {
  if (age == null || !Number.isFinite(age) || age < 10 || age > 80) return null;
  const bpm = sex === "F" ? 206 - 0.88 * age : 208 - 0.7 * age;
  return Math.round(bpm);
}

/** One HR band in the time-in-zone distribution (for display, not scoring). */
export interface HrBand {
  band: number;          // 1..8, higher = higher intensity
  timeS: number | null;  // seconds in this band
  pct: number | null;    // % of the session's HR time in this band
  avgBpm: number | null; // average bpm in this band (the honest label)
}

/**
 * Build the time-in-band distribution for one session: per band, the seconds, the
 * share of the session's total HR time, and the band's average bpm (the label). The
 * bands are ordinal (1 = lowest intensity … 8 = highest); % is of the summed HR
 * time so a session with no HR returns all-null pct, never fabricated. Pure.
 */
export function hrZoneDistribution(
  zonesSec: Array<number | null>,
  avgBpm: Array<number | null> = [],
): HrBand[] {
  const times = Array.from({ length: 8 }, (_, i) => {
    const v = zonesSec[i];
    return typeof v === "number" && isFinite(v) ? v : null;
  });
  const total = times.reduce<number>((a, t) => a + (t ?? 0), 0);
  return times.map((timeS, i) => {
    const bpm = avgBpm[i];
    return {
      band: i + 1,
      timeS,
      pct: timeS !== null && total > 0 ? r1((timeS / total) * 100) : null,
      avgBpm: typeof bpm === "number" && isFinite(bpm) ? Math.round(bpm) : null,
    };
  });
}

// ── Match-intensity anchor (Bangsbo SSE #125) ────────────────────────────────
// Turns the ordinal band distribution into a plain match-relative read, but ONLY
// for a player whose HRmax is calibrated (coach-set or belt-observed) — an age
// estimate isn't precise enough for a %HRmax verdict, so we fall back to the
// ordinal bands (return null). Reference values (Bangsbo 2014): average match HR
// ≈ 85% HRmax, peak ≈ 98%; a match is rarely below 65% HRmax, so lots of time
// under 65% = a genuinely low-intensity day.
export const MATCH_INTENSITY_ANCHORS = { matchPct: 85, lowPct: 65, ceilingPct: 98, lowDaySharePct: 40 } as const;
export const BANGSBO_CITATION = "Bangsbo 2014 (GSSI SSE #125 — match HR reference values)";

export type MatchIntensityTier = "match" | "moderate" | "low";

export interface MatchIntensityRead {
  meanPctHrMax: number;              // mean session %HRmax
  peakPctHrMax: number | null;       // peak %HRmax (session max_hr / HRmax)
  lowIntensityPct: number | null;    // % of HR time in bands whose measured avg bpm < 65% HRmax
  atMatchIntensity: boolean;         // mean ≥ 85%
  hitCeiling: boolean;               // peak ≥ 98%
  tier: MatchIntensityTier;
  verdict: Bi;
  citation: string;
}

/**
 * Bangsbo match-intensity anchor for one session. Returns null when HRmax is not
 * calibrated (source not "set"/"observed") or the mean %HRmax is unknown — the
 * caller keeps the ordinal-band distribution as the honest fallback. Pure.
 */
export function matchIntensityAnchor(input: {
  bands: HrBand[];
  effectiveHrMax: number | null;
  hrMaxSource: HrMaxSource;
  meanPctHrMax: number | null;
  peakPctHrMax: number | null;
}): MatchIntensityRead | null {
  const { bands, effectiveHrMax, hrMaxSource, meanPctHrMax, peakPctHrMax } = input;
  const calibrated = hrMaxSource === "set" || hrMaxSource === "observed";
  if (!calibrated || !effectiveHrMax || effectiveHrMax <= 0 || meanPctHrMax == null) return null;

  // Low-intensity time = share of the session's HR time in bands whose MEASURED
  // average bpm sits below 65% of this player's HRmax (uses the real per-band bpm,
  // not the ordinal weight — the band label is measured, the ordinal is not).
  const lowThresholdBpm = effectiveHrMax * (MATCH_INTENSITY_ANCHORS.lowPct / 100);
  let lowTime = 0, totalTime = 0, anyBpm = false;
  for (const b of bands) {
    if (b.timeS == null) continue;
    totalTime += b.timeS;
    if (b.avgBpm != null) { anyBpm = true; if (b.avgBpm < lowThresholdBpm) lowTime += b.timeS; }
  }
  const lowIntensityPct = anyBpm && totalTime > 0 ? r1((lowTime / totalTime) * 100) : null;

  const atMatchIntensity = meanPctHrMax >= MATCH_INTENSITY_ANCHORS.matchPct;
  const hitCeiling = peakPctHrMax != null && peakPctHrMax >= MATCH_INTENSITY_ANCHORS.ceilingPct;
  const isLowDay = lowIntensityPct != null && lowIntensityPct >= MATCH_INTENSITY_ANCHORS.lowDaySharePct;
  const tier: MatchIntensityTier = atMatchIntensity ? "match" : isLowDay ? "low" : "moderate";
  const mean = Math.round(meanPctHrMax);
  const low = lowIntensityPct != null ? Math.round(lowIntensityPct) : null;

  const verdict: Bi =
    tier === "match"
      ? {
          en: `Reached match intensity — mean ${mean}% HRmax${hitCeiling ? ", peaks near the ceiling (≥98%)" : ""}.`,
          is: `Náði leikákefð — meðal ${mean}% HRmax${hitCeiling ? ", toppar við þak (≥98%)" : ""}.`,
        }
      : tier === "low"
      ? {
          en: `Low-intensity day — ${low}% of the session sat below 65% HRmax (mean ${mean}%).`,
          is: `Lág-ákefðar dagur — ${low}% lotunnar var undir 65% HRmax (meðal ${mean}%).`,
        }
      : {
          en: `Mean ${mean}% HRmax — below the ~85% match average.`,
          is: `Meðal ${mean}% HRmax — undir ~85% leikmeðaltali.`,
        };

  return { meanPctHrMax: r1(meanPctHrMax), peakPctHrMax: peakPctHrMax == null ? null : r1(peakPctHrMax), lowIntensityPct, atMatchIntensity, hitCeiling, tier, verdict, citation: BANGSBO_CITATION };
}

/**
 * Personal-norm gap (in index points) beyond which HR and sRPE are treated as
 * genuinely diverging rather than noise. A quarter of the player's own average —
 * provisional, tuned to avoid flagging ordinary session-to-session wobble.
 */
export const DIVERGENCE_GAP = 25;

/** HR baselines below this many belt sessions are immature → confidence capped low. */
export const MIN_MATURE_HR_SESSIONS = 4;

const CITATION = "Edwards 1993 (summated-HR-zone TRIMP, adapted) · Buchheit 2024 (HR monitoring)";

const CAVEAT: Bi = {
  en: "HR load is Edwards' summated-heart-rate-zone method (1993) adapted to Catapult's 8 bands (weights = band order, not calibrated %HRmax cuts), so it's read only on the player's own norm — never as an absolute AU comparable to sRPE. %HRmax needs each athlete's HRmax set in OpenField. Only players who wore the belt on skin have HR; the rest are shown as no-data, not zero.",
  is: "HR-álag er summated-heart-rate-zone aðferð Edwards (1993) aðlöguð að 8 böndum Catapult (þyngd = band-röð, ekki kvörðuð %HRmax-mörk), svo það er einungis lesið á persónulegri viðmiðun leikmannsins — aldrei sem alger AU sambærileg við sRPE. %HRmax þarf HRmax hvers leikmanns í OpenField. Aðeins leikmenn sem báru beltið á húð hafa HR; hinir sýndir sem engin gögn, ekki núll.",
};

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Edwards-adapted HR load (AU) for one session from its 8 band durations (seconds). */
export function summatedHrZoneLoad(hrZonesSec: Array<number | null>): number | null {
  let total = 0;
  let any = false;
  for (let i = 0; i < hrZonesSec.length && i < 8; i++) {
    const sec = num(hrZonesSec[i]);
    if (sec === null) continue;
    any = true;
    total += (sec / 60) * bandWeight(i + 1); // minutes × band ordinal
  }
  return any ? total : null;
}

function verdictFor(alignment: LoadAlignment): Bi {
  switch (alignment) {
    case "aligned":
      return {
        en: "HR load matches how hard the session felt (sRPE).",
        is: "HR-álag samræmist því hve erfið lotan var (sRPE).",
      };
    case "hidden_load":
      return {
        en: "The heart says this was harder than the RPE suggested — possible hidden load.",
        is: "Hjartað segir að þetta hafi verið erfiðara en RPE gaf til kynna — hugsanlegt falið álag.",
      };
    case "low_cardio_response":
      return {
        en: "RPE was high but HR stayed low — low cardiac demand (e.g. strength) or over-reported.",
        is: "RPE var hátt en HR hélst lágt — lítið hjarta-drif (t.d. styrktaræfing) eða ofmetið.",
      };
    default:
      return {
        en: "Not enough matched HR + sRPE yet to cross-check this session.",
        is: "Ekki næg pöruð HR + sRPE enn til að kross-tékka þessa lotu.",
      };
  }
}

/**
 * Compute the HR-vs-sRPE internal-load cross-check for ONE player from their recent
 * daily rows. Pure: no I/O. Feed the ~28-day window; the personal baseline is derived
 * from every row given. The last chronological row is "latest".
 */
export function computeHrLoad(rows: HrLoadRow[]): HrLoadRead {
  const sorted = [...(rows ?? [])]
    .filter((r) => r && typeof r.date === "string")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Per-session raw HR load + carry sRPE.
  const rawHr = sorted.map((r) => summatedHrZoneLoad(r.hrZonesSec ?? []));
  const rawSrpe = sorted.map((r) => num(r.srpeLoad));

  const hrVals = rawHr.filter((v): v is number => v !== null);
  const srpeVals = rawSrpe.filter((v): v is number => v !== null);
  const avgHr = mean(hrVals);
  const avgSrpe = mean(srpeVals);

  const dataCoverage = {
    hasHr: hrVals.length > 0,
    hasSrpe: srpeVals.length > 0,
    hasPctMax: sorted.some((r) => num(r.pctMaxHr) !== null),
    sessions: sorted.length,
  };

  const history: HrLoadSession[] = sorted.map((row, i) => {
    const hrLoad = rawHr[i];
    const srpeLoad = rawSrpe[i];
    const hrLoadIndex = hrLoad !== null && avgHr && avgHr > 0 ? (hrLoad / avgHr) * 100 : null;
    const srpeIndex = srpeLoad !== null && avgSrpe && avgSrpe > 0 ? (srpeLoad / avgSrpe) * 100 : null;

    let alignment: LoadAlignment = "insufficient";
    let gap: number | null = null;
    // Both indices need a mature HR baseline before the gap means anything.
    if (hrLoadIndex !== null && srpeIndex !== null && hrVals.length >= MIN_MATURE_HR_SESSIONS) {
      gap = r1(hrLoadIndex - srpeIndex);
      if (gap >= DIVERGENCE_GAP) alignment = "hidden_load";
      else if (gap <= -DIVERGENCE_GAP) alignment = "low_cardio_response";
      else alignment = "aligned";
    }

    return {
      date: row.date,
      hrLoad: hrLoad === null ? null : r1(hrLoad),
      hrLoadIndex: hrLoadIndex === null ? null : r1(hrLoadIndex),
      srpeLoad,
      srpeIndex: srpeIndex === null ? null : r1(srpeIndex),
      alignment,
      gap,
      verdict: verdictFor(alignment),
    };
  });

  const latest = history.length ? history[history.length - 1] : null;

  // Honest confidence: needs a mature HR baseline AND HRmax set (%HRmax present).
  let confidence: Confidence = "low";
  if (hrVals.length >= MIN_MATURE_HR_SESSIONS && dataCoverage.hasPctMax) {
    confidence = hrVals.length >= MIN_MATURE_HR_SESSIONS * 2 ? "high" : "medium";
  }

  return {
    latest,
    history,
    baseline: {
      avgHrLoad: avgHr === null ? null : r1(avgHr),
      avgSrpeLoad: avgSrpe === null ? null : r1(avgSrpe),
      hrSessions: hrVals.length,
      srpeSessions: srpeVals.length,
    },
    confidence,
    dataCoverage,
    citation: CITATION,
    caveat: CAVEAT,
  };
}
