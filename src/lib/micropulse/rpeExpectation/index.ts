/**
 * RPE-vs-MD-day expectation (× match minutes).
 *
 * "Did the session's intensity land where you intended for that MD-day — given how
 * much the player actually played?" A planning-feedback signal: it compares the
 * logged sRPE (CR10, 0-10) against a coach-tunable band for the MD-day, split by the
 * player's minutes in the most recent match. DESCRIPTIVE only — it never touches the
 * readiness colour (readiness_entries.color / v_coach_readiness_today_v8.final_color)
 * and is not a training decision by itself. The coach's bands are the source of
 * truth; this engine only explains where the RPE fell against them.
 *
 * The high-value cell is the TOP-UP: a non-player (bench / DNP) on MD+1 or MD+2 who
 * logs a low RPE missed their compensatory session — a real load gap (deconditioning
 * / return-to-play risk) that a starter-focused microcycle hides.
 *
 * Pure / IO-free. MD-day, minutes and RPE are resolved by the caller
 * (v_training_day_context.md_day, match_player_minutes, session_rpe_entries).
 */

export type Bi = { en: string; is: string };

/** How much of the most recent match the player played. */
export type MinutesBucket = "full" | "partial" | "minimal";

export type RpeStatus =
  | "within"        // inside the expected band — as planned
  | "under"         // below the band — lighter than planned
  | "over"          // above the band — harder than planned
  | "missed_topup"  // UNDER on a bench/partial player's MD+1/MD+2 top-up — the key flag
  | "not_logged"    // no RPE submitted — never a false green
  | "unknown_day";  // MD-day not modelled (e.g. OTHER) — no flag

/** Minutes cutoffs (coach-tunable): >= full → full; >= partial → partial; else minimal/DNP. */
export type MinutesCutoffs = { full: number; partial: number };
export const DEFAULT_MINUTES_CUTOFFS: MinutesCutoffs = { full: 60, partial: 30 };

export type Band = [number, number];
/** MD-day → minutes bucket → expected sRPE band. A missing cell = no expectation. */
export type RpeBandGrid = Record<string, Partial<Record<MinutesBucket, Band>>>;

/**
 * Default expected-sRPE grid (CR10). Coach-tunable CODE DATA — same pattern as
 * ROLE_DEMAND_FIT: edit here (or pass `bands`) to fit the club's weekly shape. The
 * peak day is NOT hard-coded to MD-3; MD-4/MD-3 default equal, coach sets the peak.
 * The MD+1 / MD+2 minimal & partial cells are the TOP-UP rows for non-starters.
 */
export const DEFAULT_RPE_BANDS: RpeBandGrid = {
  "MD":   { full: [8, 10], partial: [8, 10] },              // the match (no expectation if didn't play)
  "MD+1": { full: [1, 3],  partial: [4, 6], minimal: [6, 8] }, // players recover; non-players top up
  "MD+2": { full: [4, 6],  partial: [5, 7], minimal: [6, 8] },
  "MD-4": { full: [6, 8],  partial: [6, 8], minimal: [6, 8] },
  "MD-3": { full: [6, 8],  partial: [6, 8], minimal: [6, 8] }, // coach sets the peak
  "MD-2": { full: [5, 7],  partial: [5, 7], minimal: [5, 7] },
  "MD-1": { full: [2, 4],  partial: [2, 4], minimal: [2, 4] }, // taper
};

/** (mdDay|bucket) cells where UNDER on a low-minutes player = a missed compensatory session. */
const TOPUP_CELLS = new Set(["MD+1|minimal", "MD+1|partial", "MD+2|minimal", "MD+2|partial"]);

export type RpeExpectationInput = {
  mdDay: string | null;
  matchMinutes: number | null;
  actualRpe: number | null;
  /** Coach override; omit to use DEFAULT_RPE_BANDS. */
  bands?: RpeBandGrid;
  minutesCutoffs?: MinutesCutoffs;
};

export type RpeExpectationRead = {
  mdDay: string | null;
  bucket: MinutesBucket | null;
  expected: Band | null;
  actual: number | null;
  status: RpeStatus;
  isTopup: boolean;
  /** Provenance: which bands were used. */
  bandSource: "coach" | "default";
  verdict: Bi;
  confidence: "high" | "n/a";
};

