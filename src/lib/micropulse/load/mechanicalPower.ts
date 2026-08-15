/**
 * Mechanical-power / high-intensity-cost read — pure, side-effect free.
 *
 * "Beyond distance and speed": the true cost of a session isn't the kilometres — it's
 * the cuts, the hard accelerations, and (most of all) the decelerations, plus the peak
 * metabolic power the athlete had to produce. This is the read Hudl validated by buying
 * ADI. MicroPulse is IMA-native, so we already carry the raw ingredients as session
 * summaries; this engine turns them into a personal-norm mechanical-demand index.
 *
 * MECHANICAL-LOAD INTENSITY (per minute) = (high-intensity IMA efforts + gen2 accel
 * efforts + gen2 decel efforts) ÷ session minutes. That is the density of high-cost
 * mechanical actions — the "cost of cuts and decelerations". It is read ONLY on the
 * player's own rolling baseline (100 = his average session), because the absolute AU
 * mixes count families and is not comparable across athletes or vendors.
 *
 * PEAK METABOLIC POWER (metabolic_power_peak, W/kg) is surfaced as-is — the single most
 * demanding instant of energy expenditure the session reached — alongside average
 * metabolic power per minute. di Prampero's model is contested in football for absolute
 * accounting, so it too is read on the personal norm, never as a cross-athlete ranking.
 *
 * MOVEMENT PROFILE (linear vs multidirectional, braking- vs accelerative-biased) is NOT
 * recomputed here — the caller pairs this with the existing directionalSignature
 * (ima_clock_gen2) and decelNarrative engines. This file stays a pure numeric read.
 *
 * HONEST PROVENANCE:
 *   - Mechanical-load intensity sums three DIFFERENT count families (IMA high-tier,
 *     accel gen2, decel gen2). The mix is a deliberate density proxy, not a calibrated
 *     load. Personal-norm only.
 *   - metabolic_power_peak requires the metabolic export; absent → null, never 0.
 *   - session_duration_minutes gates the per-minute rates; a session with no duration
 *     yields null rates, not a divide-by-zero.
 *   - Descriptive context. NEVER feeds the readiness colour, load target, or daily decision.
 *
 * Cite: di Prampero 2015 (metabolic power) · McBurnie 2022 (deceleration cost) ·
 *       Buchheit 2014 (IMA / inertial movement analysis).
 */

/** A plain-language string in both UI languages. */
export type Bi = { en: string; is: string };
export type Confidence = "low" | "medium" | "high";

/** Where this session's mechanical demand sits vs the player's own norm. */
export type MechDemand = "low" | "typical" | "high" | "insufficient";

/** One session's mechanical inputs for a player (session-summary columns). */
export interface MechRow {
  date: string;
  /** Count of high-intensity IMA efforts (high tier of ima_clock_gen2). Null if absent. */
  imaHigh: number | null;
  /** gen2 accel efforts, band 2–3 (accel_b2_3_tot_effs_gen2). Null if absent. */
  accelEfforts: number | null;
  /** gen2 decel efforts, band 2–3 (decel_b2_3_tot_effs_gen2). Null if absent. */
  decelEfforts: number | null;
  /** Peak metabolic power reached, W/kg (metabolic_power_peak). Null if absent. */
  metabolicPeak: number | null;
  /** Average metabolic power, W/kg (metabolic_power). Null if absent. */
  metabolicAvg: number | null;
  /** Session duration in minutes (session_duration_minutes). Gates the per-minute rates. */
  durationMin: number | null;
  /** PlayerLoad (total_player_load) — used to DERIVE minutes when durationMin is absent. */
  playerLoad?: number | null;
  /** PlayerLoad per minute (player_load_per_minute) — the other half of the duration fallback. */
  loadPerMin?: number | null;
}

