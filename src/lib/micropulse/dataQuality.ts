/**
 * Data quality — the system says when it does not know.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-07-12 a coach mentioned in passing that his substitutes' numbers looked
 * too high. Chasing it turned up a much bigger problem: of seven Catapult teams,
 * only ONE (Breiðablik) had healthy IMA data. HK had every stride reading at zero
 * since April. Grindavík, Þór and Afturelding had NO IMA at all — hundreds of
 * sessions, not one row. Keflavík had 10 rows out of 379.
 *
 * Nobody knew. The dashboards rendered, the numbers looked plausible, and four
 * clubs were running on half a system for three months. It surfaced only because
 * one coach happened to speak up.
 *
 * A monitoring system that cannot monitor ITSELF is not trustworthy. This module
 * is the missing half: every feed and every row carries its own provenance, and
 * when the data is absent, stale, or impossible, the system says so out loud
 * instead of rendering a confident-looking number.
 *
 * This is principle #1 of the manifesto (decision provenance is mandatory) turned
 * on the platform itself.
 *
 * TWO LAYERS
 * ----------
 *   FEED health  — is this signal arriving at all, for this team? (silent feeds)
 *   ROW checks   — is this specific value physiologically possible? (bad values)
 *
 * The subtle part is telling "broken" apart from "not applicable". A feed that
 * never delivered for a team is only a FAULT if comparable teams on the same
 * integration do receive it. That peer comparison is what would have caught HK
 * on day one instead of month three — a pure "did it stop?" check never fires for
 * something that was broken from the start.
 */

import { PLAUSIBLE_STRIDE_MIN, PLAUSIBLE_STRIDE_MAX } from "./strideLength";

// ── Physiological ceilings ───────────────────────────────────────────────────
// Above these a value is not "high", it is WRONG. Stated as constants so the
// thresholds are auditable rather than buried in a comparison.
//
// Stride length's bounds are NOT redefined here — they are imported from the
// stride engine, which owns them. One source, one verdict (CLAUDE.md): the row
// check and the engine's own refusal must never disagree about what is possible.

/** Men's 100 m world-record peak is ~37.6 km/h. Anything above is a GPS spike. */
export const MAX_PLAUSIBLE_VELOCITY_KMH = 37;
/** No footballer covers this in one session. */
export const MAX_PLAUSIBLE_DISTANCE_M = 14000;
/** Elite match intensity is 105–120 m/min; ~130 is the credible ceiling. */
export const MAX_PLAUSIBLE_M_PER_MIN = 130;

/** Share of sessions that must carry a signal before the feed counts as healthy. */
export const FEED_HEALTHY_COVERAGE = 0.8;
/** A feed that delivered before but has been dry this long is presumed broken. */
export const FEED_SILENT_DAYS = 14;

export type FeedStatus =
  | "healthy"       // arriving as expected
  | "degraded"      // arriving, but with gaps
  | "silent"        // used to arrive, has stopped — a REGRESSION
  | "never"         // never arrived, though peers on the same integration get it
  | "not_expected"; // not available on this integration — absence is correct

export type SignalKey =
  | "gps"
  | "ima"
  | "ima_strides"
  | "ima_run_distance" // free-running distance (bands 5-8) — GPS-derived, outdoor only
  | "cod"
  | "impacts"
  | "jumps"
  | "fmp"              // Football Movement Profile — inertial, works indoors
  | "heart_rate"
  | "readiness";

/**
 * What each Catapult data tier actually delivers.
 *
 * A LITE team receives limited Catapult data — no IMA. A Lite team with no IMA is
 * therefore not broken; it is behaving exactly as sold, and saying otherwise every
 * day would destroy the coach's trust in every other warning on this page.
 *
 * The first version of this engine inferred entitlement from peers ("other teams
 * get IMA, so you should too") and consequently flagged four healthy Lite teams as
 * faulty. The second version invented a new `catapult_product` column — a FOURTH
 * competing source of truth next to plan_tier, catapult_plan_type and
 * catapult_data_tier_override. Both were wrong for the same underlying reason:
 * inventing an answer to a question the system had already answered.
 *
 * The tier is resolved by the existing `getCatapultDataTier()`
 * (src/lib/micropulse/catapultTier/), which honours teams.catapult_data_tier_override
 * and otherwise auto-detects from recent data, defaulting to 'lite'. One source,
 * one verdict — per CLAUDE.md.
 */