/** Resolve the minutes bucket. Null minutes = did not play (bench / DNP) → minimal. */
export function minutesBucket(matchMinutes: number | null | undefined, cutoffs: MinutesCutoffs = DEFAULT_MINUTES_CUTOFFS): MinutesBucket {
  const m = matchMinutes ?? 0;
  if (m >= cutoffs.full) return "full";
  if (m >= cutoffs.partial) return "partial";
  return "minimal";
}

function normalizeMd(md: string | null | undefined): string | null {
  const s = String(md ?? "").trim().toUpperCase();
  return s ? s : null;
}

const bucketLabel: Record<MinutesBucket, Bi> = {
  full: { en: "played full", is: "spilaði fullt" },
  partial: { en: "played part", is: "spilaði hluta" },
  minimal: { en: "did not play", is: "spilaði ekki" },
};

/**
 * Pure. Compare a logged sRPE to the expected band for its MD-day × minutes bucket.
 */
export function evaluateRpeExpectation(input: RpeExpectationInput): RpeExpectationRead {
  const bands = input.bands ?? DEFAULT_RPE_BANDS;
  const bandSource: "coach" | "default" = input.bands ? "coach" : "default";
  const cutoffs = input.minutesCutoffs ?? DEFAULT_MINUTES_CUTOFFS;
  const md = normalizeMd(input.mdDay);
  const base = { mdDay: md, bucket: null as MinutesBucket | null, expected: null as Band | null, actual: input.actualRpe, isTopup: false, bandSource };

  // MD-day not modelled (OTHER / unknown) → no flag.
  if (!md || !bands[md]) {
    return { ...base, status: "unknown_day", confidence: "n/a", verdict: { en: "", is: "" } };
  }
  const bucket = minutesBucket(input.matchMinutes, cutoffs);
  const expected = bands[md][bucket] ?? null;
  // No expectation for this cell (e.g. a non-player on match day) → no flag.
  if (!expected) {
    return { ...base, bucket, status: "unknown_day", confidence: "n/a", verdict: { en: "", is: "" } };
  }
  const isTopup = TOPUP_CELLS.has(`${md}|${bucket}`);

  // RPE not logged → say so, never a false green.
  if (input.actualRpe == null) {
    return {
      ...base, bucket, expected, isTopup, status: "not_logged", confidence: "n/a",
      verdict: {
        en: `${md}: no RPE logged (expected ${expected[0]}–${expected[1]}).`,
        is: `${md}: ekkert RPE skráð (væntanlegt ${expected[0]}–${expected[1]}).`,
      },
    };
  }

  const [lo, hi] = expected;
  const actual = input.actualRpe;
  let status: RpeStatus;
  if (actual < lo) status = isTopup ? "missed_topup" : "under";
  else if (actual > hi) status = "over";
  else status = "within";

  const minsEn = input.matchMinutes != null ? `, ${bucketLabel[bucket].en} (${input.matchMinutes} min)` : "";
  const minsIs = input.matchMinutes != null ? `, ${bucketLabel[bucket].is} (${input.matchMinutes} mín)` : "";
  const bandStr = `${lo}–${hi}`;
  let verdict: Bi;
  switch (status) {
    case "within":
      verdict = {
        en: `${md}${minsEn}: RPE ${actual} — as planned (${bandStr}).`,
        is: `${md}${minsIs}: RPE ${actual} — innan væntinga (${bandStr}).`,
      };
      break;
    case "missed_topup":
      verdict = {
        en: `${md}${minsEn} → expected top-up ${bandStr}; logged ${actual} — top-up missed.`,
        is: `${md}${minsIs} → væntanlegt top-up ${bandStr}; skráð ${actual} — top-up vantaði.`,
      };
      break;
    case "under":
      verdict = {
        en: `${md}${minsEn}: RPE ${actual} below the expected ${bandStr} — lighter than planned.`,
        is: `${md}${minsIs}: RPE ${actual} undir væntu ${bandStr} — léttara en áætlað.`,
      };
      break;
    default: // over
      verdict = {
        en: `${md}${minsEn}: RPE ${actual} above the expected ${bandStr} — harder than planned.`,
        is: `${md}${minsIs}: RPE ${actual} yfir væntu ${bandStr} — erfiðara en áætlað.`,
      };
  }

  return { ...base, bucket, expected, isTopup, status, confidence: "high", verdict };
}

/** Does this read warrant a chip (i.e. it is not silent)? unknown_day is silent. */
export function isRpeExpectationActionable(read: RpeExpectationRead): boolean {
  return read.status !== "unknown_day";
}
