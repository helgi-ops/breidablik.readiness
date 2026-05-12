/**
 * Sprint Exposure — VOLUME-side companion to Sprint Speed Drop (the
 * QUALITY-side metric).
 *
 * Tracks the count of IMA Free Running strides in bands 5-8 (high-velocity
 * stride bands) and compares the 7-day acute sum against the player's
 * match-day demand baseline.
 *
 * Sport-science rationale:
 *   - Sprint Speed Drop (Edouard 2019) catches when today's MAX velocity
 *     is below personal peak — a fatigue / mechanical compensation signal.
 *   - Sprint Exposure (Malone 2018) catches when the WEEKLY VOLUME of
 *     sprint-pace strides is below what the player typically faces in a
 *     match — an undertraining / detraining signal.
 *
 *   Malone 2018 found players whose weekly sprint exposure dropped below
 *   50% of match demand had ~3× higher hamstring injury risk. The U-shape
 *   means too much is also dangerous (>150% = overload), but undertraining
 *   is the more common failure mode in club football where coaches under-
 *   prescribe sprints to "protect" players.
 *
 *   Bands 5-8 of Catapult IMA Free Running V2 are the top half of the
 *   8-band stride-rate range — they capture high-cadence (and therefore
 *   high-velocity) running strides. We sum them daily and compare the
 *   7-day sum against the average per-match total when the player played
 *   ≥ 60 minutes.
 *
 * Pure deterministic. Companion loader.ts pulls the rows from
 * player_external_load_daily and match_player_minutes.
 *
 * References:
 *   - Malone S et al. Aerobic fitness and player load >25 km/h are
 *     associated with hamstring injury. J Sci Med Sport 2018;21(8):785-790.
 *   - Buchheit M et al. Adding heat to the live-load monitoring debate.
 *     Sport Performance & Science Reports 2019.
 *   - Duhig S et al. Effect of high-speed running on hamstring strain
 *     injury risk. Br J Sports Med 2016;50(24):1536-1540.
 */

export type DailySprintExposure = {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** Sum of stride counts in IMA bands 5-8 (high-velocity bands). null when
   *  no IMA data captured (older Catapult activities before Free Running
   *  was enabled in OpenField). The loader injects GPS-derived estimates
   *  on match days where this is null but GPS sprint efforts > 0 — see
   *  `hiBandStridesEstimated`. */
  hiBandStrides: number | null;
  /** Whether the player played ≥ 60 minutes that day (true match day). */
  isMatchDay: boolean;
  /** Whether the day was on the team's match schedule (week_plans GAME).
   *  Distinguishes "match scheduled but no stride data captured" from
   *  "no match that day". Used for the transparency line in the UI. */
  isScheduledGame?: boolean;
  /** True when hiBandStrides was derived from GPS V5+V6 sprint efforts
   *  using a per-player IMA-to-effort ratio (calibrated from an
   *  IMA-complete match day). Lets the UI distinguish "measured" from
   *  "estimated" match days and lets us tag the baseline confidence. */
  hiBandStridesEstimated?: boolean;
  /** Sum of GPS V5+V6 sprint-effort counts (gen2 algorithm). Kept on the
   *  row so the loader can compute the per-player IMA-to-effort calibration
   *  ratio in one pass without re-querying. */
  v5v6Efforts?: number | null;
};

export type SprintExposureBand =
  | "INSUFFICIENT_DATA"
  | "UNDERLOAD"   // < 50% of match demand — Malone 2018 elevated injury risk
  | "WATCH"       // 50–80% — playable but undertrained
  | "SAFE"        // 80–130% — sweet spot
  | "OVERLOAD";   // > 150% — accumulated spike

export type SprintExposurePayload = {
  /** Sum of bands 5-8 strides over the last 7 days. null when no data. */
  acuteSum7d: number | null;
  /** Average per-match sum of bands 5-8 across the last 28 days of matches. */
  matchDayDemand: number | null;
  /** acuteSum7d ÷ matchDayDemand. null when demand is unknown. */
  exposureRatio: number | null;
  band: SprintExposureBand;
  /** Number of match days with non-null stride data — used for the baseline.
   *  Includes BOTH measured (real IMA) and estimated (GPS-derived) days. */
  matchDaysObserved: number;
  /** Number of match days where IMA bands 5-8 came from real Catapult data
   *  (Free Running enabled). Subset of matchDaysObserved. */
  matchDaysMeasured: number;
  /** Number of match days where the stride count was estimated from GPS V5+V6
   *  sprint efforts using the player's own match-derived ratio. The estimate
   *  uses ONE measured match as calibration anchor (Catapult fixed Free Running
   *  going forward but older activities can't be backfilled). Subset of
   *  matchDaysObserved. matchDaysObserved = matchDaysMeasured + matchDaysEstimated. */
  matchDaysEstimated: number;
  /** Total match days on the team schedule in the 28d window (any source).
   *  Used to surface "5 scheduled, 3 captured" transparency in the UI when
   *  some matches were DNP, manual entries, or had no GPS/IMA data at all. */
  matchDaysScheduled: number;
  /** Number of training/match days with non-null hi-band strides in last 7d. */
  daysObserved7d: number;
};

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;
// MIN_MATCH_DAYS = 1: league teams often have only one match per 28-day
// window for a given player (rotations, injuries, international breaks).
// We surface match-day demand as soon as 1 match is observed and let the
// UI flag confidence ("based on 1 match" caveat) so coaches can weight it.
// Sport-science note: a single match is noisier than a 2-3 match average
// but still beats no baseline — Buchheit 2019 explicitly recommends
// progressive baseline confidence rather than gated thresholds.
const MIN_MATCH_DAYS = 1;
const MIN_TRAINING_DAYS_7D = 2;