export type CatapultDataTier = "full" | "lite";

export const TIER_SIGNALS: Record<CatapultDataTier, SignalKey[]> = {
  lite: ["gps", "heart_rate", "readiness"],
  // Every IMA-family signal is a FULL-tier entitlement. These four were added
  // after the 2026-07 "mirror image" discovery: HK received IMA + impacts + jumps
  // but no FMP and no free-running; Breiðablik received the opposite (no impacts).
  // The engine could not flag either, because it did not know those signals
  // existed. A safety net that omits the failures it is meant to catch is not one.
  full: [
    "gps", "ima", "ima_strides", "ima_run_distance",
    "cod", "impacts", "jumps", "fmp",
    "heart_rate", "readiness",
  ],
};

/**
 * Is this team entitled to this signal?
 *
 * Note the asymmetry with `getCatapultDataTier()`, which defaults to 'lite' when it
 * cannot tell. That default is right for FEATURE GATING (hide a surface rather than
 * show a broken one) and right here too: if we are unsure what a team pays for, we
 * do not accuse the integration of being broken.
 */
export function isEntitled(tier: CatapultDataTier, signal: SignalKey): boolean {
  return TIER_SIGNALS[tier].includes(signal);
}

export interface FeedInput {
  signal: SignalKey;
  /** Sessions in the window for this team. */
  totalRows: number;
  /** Sessions carrying a usable (non-null, non-zero) value for this signal. */
  rowsWithSignal: number;
  /** Days since the last session that carried this signal. null = never. */
  daysSinceLast: number | null;
  /**
   * Does this team's PRODUCT include this signal? Recorded fact, not a guess.
   * False → absence is correct and the system says nothing.
   */
  entitled: boolean;
}

export interface FeedVerdict {
  signal: SignalKey;
  status: FeedStatus;
  coverage: number;
  /** True when a human needs to act. Drives the alert, not just the display. */
  actionable: boolean;
  /** Plain language, coach-readable. No jargon. */
  reason: string;
  reasonIs: string;
}

const SIGNAL_LABEL: Record<SignalKey, { en: string; is: string }> = {
  gps: { en: "GPS", is: "GPS" },
  ima: { en: "IMA (movement)", is: "IMA (hreyfing)" },
  ima_strides: { en: "IMA stride bands", is: "IMA skreftíðni" },
  ima_run_distance: { en: "IMA running distance", is: "IMA hlaupavegalengd" },
  cod: { en: "Change of direction", is: "Stefnubreytingar" },
  impacts: { en: "Impacts", is: "Högg" },
  jumps: { en: "Jumps", is: "Stökk" },
  fmp: { en: "Movement profile (indoor)", is: "Hreyfiprófíll (innandyra)" },
  heart_rate: { en: "Heart rate", is: "Púls" },
  readiness: { en: "Player check-ins", is: "Leikmannaskráningar" },
};

const pct = (n: number) => Math.round(n * 100);

/**
 * Pure. Decide the health of one signal for one team.
 *
 * Order matters: we test "never arrived" BEFORE "stopped arriving", because a
 * feed that was broken from day one has no "last seen" date to go stale — the
 * stopped-arriving check would never fire on it. That is precisely the hole HK
 * fell through for three months.
 */
