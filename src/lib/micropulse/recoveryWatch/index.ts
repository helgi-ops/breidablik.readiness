/**
 * recoveryWatch — day-aware post-match recovery evaluation.
 *
 * Spec: docs/post-match-recovery-recheck.md (step 1). Turns the fixed
 * MD+1/MD+2 fatigue weighting into a RECOVERY LOOP: measure on whatever day a
 * check-in actually lands, interpret the reading against the EXPECTED recovery
 * for that MD-day, and keep re-checking the players who haven't returned to
 * their own baseline.
 *
 * Pure + deterministic. Reuses:
 *   - `flagAgainstBaseline` (z + SD-band vs the player's own rolling baseline), and
 *   - the MD-day notion from `fatigue/classify.ts` (mdDay = "MD+1" | "MD+2" | …),
 *     derived upstream from match_schedule × match_player_minutes.
 *
 * Honest scope: the signal is the SUBJECTIVE readiness check-in (sleep / fatigue
 * / soreness) vs the player's own norm — the only recovery signal available (HR
 * belts are absent). It is directional, not a medical recovery test, and is
 * surfaced as a DISTINCT "recovery watch" signal beside the canonical readiness
 * colour, never as the colour (CLAUDE.md).
 */

import { flagAgainstBaseline, type AthleteMetricBaseline, type SdBandFlag } from "../baselines";

export type RecoveryWatchStatus =
  | "na"          // not applicable: didn't play enough, no MD-day, or no reading
  | "building"    // baseline immature → low confidence, never flag
  | "recovered"   // back at/above his baseline for the day → close the watch
  | "on_track"    // MD+1 and low-as-expected (the normal echo) → re-check, no alert
  | "monitor"     // MD+1 but FAR below even the expected echo → re-check
  | "incomplete"  // MD+2 still clearly below baseline → re-check
  | "escalate";   // MD+3+ still below baseline → modify training / refer

export type RecoveryWatchInput = {
  /** Minutes in the reference match (match_player_minutes). */
  minutesPlayed: number | null;
  /** MD-day the check-in landed on: "MD+1" | "MD+2" | "MD+3" | … */
  mdDay: string | null;
  /** Today's reading of the signal metric (e.g. wellness total, 5..25). */
  todayReadiness: number | null;
  /** The player's own rolling baseline for that metric. */
  baseline: AthleteMetricBaseline | null;
  /** Metric key for direction lookup. Default "wellness.total" (lower_is_worse). */
  metricKey?: string;
  /** Typical MD+1 dip magnitude for this player/squad as a positive z (e.g. 0.7 =
   *  usually ~0.7 SD below the day after). When supplied, the MD+1 bar steepens to
   *  this + a margin, so we only flag a reading that is worse than his usual echo. */
  expectedMd1Dip?: number | null;
  /** Minimum minutes to bother tracking recovery. Default 30. */
  minMinutes?: number;
};

export type RecoveryWatchResult = {
  status: RecoveryWatchStatus;
  /** Signed z vs baseline (negative = below, since readiness is lower_is_worse). */
  z: number | null;
  /** How far BELOW baseline, in SD (positive number; 0 when at/above). */
  belowBy: number | null;
  flag: SdBandFlag;
  /** Parsed MD offset: "MD+2" → 2. */
  mdOffset: number | null;
  /** Keep the watch open and prompt a re-check on the next check-in day. */
  recheck: boolean;
  /** Baseline is mature (active) vs still calibrating. */
  confident: boolean;
  headline: string | null;
  why: string | null;
  action: string | null;
};

const DEFAULT_MIN_MINUTES = 30;
// Bars are expressed as SD BELOW baseline (positive). Tunable per the spec.
const MD1_HARD_BAR = 1.5; // MD+1: flag only when far below even the expected echo
const MD1_MARGIN = 0.5;   // added to a known expected dip to form the MD+1 bar
const MD2_BAR = 1.0;      // MD+2: should be returning — still ≥1 SD below = concern
const MD3_BAR = 1.0;      // MD+3+: should be back — still ≥1 SD below → escalate

