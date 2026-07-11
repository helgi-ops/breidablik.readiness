/**
 * Return-to-training engine (pure, testable).
 *
 * Method: aggregate the player's sessions into WEEKS (the natural unit for load
 * accumulation and ACWR), then bridge floor → ceiling week by week.
 *   • Ceiling = his own HEALTHY WEEKLY load — a robust percentile of his healthy
 *     weeks' totals, MATCHES INCLUDED (a normal healthy week has a match), never
 *     injured-window weeks, never a squad average, never a single freak session.
 *   • Floor = his most recent weekly load (may be rehab — that's where he is now).
 *   • Ramp origin & length scale with the LAYOFF. A player out 10 days barely
 *     detrains — he keeps most of his capacity, so the plan starts high and takes
 *     ~2 weeks; a player out 10 weeks genuinely detrains, so it starts low and
 *     takes many. We retain a decaying fraction of the ceiling with layoff days
 *     (detraining curve), take the ramp ORIGIN = max(measured floor, retained ×
 *     ceiling), and derive the number of weeks from how far that origin sits below
 *     the ceiling under the 10%/week climb. Short layoff → short plan.
 *   • Plan = ramps each quality week by week in a fixed clinical order (volume →
 *     distance → HSR → sprint → IMA accel → IMA decel → high-intensity braking →
 *     change-of-direction LAST — the most re-injury-prone), each unlocked only
 *     after the previous, under an ACWR guardrail (≤ ~1.3). The injury type
 *     ramps its own key re-injury qualities slower (see injuryRiskProfile).
 *   • Left/right change-of-direction ASYMMETRY is monitored (not ramped) —
 *     important after a one-sided injury.
 *
 * Rules decide; a narrative layer only explains. ACWR is a spike-size descriptor
 * (Gabbett/Williams), not an injury predictor. For head injuries the load plan is
 * a CEILING, not a stage trigger — graded return is symptom-limited.
 */

export type QualityKey = "volume" | "distance" | "hsr" | "sprint" | "accel" | "decel" | "decelHigh" | "cod" | "efforts";
// Pro/ELITE (IMA) variant — the movement axis comes from IMA bands.
export const QUALITY_ORDER: QualityKey[] = ["volume", "distance", "hsr", "sprint", "accel", "decel", "decelHigh", "cod"];
// Core/Lite (GPS) variant — no IMA; the club sends accel_decel_efforts instead,
// so the movement/agility axis is a single "efforts" quality. See
// efforts-vs-ima-tier-complementary: Core sends efforts, Pro sends IMA.
export const QUALITY_ORDER_GPS: QualityKey[] = ["volume", "distance", "hsr", "sprint", "efforts"];
const ALL_QUALITIES: QualityKey[] = ["volume", "distance", "hsr", "sprint", "accel", "decel", "decelHigh", "cod", "efforts"];
export type RttVariant = "ima" | "gps";
export function qualityOrderForVariant(variant: RttVariant): QualityKey[] {
  return variant === "gps" ? QUALITY_ORDER_GPS : QUALITY_ORDER;
}

export type RttSession = {
  date: string;
  injured: boolean;
  isMatch: boolean;
  estimated: boolean;
  load: number;       // total_player_load
  distance: number;   // total_distance (m)
  hsr: number;        // high_speed_distance (m)
  sprint: number;     // sprint_distance (m)
  accel: number;      // IMA accelerations (count)
  decel: number;      // IMA decelerations (count)
  decelHigh: number;  // high-intensity braking (ima_band3_decel_count) — injury-critical
  cod: number;        // high-intensity change-of-direction (IMA CoD high+medium bands) — re-injury-critical; excludes the low/jogging band
  codLeft: number;    // IMA CoD to the left, all bands (for asymmetry)
  codRight: number;   // IMA CoD to the right, all bands (for asymmetry)
  efforts: number;    // accel_decel_efforts (Core/Lite GPS agility proxy; no IMA)
  topSpeed: number;   // max_velocity (km/h)
  /** Did the pod get a GPS lock this session? An indoor/gym session logs valid
   *  PlayerLoad + IMA but ~0 GPS distance/speed — those rows must NOT contribute
   *  their near-zero distance/HSR/sprint to the ramp. Undefined = treat as valid. */
  gpsValid?: boolean;
};

