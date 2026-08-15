/**
 * Peak-intensity read — pure, side-effect free.
 *
 * The "peak demands" of a session are its most intense stretch — the worst window a
 * player had to survive. A TRUE peak period (rolling 1/3/5-min PlayerLoad, HSR,
 * metabolic power) needs a per-epoch time series, which the daily summary table does
 * NOT hold (see peakPeriod.ts, Phase 2). Until that export lands, this engine uses the
 * densest session-summary proxies we DO have as a peak-intensity FINGERPRINT:
 *
 *   - PlayerLoad per minute        (player_load_per_minute)   — overall mechanical rate
 *   - Peak metabolic power         (metabolic_power_peak)     — top instantaneous energy cost
 *   - High-speed-running rate      (band6 distance ÷ minutes) — top-end running density
 *   - High-intensity efforts/min   ((accel+decel gen2)/min)   — cut/brake density
 *
 * Each proxy is read on the player's own norm (100 = his average session) AND, at the
 * call site, against the squad — so "how intense was this vs his usual and vs his peers".
 * worstCaseSession() returns the single session with the highest overall fingerprint —
 * the practical "individual worst-case GPS demands" the hamstring RTP protocol references
 * as its final return-to-play gate.
 *
 * HONEST PROVENANCE:
 *   - These are SESSION-SUMMARY proxies for peak intensity, NOT a true rolling peak. The
 *     read is labelled as a proxy everywhere; the real power curve arrives in Phase 2.
 *   - Every proxy is null when its source column is absent (never 0), and the composite
 *     fingerprint averages only the proxies that are present.
 *   - Descriptive context. NEVER feeds the readiness colour, load target, or daily decision.
 *
 * Cite: Buchheit 2014 (IMA) · di Prampero 2015 (metabolic power) · the peak-demands /
 *       worst-case-scenario framing (Delaney 2017, "peak locomotor demands").
 */

/** A plain-language string in both UI languages. */
export type Bi = { en: string; is: string };
export type Confidence = "low" | "medium" | "high";

/** Where this session's peak intensity sits vs the player's own norm. */
export type PeakLevel = "below" | "typical" | "elevated" | "peak" | "insufficient";

/** One session's peak-intensity inputs (session-summary columns). */
export interface PeakRow {
  date: string;
  /** PlayerLoad per minute (player_load_per_minute). */
  loadPerMin: number | null;
  /** Peak metabolic power reached, W/kg (metabolic_power_peak). */
  metabolicPeak: number | null;
  /** High-speed-running distance, band6 (velocity_band6_total_distance), metres. */
  hsrBand6: number | null;
  /** gen2 accel efforts (accel_b2_3_tot_effs_gen2). */
  accelEfforts: number | null;
  /** gen2 decel efforts (decel_b2_3_tot_effs_gen2). */
  decelEfforts: number | null;
  /** Session duration in minutes (session_duration_minutes). Gates the per-minute proxies. */
  durationMin: number | null;
}

/** The four peak-intensity proxies for one session (raw + personal-norm index). */
export interface PeakProxies {
  loadPerMin: number | null;
  metabolicPeak: number | null;
  hsrRate: number | null; // band6 metres per minute
  effortsPerMin: number | null; // (accel+decel gen2) per minute
}

export interface PeakSession {
  date: string;
  proxies: PeakProxies;
  /** Each proxy vs the player's own baseline (100 = average), same key order. */
  indices: PeakProxies;
  /** Composite peak-intensity fingerprint = mean of the available proxy indices (100 = average). */
  fingerprint: number | null;
  level: PeakLevel;
  verdict: Bi;
}

export interface PeakRead {
  latest: PeakSession | null;
  history: PeakSession[];
  /** The single most intense session by composite fingerprint — the worst-case demands. */
  worstCase: PeakSession | null;
  confidence: Confidence;
  dataCoverage: { proxies: number; sessions: number };
  citation: string;
  caveat: Bi;
}

/** Fingerprint index at/above which a session is the player's PEAK-intensity territory. */
export const PEAK_LEVEL_BAND = 25;
/** Fingerprint well above the band → a genuine outlier "peak" rather than merely elevated. */
export const PEAK_OUTLIER_BAND = 50;
/** Baselines below this many sessions are immature → confidence capped low. */
export const MIN_MATURE_PEAK_SESSIONS = 4;

const CITATION =
  "Buchheit 2014 (IMA) · di Prampero 2015 (metabolic power) · Delaney 2017 (peak locomotor demands)";