export function classifyFeed(inp: FeedInput): FeedVerdict {
  const label = SIGNAL_LABEL[inp.signal];
  const coverage = inp.totalRows > 0 ? inp.rowsWithSignal / inp.totalRows : 0;

  // Not part of what this team pays for. Silence is the CORRECT answer — a Core
  // team has no IMA by design, and telling its coach he is "missing data" every
  // day would be both false and corrosive to trust in every other warning here.
  if (!inp.entitled) {
    return {
      signal: inp.signal,
      status: "not_expected",
      coverage,
      actionable: false,
      reason: `${label.en} is not included in this team's Catapult tier. Its absence is correct, not a fault.`,
      reasonIs: `${label.is} er ekki innifalið í Catapult-þrepi þessa liðs. Það vantar ekki — það á ekki að vera þarna.`,
    };
  }

  // Entitled to it, and it has NEVER arrived. This is the case a "did it stop?"
  // check can never catch, because there is no last-seen date to go stale — the
  // exact hole HK sat in for three months.
  if (inp.rowsWithSignal === 0) {
    return {
      signal: inp.signal,
      status: "never",
      coverage: 0,
      actionable: true,
      reason:
        `${label.en} has NEVER arrived — not once in ${inp.totalRows} sessions — even though ` +
        `this team's Catapult tier includes it. They are paying for data they are not getting.`,
      reasonIs:
        `${label.is} hefur ALDREI borist — ekki einu sinni í ${inp.totalRows} æfingum — þótt ` +
        `Catapult-þrep liðsins innihaldi þau. Þeir eru að borga fyrir gögn sem þeir fá ekki.`,
    };
  }

  // It has arrived before. Has it stopped?
  if (inp.daysSinceLast != null && inp.daysSinceLast >= FEED_SILENT_DAYS) {
    return {
      signal: inp.signal,
      status: "silent",
      coverage,
      actionable: true,
      reason: `${label.en} stopped arriving ${inp.daysSinceLast} days ago. It worked before, so something broke.`,
      reasonIs: `${label.is} hætti að berast fyrir ${inp.daysSinceLast} dögum. Það virkaði áður, svo eitthvað bilaði.`,
    };
  }

  if (coverage < FEED_HEALTHY_COVERAGE) {
    return {
      signal: inp.signal,
      status: "degraded",
      coverage,
      actionable: true,
      reason:
        `${label.en} is only on ${pct(coverage)}% of sessions. Verdicts built on it are ` +
        `missing part of the picture.`,
      reasonIs:
        `${label.is} er bara á ${pct(coverage)}% æfinga. Niðurstöður sem byggja á þeim ` +
        `sjá ekki alla myndina.`,
    };
  }

  return {
    signal: inp.signal,
    status: "healthy",
    coverage,
    actionable: false,
    reason: `${label.en} is arriving normally (${pct(coverage)}% of sessions).`,
    reasonIs: `${label.is} berast eðlilega (${pct(coverage)}% æfinga).`,
  };
}

// ── Row-level checks ─────────────────────────────────────────────────────────

export type RowIssueKind =
  | "impossible_velocity"
  | "impossible_distance"
  | "impossible_intensity"
  | "impossible_stride_length"
  | "manual_conflicts_device"
  | "match_minutes_missing";

export interface RowIssue {
  kind: RowIssueKind;
  /** "block" = do not use this number anywhere. "warn" = usable, but say why. */
  severity: "block" | "warn";
  field: string;
  value: number | null;
  reason: string;
  reasonIs: string;
}

export interface RowCheckInput {
  maxVelocityKmh: number | null;
  totalDistanceM: number | null;
  /** Pod minutes, for the intensity check. */
  podMinutes: number | null;
  /**
   * Metres per high-cadence stride, ALREADY computed by the stride engine
   * (`strideLength()`), so this only ever sees a value the engine would actually
   * use — i.e. ≥ MIN_STRIDES with real distance. null = nothing to check.
   */
  strideLengthM?: number | null;
  /** Same-day device reading, when a manual entry also exists. */
  deviceDistanceM?: number | null;
  manualDistanceM?: number | null;
  /** Is this a match day with no minutes entered? */
  isMatchDay?: boolean;
  minutesPlayed?: number | null;
}

/**
 * Pure. Flag values that cannot be true.
 *
 * These are BLOCKS, not warnings: a 59.4 km/h sprint (which is sitting in the
 * database right now) is not an athlete having a great day, it is a GPS artefact.
 * Feeding it into a baseline silently corrupts every future comparison against it.
 */