export type RttInput = {
  sessions: RttSession[];
  refDate: string;
  rttStartDate?: string | null;
  currentlyInjured: boolean;
  layoffDays?: number | null;   // days out (injury start → return/now). Drives ramp origin & length.
  weeks?: number;               // hard override of the derived plan length
  headInjury?: boolean;
  riskQualities?: QualityKey[];
  variant?: RttVariant;         // "ima" (Pro) default, or "gps" (Core/Lite — efforts, no IMA)
};

export function injuryRiskProfile(types: string[]): { category: string; riskQualities: QualityKey[]; label: { en: string; is: string } } {
  const t = types.join(" ").toLowerCase();
  const m = (re: RegExp) => re.test(t);
  if (m(/concuss|head|hia|heilahrist|höfu|hofu|hnakk/)) return { category: "head", riskQualities: [], label: { en: "Head injury — symptom-limited return", is: "Höfuðáverki — einkenna-stýrð endurkoma" } };
  if (m(/hamstring|ham\b|biceps femoris/)) return { category: "hamstring", riskQualities: ["hsr", "sprint", "decel", "decelHigh"], label: { en: "Hamstring — high-speed running & braking are the key re-injury qualities", is: "Aftanlæri — háhraðahlaup og hemlun eru lykil-endurmeiðsla-gæðin" } };
  if (m(/calf|gastroc|soleus|achill/)) return { category: "calf", riskQualities: ["hsr", "sprint"], label: { en: "Calf/Achilles — high-speed & sprint running ramp slowly", is: "Kálfi/hásin — háhraði og sprettir aukast hægt" } };
  if (m(/quad|rectus femoris/)) return { category: "quad", riskQualities: ["sprint", "accel"], label: { en: "Quadriceps — sprinting & acceleration ramp slowly", is: "Framlæri — sprettir og hröðun aukast hægt" } };
  if (m(/groin|adduct/)) return { category: "groin", riskQualities: ["cod", "sprint"], label: { en: "Groin/adductor — change-of-direction & sprint ramp slowly", is: "Nári — stefnubreytingar og sprettir aukast hægt" } };
  if (m(/acl|knee|mcl|meniscus|patell/)) return { category: "knee", riskQualities: ["cod", "decel", "decelHigh", "accel"], label: { en: "Knee — change-of-direction & braking are the key re-injury qualities", is: "Hné — stefnubreytingar og hemlun eru lykil-endurmeiðsla-gæðin" } };
  if (m(/ankle|lateral ligament|syndesmo/)) return { category: "ankle", riskQualities: ["cod", "decel", "decelHigh"], label: { en: "Ankle — change-of-direction & braking ramp slowly", is: "Ökkli — stefnubreytingar og hemlun aukast hægt" } };
  if (m(/hip|flexor/)) return { category: "hip", riskQualities: ["sprint", "cod"], label: { en: "Hip — sprint & change-of-direction ramp slowly", is: "Mjöðm — sprettir og stefnubreytingar aukast hægt" } };
  if (m(/muscle|strain|tear/)) return { category: "muscle", riskQualities: ["hsr", "sprint", "decelHigh"], label: { en: "Muscle strain — high-speed running & hard braking ramp slowly", is: "Vöðvatognun — háhraðahlaup og hörð hemlun aukast hægt" } };
  return { category: "general", riskQualities: ["sprint", "cod"], label: { en: "Ramping the most re-injury-prone qualities slowly", is: "Aukum þau gæði sem eru mest endurmeiðsla-hætt hægt" } };
}