const CAVEAT: Bi = {
  en: "This is a peak-intensity FINGERPRINT from session-summary proxies (PlayerLoad/min, peak metabolic power, high-speed-running rate, high-intensity efforts/min) — not a true rolling peak period. A real peak-period power curve (worst 1/3/5-minute window) needs the per-interval Catapult export, which the daily table doesn't hold. Every proxy is read on the player's own norm; missing proxies are shown as no-data, not zero. Descriptive load context — it never changes the readiness verdict or the daily plan.",
  is: "Þetta er hámarks-ákefðar FINGRAFAR úr lotu-samantektar nálgunum (PlayerLoad/mín, hámarks efnaskiptaafl, háhraða-hlaupshraði, hákröftug átök/mín) — ekki raunverulegt rúllandi hámarkstímabil. Raunveruleg hámarkstímabils afl-kúrfa (versti 1/3/5-mínútu gluggi) þarf per-bils útflutning frá Catapult sem daglega taflan geymir ekki. Sérhver nálgun er lesin á persónulegri viðmiðun leikmannsins; nálganir sem vantar eru sýndar sem engin gögn, ekki núll. Lýsandi álags-samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The four peak-intensity proxies for one session (raw values). */
export function proxiesFor(row: PeakRow): PeakProxies {
  const dur = num(row.durationMin);
  const perMin = (v: number | null): number | null =>
    v !== null && dur !== null && dur > 0 ? v / dur : null;
  const accel = num(row.accelEfforts);
  const decel = num(row.decelEfforts);
  const efforts = accel === null && decel === null ? null : (accel ?? 0) + (decel ?? 0);
  return {
    loadPerMin: num(row.loadPerMin),
    metabolicPeak: num(row.metabolicPeak),
    hsrRate: perMin(num(row.hsrBand6)),
    effortsPerMin: perMin(efforts),
  };
}

const PROXY_KEYS: Array<keyof PeakProxies> = ["loadPerMin", "metabolicPeak", "hsrRate", "effortsPerMin"];

function verdictFor(level: PeakLevel): Bi {
  switch (level) {
    case "peak":
      return {
        en: "One of his most intense sessions — the peak physical demands he's faced in this window.",
        is: "Ein af hans ákafustu lotum — hámarks líkamlega krafan sem hann hefur mætt á þessu tímabili.",
      };
    case "elevated":
      return {
        en: "An intense session for him — above his usual peak-intensity fingerprint.",
        is: "Ákafari lota fyrir hann — yfir venjulegu hámarks-ákefðar fingrafari hans.",
      };
    case "below":
      return {
        en: "A low-intensity session for him — below his usual peak demands.",
        is: "Lág-ákefðar lota fyrir hann — undir venjulegri hámarkskröfu hans.",
      };
    case "typical":
      return {
        en: "Typical peak intensity for him — in line with his usual.",
        is: "Dæmigerð hámarks-ákefð fyrir hann — í takt við venjulegt.",
      };
    default:
      return {
        en: "Not enough sessions yet to place this against his usual peak intensity.",
        is: "Ekki nægar lotur enn til að staðsetja þetta gegn venjulegri hámarks-ákefð hans.",
      };
  }
}

/**
 * Compute the peak-intensity read for ONE player from their recent daily rows. Pure: no
 * I/O. Feed a ~28-day (or season) window; the personal baseline is the mean over every
 * row given. Latest = last chronological session; worstCase = highest composite fingerprint.
 */
export function computePeakIntensity(rows: PeakRow[]): PeakRead {
  const sorted = [...(rows ?? [])]
    .filter((r) => r && typeof r.date === "string")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const rawProxies = sorted.map(proxiesFor);

  // Personal-norm baseline per proxy (mean over available values).
  const avg: PeakProxies = {
    loadPerMin: mean(rawProxies.map((p) => p.loadPerMin).filter((v): v is number => v !== null)),
    metabolicPeak: mean(rawProxies.map((p) => p.metabolicPeak).filter((v): v is number => v !== null)),
    hsrRate: mean(rawProxies.map((p) => p.hsrRate).filter((v): v is number => v !== null)),
    effortsPerMin: mean(rawProxies.map((p) => p.effortsPerMin).filter((v): v is number => v !== null)),
  };

  const proxiesPresent = PROXY_KEYS.filter((k) => avg[k] !== null).length;

  const history: PeakSession[] = sorted.map((row, i) => {
    const proxies = rawProxies[i];
    const indices: PeakProxies = {
      loadPerMin: null,
      metabolicPeak: null,
      hsrRate: null,
      effortsPerMin: null,
    };
    const idxVals: number[] = [];
    for (const k of PROXY_KEYS) {
      const v = proxies[k];
      const a = avg[k];
      if (v !== null && a !== null && a > 0) {
        const idx = (v / a) * 100;
        indices[k] = r1(idx);
        idxVals.push(idx);
      }
    }
    const fingerprint = idxVals.length ? r1(mean(idxVals)!) : null;

    let level: PeakLevel = "insufficient";
    if (fingerprint !== null && sorted.length >= MIN_MATURE_PEAK_SESSIONS) {
      if (fingerprint >= 100 + PEAK_OUTLIER_BAND) level = "peak";
      else if (fingerprint >= 100 + PEAK_LEVEL_BAND) level = "elevated";
      else if (fingerprint <= 100 - PEAK_LEVEL_BAND) level = "below";
      else level = "typical";
    }

    return { date: row.date, proxies, indices, fingerprint, level, verdict: verdictFor(level) };
  });

  const latest = history.length ? history[history.length - 1] : null;
  const worstCase = history
    .filter((s) => s.fingerprint !== null)
    .reduce<PeakSession | null>((best, s) => (best === null || s.fingerprint! > best.fingerprint! ? s : best), null);

  let confidence: Confidence = "low";
  if (sorted.length >= MIN_MATURE_PEAK_SESSIONS && proxiesPresent >= 2) {
    confidence = sorted.length >= MIN_MATURE_PEAK_SESSIONS * 2 && proxiesPresent >= 3 ? "high" : "medium";
  }

  return {
    latest,
    history,
    worstCase,
    confidence,
    dataCoverage: { proxies: proxiesPresent, sessions: sorted.length },
    citation: CITATION,
    caveat: CAVEAT,
  };
}

/** Convenience: the single most demanding session (worst-case peak demands) or null. */
export function worstCaseSession(rows: PeakRow[]): PeakSession | null {
  return computePeakIntensity(rows).worstCase;
}
