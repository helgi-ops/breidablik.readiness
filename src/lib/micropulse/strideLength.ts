/**
 * Stride length — is he still pushing, or just turning his legs over?
 *
 * WHAT IT MEASURES
 * ----------------
 * Stride length = high-cadence distance ÷ high-cadence strides (IMA free-running
 * bands 5–8). Cadence tells you how FAST the legs turn over; stride length tells
 * you how much GROUND each stride covers — a proxy for force into the floor.
 *
 * The pairing is what makes it useful. Under neuromuscular fatigue an athlete
 * characteristically MAINTAINS stride frequency while stride length SHORTENS: the
 * legs keep spinning, the push weakens (Girard, Micallef & Millet 2011; Morin et
 * al. 2011). Cadence alone cannot see this. GPS distance alone cannot see this.
 * The ratio can.
 *
 * THE MISTAKE THIS MODULE EXISTS TO AVOID
 * ---------------------------------------
 * Measured naively — every session lumped together — stride length has ~18%
 * day-to-day variation within a single player. The fatigue signal we are hunting
 * is 2–5%. A flag built on that would fire at random and look convincing while
 * doing it.
 *
 * The noise is not intrinsic. It is SESSION TYPE talking. Measured on Breiðablik
 * (May–Jul 2026):
 *
 *     match      (>8 km)   stride length 2.30 m   within-player CV  4.2%
 *     big session (5–8 km)               1.98 m                     8.5%
 *     light      (<5 km)                 1.76 m                    15.1%
 *
 * The same player strides 30% longer in a match than in a light session — because
 * he is doing a different thing, not because his legs changed. Pool those together
 * and the session type IS the variance.
 *
 * So we compare LIKE WITH LIKE: a match against his own match norm. On that basis
 * the CV collapses to 4.2%, and a 2-SD drop (~8%) becomes a real, readable signal.
 *
 * This is why the module refuses to produce a verdict for a session type it cannot
 * measure reliably. A metric that only works in one context is honest. A metric
 * that pretends to work everywhere is not.
 *
 * Refs: Girard, Micallef & Millet 2011 (sprint fatigue → stride length falls,
 *       frequency preserved); Morin et al. 2011 (stride mechanics & force output).
 */

export type SessionKind = "match" | "big_session" | "light_session";

/**
 * Within-player coefficient of variation, per session type — measured, not assumed.
 * These are the noise floors that decide whether a verdict is possible at all.
 */
export const CV_BY_KIND: Record<SessionKind, number> = {
  match: 4.2,
  big_session: 8.5,
  light_session: 15.1,
};

/**
 * Session types we will issue a verdict for.
 *
 * Light sessions are excluded deliberately: at 15.1% CV, the noise is three times
 * the signal. Flagging on them would be indistinguishable from guessing, and would
 * teach the coach to ignore the flag when it eventually matters.
 */
export const VERDICT_KINDS: SessionKind[] = ["match", "big_session"];

/** Minimum high-cadence strides for the ratio to be meaningful at all. */
export const MIN_STRIDES = 50;

/** Prior same-type sessions needed before the norm is his rather than the group's. */
export const MIN_HISTORY = 3;
export const MATURE_HISTORY = 8;

/**
 * A drop this many SDs below his own norm is treated as real, not noise.
 *
 * Set at 2.5, not the conventional 2, and the choice was measured rather than
 * assumed. Across Breiðablik's 57 full matches (9 players with ≥4 matches each):
 *
 *     2.0 SD (-8.4%)   → 2 flags   (3.5% of matches)
 *     2.5 SD (-10.5%)  → 1 flag    (1.8%)
 *     3.0 SD (-12.6%)  → 1 flag    (1.8%)
 *
 * The one genuine event sits at -17.6% — far beyond any of these. So moving from
 * 2.0 to 2.5 SD loses nothing real and halves the false alarms. At 3.0 we would
 * gain nothing further, and would start risking the milder true positives.
 *
 * The asymmetry matters: a missed flag costs one conversation the coach might have
 * had anyway. A false flag costs trust in every flag that follows.
 */
export const FLAG_SD = 2.5;

export type StrideVerdict = "normal" | "shortened" | "lengthened" | "unmeasurable";

export interface StrideSession {
  date: string;
  kind: SessionKind;
  /** Summed distance in IMA free-running bands 5–8, metres. */
  highCadenceDistanceM: number | null;
  /** Summed stride count in bands 5–8. */
  highCadenceStrides: number | null;
}