export type RttBaseline = Record<QualityKey, number> & { builtFromHealthyWeeks: number; topSpeed: number };
export type RttFloor = Record<QualityKey, number> & { topSpeed: number };
export type RttAsymmetry = { healthyLeftPct: number | null; currentLeftPct: number | null; imbalanced: boolean };
export type RttWeekTarget = {
  week: number; quality: QualityKey;
  target: number; pctOfHealthy: number; wow: number; acwr: number;
  locked: boolean; unlockWeek: number; caution: boolean; why: string;
};
export type RttLayoff = { days: number | null; retainedPct: number | null; rampWeeks: number };
export type RttAdherenceCell = { quality: QualityKey; target: number; actual: number; deltaPct: number; status: "under" | "on" | "over" };
export type RttAdherenceWeek = { week: number; weekStart: string; sessions: number; estimatedSessions: number; inProgress: boolean; cells: RttAdherenceCell[] };
export type RttResult = {
  currentlyInjured: boolean;
  unit: "week";
  baseline: RttBaseline;
  floor: RttFloor;
  rampFrom: RttFloor;   // detraining-adjusted week-1 origin per quality (≥ measured floor)
  layoff: RttLayoff;
  asymmetry: RttAsymmetry;
  plan: { verdict: string; currentWeek: number; weeks: RttWeekTarget[] } | null;
  adherence: RttAdherenceWeek[]; // actual weekly load vs the recommended ramp, per elapsed plan week
  confidence: "high" | "medium" | "low";
  variant: RttVariant;           // which data axis this plan is built on
  qualityOrder: QualityKey[];    // the qualities in play for this variant (render order)
};

const RAMP = 1.10;
const RAMP_CAUTION = 1.07;
const P_CEILING = 0.85;
const REINTRO_FRAC = 0.30;
const REINTRO_CAUTION = 0.20;
const ASYM_TOLERANCE = 12; // percentage-points from healthy L/R balance to flag
const ADHERE_BAND = 15;    // ±% around the recommended target that still counts as "on plan"
const DETRAIN_TAU = 50;    // days — capacity decay constant of the detraining curve
const DETRAIN_FLOOR = 0.35; // never assume <35% retained (he's still a trained athlete)
const MIN_RAMP_WEEKS = 2;
const MAX_RAMP_WEEKS = 12;

/**
 * Fraction of healthy capacity retained after `layoffDays` out. ~1.0 for a few
 * days off, decaying toward DETRAIN_FLOOR over months (detraining literature:
 * meaningful aerobic/neuromuscular loss builds after ~2 weeks). This sets how
 * high the plan starts and — via the load bridge — how many weeks it needs.
 */
export function retainedFraction(layoffDays: number): number {
  if (!Number.isFinite(layoffDays) || layoffDays <= 3) return 1;
  return DETRAIN_FLOOR + (1 - DETRAIN_FLOOR) * Math.exp(-(layoffDays - 3) / DETRAIN_TAU);
}

const QLABEL: Record<QualityKey, { en: string; is: string; unit: string; dp: number }> = {
  volume:    { en: "Weekly player load", is: "Vikuálag", unit: "", dp: 0 },
  distance:  { en: "Weekly distance", is: "Vikuvegalengd", unit: "m", dp: 0 },
  hsr:       { en: "Weekly high-speed running", is: "Vikuháhraðahlaup", unit: "m", dp: 0 },
  sprint:    { en: "Weekly sprinting", is: "Vikusprettur", unit: "m", dp: 0 },
  accel:     { en: "Weekly accelerations (IMA)", is: "Hröðun/viku (IMA)", unit: "", dp: 0 },
  decel:     { en: "Weekly decelerations (IMA)", is: "Hemlun/viku (IMA)", unit: "", dp: 0 },
  decelHigh: { en: "Weekly high-intensity braking (IMA)", is: "Háákefðar hemlun/viku (IMA)", unit: "", dp: 0 },
  cod:       { en: "Weekly high-intensity change of direction (IMA)", is: "Háákefðar stefnubreytingar/viku (IMA)", unit: "", dp: 0 },
  efforts:   { en: "Weekly efforts (accel + decel)", is: "Átök/viku (hröðun + hemlun)", unit: "", dp: 0 },
};

const QFIELD: Record<QualityKey, keyof RttSession> = { volume: "load", distance: "distance", hsr: "hsr", sprint: "sprint", accel: "accel", decel: "decel", decelHigh: "decelHigh", cod: "cod", efforts: "efforts" };
// GPS-derived qualities — invalid (must be skipped) when the pod got no GPS lock.
// PlayerLoad + IMA (volume/accel/decel/decelHigh/cod) stay valid indoors.
const GPS_DERIVED = new Set<QualityKey>(["distance", "hsr", "sprint", "efforts"]);

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}
const round = (v: number, dp = 0) => { const f = 10 ** dp; return Math.round(v * f) / f; };
const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