export interface MechSession {
  date: string;
  /** High-cost mechanical actions per minute (personal-norm use only). Null if no inputs / no duration. */
  mechIntensity: number | null;
  /** Mechanical intensity vs the player's own baseline (100 = average session). */
  mechIndex: number | null;
  /** Peak metabolic power reached, W/kg. */
  metabolicPeak: number | null;
  /** Peak metabolic power vs the player's own baseline (100 = average). */
  metabolicPeakIndex: number | null;
  /** Average metabolic power per minute of the session, W/kg. */
  metabolicPerMin: number | null;
  demand: MechDemand;
  verdict: Bi;
}

export interface MechRead {
  latest: MechSession | null;
  history: MechSession[];
  baseline: { avgMechIntensity: number | null; avgMetabolicPeak: number | null; sessions: number };
  confidence: Confidence;
  dataCoverage: { hasMech: boolean; hasMetabolicPeak: boolean; sessions: number };
  citation: string;
  caveat: Bi;
}

/**
 * Personal-norm index points beyond the average at which a session is called HIGH (or,
 * symmetrically, LOW) mechanical demand rather than an ordinary day. A quarter of the
 * player's own average — provisional, tuned to skip normal session-to-session wobble.
 */
export const MECH_DEMAND_BAND = 25;

/** Baselines below this many mechanical sessions are immature → confidence capped low. */
export const MIN_MATURE_MECH_SESSIONS = 4;

const CITATION =
  "di Prampero 2015 (metabolic power) · McBurnie 2022 (deceleration cost) · Buchheit 2014 (IMA)";