export interface StrideResult {
  verdict: StrideVerdict;
  kind: SessionKind;
  /** Metres per stride today. */
  strideLengthM: number | null;
  /** His own mean for THIS session type. */
  normM: number | null;
  /** Percent difference from his norm. Negative = shorter strides. */
  deltaPct: number | null;
  /** How many of his own same-type sessions the norm rests on. */
  historyN: number;
  /** 0–1. Rises with history; the coach always sees how much of this is really him. */
  confidence: number;
  /** True while the norm is too thin to stand alone. */
  provisional: boolean;
  reason: string;
  reasonIs: string;
  /**
   * When verdict === "unmeasurable", WHY — so a surface can explain the absence
   * instead of hiding it. In particular `no_distance` = the session had
   * high-cadence strides but no running distance (indoor, or GPS not captured):
   * stride length in metres is GPS-derived and OUTDOOR-ONLY.
   */
  unmeasurableReason?: "no_distance" | "too_few_strides" | "light_session" | "no_history";
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Metres per stride, or null when there is too little to divide. */
export function strideLength(s: StrideSession): number | null {
  const d = s.highCadenceDistanceM;
  const n = s.highCadenceStrides;
  if (d == null || n == null || n < MIN_STRIDES || d <= 0) return null;
  return round(d / n, 3);
}

/**
 * Pure. Compare today's stride length to his own norm FOR THE SAME SESSION TYPE.
 *
 * `history` must already be filtered to the same kind — mixing kinds is the exact
 * error this module exists to prevent, so we do not silently tolerate it.
 */
export function assessStrideLength(
  today: StrideSession,
  history: StrideSession[],
  groupNormM: number | null = null,
): StrideResult {
  const kind = today.kind;
  const todayLen = strideLength(today);

  const base = {
    kind,
    strideLengthM: todayLen,
    normM: null as number | null,
    deltaPct: null as number | null,
    historyN: 0,
    confidence: 0,
    provisional: true,
  };

  // Indoor / no-GPS session FIRST — before the light-session refusal — so an
  // indoor day is always explained as "outdoor-only" rather than conflated with
  // light-session noise. He ran (strides present) but there is no running
  // distance, and stride length in metres is GPS-derived and OUTDOOR-ONLY:
  // indoors Catapult gives strides and cadence but no free-running distance.
  // Any high-cadence strides at all + no distance = the indoor signature (don't
  // require MIN_STRIDES here: an indoor session may have few sprint-band strides,
  // but the honest reason it's unmeasurable is still "no GPS distance", not
  // "too few strides").
  // Indoors Catapult returns 0 (not null) for free-running distance while still
  // counting strides — so "no distance" means null OR ≤ 0, paired with strides.
  const ranWithNoDistance =
    todayLen == null &&
    (today.highCadenceDistanceM == null || today.highCadenceDistanceM <= 0) &&
    today.highCadenceStrides != null && today.highCadenceStrides > 0;
  if (ranWithNoDistance) {
    return {
      ...base,
      verdict: "unmeasurable",
      unmeasurableReason: "no_distance",
      reason:
        `No running distance for this session, so stride length can't be measured — it's derived from GPS ` +
        `distance and only works outdoors. Indoors Catapult records his strides and cadence but not the distance.`,
      reasonIs:
        `Engin hlaupavegalengd í þessari æfingu, svo skreflengd er ekki mælanleg — hún byggir á GPS-vegalengd ` +
        `og virkar aðeins utandyra. Innandyra skráir Catapult skrefin og skreftíðnina en ekki vegalengdina.`,
    };
  }

  if (!VERDICT_KINDS.includes(kind)) {
    return {
      ...base,
      verdict: "unmeasurable",
      unmeasurableReason: "light_session",
      reason:
        `Stride length varies ${CV_BY_KIND[kind]}% between light sessions for the same player — ` +
        `three times the size of the signal. No verdict is possible here, and pretending otherwise ` +
        `would be guessing.`,
      reasonIs:
        `Skreflengd sveiflast um ${CV_BY_KIND[kind]}% milli léttra æfinga hjá sama leikmanni — ` +
        `þrefalt merkið sem við leitum að. Enginn dómur er mögulegur hér, og að þykjast annað ` +
        `væri ágiskun.`,
    };
  }

  if (todayLen == null) {
    return {
      ...base,
      verdict: "unmeasurable",
      unmeasurableReason: "too_few_strides",
      reason: `Fewer than ${MIN_STRIDES} high-cadence strides — too little running to measure stride length.`,
      reasonIs: `Færri en ${MIN_STRIDES} háhraðaskref — of lítið hlaup til að mæla skreflengd.`,
    };
  }

  const lens = history
    .filter((h) => h.kind === kind)
    .map(strideLength)
    .filter((v): v is number => v != null);
  const n = lens.length;

  // Shrink toward the group until he has enough of his own same-type sessions.
  const own = n ? lens.reduce((a, b) => a + b, 0) / n : null;
  const w = n / (n + MIN_HISTORY);
  const norm =
    own != null && groupNormM != null ? w * own + (1 - w) * groupNormM
    : own ?? groupNormM;

  if (norm == null) {
    return {
      ...base,
      verdict: "unmeasurable",
      unmeasurableReason: "no_history",
      historyN: n,
      reason: "No same-type history for this player and no squad norm — nothing to compare today against.",
      reasonIs: "Engin saga af sömu tegund og enginn hópur til samanburðar — ekkert til að bera daginn saman við.",
    };
  }

  const deltaPct = round(((todayLen - norm) / norm) * 100, 1);
  const cv = CV_BY_KIND[kind];
  const threshold = FLAG_SD * cv; // 2 SD, in percent
  const confidence = round(Math.min(1, n / MATURE_HISTORY), 2);
  const provisional = n < MATURE_HISTORY;

  const kindIs = kind === "match" ? "leikjum" : "stórum æfingum";
  const kindEn = kind === "match" ? "matches" : "big sessions";
  const tail =
    n === 0
      ? ` No matches of his own yet — this is the squad's norm, not his.`
      : provisional
        ? ` Based on ${n} of his own ${kindEn} — still settling.`
        : ` Based on ${n} of his own ${kindEn}.`;
  const tailIs =
    n === 0
      ? ` Engir eigin leikir enn — þetta er norm hópsins, ekki hans.`
      : provisional
        ? ` Byggt á ${n} af hans eigin ${kindIs} — enn að þroskast.`
        : ` Byggt á ${n} af hans eigin ${kindIs}.`;

  if (deltaPct <= -threshold) {
    return {
      ...base,
      verdict: "shortened",
      normM: round(norm),
      deltaPct,
      historyN: n,
      confidence,
      provisional,
      reason:
        `His strides are ${Math.abs(deltaPct)}% shorter than his usual ${kindEn.slice(0, -2)} ` +
        `(${round(todayLen)} m vs ${round(norm)} m). He is turning his legs over as fast as ever ` +
        `but covering less ground with each one — he is pushing less.${tail}`,
      reasonIs:
        `Skrefin hans eru ${Math.abs(deltaPct)}% styttri en venjulega í leik ` +
        `(${round(todayLen)} m á móti ${round(norm)} m). Hann stígur jafn hratt og áður en ` +
        `kemst styttra með hverju skrefi — hann er að ýta minna.${tailIs}`,
    };
  }

  if (deltaPct >= threshold) {
    return {
      ...base,
      verdict: "lengthened",
      normM: round(norm),
      deltaPct,
      historyN: n,
      confidence,
      provisional,
      reason:
        `His strides are ${deltaPct}% longer than usual (${round(todayLen)} m vs ${round(norm)} m) — ` +
        `more ground per stride. Usually a good sign, but worth a glance if it is sudden.${tail}`,
      reasonIs:
        `Skrefin hans eru ${deltaPct}% lengri en venjulega (${round(todayLen)} m á móti ${round(norm)} m) — ` +
        `meiri völlur með hverju skrefi. Yfirleitt gott merki, en vert að líta á ef það kemur skyndilega.${tailIs}`,
    };
  }

  return {
    ...base,
    verdict: "normal",
    normM: round(norm),
    deltaPct,
    historyN: n,
    confidence,
    provisional,
    reason: `Stride length is normal for him (${round(todayLen)} m vs his usual ${round(norm)} m).${tail}`,
    reasonIs: `Skreflengd er eðlileg hjá honum (${round(todayLen)} m á móti hans venjulegu ${round(norm)} m).${tailIs}`,
  };
}

/**
 * Classify a session by MINUTES PLAYED — never by distance.
 *
 * Classifying by distance is circular, and dangerously so: distance is the very
 * quantity the metric is built on. A fatigued player covers LESS ground, so a
 * distance threshold silently drops exactly the players the flag exists to catch.
 *
 * Ágúst Orri, 2026-06-16, is the proof. He played the full 90 minutes and covered
 * 8,222 m — 91 m/min against his usual 117–138, with strides 18.5% short. Under a
 * "≥8,000 m = match" rule he scraped in by 222 m. Slightly worse and he would have
 * been filtered out of his own comparison set, and the system would have said
 * nothing at all.
 *
 * Minutes played come from match_player_minutes (coach-entered). They are the one
 * fact no device gives us, and the only non-circular basis for "was this a match?"
 *
 * Fall back to distance ONLY when minutes are absent — and mark it, because such a
 * verdict is weaker than one grounded in a known match window.
 */
export const FULL_MATCH_MIN = 80;
export const BIG_SESSION_MIN = 45;

export function classifySession(
  minutesPlayed: number | null,
  totalDistanceM: number | null = null,
): SessionKind {
  if (minutesPlayed != null) {
    if (minutesPlayed >= FULL_MATCH_MIN) return "match";
    if (minutesPlayed >= BIG_SESSION_MIN) return "big_session";
    return "light_session";
  }
  // No minutes recorded — fall back to distance, accepting the circularity because
  // the alternative is no verdict at all. The caller should treat this as lower
  // confidence.
  const d = totalDistanceM ?? 0;
  if (d >= 8000) return "match";
  if (d >= 5000) return "big_session";
  return "light_session";
}
