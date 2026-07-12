/**
 * Match minutes — separating MATCHDAY LOAD from MATCH RUNNING.
 *
 * THE PROBLEM
 * -----------
 * Catapult splits an activity into periods by the STADIUM CLOCK ("1st half",
 * "2nd half"), not by who is on the pitch. A substitute's pod goes on at
 * half-time — he jogs the touchline for ~30 min, comes on for ~20 — and every
 * metre of it is credited to the "2nd half" period.
 *
 * Ground truth (HK vs Ægir, 2026-07-10): all four substitutes carry exactly
 * 51.5 min — the entire second half. Atli Þór Gunnarsson: 3,983 m at 3.7%
 * high-speed. A player genuinely playing runs 8–13% high-speed (Bradley 2009).
 * He was jogging, not playing. Meanwhile Dagur Ingi — highest high-speed share
 * (12.1%) — has the LOWEST distance (2,848 m): he came on earlier and warmed up
 * less. The contamination is visible in the data, and it is systematic.
 *
 * THE DISTINCTION
 * ---------------
 *   matchday load  — everything the pod recorded, warm-up included. VALID for
 *                    ACWR / load monitoring: the body did the work. Do not throw
 *                    it away (Gabbett 2016).
 *   match running  — on-pitch output only. Only trustworthy when the pod window
 *                    and the minutes played actually agree.
 *
 * Blending these into one number is what made a substitute look like he ran half
 * a match. This module keeps them apart and makes every verdict say WHY —
 * per the explainability manifesto: a number must carry its own provenance.
 *
 * Refs: Bradley et al. 2009 (high-speed share of match distance);
 *       Gabbett 2016 (training-load monitoring / ACWR).
 */

/** Pod minutes and match minutes may disagree by this much and still be "clean". */
export const POD_MATCH_TOLERANCE_MIN = 5;

/**
 * For a STARTER, how many minutes short of the pod window his entered minutes may
 * fall and still mean "played to the end". Coaches enter a nominal "90" for a full
 * match while the pod (with stoppage) reads ~101 — that gap is uncounted stoppage,
 * not bench-sitting. Only a gap larger than this means he was actually substituted
 * off. Set above the largest realistic added time so a full-match captain is never
 * mistaken for a sub-off and false-flagged as "impossible m/min".
 */
export const FULL_MATCH_STOPPAGE_SLACK_MIN = 15;

/**
 * Above this, a distance rate is not physiologically plausible for football.
 * Elite match intensity sits at 105–120 m/min; the highest credible outliers
 * reach ~130. A value above this means the minutes are wrong, not the athlete.
 */
export const IMPLAUSIBLE_M_PER_MIN = 130;

export type MatchLoadContext =
  | "match_full"        // played essentially the whole pod window — clean
  | "match_partial"     // played a defined shorter spell, pod matches it — clean
  | "bench_contaminated" // pod ran far longer than he played: touchline warm-up is inside the numbers
  | "unused"            // named but never came on — everything recorded is warm-up
  | "unknown";          // no minutes entered — we cannot tell, so we must not assert

export interface MatchLoadInput {
  /** Sum of Catapult period durations for this player on this date. */
  podMinutes: number | null;
  /** Coach-entered minutes ON THE PITCH. null = not entered yet. */
  minutesPlayed: number | null;
  distanceM: number | null;
  highSpeedM: number | null;
  /**
   * Did he START the match? Derived from the period data: a starter has a
   * "1st half" period row, a substitute does not.
   *
   * This matters because pod-time-without-pitch-time is NOT one phenomenon:
   *   subbed OFF  — pod keeps recording while he SITS. Adds almost no distance,
   *                 so his totals are still true match running. Usable.
   *   subbed ON   — pod recorded him JOGGING THE TOUCHLINE before he came on.
   *                 That distance is inside his total. Not match running.
   * Treating these the same would throw away good data (a subbed-off starter)
   * and is factually wrong ("touchline warm-up" for a man on the bench).
   */
  startedMatch?: boolean | null;
}

