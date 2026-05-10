/**
 * Sprint Speed Drop intelligence.
 *
 * Detects within-player drops in maximal sprint velocity vs personal recent
 * peak. A drop in maximal sprint speed is one of the strongest predictors of
 * subsequent hamstring injury and CNS suppression in field-sport athletes.
 *
 * The signal is computed from `max_velocity` (or `max_vel`) recorded in the
 * Catapult activity report — a metric that ALL Catapult tiers expose, so this
 * works for LITE teams too (no GPS tier upgrade needed).
 *
 * Method:
 *   - Personal reference = top-3 mean of max_velocity over the last 28 days
 *     of high-intensity sessions (HSR > REF_HSR_FLOOR_M). Top-3-mean is more
 *     resilient to single-session outliers than absolute max.
 *   - Today's value = max_velocity recorded today (if a HSR-meaningful session
 *     was logged). Sessions below REF_HSR_FLOOR_M are excluded — players who
 *     didn't sprint today aren't "suppressed", they just didn't sprint.
 *   - Drop% = (reference - today) / reference × 100
 *
 * Bands (evidence-based):
 *   - < 3%   → NORMAL    (within session-to-session noise; Buchheit 2014)
 *   - 3–7%   → WATCH     (mild suppression; trend over 3 days matters)
 *   - 7–12%  → CONCERN   (significant CNS / neuromuscular suppression)
 *   - > 12%  → HIGH_RISK (Edouard 2019 / Malone 2018: > 10% drop ≈ 3–4× HS injury risk)
 *
 * Implementation notes:
 *   - Pure function. No IO. Companion loader.ts pulls daily rows from
 *     player_external_load_daily and hands them in.
 *   - Today's value is OPTIONAL — if today's session had no HSR, the drop is
 *     undefined and band is INSUFFICIENT_DATA. We don't flag low-volume days.
 *   - Requires at least MIN_REF_DAYS HSR sessions in the 28-day window before
 *     the reference is considered stable.
 *
 * References:
 *   - Edouard P et al. Sprint biomechanical deficits and hamstring injury risk
 *     in elite track sprinters. Med Sci Sports Exerc 2019;51(12):2470-2477.
 *   - Malone S et al. Aerobic fitness and player load above 25 km/h are
 *     associated with hamstring injury. J Sci Med Sport 2018;21(8):785-790.
 *   - Buchheit M, Mendez-Villanueva A. Reliability and stability of anthropometric
 *     and performance measures in highly-trained young soccer players. J Sports
 *     Sci 2014;32(13):1271-1278.
 */

export type SprintBand =
  | "INSUFFICIENT_DATA"
  | "NORMAL"
  | "WATCH"
  | "CONCERN"
  | "HIGH_RISK";

export type DailySprint = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Session max velocity in m/s (Catapult convention). null = no session. */
  maxVelocityMs: number | null;
  /** High-speed running distance in metres for the same session. Used to gate
   *  out low-volume days where the player simply didn't sprint. null = unknown. */
  hsrM: number | null;
};

export type SprintDropPayload = {
  /** Personal-reference max sprint speed (m/s). Top-3 mean over 28d. */
  referenceMs: number | null;
  /** Today's max sprint speed (m/s). null when no HSR-meaningful session today. */
  todayMs: number | null;
  /** (reference - today) / reference × 100. Negative = today exceeded reference. */
  dropPct: number | null;
  band: SprintBand;
  /** Number of HSR-meaningful sessions in the 28d ref window. */
  refSessionCount: number;
};

const WINDOW_DAYS = 28;
const REF_HSR_FLOOR_M = 200; // session must have ≥ 200m HSR to count for reference
const MIN_REF_DAYS = 4;       // need ≥ 4 HSR sessions before reference is trustworthy
const TOP_N_FOR_REFERENCE = 3;

const BAND_NORMAL_MAX = 3;
const BAND_WATCH_MAX = 7;
const BAND_CONCERN_MAX = 12;

export function bandFromDrop(dropPct: number | null): SprintBand {
  if (dropPct == null || !Number.isFinite(dropPct)) return "INSUFFICIENT_DATA";
  if (dropPct < BAND_NORMAL_MAX) return "NORMAL";
  if (dropPct <= BAND_WATCH_MAX) return "WATCH";
  if (dropPct <= BAND_CONCERN_MAX) return "CONCERN";
  return "HIGH_RISK";
}

/** Filter to HSR-meaningful sessions (player actually ran). HSR floor is the
 *  gate — without HSR a low max_velocity is just "didn't sprint", not a drop. */
function isHsrMeaningful(row: DailySprint): boolean {
  return (
    row.maxVelocityMs != null &&
    Number.isFinite(row.maxVelocityMs) &&
    row.maxVelocityMs > 0 &&
    row.hsrM != null &&
    Number.isFinite(row.hsrM) &&
    row.hsrM >= REF_HSR_FLOOR_M
  );
}

