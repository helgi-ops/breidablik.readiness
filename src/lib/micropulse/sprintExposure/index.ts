/**
 * Sprint Exposure — VOLUME-side companion to Sprint Speed Drop (the
 * QUALITY-side metric).
 *
 * SOURCE (Nov 2026): GPS sprint distance, metres per day, from
 * player_external_load_daily — `sprint_distance`, falling back to
 * `velocity_band6_total_distance` (Catapult Core exposes sprint only as
 * velocity band 6). Compares the 7-day TRAINING sum against the player's
 * average per-match sprint distance over the last 28 days.
 *
 * Why not IMA Free Running bands 5–8 any more: those are BOUT-DURATION bands
 * (strides in continuous runs of ≥18 s), not speed or cadence bands — mean
 * speed is ~12–14 km/h and flat from band 4 up, and one player logged 567 m in
 * band 8 against 50 m of GPS sprinting (docs/ima-free-running-bands.md). They
 * measure long-run volume, not sprinting, so they are never used here — not
 * even as a fallback. GPS needs an outdoor lock: on indoor days the GPS
 * columns are null and the day is a "no sprint reading" day, which the
 * payload counts (`noGpsDays7d`) so the UI can say so explicitly.
 *
 * Sport-science rationale:
 *   - Sprint Speed Drop (Edouard 2019) catches when today's MAX velocity
 *     is below personal peak — a fatigue / mechanical compensation signal.
 *   - Sprint Exposure (Malone 2017) catches when the weekly VOLUME of GPS
 *     sprinting is well below what the player meets in a match — an
 *     under-preparation signal. Moderate sprint exposure is protective;
 *     the strongest injury signal is rapid increases (Malone 2017;
 *     Gabbett 2016), hence the spike band at the top.
 *
 * Pure deterministic. Companion loader.ts pulls the rows from
 * player_external_load_daily, week_plans and match_player_minutes.
 *
 * NOTE ON FIELD NAMES: `hiBandStrides*`, `v5v6Efforts` and the payload keys
 * are kept for interface stability (other modules and API consumers read
 * them). `hiBandStrides` now holds GPS sprint METRES for the day — see the
 * per-field comments.
 *
 * References:
 *   - Malone S et al. High-speed running and sprinting as an injury risk
 *     factor in soccer: can well-developed physical qualities reduce the
 *     risk? J Sci Med Sport 2018;21(3):257-262 (published online 2017).
 *   - Gabbett TJ. The training-injury prevention paradox. Br J Sports Med
 *     2016;50(5):273-280.
 */

export type DailySprintExposure = {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** GPS sprint distance (metres) for the day — `sprint_distance`, else
   *  `velocity_band6_total_distance`. Field name kept for interface
   *  stability (historically IMA band 5–8 strides, which were long-run
   *  volume, not sprinting). null = NO GPS READING (indoor session / no
   *  satellite lock / no session); 0 = GPS on, genuinely no sprinting. */
  hiBandStrides: number | null;
  /** Whether the player played ≥ 30 minutes / it was a scheduled game. */
  isMatchDay: boolean;
  /** Whether the day was on the team's match schedule (week_plans GAME).
   *  Distinguishes "match scheduled but no GPS captured" from "no match
   *  that day". Used for the transparency line in the UI. */
  isScheduledGame?: boolean;
  /** Legacy: true when the value was estimated rather than measured. The GPS
   *  loader never estimates, so it always writes false. Kept so older callers
   *  that still pass estimated rows are counted as estimated. */
  hiBandStridesEstimated?: boolean;
  /** Legacy field kept for interface stability. The GPS loader stores the
   *  day's GPS sprint EFFORT count here (velocity_band6_total_efforts_gen2),
   *  for display only — not used in the ratio. */
  v5v6Efforts?: number | null;
  /** True when the player had a load row that day (a session happened) but
   *  no GPS sprint reading — i.e. an indoor / no-GPS session. */
  noGpsReading?: boolean;
};

export type SprintExposureBand =
  | "INSUFFICIENT_DATA"
  | "UNDERLOAD"   // < 50% of a match's sprint distance across the training week
  | "WATCH"       // 50–80% — playable but light
  | "SAFE"        // 80–180% — normal football week
  | "OVERLOAD";   // > 180% — accumulated spike

export type SprintExposurePayload = {
  /** GPS sprint metres summed over TRAINING days in the last 7 days. null when
   *  no GPS training day. (Key kept for stability; unit is metres.) */
  acuteSum7d: number | null;
  /** Average GPS sprint metres per match across the last 28 days. */
  matchDayDemand: number | null;
  /** acuteSum7d ÷ matchDayDemand. null when demand is unknown. */
  exposureRatio: number | null;
  band: SprintExposureBand;
  /** Number of match days with a GPS sprint reading — the baseline size. */
  matchDaysObserved: number;
  /** Match days measured directly (GPS). Equals matchDaysObserved for the
   *  GPS loader (no estimation). */
  matchDaysMeasured: number;
  /** Legacy: match days filled by estimation. Always 0 for the GPS loader. */
  matchDaysEstimated: number;
  /** Total match days on the team schedule in the 28d window (any source).
   *  Used to surface "5 scheduled, 3 captured" transparency in the UI when
   *  some matches were DNP, manual entries, or had no GPS at all. */
  matchDaysScheduled: number;
  /** Training days in the last 7 with a GPS sprint reading (zeros count). */
  daysObserved7d: number;
  /** What the numbers are. Always "gps_sprint_distance_m" from this module;
   *  lets consumers refuse anything that isn't GPS-sourced. */
  metric?: "gps_sprint_distance_m";
  /** Training days in the last 7 that had a session but NO GPS reading
   *  (indoor / no satellite lock) — "no sprint reading" days. */
  noGpsDays7d?: number;
  /** True when the anchor day had a session but no GPS reading. */
  todayNoGps?: boolean;
};