export interface MatchLoadVerdict {
  context: MatchLoadContext;
  /** Minutes the pod was recording while he was NOT playing. */
  benchMinutes: number | null;
  /**
   * TRUE only when this row may be used as a MATCH benchmark (baselines,
   * position norms, "his usual match"). Matchday LOAD is always usable.
   */
  usableAsMatchBenchmark: boolean;
  /** Distance rate over minutes actually played. Null unless clean. */
  mPerMin: number | null;
  /** Distance rate over the whole pod window — always computable, often misleading. */
  podMPerMin: number | null;
  /** High-speed share of total distance, in percent. */
  highSpeedPct: number | null;
  /** Set when the arithmetic itself is impossible — the minutes must be wrong. */
  implausible: boolean;
  /** Plain-language "why", coach-readable. No jargon. Layer 1 of the read. */
  reason: string;
  reasonIs: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pure. Given the pod window and the minutes actually played, decide what this
 * row is allowed to claim.
 *
 * Deliberately conservative: with no minutes entered we return "unknown" and
 * refuse the benchmark rather than guessing. Rules decide; we never let a
 * heuristic quietly promote itself into a verdict.
 */
export function classifyMatchLoad(inp: MatchLoadInput): MatchLoadVerdict {
  const pod = inp.podMinutes != null && inp.podMinutes > 0 ? inp.podMinutes : null;
  const played = inp.minutesPlayed;
  const dist = inp.distanceM ?? null;

  const highSpeedPct =
    dist != null && dist > 0 && inp.highSpeedM != null
      ? round1((inp.highSpeedM / dist) * 100)
      : null;
  const podMPerMin = dist != null && pod ? round1(dist / pod) : null;

  // No minutes entered → we genuinely do not know. Say so.
  if (played == null) {
    return {
      context: "unknown",
      benchMinutes: null,
      usableAsMatchBenchmark: false,
      mPerMin: null,
      podMPerMin,
      highSpeedPct,
      implausible: false,
      reason:
        "Minutes played not entered — this is matchday load (pod total), not verified match running.",
      reasonIs:
        "Leikmínútur ekki skráðar — þetta er leikdagsálag (allt sem pod-ið mældi), ekki staðfest leikhlaup.",
    };
  }

  if (played === 0) {
    return {
      context: "unused",
      benchMinutes: pod,
      usableAsMatchBenchmark: false,
      mPerMin: null,
      podMPerMin,
      highSpeedPct,
      implausible: false,
      reason:
        "Never came on — everything recorded here is warm-up. Counts as load, not as a match.",
      reasonIs:
        "Kom aldrei inn á — allt sem hér er mælt er upphitun. Telst sem álag, ekki sem leikur.",
    };
  }

  const mPerMin = dist != null && played > 0 ? round1(dist / played) : null;
  const bench = pod != null ? Math.max(0, round1(pod - played)) : null;
  const contaminated = pod != null && played < pod - POD_MATCH_TOLERANCE_MIN;

  if (contaminated && bench != null) {
    // A STARTER whose pod ran long either (a) played to the end — his "90" is a
    // nominal full-match count and the extra pod time is uncounted stoppage — or
    // (b) was genuinely substituted OFF, after which the pod recorded him sitting.
    // Either way the distance is true match running; the only question is the
    // right DENOMINATOR for the rate. For a full-match starter it is the pod
    // window (rating over the nominal 90 inflates m/min and false-flags him); for
    // a sub-off it is his played minutes (rating over the pod under-counts the
    // time he was sitting). We tell them apart by how far short of the pod he fell.
    if (inp.startedMatch === true) {
      const subbedOff = pod != null && played < pod - FULL_MATCH_STOPPAGE_SLACK_MIN;
      const trueMin = subbedOff ? played : pod!;
      const trueBench = subbedOff ? bench : 0;
      const rate = dist != null && trueMin > 0 ? round1(dist / trueMin) : null;
      const impl = rate != null && rate > IMPLAUSIBLE_M_PER_MIN;
      return {
        context: subbedOff ? "match_partial" : "match_full",
        benchMinutes: trueBench,
        usableAsMatchBenchmark: !impl,
        mPerMin: rate,
        podMPerMin,
        highSpeedPct,
        implausible: impl,
        reason: subbedOff
          ? `Started and came off after ${played} min; the pod kept recording for ${trueBench} min on the bench, ` +
            `which adds no running. Match numbers stand (${rate ?? "—"} m/min).`
          : `Started and played the full match — the pod read ${round1(pod!)} min (with stoppage) against a nominal ${played}. ` +
            `Rated over the true window: ${rate ?? "—"} m/min.`,
        reasonIs: subbedOff
          ? `Byrjaði og fór af velli eftir ${played} mín; pod-ið mældi áfram í ${trueBench} mín á bekknum, ` +
            `sem bætir engum hlaupum við. Leiktölurnar standa (${rate ?? "—"} m/mín).`
          : `Byrjaði og spilaði allan leikinn — pod-ið mældi ${round1(pod!)} mín (með uppbótartíma) á móti ${played} að nafngildi. ` +
            `Reiknað yfir rétta gluggann: ${rate ?? "—"} m/mín.`,
      };
    }

    // A SUBSTITUTE: the pod was on while he jogged the touchline. That distance
    // is inside his total and cannot be separated out. The load is real; the
    // ATTRIBUTION is what's wrong. Say exactly that, and refuse the match rate.
    return {
      context: "bench_contaminated",
      benchMinutes: bench,
      usableAsMatchBenchmark: false,
      mPerMin: null, // refuse to publish a match rate we know is polluted
      podMPerMin,
      highSpeedPct,
      implausible: false,
      reason:
        `Came on as a substitute for ${played} min, but the pod recorded ${round1(pod!)} min — the other ${bench} min ` +
        `are touchline warm-up, and that distance is inside these numbers. Real load, but not match running.`,
      reasonIs:
        `Kom inn á sem varamaður í ${played} mín, en pod-ið mældi ${round1(pod!)} mín — hinar ${bench} mín ` +
        `eru upphitun á hliðarlínu, og sú vegalengd er inni í þessum tölum. Raunverulegt álag, en ekki leikhlaup.`,
    };
  }

  // Clean: the pod window and the minutes played agree.
  const implausible = mPerMin != null && mPerMin > IMPLAUSIBLE_M_PER_MIN;
  const full = played >= 80;

  if (implausible) {
    return {
      context: full ? "match_full" : "match_partial",
      benchMinutes: bench,
      usableAsMatchBenchmark: false,
      mPerMin,
      podMPerMin,
      highSpeedPct,
      implausible: true,
      reason:
        `${mPerMin} m/min over ${played} min is beyond what is physiologically possible (ceiling ~${IMPLAUSIBLE_M_PER_MIN}). ` +
        `The minutes or the GPS file are wrong — check before using this.`,
      reasonIs:
        `${mPerMin} m/mín á ${played} mín er umfram það sem er líffræðilega mögulegt (þak ~${IMPLAUSIBLE_M_PER_MIN}). ` +
        `Annaðhvort mínúturnar eða GPS-skráin eru rangar — athugaðu áður en þetta er notað.`,
    };
  }

  return {
    context: full ? "match_full" : "match_partial",
    benchMinutes: bench,
    usableAsMatchBenchmark: true,
    mPerMin,
    podMPerMin,
    highSpeedPct,
    implausible: false,
    reason: full
      ? `Played ${played} min — pod window matches, so these are true match numbers (${mPerMin ?? "—"} m/min).`
      : `Played ${played} min — a clean partial spell (${mPerMin ?? "—"} m/min). Compare per-minute, not totals.`,
    reasonIs: full
      ? `Spilaði ${played} mín — pod-glugginn stemmir, svo þetta eru réttar leiktölur (${mPerMin ?? "—"} m/mín).`
      : `Spilaði ${played} mín — hreinn hluti úr leik (${mPerMin ?? "—"} m/mín). Berðu saman á mínútu, ekki heildartölur.`,
  };
}
