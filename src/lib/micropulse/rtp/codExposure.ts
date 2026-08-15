/**
 * Change-of-direction LOAD EXPOSURE — an RTP worst-case gate. Pure, side-effect free.
 *
 * The RTP battery (VALD ForceDecks) tells you a player's LIMBS are symmetric and strong —
 * but not whether he has actually been RE-EXPOSED to the multidirectional load a match will
 * demand. A player can pass every jump test and still be under-prepared if his recent
 * training never rebuilt his cutting and deceleration volume. This is the "final gate" the
 * hamstring protocol references: a game-simulation session on his individual worst-case
 * demands before full return.
 *
 * True arc/curved-sprint detection needs raw position streams we don't ingest, so this uses
 * the IMA proxy MicroPulse is native to: high-intensity change-of-direction efforts +
 * deceleration efforts per minute. We compare his RECENT peak COD/decel session to his own
 * established match-level demand (the robust season worst-case), and ask: has a recent
 * session reached the multidirectional load a match will demand?
 *
 *   exposureRatio = recent peak COD/decel-per-min  ÷  his season worst-case COD/decel-per-min
 *     ≥ 0.90  → sufficient  (re-exposed to near his match demand)
 *     0.60–0.90 → building  (approaching, not yet at match demand)
 *     < 0.60  → insufficient (recent COD load well below his match demand — not yet exposed)
 *
 * HONEST PROVENANCE:
 *   - IMA COD is a PROXY for multidirectional load, not true per-cut-angle vectors (those
 *     need raw velocity/position streams — out of scope; that's Hudl/ADI land).
 *   - Read on the player's OWN demand, never cross-athlete. Baseline = p90 over real sessions.
 *   - This is a DESCRIPTIVE exposure check that INFORMS the clearance checklist. It never
 *     auto-clears, never sets the readiness colour, and never changes the daily decision —
 *     rules compute, the coach/medical team decides.
 *
 * Cite: Buchheit 2014 (IMA) · McBurnie 2022 (deceleration cost) · Delaney 2017 (worst-case /
 *       peak locomotor demands).
 */

export type Bi = { en: string; is: string };

/** Where recent multidirectional exposure sits vs his own match demand. */
export type CodExposureStatus = "sufficient" | "building" | "insufficient" | "no_data";

/** One session's COD-exposure inputs (session-summary columns). */
export interface CodExposureRow {
  date: string;
  /** High-intensity change-of-direction count = ima_cod_left_high + ima_cod_right_high. */
  imaCodHigh: number | null;
  /** gen2 deceleration efforts (decel_b2_3_tot_effs_gen2). */
  decelEfforts: number | null;
  /** Session duration in minutes (session_duration_minutes). */
  durationMin: number | null;
  /** PlayerLoad (total_player_load) — DERIVES minutes when durationMin is empty (÷ loadPerMin). */
  playerLoad?: number | null;
  /** PlayerLoad per minute (player_load_per_minute) — the other half of the duration fallback. */
  loadPerMin?: number | null;
}

export interface CodExposureRead {
  /** Highest COD/decel-per-min session in the recent window. */
  recentPeakPerMin: number | null;
  /** His match-level COD/decel demand = p90 per-min over real season sessions. */
  baselinePerMin: number | null;
  /** recentPeak ÷ baseline (1.0 = a recent session matched his usual match demand). */
  exposureRatio: number | null;
  status: CodExposureStatus;
  recentSessions: number;
  baselineSessions: number;
  recentDays: number;
  citation: string;
  caveat: Bi;
}

/** Recent peak ≥ this fraction of his match demand → sufficiently re-exposed. */
export const COD_EXPOSURE_SUFFICIENT = 0.9;
/** Recent peak ≥ this (but below sufficient) → building toward match demand. */
export const COD_EXPOSURE_BUILDING = 0.6;
/** A session shorter than this (minutes) is a warmup/rehab block, not a COD-exposure session. */
export const MIN_COD_SESSION_MIN = 20;
/** Baselines below this many real sessions are too thin to define a match demand. */
export const MIN_BASELINE_SESSIONS = 4;
/** Default recent window (days) in which we look for a re-exposure session. */
export const DEFAULT_RECENT_DAYS = 14;

const CITATION = "Buchheit 2014 (IMA) · McBurnie 2022 (deceleration) · Delaney 2017 (worst-case demands)";