export function checkRow(inp: RowCheckInput): RowIssue[] {
  const out: RowIssue[] = [];

  if (inp.maxVelocityKmh != null && inp.maxVelocityKmh > MAX_PLAUSIBLE_VELOCITY_KMH) {
    out.push({
      kind: "impossible_velocity",
      severity: "block",
      field: "max_velocity",
      value: inp.maxVelocityKmh,
      reason:
        `${inp.maxVelocityKmh} km/h is faster than the 100 m world record (~37 km/h). ` +
        `This is a GPS spike, not a sprint — it must not set a personal best or a baseline.`,
      reasonIs:
        `${inp.maxVelocityKmh} km/klst er hraðar en heimsmetið í 100 m (~37 km/klst). ` +
        `Þetta er GPS-hopp, ekki spretthlaup — það má hvorki verða persónulegt met né grunnlína.`,
    });
  }

  if (inp.totalDistanceM != null && inp.totalDistanceM > MAX_PLAUSIBLE_DISTANCE_M) {
    out.push({
      kind: "impossible_distance",
      severity: "block",
      field: "total_distance",
      value: inp.totalDistanceM,
      reason: `${Math.round(inp.totalDistanceM)} m in one session is beyond what is possible.`,
      reasonIs: `${Math.round(inp.totalDistanceM)} m á einni æfingu er umfram það sem er mögulegt.`,
    });
  }

  // An impossible stride length is the fingerprint of a MIS-CONFIGURED ORG — wrong
  // bands or wrong units — not of an athlete. Across a whole squad on one date it
  // is exactly the "tell us on day one" signal this engine exists for. Blocked,
  // not warned: it must never reach a baseline or a fatigue verdict.
  if (
    inp.strideLengthM != null &&
    (inp.strideLengthM < PLAUSIBLE_STRIDE_MIN || inp.strideLengthM > PLAUSIBLE_STRIDE_MAX)
  ) {
    out.push({
      kind: "impossible_stride_length",
      severity: "block",
      field: "stride_length",
      value: inp.strideLengthM,
      reason:
        `A stride length of ${inp.strideLengthM} m is outside the physiologically possible range ` +
        `(${PLAUSIBLE_STRIDE_MIN}–${PLAUSIBLE_STRIDE_MAX} m). Real match strides are ~1.9–2.7 m. ` +
        `This is a data problem — most likely a band or unit mis-configuration — not the athlete.`,
      reasonIs:
        `Skreflengd ${String(inp.strideLengthM).replace(".", ",")} m er utan þess sem er líffræðilega ` +
        `mögulegt (${String(PLAUSIBLE_STRIDE_MIN).replace(".", ",")}–${String(PLAUSIBLE_STRIDE_MAX).replace(".", ",")} m). ` +
        `Raunveruleg skref í leik eru ~1,9–2,7 m. Þetta er gagnavilla — líklega röng banda- eða ` +
        `einingastilling — ekki leikmaðurinn.`,
    });
  }

  if (inp.totalDistanceM != null && inp.podMinutes != null && inp.podMinutes > 0) {
    const rate = Math.round((inp.totalDistanceM / inp.podMinutes) * 10) / 10;
    if (rate > MAX_PLAUSIBLE_M_PER_MIN) {
      out.push({
        kind: "impossible_intensity",
        severity: "warn",
        field: "m_per_min",
        value: rate,
        reason:
          `${rate} m/min sustained is not physiologically possible (ceiling ~${MAX_PLAUSIBLE_M_PER_MIN}). ` +
          `Either the distance or the session duration is wrong.`,
        reasonIs:
          `${rate} m/mín viðvarandi er ekki líffræðilega mögulegt (þak ~${MAX_PLAUSIBLE_M_PER_MIN}). ` +
          `Annaðhvort vegalengdin eða tímalengdin er röng.`,
      });
    }
  }

  // A coach's manual entry beats the device by design (forgotten / broken pod).
  // But when BOTH exist and disagree wildly, the manual figure is usually a guess
  // — as with the player who was hand-entered at 10,902 m for a match he only
  // played the first half of (the pod recorded 6,547 m).
  if (inp.manualDistanceM != null && inp.deviceDistanceM != null && inp.deviceDistanceM > 0) {
    const delta = Math.abs(inp.manualDistanceM - inp.deviceDistanceM) / inp.deviceDistanceM;
    if (delta > 0.25) {
      out.push({
        kind: "manual_conflicts_device",
        severity: "warn",
        field: "total_distance",
        value: inp.manualDistanceM,
        reason:
          `Hand-entered ${Math.round(inp.manualDistanceM)} m, but the pod recorded ` +
          `${Math.round(inp.deviceDistanceM)} m the same day (${pct(delta)}% apart). ` +
          `The manual figure is being used — check it is right.`,
        reasonIs:
          `Handvirkt skráð ${Math.round(inp.manualDistanceM)} m, en pod-ið mældi ` +
          `${Math.round(inp.deviceDistanceM)} m sama dag (${pct(delta)}% munur). ` +
          `Handvirka talan er notuð — athugaðu hvort hún sé rétt.`,
      });
    }
  }

  if (inp.isMatchDay && inp.minutesPlayed == null) {
    out.push({
      kind: "match_minutes_missing",
      severity: "warn",
      field: "minutes_played",
      value: null,
      reason:
        "Minutes played not entered, so match numbers cannot be verified — a substitute's " +
        "touchline warm-up is inside these figures.",
      reasonIs:
        "Leikmínútur ekki skráðar, svo leiktölur eru óstaðfestar — upphitun varamanns " +
        "á hliðarlínu er inni í þessum tölum.",
    });
  }

  return out;
}