// Threshold rationale (revised May 12 after Höskuldur empirical check):
//
// Originally we compared the WEEKLY TOTAL (training + match days) against a
// single-match demand. That double-counts the match itself (it's in both
// numerator and denominator) and forces every active player above 100%.
// In our Breiðablik data, EVERY player was reading 150-220% = "Spike",
// which is implausible — they were just having normal football weeks.
//
// New formulation:
//   - Numerator = TRAINING-ONLY strides across the 7-day window (matches
//     excluded — see computeSprintExposure below).
//   - Denominator = average per-match strides in the 28-day window.
//   - Ratio is now training-load relative to a single match's worth of
//     high-cadence work. A normal football week has 3-4 training days,
//     so a healthy ratio sits in 0.8-1.5× (i.e. training delivers roughly
//     one match's worth across the week, give or take).
//
// Sport-science anchor: Malone 2018 found undertraining (acute ≪ chronic
// HSR exposure) elevates hamstring injury risk ~3×. The exact thresholds
// vary by paper; what matters is that our bands match real-week data so
// the engine flags meaningful deviations, not normal weeks.
const BAND_UNDERLOAD_MAX = 0.5;  // <50% of one match's worth across whole week = undertrained
const BAND_WATCH_MAX = 0.8;       // 50-80% = playable but light
const BAND_SAFE_MAX = 1.8;        // 80-180% = normal football week (was 1.5 — too tight)

export function bandFromRatio(ratio: number | null): SprintExposureBand {
  if (ratio == null || !Number.isFinite(ratio)) return "INSUFFICIENT_DATA";
  if (ratio < BAND_UNDERLOAD_MAX) return "UNDERLOAD";
  if (ratio < BAND_WATCH_MAX) return "WATCH";
  if (ratio <= BAND_SAFE_MAX) return "SAFE";
  return "OVERLOAD";
}

/** Compute the sprint-exposure payload for one player from a window of
 *  daily rows. `rows` should cover at least the last 28 days. `todayIso`
 *  is the anchor date — only rows on or before it are considered.
 *
 *  KEY DESIGN — acute sum is TRAINING-ONLY (match days excluded). Match
 *  days are also in the chronic match-demand denominator, so including
 *  them in acute would double-count the match itself and pin every player
 *  above 100%. The training-only ratio gives a clean "how much sprint
 *  work did the player do across the week, relative to a typical match?"
 *  reading. A healthy in-season football week sits at 80-180%. */