/** "MD+2" → 2; "MD + 3" → 3; anything else → null. */
export function parseMdOffset(mdDay: string | null | undefined): number | null {
  if (!mdDay) return null;
  const m = /MD\s*\+\s*(\d+)/i.exec(mdDay);
  return m ? Number(m[1]) : null;
}

export function recoveryWatch(input: RecoveryWatchInput): RecoveryWatchResult {
  const mdOffset = parseMdOffset(input.mdDay);
  const none = (status: RecoveryWatchStatus): RecoveryWatchResult => ({
    status, z: null, belowBy: null, flag: "green", mdOffset,
    recheck: false, confident: false, headline: null, why: null, action: null,
  });

  const minMinutes = input.minMinutes ?? DEFAULT_MIN_MINUTES;
  // ── Gates (spec "Gating"): real minutes, a known MD-day, an actual reading ──
  if (input.minutesPlayed == null || input.minutesPlayed < minMinutes) return none("na");
  if (mdOffset == null || mdOffset < 1) return none("na");
  if (input.todayReadiness == null) return none("na");
  const b = input.baseline;
  if (!b || b.status === "insufficient_data") return none("building");

  const metricKey = input.metricKey ?? "wellness.total";
  const { z, flag } = flagAgainstBaseline(input.todayReadiness, b, metricKey);
  const zr = z == null ? null : Math.round(z * 100) / 100;
  // readiness is lower_is_worse: a low reading → negative z → belowBy positive.
  const belowBy = z == null ? 0 : Math.max(0, Math.round(-z * 100) / 100);
  const confident = b.status === "active";

  const zStr = zr == null ? "" : ` (z ${zr})`;
  const calNote = confident ? "" : " Baseline is still calibrating, so read this with lower confidence.";

  let status: RecoveryWatchStatus;
  let headline: string;
  let why: string;
  let action: string;

  if (mdOffset === 1) {
    // A low MD+1 reading is the expected post-match echo (Nédélec 2012) — only
    // flag when it is worse than his usual echo, not merely "low".
    const bar = input.expectedMd1Dip != null && input.expectedMd1Dip > 0
      ? input.expectedMd1Dip + MD1_MARGIN
      : MD1_HARD_BAR;
    if (belowBy >= bar) {
      status = "monitor";
      headline = `Below his usual even for the day after a match${zStr}.`;
      why = "A low reading on MD+1 is the normal post-match echo — this is worse than even that, so it is worth watching rather than dismissing.";
      action = "Re-check on the next check-in day; ease his plan if it persists.";
    } else {
      status = "on_track";
      headline = `Low as expected the day after a match${zStr} — within his normal echo.`;
      why = "Depressed readiness on MD+1 is the expected post-match echo (Nédélec 2012), not a concern by itself.";
      action = "Re-check on the next check-in day to confirm he returns to baseline.";
    }
  } else if (mdOffset === 2) {
    if (belowBy >= MD2_BAR) {
      status = "incomplete";
      headline = `Still below his baseline two days after the match${zStr}.`;
      why = "By MD+2 readiness should be returning toward baseline; he is still clearly below it.";
      action = "Keep the watch open and re-check on the next check-in day; consider a lighter session.";
    } else {
      status = "recovered";
      headline = `Back toward baseline by MD+2${zStr}.`;
      why = "Recovered on the expected post-match time-course.";
      action = "Close the watch — a full session is fine.";
    }
  } else {
    // MD+3 and beyond — should be back at baseline.
    if (belowBy >= MD3_BAR) {
      status = "escalate";
      headline = `Still below baseline ${mdOffset} days after the match${zStr}.`;
      why = "By MD+3 he should be back at baseline; persistent depression beyond the normal recovery window warrants action, not just monitoring.";
      action = "Modify training and/or refer to physio — this is past the expected echo.";
    } else {
      status = "recovered";
      headline = `Back at baseline ${mdOffset} days after the match${zStr}.`;
      why = "Recovered within the expected post-match window.";
      action = "Close the watch — a full session is fine.";
    }
  }

  // Re-check on the next check-in day for everything except a clean recovery.
  const recheck = status !== "recovered";

  return {
    status, z: zr, belowBy, flag, mdOffset, recheck, confident,
    headline: headline + (status === "recovered" ? "" : calNote),
    why, action,
  };
}