const CAVEAT: Bi = {
  en: "Mechanical-load intensity is the density of high-cost actions (high-intensity IMA efforts + hard accelerations + decelerations per minute) — a deliberate proxy that mixes count families, so it's read only on the player's own norm, never as an absolute or a cross-athlete ranking. Peak metabolic power (W/kg) needs the Catapult metabolic export; di Prampero's model is contested for absolute accounting in football, so it too is a personal-norm read. Descriptive load context — it never changes the readiness verdict or the daily plan.",
  is: "Vélræn álags-ákefð er þéttleiki hákostnaðar-aðgerða (hákröftug IMA-átök + snörp hröðun + hraðaminnkun á mínútu) — meðvituð nálgun sem blandar talningar-fjölskyldum, svo hún er einungis lesin á persónulegri viðmiðun leikmannsins, aldrei sem alger tala eða röðun milli leikmanna. Hámarks efnaskiptaafl (W/kg) þarf metabolic-útflutninginn frá Catapult; líkan di Prampero er umdeilt fyrir algert bókhald í fótbolta, svo það er líka persónuleg-viðmiðunar lestur. Lýsandi álags-samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Session minutes — the stored `session_duration_minutes` when present, else DERIVED from
 * PlayerLoad ÷ PlayerLoad-per-minute (Catapult populates the rate on nearly every session
 * even when the duration column is empty). Null when neither is available.
 */
export function effectiveDurationMin(row: MechRow): number | null {
  const d = num(row.durationMin);
  if (d !== null && d > 0) return d;
  const pl = num(row.playerLoad);
  const pm = num(row.loadPerMin);
  return pl !== null && pm !== null && pm > 0 ? pl / pm : null;
}

/**
 * High-cost mechanical actions per minute for one session. Sums the three high-cost
 * count families that are present (missing families are skipped, not treated as 0) and
 * divides by the session minutes. Null when no count family or no duration is available.
 */
export function mechIntensityFor(row: MechRow): number | null {
  const dur = effectiveDurationMin(row);
  if (dur === null || dur <= 0) return null;
  const parts = [num(row.imaHigh), num(row.accelEfforts), num(row.decelEfforts)].filter(
    (v): v is number => v !== null,
  );
  if (parts.length === 0) return null;
  const total = parts.reduce((a, b) => a + b, 0);
  return total / dur;
}

function verdictFor(demand: MechDemand): Bi {
  switch (demand) {
    case "high":
      return {
        en: "A high mechanical-demand session for him — more cutting, braking and hard efforts per minute than his usual.",
        is: "Vélrænt krefjandi lota fyrir hann — meira af skurðum, hemlun og snörpum átökum á mínútu en venjulega.",
      };
    case "low":
      return {
        en: "A light mechanical session for him — fewer high-cost actions per minute than his usual.",
        is: "Vélrænt létt lota fyrir hann — færri hákostnaðar-aðgerðir á mínútu en venjulega.",
      };
    case "typical":
      return {
        en: "Typical mechanical demand for him — in line with his usual density of cuts and decelerations.",
        is: "Dæmigerð vélræn krafa fyrir hann — í takt við venjulegan þéttleika skurða og hraðaminnkunar.",
      };
    default:
      return {
        en: "Not enough mechanical sessions yet to place this against his norm.",
        is: "Ekki nægar vélrænar lotur enn til að staðsetja þetta gegn viðmiðun hans.",
      };
  }
}

/**
 * Compute the mechanical-power read for ONE player from their recent daily rows. Pure:
 * no I/O. Feed a ~28-day window; the personal baseline is the mean over every row given.
 * The last chronological row is "latest".
 */
export function computeMechanicalPower(rows: MechRow[]): MechRead {
  const sorted = [...(rows ?? [])]
    .filter((r) => r && typeof r.date === "string")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const rawMech = sorted.map(mechIntensityFor);
  const rawPeak = sorted.map((r) => num(r.metabolicPeak));

  const mechVals = rawMech.filter((v): v is number => v !== null);
  const peakVals = rawPeak.filter((v): v is number => v !== null);
  const avgMech = mean(mechVals);
  const avgPeak = mean(peakVals);

  const dataCoverage = {
    hasMech: mechVals.length > 0,
    hasMetabolicPeak: peakVals.length > 0,
    sessions: sorted.length,
  };

  const history: MechSession[] = sorted.map((row, i) => {
    const mech = rawMech[i];
    const peak = rawPeak[i];
    const dur = effectiveDurationMin(row);
    const metAvg = num(row.metabolicAvg);
    const mechIndex = mech !== null && avgMech && avgMech > 0 ? (mech / avgMech) * 100 : null;
    const peakIndex = peak !== null && avgPeak && avgPeak > 0 ? (peak / avgPeak) * 100 : null;

    let demand: MechDemand = "insufficient";
    // The index only means something once the personal baseline is mature.
    if (mechIndex !== null && mechVals.length >= MIN_MATURE_MECH_SESSIONS) {
      if (mechIndex >= 100 + MECH_DEMAND_BAND) demand = "high";
      else if (mechIndex <= 100 - MECH_DEMAND_BAND) demand = "low";
      else demand = "typical";
    }

    return {
      date: row.date,
      mechIntensity: mech === null ? null : r1(mech),
      mechIndex: mechIndex === null ? null : r1(mechIndex),
      metabolicPeak: peak,
      metabolicPeakIndex: peakIndex === null ? null : r1(peakIndex),
      metabolicPerMin: metAvg !== null && dur !== null && dur > 0 ? r1(metAvg) : metAvg,
      demand,
      verdict: verdictFor(demand),
    };
  });

  const latest = history.length ? history[history.length - 1] : null;

  let confidence: Confidence = "low";
  if (mechVals.length >= MIN_MATURE_MECH_SESSIONS) {
    confidence = mechVals.length >= MIN_MATURE_MECH_SESSIONS * 2 ? "high" : "medium";
  }

  return {
    latest,
    history,
    baseline: {
      avgMechIntensity: avgMech === null ? null : r1(avgMech),
      avgMetabolicPeak: avgPeak === null ? null : r1(avgPeak),
      sessions: sorted.length,
    },
    confidence,
    dataCoverage,
    citation: CITATION,
    caveat: CAVEAT,
  };
}