/** Monday of the ISO week containing dateIso. */
function weekStart(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}
function addDays(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type WeekAgg = { weekStart: string; injured: boolean; count: number; totals: Record<QualityKey, number>; topSpeed: number; codLeft: number; codRight: number };

/** Aggregate a session list into weekly totals (Monday-based). MATCHES INCLUDED. */
function aggregateWeeks(sessions: RttSession[], order: QualityKey[]): Map<string, WeekAgg> {
  const byWeek = new Map<string, WeekAgg>();
  for (const s of sessions) {
    const wk = weekStart(s.date);
    let a = byWeek.get(wk);
    if (!a) { a = { weekStart: wk, injured: false, count: 0, totals: Object.fromEntries(ALL_QUALITIES.map((q) => [q, 0])) as Record<QualityKey, number>, topSpeed: 0, codLeft: 0, codRight: 0 }; byWeek.set(wk, a); }
    if (s.injured) a.injured = true;                       // any injured day → not a healthy week
    a.count += 1;
    const gpsOk = s.gpsValid !== false; // no GPS lock → skip GPS-derived qualities (keep PlayerLoad/IMA)
    for (const q of order) { if (GPS_DERIVED.has(q) && !gpsOk) continue; a.totals[q] += s[QFIELD[q]] as number; }
    if (gpsOk && s.topSpeed > 0 && s.topSpeed <= 45) a.topSpeed = Math.max(a.topSpeed, s.topSpeed);
    a.codLeft += s.codLeft; a.codRight += s.codRight;
  }
  return byWeek;
}

export function computeReturnToTraining(inp: RttInput): RttResult {
  // Variant picks the movement axis: IMA (Pro) or efforts (Core/Lite GPS).
  const variant: RttVariant = inp.variant ?? "ima";
  const order = qualityOrderForVariant(variant);
  const real = inp.sessions.filter((s) => !s.estimated);

  // Two aggregations: the HEALTHY baseline / floor / asymmetry use REAL sessions
  // only (a pod-estimate must not define his norm). Adherence — what he ACTUALLY
  // did this ramp week — uses ALL sessions, so a session he did but forgot his
  // pod for (estimated from a team-mate) still counts toward his weekly load.
  const byWeek = aggregateWeeks(real, order);
  const byWeekAll = aggregateWeeks(inp.sessions, order);
  const allWeeks = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const healthyWeeks = allWeeks.filter((w) => !w.injured);
  const recentWeeks = allWeeks.slice(-3);

  // Ceiling = p85 of healthy WEEKLY totals per quality. Floor = median of recent
  // weekly totals. Both are weekly loads the plan ramps between.
  const baseline = { builtFromHealthyWeeks: healthyWeeks.length, topSpeed: 0 } as RttBaseline;
  const floor = { topSpeed: 0 } as RttFloor;
  for (const q of ALL_QUALITIES) { baseline[q] = 0; floor[q] = 0; } // keep the Record complete
  for (const q of order) {
    const hv = healthyWeeks.map((w) => w.totals[q]).filter((v) => v > 0).sort((a, b) => a - b);
    baseline[q] = round(percentile(hv, P_CEILING), QLABEL[q].dp);
    const rv = recentWeeks.map((w) => w.totals[q]).sort((a, b) => a - b);
    floor[q] = round(percentile(rv, 0.5), QLABEL[q].dp);
  }
  baseline.topSpeed = round(percentile(healthyWeeks.map((w) => w.topSpeed).filter((v) => v > 0).sort((a, b) => a - b), P_CEILING), 1);
  floor.topSpeed = round(percentile(recentWeeks.map((w) => w.topSpeed).filter((v) => v > 0).sort((a, b) => a - b), 0.5), 1);

  // Left/right change-of-direction asymmetry (monitor, not ramp). IMA-only —
  // Core/Lite GPS has no directional CoD, so there is nothing to compare.
  const sum = (arr: WeekAgg[], k: "codLeft" | "codRight") => arr.reduce((s, w) => s + w[k], 0);
  const pct = (l: number, r: number) => (l + r > 0 ? round((100 * l) / (l + r), 0) : null);
  const healthyLeftPct = variant === "gps" ? null : pct(sum(healthyWeeks, "codLeft"), sum(healthyWeeks, "codRight"));
  const currentLeftPct = variant === "gps" ? null : pct(sum(recentWeeks, "codLeft"), sum(recentWeeks, "codRight"));
  const asymmetry: RttAsymmetry = {
    healthyLeftPct, currentLeftPct,
    imbalanced: currentLeftPct != null && healthyLeftPct != null && Math.abs(currentLeftPct - healthyLeftPct) >= ASYM_TOLERANCE,
  };

  const confidence: RttResult["confidence"] = healthyWeeks.length >= 4 ? "high" : healthyWeeks.length >= 2 ? "medium" : "low";

  // ── Detraining-scaled ramp origin & length ─────────────────────────────────
  // A short layoff keeps most of the ceiling → start high, few weeks. A long one
  // detrains → start near the measured floor, many weeks. The measured floor is a
  // hard lower bound (never plan below what he's actually doing now).
  const hasLayoff = inp.layoffDays != null && Number.isFinite(inp.layoffDays);
  const retained = hasLayoff ? retainedFraction(inp.layoffDays as number) : null;
  const rampFrom = { topSpeed: floor.topSpeed } as RttFloor;
  for (const q of ALL_QUALITIES) rampFrom[q] = 0;
  for (const q of order) {
    const retainedTarget = retained != null ? round(retained * baseline[q], QLABEL[q].dp) : 0;
    rampFrom[q] = Math.max(floor[q], retainedTarget);
  }
  // Derive plan length from the volume bridge (origin → ceiling under 10%/week),
  // unless the coach hard-overrides. No layoff info → keep the full staged ramp.
  let weeks = inp.weeks ?? order.length;
  if (inp.weeks == null && hasLayoff) {
    const originVol = rampFrom.volume, ceilVol = baseline.volume;
    const bridge = ceilVol > 0 && originVol > 0 && originVol < ceilVol ? Math.ceil(Math.log(ceilVol / originVol) / Math.log(RAMP)) : 0;
    const minWeeks = (inp.riskQualities?.length ?? 0) > 0 ? MIN_RAMP_WEEKS + 1 : MIN_RAMP_WEEKS;
    weeks = Math.min(MAX_RAMP_WEEKS, Math.max(minWeeks, bridge));
  }
  const layoff: RttLayoff = { days: hasLayoff ? Math.round(inp.layoffDays as number) : null, retainedPct: retained != null ? Math.round(retained * 100) : null, rampWeeks: weeks };

  if (inp.currentlyInjured && !inp.rttStartDate) {
    return { currentlyInjured: true, unit: "week", baseline, floor, rampFrom, layoff, asymmetry, plan: null, adherence: [], confidence, variant, qualityOrder: order };
  }

  const unlockWeek = (qi: number) => Math.max(1, Math.round(1 + (qi * (weeks - 1)) / Math.max(1, order.length - 1)));
  const targetsByQuality = Object.fromEntries(order.map((q) => [q, [] as number[]])) as Record<QualityKey, number[]>;
  const weekTargets: RttWeekTarget[] = [];
  // Map the injury's key re-injury qualities onto the active variant: on GPS,
  // IMA-only qualities (accel/decel/decelHigh/cod) fold into "efforts".
  const riskSet = new Set(
    (inp.riskQualities ?? [])
      .map((q) => (order.includes(q) ? q : variant === "gps" ? "efforts" : q))
      .filter((q) => order.includes(q as QualityKey)) as QualityKey[],
  );

  for (let w = 1; w <= weeks; w++) {
    let weekAcwr = 0; // the week's LOAD acute:chronic — the guardrail, shared by all qualities
    for (let qi = 0; qi < order.length; qi++) {
      const q = order[qi];
      const uw = unlockWeek(qi);
      const ceiling = baseline[q] || 0;
      const locked = w < uw;
      const risky = riskSet.has(q);
      const ramp = risky ? RAMP_CAUTION : RAMP;
      const reintroFrac = risky ? REINTRO_CAUTION : REINTRO_FRAC;
      const origin = rampFrom[q];
      const prevArr = targetsByQuality[q];
      const prev = prevArr.length ? prevArr[prevArr.length - 1] : origin;

      let target: number;
      if (locked) target = floor[q];
      else if (w === uw) {
        const startFromOrigin = origin * ramp;
        const reintro = ceiling * reintroFrac;
        target = Math.min(ceiling || startFromOrigin, Math.max(startFromOrigin, origin > 0.05 * ceiling ? startFromOrigin : reintro));
      } else target = Math.min(ceiling, prev * ramp);
      target = round(target, QLABEL[q].dp);
      prevArr.push(target);

      // ACWR is the week's LOAD (volume) acute:chronic — the clinical guardrail.
      // The same value applies to every quality in the week; a per-quality 0→
      // reintroduction must never spike it.
      if (q === "volume") {
        const vt = targetsByQuality.volume;
        const trailing = vt.slice(Math.max(0, vt.length - 4));
        const chronic = trailing.reduce((a, b) => a + b, 0) / trailing.length;
        weekAcwr = chronic > 0 ? round(target / chronic, 2) : 0;
      }
      const acwr = weekAcwr;
      const pctOfHealthy = ceiling > 0 ? Math.round((target / ceiling) * 100) : 0;
      const wow = prev > 0 ? Math.round((target / prev - 1) * 100) : 0;

      weekTargets.push({
        week: w, quality: q, target, pctOfHealthy, wow, acwr, locked, unlockWeek: uw,
        caution: risky && !locked,
        why: locked
          ? `Held — ${QLABEL[q].en} unlocks week ${uw}`
          : `${fmt(target)}${QLABEL[q].unit ? " " + QLABEL[q].unit : ""}/week = ${pctOfHealthy}% of healthy weekly baseline (${fmt(ceiling)})` +
            `${prev > 0 ? `; last ${fmt(prev)}` : ""}${wow ? `; ${wow > 0 ? "+" : ""}${wow}% keeps ACWR at ${acwr.toFixed(2)}` : ""}` +
            `${risky ? " · key re-injury quality — ramping slowly" : ""}`,
      });
    }
  }

  // ── Adherence: actual weekly load vs the recommended ramp ─────────────────
  // Once the plan is started (rttStartDate anchors week 1's Monday), map his
  // REAL sessions into plan weeks and compare each week's actual total to what
  // was recommended. The in-progress week is flagged (partial, don't read
  // "under" as behind). This closes the loop: recommended vs what he did.
  const adherence: RttAdherenceWeek[] = [];
  const anchor = inp.rttStartDate ? weekStart(inp.rttStartDate) : null;
  if (anchor) {
    const refWk = weekStart(inp.refDate);
    const elapsed = Math.max(0, Math.round((Date.parse(refWk) - Date.parse(anchor)) / (7 * 86400000)));
    const lastWeek = Math.min(weeks, elapsed + 1);
    for (let w = 1; w <= lastWeek; w++) {
      const ws = addDays(anchor, 7 * (w - 1));
      const agg = byWeekAll.get(ws);                       // actual = everything he did (incl. pod-estimated)
      const estimatedSessions = (agg?.count ?? 0) - (byWeek.get(ws)?.count ?? 0);
      const cells: RttAdherenceCell[] = order.map((q) => {
        const target = weekTargets.find((t) => t.week === w && t.quality === q)?.target ?? 0;
        const actual = round(agg?.totals[q] ?? 0, QLABEL[q].dp);
        const deltaPct = target > 0 ? Math.round((actual / target - 1) * 100) : actual > 0 ? 100 : 0;
        const status: RttAdherenceCell["status"] = deltaPct > ADHERE_BAND ? "over" : deltaPct < -ADHERE_BAND ? "under" : "on";
        return { quality: q, target, actual, deltaPct, status };
      });
      adherence.push({ week: w, weekStart: ws, sessions: agg?.count ?? 0, estimatedSessions, inProgress: ws === refWk, cells });
    }
  }

  const currentWeek = adherence.length ? adherence[adherence.length - 1].week : 1;
  const w1 = order.filter((_, qi) => unlockWeek(qi) <= 1).map((q) => QLABEL[q].en.toLowerCase().replace("weekly ", ""));
  const layoffNote = layoff.days != null ? ` · ${layoff.days}-day layoff (~${layoff.retainedPct}% capacity retained)` : "";
  const verdict = `Week ${currentWeek} of ${weeks} · ${currentWeek === 1 ? "rebuild" : "rebuilding"} ${w1.join(" + ") || "weekly load"}${layoffNote}` + (inp.headInjury ? " · load is a ceiling (symptom-limited return)" : "");

  return { currentlyInjured: inp.currentlyInjured, unit: "week", baseline, floor, rampFrom, layoff, asymmetry, plan: { verdict, currentWeek, weeks: weekTargets }, adherence, confidence, variant, qualityOrder: order };
}

export { QLABEL as RTT_QUALITY_LABELS };

// ── Today's session recommendation ───────────────────────────────────────────
// Turns the WEEKLY graded plan into a single "today" recommendation, shared by
// the coach RTT page and the player's own Today card so they can never drift.
// today[q] = (this week's target − what's already done this week) ÷ sessions
// still to come. Plus a session-type steer: LOCOMOTIVE (running: distance / HSR
// / sprint) vs MECHANICAL (change of direction & braking: accel / decel /
// high-decel / CoD), or MIXED when balanced — pick the axis he's most behind on
// this week, among UNLOCKED qualities (held qualities aren't introduced yet).
// GPS = Engine, IMA = Driver (Niklas Virtanen); mechanical vs locomotor load
// separation — Vanrenterghem 2017.

export type RttSessionType = "locomotive" | "mechanical" | "mixed";
export type RttTodayQuality = { key: QualityKey; weekly: number; done: number; remaining: number; today: number; pctOfHealthy: number };
export type RttTodayRecommendation = {
  currentWeek: number;
  totalWeeks: number;
  sessionsDone: number;
  plannedSessions: number;
  remainingSessions: number;
  qualities: RttTodayQuality[];            // unlocked, target > 0
  held: Array<{ key: QualityKey; unlockWeek: number }>;
  sessionType: RttSessionType;
  locoFrac: number;
  mechFrac: number;
};

const RTT_LOCO_Q = new Set<QualityKey>(["distance", "hsr", "sprint"]);
const RTT_MECH_Q = new Set<QualityKey>(["accel", "decel", "decelHigh", "cod"]);
const RTT_DEFAULT_SESSIONS = 4;

/** `plannedSessions` = the coach's Week-setup session count for this week, or
 *  null → defaults to RTT_DEFAULT_SESSIONS. Pure. */
export function buildRttTodayRecommendation(
  result: RttResult,
  plannedSessions: number | null,
): RttTodayRecommendation | null {
  const plan = result.plan;
  if (!plan) return null;
  const currentWeek = plan.currentWeek;
  const totalWeeks = Math.max(1, ...plan.weeks.map((w) => w.week));
  const targets = plan.weeks.filter((w) => w.week === currentWeek);
  if (!targets.length) return null;

  const adh = result.adherence.find((a) => a.week === currentWeek) ?? null;
  const doneByQ = new Map<QualityKey, number>((adh?.cells ?? []).map((c) => [c.quality, c.actual]));
  const sessionsDone = adh?.sessions ?? 0;
  const planned = plannedSessions ?? RTT_DEFAULT_SESSIONS;
  const remainingSessions = Math.max(1, planned - sessionsDone);

  const qualities: RttTodayQuality[] = targets
    .filter((w) => !w.locked && w.target > 0)
    .map((w) => {
      const done = doneByQ.get(w.quality) ?? 0;
      const remaining = Math.max(0, w.target - done);
      return { key: w.quality, weekly: w.target, done, remaining, today: Math.round(remaining / remainingSessions), pctOfHealthy: w.pctOfHealthy };
    });
  const held = targets.filter((w) => w.locked).map((w) => ({ key: w.quality, unlockWeek: w.unlockWeek }));

  const axis = (set: Set<QualityKey>) => {
    const items = qualities.filter((q) => set.has(q.key));
    const wk = items.reduce((s, q) => s + q.weekly, 0);
    const rem = items.reduce((s, q) => s + q.remaining, 0);
    return { available: items.length > 0 && wk > 0, frac: wk > 0 ? rem / wk : 0 };
  };
  const loco = axis(RTT_LOCO_Q);
  const mech = axis(RTT_MECH_Q);
  const sessionType: RttSessionType =
    loco.available && !mech.available ? "locomotive"
    : mech.available && !loco.available ? "mechanical"
    : !loco.available && !mech.available ? "mixed"
    : Math.abs(loco.frac - mech.frac) < 0.12 ? "mixed"
    : loco.frac > mech.frac ? "locomotive" : "mechanical";

  return { currentWeek, totalWeeks, sessionsDone, plannedSessions: planned, remainingSessions, qualities, held, sessionType, locoFrac: loco.frac, mechFrac: mech.frac };
}