// ── Consent gaps ─────────────────────────────────────────────────────────────
//
// A COMPLIANCE gap, not a training gap — but it belongs here for the same reason
// the feed checks do: the system should say where it is incomplete on day one,
// not when someone asks. A minor cannot validly consent to health/biometric
// processing themselves, so an under-18 with only a self-consent is NOT covered,
// and an unknown DOB means we cannot even tell.
//
// This decides nothing: whether to pause processing for a minor without guardian
// consent is the club's call. It reports.

export type ConsentGapKind =
  | "dob_unknown"        // cannot tell who may consent
  | "minor_self_consent" // under 18, but the only consent is their own — invalid
  | "no_consent";        // no active data-processing consent at all

export interface ConsentGap {
  kind: ConsentGapKind;
  /** True when a human needs to act. */
  actionable: boolean;
  reason: string;
  reasonIs: string;
}

export interface ConsentCheckInput {
  /** true | false | null — null = DOB unknown (NOT "adult"). */
  isMinor: boolean | null;
  /** Is there an active data_processing consent at the current policy version? */
  hasActiveConsent: boolean;
  /** Who granted it: 'self' | 'parent' | 'guardian' | 'club_proxy' | null. */
  grantedByRelationship: string | null;
}

/**
 * Pure. The consent gap for ONE player, or null when nothing is wrong.
 *
 * Order matters: an under-18 self-consent is reported as the MINOR problem, not
 * as "consented, fine" — that silent pass is the exact failure the age gate
 * exists to prevent.
 */
export function checkConsent(inp: ConsentCheckInput): ConsentGap | null {
  const guardianGranted =
    inp.grantedByRelationship === "parent" || inp.grantedByRelationship === "guardian";

  if (inp.isMinor === true && inp.hasActiveConsent && !guardianGranted) {
    return {
      kind: "minor_self_consent",
      actionable: true,
      reason:
        "Under 18, but the consent on file is their own. A minor cannot validly consent to " +
        "health data processing — a parent or guardian must. This consent is incomplete.",
      reasonIs:
        "Undir 18 ára, en samþykkið sem er skráð er þeirra eigið. Ólögráða getur ekki gefið gilt " +
        "samþykki fyrir vinnslu heilsugagna — foreldri eða forráðamaður þarf að gera það. Þetta samþykki er ófullnægjandi.",
    };
  }

  if (!inp.hasActiveConsent) {
    return {
      kind: "no_consent",
      actionable: true,
      reason: "No active consent to data processing. They are asked each time they open the app.",
      reasonIs: "Ekkert virkt samþykki fyrir gagnavinnslu. Þau eru spurð í hvert sinn sem appið er opnað.",
    };
  }

  if (inp.isMinor == null) {
    return {
      kind: "dob_unknown",
      actionable: true,
      reason:
        "Date of birth is missing, so we cannot tell whether they may consent themselves or a " +
        "guardian must. Unknown age is not an adult.",
      reasonIs:
        "Fæðingardag vantar, svo við vitum ekki hvort þau megi samþykkja sjálf eða hvort " +
        "forráðamaður þarf að gera það. Óþekktur aldur er ekki fullorðinn.",
    };
  }

  return null;
}

/** Worst-first, so the coach reads the thing that matters most. */
export function sortFeeds(v: FeedVerdict[]): FeedVerdict[] {
  const rank: Record<FeedStatus, number> = {
    never: 0, silent: 1, degraded: 2, healthy: 3, not_expected: 4,
  };
  return [...v].sort((a, b) => rank[a.status] - rank[b.status] || a.coverage - b.coverage);
}