export function computeSprintExposure(
  rows: ReadonlyArray<DailySprintExposure>,
  todayIso: string,
): SprintExposurePayload {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const start7 = new Date(today);
  start7.setUTCDate(start7.getUTCDate() - (ACUTE_DAYS - 1));
  const start7Iso = start7.toISOString().slice(0, 10);
  const start28 = new Date(today);
  start28.setUTCDate(start28.getUTCDate() - (CHRONIC_DAYS - 1));
  const start28Iso = start28.toISOString().slice(0, 10);

  // Acute: TRAINING-only strides across last 7 days (match days excluded
  // because they're in the denominator's average — see header note).
  const acuteRows = rows.filter((r) =>
    r.date >= start7Iso &&
    r.date <= todayIso &&
    !r.isMatchDay &&
    typeof r.hiBandStrides === "number" &&
    Number.isFinite(r.hiBandStrides) &&
    r.hiBandStrides! > 0
  );
  const daysObserved7d = acuteRows.length;
  const acuteSum7d = acuteRows.length > 0
    ? acuteRows.reduce((s, r) => s + (r.hiBandStrides as number), 0)
    : null;

  // Match-day demand: average bands 5-8 sum across matches in 28d window.
  // Includes BOTH IMA-measured days and GPS-estimated days. The loader has
  // already filled hiBandStrides with the per-player IMA-to-effort estimate
  // on days where real IMA was missing (Catapult Free Running disabled at
  // ingest time). Track measured vs estimated separately so the UI can
  // explain how many match days are real vs derived.
  const matchRows = rows.filter((r) =>
    r.date >= start28Iso &&
    r.date <= todayIso &&
    r.isMatchDay &&
    typeof r.hiBandStrides === "number" &&
    Number.isFinite(r.hiBandStrides) &&
    r.hiBandStrides! > 0
  );
  const matchDaysObserved = matchRows.length;
  const matchDaysMeasured = matchRows.filter(
    (r) => r.hiBandStridesEstimated !== true,
  ).length;
  const matchDaysEstimated = matchRows.length - matchDaysMeasured;
  const matchDaysScheduled = rows.filter((r) =>
    r.date >= start28Iso &&
    r.date <= todayIso &&
    (r.isScheduledGame === true || r.isMatchDay)
  ).length;
  const matchDayDemand = matchDaysObserved >= MIN_MATCH_DAYS
    ? matchRows.reduce((s, r) => s + (r.hiBandStrides as number), 0) / matchDaysObserved
    : null;

  if (
    acuteSum7d == null ||
    matchDayDemand == null ||
    daysObserved7d < MIN_TRAINING_DAYS_7D ||
    matchDayDemand <= 0
  ) {
    return {
      acuteSum7d,
      matchDayDemand,
      exposureRatio: null,
      band: "INSUFFICIENT_DATA",
      matchDaysObserved,
      matchDaysMeasured,
      matchDaysEstimated,
      matchDaysScheduled,
      daysObserved7d,
    };
  }

  const exposureRatio = acuteSum7d / matchDayDemand;
  return {
    acuteSum7d,
    matchDayDemand,
    exposureRatio,
    band: bandFromRatio(exposureRatio),
    matchDaysObserved,
    matchDaysMeasured,
    matchDaysEstimated,
    matchDaysScheduled,
    daysObserved7d,
  };
}

/** Stable key for Decision Summary driver chips and explanations. */
export const SPRINT_EXPOSURE_DRIVER_KEY = "SPRINT_EXPOSURE";

export type SprintExposureDriverFlag = {
  driver: typeof SPRINT_EXPOSURE_DRIVER_KEY;
  ratio: number;
  acuteSum7d: number;
  matchDayDemand: number;
  band: SprintExposureBand;
  severity: "watch" | "concern" | "high";
};

/** Build a Decision Summary driver flag when exposure is meaningfully off
 *  the safe band. Returns null on SAFE / INSUFFICIENT_DATA. */
export function buildSprintExposureFlag(
  payload: SprintExposurePayload,
): SprintExposureDriverFlag | null {
  if (
    payload.exposureRatio == null ||
    payload.acuteSum7d == null ||
    payload.matchDayDemand == null ||
    payload.band === "INSUFFICIENT_DATA" ||
    payload.band === "SAFE"
  ) {
    return null;
  }
  let severity: SprintExposureDriverFlag["severity"];
  if (payload.band === "UNDERLOAD" || payload.band === "OVERLOAD") {
    severity = "high";
  } else if (payload.band === "WATCH") {
    severity = "watch";
  } else {
    severity = "concern";
  }
  return {
    driver: SPRINT_EXPOSURE_DRIVER_KEY,
    ratio: payload.exposureRatio,
    acuteSum7d: payload.acuteSum7d,
    matchDayDemand: payload.matchDayDemand,
    band: payload.band,
    severity,
  };
}

/** Coach-facing one-liner for the chip / modal. */
export function formatSprintExposureReason(
  flag: SprintExposureDriverFlag,
  lang: "IS" | "EN" = "EN",
): string {
  const pct = Math.round(flag.ratio * 100);
  const acute = Math.round(flag.acuteSum7d);
  const demand = Math.round(flag.matchDayDemand);
  if (flag.band === "UNDERLOAD") {
    return lang === "IS"
      ? `Sprint exposure ${pct}% af match demand (${acute} vs ${demand} sprint-strides/leikur) — undertrained. Bætið við sprint-blokk MD-3/MD-4.`
      : `Sprint exposure ${pct}% of match demand (${acute} vs ${demand} sprint-strides/match) — undertrained. Add a sprint block at MD-3/MD-4.`;
  }
  if (flag.band === "OVERLOAD") {
    return lang === "IS"
      ? `Sprint exposure ${pct}% af match demand (${acute} vs ${demand}) — spike-band. Lækkið sprint volume næstu 2 daga.`
      : `Sprint exposure ${pct}% of match demand (${acute} vs ${demand}) — spike band. Cap sprint volume the next 2 days.`;
  }
  return lang === "IS"
    ? `Sprint exposure ${pct}% af match demand — fylgjast með, bæta upp ef leikur er á næstu leiti.`
    : `Sprint exposure ${pct}% of match demand — monitor; top up if a match is coming up.`;
}