const CAVEAT: Bi = {
  en: "Change-of-direction load exposure is an IMA proxy (high-intensity COD + deceleration efforts per minute), not true per-cut-angle vectors — those need raw position streams we don't ingest. It reads his recent peak COD/decel session against his own season worst-case, so it answers 'has he been re-loaded with enough cutting/braking to meet a match?' — never a cross-athlete ranking. Descriptive: it informs the clearance checklist, never auto-clears and never touches the readiness verdict.",
  is: "Stefnubreytinga-álags útsetning er IMA-nálgun (hákröftug COD + hemlunar-átök á mínútu), ekki raunverulegir per-horn vektorar — þeir þurfa hráa staðsetningarstrauma sem við sækjum ekki. Hún ber saman nýlega hámarks COD/decel lotu við hans eigin versta-tilfelli tímabilsins, svo hún svarar 'hefur hann verið endur-hlaðinn með nógu miklu skurð-/hemlunar-álagi til að mæta leik?' — aldrei röðun milli leikmanna. Lýsandi: hún upplýsir clearance-gátlistann, aldrei sjálfvirk clearance og snertir aldrei readiness-dóminn.",
};

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Session minutes — stored, else DERIVED from PlayerLoad ÷ PlayerLoad-per-minute. */
function effectiveDurationMin(row: CodExposureRow): number | null {
  const d = num(row.durationMin);
  if (d !== null && d > 0) return d;
  const pl = num(row.playerLoad);
  const pm = num(row.loadPerMin);
  return pl !== null && pm !== null && pm > 0 ? pl / pm : null;
}

/** COD + deceleration efforts per minute for one session. Null without a count or duration. */
export function codLoadPerMin(row: CodExposureRow): number | null {
  const dur = effectiveDurationMin(row);
  if (dur === null || dur < MIN_COD_SESSION_MIN) return null;
  const parts = [num(row.imaCodHigh), num(row.decelEfforts)].filter((v): v is number => v !== null);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / dur;
}

/** Linear-interpolated percentile of a numeric list (0..1). Null if empty. */
function percentile(xs: number[], q: number): number | null {
  const vals = xs.filter((v) => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
  if (!vals.length) return null;
  if (vals.length === 1) return vals[0];
  const pos = q * (vals.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (pos - lo);
}

function statusFor(ratio: number | null): CodExposureStatus {
  if (ratio === null) return "no_data";
  if (ratio >= COD_EXPOSURE_SUFFICIENT) return "sufficient";
  if (ratio >= COD_EXPOSURE_BUILDING) return "building";
  return "insufficient";
}

/**
 * Compute the COD-exposure read for ONE player from recent daily rows. Pure: no I/O. Feed a
 * season-length window (e.g. 180 days); the baseline (match demand) is the p90 over all real
 * sessions, and the recent peak is the max over the last `recentDays`. `today` is the anchor
 * for the recent window (pass it — Date.now() is avoided so the engine stays deterministic).
 */
export function computeCodExposure(
  rows: CodExposureRow[],
  opts: { today: string; recentDays?: number },
): CodExposureRead {
  const recentDays = opts.recentDays ?? DEFAULT_RECENT_DAYS;
  const clean = (rows ?? []).filter((r) => r && typeof r.date === "string");
  const recentStart = new Date(Date.parse(opts.today + "T00:00:00Z") - (recentDays - 1) * 86_400_000)
    .toISOString().slice(0, 10);

  const perMin = clean.map((r) => ({ date: r.date, v: codLoadPerMin(r) }));
  const allVals = perMin.map((p) => p.v).filter((v): v is number => v !== null);
  const recentVals = perMin.filter((p) => p.date >= recentStart).map((p) => p.v).filter((v): v is number => v !== null);

  const baseline = allVals.length >= MIN_BASELINE_SESSIONS ? percentile(allVals, 0.9) : null;
  const recentPeak = recentVals.length ? Math.max(...recentVals) : null;
  const ratio = baseline && baseline > 0 && recentPeak !== null ? recentPeak / baseline : null;

  return {
    recentPeakPerMin: recentPeak === null ? null : r1(recentPeak),
    baselinePerMin: baseline === null ? null : r1(baseline),
    exposureRatio: ratio === null ? null : r2(ratio),
    status: statusFor(ratio),
    recentSessions: recentVals.length,
    baselineSessions: allVals.length,
    recentDays,
    citation: CITATION,
    caveat: CAVEAT,
  };
}