/**
 * Compute Sprint Speed Drop for `todayIso` from a window of daily-sprint rows.
 * `rows` may include extra dates outside the 28-day window — they're filtered.
 *
 * Today's row is excluded from the reference computation (we don't want
 * today's regressed value polluting its own baseline).
 */
export function computeSprintDrop(
  rows: ReadonlyArray<DailySprint>,
  todayIso: string,
): SprintDropPayload {
  // Restrict to last WINDOW_DAYS ending today
  const today = new Date(`${todayIso}T00:00:00Z`);
  const oldest = new Date(today);
  oldest.setUTCDate(oldest.getUTCDate() - (WINDOW_DAYS - 1));
  const oldestIso = oldest.toISOString().slice(0, 10);

  const inWindow = rows.filter((r) => r.date >= oldestIso && r.date <= todayIso);

  // Today's row (if present and HSR-meaningful)
  const todayRow = inWindow.find((r) => r.date === todayIso) ?? null;
  const todayMs = todayRow && isHsrMeaningful(todayRow) ? todayRow.maxVelocityMs : null;

  // Reference = top-3 mean of HSR-meaningful sessions in the window EXCLUDING today
  const refCandidates = inWindow
    .filter((r) => r.date !== todayIso && isHsrMeaningful(r))
    .map((r) => r.maxVelocityMs as number)
    .sort((a, b) => b - a);

  const refSessionCount = refCandidates.length;

  if (refSessionCount < MIN_REF_DAYS) {
    return {
      referenceMs: null,
      todayMs,
      dropPct: null,
      band: "INSUFFICIENT_DATA",
      refSessionCount,
    };
  }

  const topN = refCandidates.slice(0, TOP_N_FOR_REFERENCE);
  const referenceMs = topN.reduce((s, x) => s + x, 0) / topN.length;

  if (todayMs == null) {
    // Reference is computable, but no HSR session today → no drop to report
    return {
      referenceMs,
      todayMs: null,
      dropPct: null,
      band: "INSUFFICIENT_DATA",
      refSessionCount,
    };
  }

  const dropPct = ((referenceMs - todayMs) / referenceMs) * 100;
  return {
    referenceMs,
    todayMs,
    dropPct,
    band: bandFromDrop(dropPct),
    refSessionCount,
  };
}

/** Stable key shown in Decision Summary driver chips and explanations. */
export const SPRINT_DROP_DRIVER_KEY = "SPRINT_SPEED_DROP";

export type SprintDropDriverFlag = {
  driver: typeof SPRINT_DROP_DRIVER_KEY;
  dropPct: number;
  referenceMs: number;
  todayMs: number;
  band: SprintBand;
  /** "watch" when band=WATCH, "concern" when band=CONCERN, "high" when HIGH_RISK. */
  severity: "watch" | "concern" | "high";
};

/**
 * Build a decision-engine driver flag when sprint speed has dropped enough
 * to warrant attention. Returns null on NORMAL / INSUFFICIENT_DATA — those
 * don't warrant a Decision Summary chip.
 */
export function buildSprintDropDriverFlag(
  payload: SprintDropPayload,
): SprintDropDriverFlag | null {
  if (
    payload.dropPct == null ||
    payload.referenceMs == null ||
    payload.todayMs == null ||
    payload.band === "INSUFFICIENT_DATA" ||
    payload.band === "NORMAL"
  ) {
    return null;
  }
  let severity: SprintDropDriverFlag["severity"];
  if (payload.band === "HIGH_RISK") severity = "high";
  else if (payload.band === "CONCERN") severity = "concern";
  else severity = "watch";
  return {
    driver: SPRINT_DROP_DRIVER_KEY,
    dropPct: payload.dropPct,
    referenceMs: payload.referenceMs,
    todayMs: payload.todayMs,
    band: payload.band,
    severity,
  };
}

/** Convert m/s to km/h (rounded to 1 decimal) for coach-friendly display. */
export function msToKmh(ms: number): number {
  return Math.round(ms * 3.6 * 10) / 10;
}

/** Coach-facing one-liner suitable for Decision Summary. */
export function formatSprintDropReason(flag: SprintDropDriverFlag): string {
  const drop = flag.dropPct.toFixed(1);
  const ref = msToKmh(flag.referenceMs).toFixed(1);
  const today = msToKmh(flag.todayMs).toFixed(1);
  if (flag.severity === "high") {
    return `Sprint speed −${drop}% vs personal peak (${today} vs ${ref} km/h) — high hamstring-injury risk band. Avoid maximal sprint exposure today.`;
  }
  if (flag.severity === "concern") {
    return `Sprint speed −${drop}% vs personal peak (${today} vs ${ref} km/h) — significant suppression. Cap top-end sprints, monitor closely.`;
  }
  return `Sprint speed −${drop}% vs personal peak (${today} vs ${ref} km/h) — mild drop. Watch trend over next 1–2 sessions.`;
}