/** Unit + source tag for every payload this module produces. */
export const SPRINT_EXPOSURE_METRIC = "gps_sprint_distance_m" as const;

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
//   - Numerator = TRAINING-ONLY GPS sprint metres across the 7-day window
//     (matches excluded — see computeSprintExposure below).
//   - Denominator = average GPS sprint metres per match in the 28-day window.
//   - Ratio = training sprinting relative to one match's worth. A normal
//     football week has 3-4 training days, so a healthy ratio sits around
//     0.8-1.8× (training delivers roughly one match's worth of sprinting
//     across the week, give or take).
//
// Sport-science anchor: Malone 2017 — low sprint exposure leaves players
// under-prepared (moderate exposure is protective); rapid increases are the
// stronger injury signal (Gabbett 2016). The exact thresholds vary by paper.
//
// RECALIBRATION NOTE (Nov 2026): these cut-points were first tuned on the
// old IMA band 5–8 stride numbers (long-run volume, not sprinting). The ratio
// logic carries over unchanged, but the cut-points should be re-checked
// against a few weeks of GPS sprint-distance weeks before anyone treats the
// band edges as precise.
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
 *  above 100%. The training-only ratio gives a clean "how much sprinting
 *  did the player do across the week, relative to a typical match?"
 *  reading. A healthy in-season football week sits at 80-180%.
 *
 *  null vs 0: a null value is "no GPS reading" (indoor) and is skipped; a 0
 *  is a real GPS day with no sprinting and DOES count as an observed day. */
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

  // Acute: TRAINING-only GPS sprint metres across last 7 days (match days
  // excluded because they're in the denominator's average — see header).
  // Zeros count: GPS was on and the player simply didn't sprint.
  const acuteRows = rows.filter((r) =>
    r.date >= start7Iso &&
    r.date <= todayIso &&
    !r.isMatchDay &&
    typeof r.hiBandStrides === "number" &&
    Number.isFinite(r.hiBandStrides) &&
    r.hiBandStrides >= 0
  );
  // Indoor / no-GPS training days in the last 7 — surfaced as
  // "no sprint reading", never back-filled from IMA bands.
  const noGpsDays7d = rows.filter((r) =>
    r.date >= start7Iso &&
    r.date <= todayIso &&
    !r.isMatchDay &&
    r.noGpsReading === true
  ).length;
  const todayNoGps = rows.some((r) => r.date === todayIso && r.noGpsReading === true);
  const daysObserved7d = acuteRows.length;
  const acuteSum7d = acuteRows.length > 0
    ? acuteRows.reduce((s, r) => s + (r.hiBandStrides as number), 0)
    : null;

  // Match-day demand: average GPS sprint metres per match in the 28d window.
  // A match with 0 m sprint is treated as a non-reading (a player who sat on
  // the bench but was logged, or a GPS dropout) so it can't drag the
  // baseline to zero. measured/estimated split is kept for legacy callers.
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
      metric: SPRINT_EXPOSURE_METRIC,
      noGpsDays7d,
      todayNoGps,
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
    metric: SPRINT_EXPOSURE_METRIC,
    noGpsDays7d,
    todayNoGps,
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

/** Coach-facing one-liner for the chip / modal. Plain language; the numbers
 *  are GPS sprint metres (training, last 7 days) vs his average per match. */
export function formatSprintExposureReason(
  flag: SprintExposureDriverFlag,
  lang: "IS" | "EN" = "EN",
): string {
  const pct = Math.round(flag.ratio * 100);
  const acute = Math.round(flag.acuteSum7d);
  const demand = Math.round(flag.matchDayDemand);
  if (flag.band === "UNDERLOAD") {
    return lang === "IS"
      ? `Sprettir í æfingum vikunnar eru ${pct}% af einum leik (${acute} m vs ${demand} m í leik að meðaltali) — of lítið. Bættu við stuttri hámarkshraða-blokk á MD-3/MD-4.`
      : `Sprinting in training this week is ${pct}% of one match (${acute} m vs ${demand} m per match on average) — too little. Add a short max-speed block at MD-3/MD-4.`;
  }
  if (flag.band === "OVERLOAD") {
    return lang === "IS"
      ? `Sprettir í æfingum vikunnar eru ${pct}% af einum leik (${acute} m vs ${demand} m) — snarpur toppur. Takmarkaðu spretti næstu 2 daga.`
      : `Sprinting in training this week is ${pct}% of one match (${acute} m vs ${demand} m) — a sharp spike. Cap sprinting the next 2 days.`;
  }
  return lang === "IS"
    ? `Sprettir í æfingum vikunnar eru ${pct}% af einum leik (${acute} m vs ${demand} m) — fylgjast með; bættu aðeins við ef leikur er í nánd.`
    : `Sprinting in training this week is ${pct}% of one match (${acute} m vs ${demand} m) — keep an eye on it; top up a little if a match is coming.`;
}
