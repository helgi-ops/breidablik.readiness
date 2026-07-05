/**
 * Return-to-training engine (pure, testable).
 *
 * Method: aggregate the player's sessions into WEEKS (the natural unit for load
 * accumulation and ACWR), then bridge floor → ceiling week by week.
 *   • Ceiling = his own HEALTHY WEEKLY load — a robust percentile of his healthy
 *     weeks' totals, MATCHES INCLUDED (a normal healthy week has a match), never
 *     injured-window weeks, never a squad average, never a single freak session.
 *   • Floor = his most recent weekly load (may be rehab — that's where he is now).
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

export type QualityKey = "volume" | "distance" | "hsr" | "sprint" | "accel" | "decel" | "decelHigh" | "cod";
export const QUALITY_ORDER: QualityKey[] = ["volume", "distance", "hsr", "sprint", "accel", "decel", "decelHigh", "cod"];

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
  cod: number;        // change-of-direction load (IMA CoD total)
  codLeft: number;    // IMA CoD to the left (for asymmetry)
  codRight: number;   // IMA CoD to the right
  topSpeed: number;   // max_velocity (km/h)
};

export type RttInput = {
  sessions: RttSession[];
  refDate: string;
  rttStartDate?: string | null;
  currentlyInjured: boolean;
  weeks?: number;               // default = number of qualities
  headInjury?: boolean;
  riskQualities?: QualityKey[];
};

export function injuryRiskProfile(types: string[]): { category: string; riskQualities: QualityKey[]; label: { en: string; is: string } } {
  const t = types.join(" ").toLowerCase();
  const m = (re: RegExp) => re.test(t);
  if (m(/concuss|head|hia/)) return { category: "head", riskQualities: [], label: { en: "Head injury — symptom-limited return", is: "Höfuðáverki — einkenna-stýrð endurkoma" } };
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
export type RttResult = {
  currentlyInjured: boolean;
  unit: "week";
  baseline: RttBaseline;
  floor: RttFloor;
  asymmetry: RttAsymmetry;
  plan: { verdict: string; weeks: RttWeekTarget[] } | null;
  confidence: "high" | "medium" | "low";
};

const RAMP = 1.10;
const RAMP_CAUTION = 1.07;
const P_CEILING = 0.85;
const REINTRO_FRAC = 0.30;
const REINTRO_CAUTION = 0.20;
const ASYM_TOLERANCE = 12; // percentage-points from healthy L/R balance to flag

const QLABEL: Record<QualityKey, { en: string; is: string; unit: string; dp: number }> = {
  volume:    { en: "Weekly player load", is: "Vikuálag", unit: "", dp: 0 },
  distance:  { en: "Weekly distance", is: "Vikuvegalengd", unit: "m", dp: 0 },
  hsr:       { en: "Weekly high-speed running", is: "Vikuháhraðahlaup", unit: "m", dp: 0 },
  sprint:    { en: "Weekly sprinting", is: "Vikusprettur", unit: "m", dp: 0 },
  accel:     { en: "Weekly accelerations (IMA)", is: "Hröðun/viku (IMA)", unit: "", dp: 0 },
  decel:     { en: "Weekly decelerations (IMA)", is: "Hemlun/viku (IMA)", unit: "", dp: 0 },
  decelHigh: { en: "Weekly high-intensity braking (IMA)", is: "Háákefðar hemlun/viku (IMA)", unit: "", dp: 0 },
  cod:       { en: "Weekly change of direction (IMA)", is: "Stefnubreytingar/viku (IMA)", unit: "", dp: 0 },
};

const QFIELD: Record<QualityKey, keyof RttSession> = { volume: "load", distance: "distance", hsr: "hsr", sprint: "sprint", accel: "accel", decel: "decel", decelHigh: "decelHigh", cod: "cod" };

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

type WeekAgg = { weekStart: string; injured: boolean; totals: Record<QualityKey, number>; topSpeed: number; codLeft: number; codRight: number };

export function computeReturnToTraining(inp: RttInput): RttResult {
  const weeks = inp.weeks ?? QUALITY_ORDER.length;
  const real = inp.sessions.filter((s) => !s.estimated);

  // Aggregate sessions → weeks (MATCHES INCLUDED — a healthy week has a match).
  const byWeek = new Map<string, WeekAgg>();
  for (const s of real) {
    const wk = weekStart(s.date);
    let a = byWeek.get(wk);
    if (!a) { a = { weekStart: wk, injured: false, totals: Object.fromEntries(QUALITY_ORDER.map((q) => [q, 0])) as Record<QualityKey, number>, topSpeed: 0, codLeft: 0, codRight: 0 }; byWeek.set(wk, a); }
    if (s.injured) a.injured = true;                       // any injured day → not a healthy week
    for (const q of QUALITY_ORDER) a.totals[q] += s[QFIELD[q]] as number;
    if (s.topSpeed > 0 && s.topSpeed <= 45) a.topSpeed = Math.max(a.topSpeed, s.topSpeed);
    a.codLeft += s.codLeft; a.codRight += s.codRight;
  }
  const allWeeks = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const healthyWeeks = allWeeks.filter((w) => !w.injured);
  const recentWeeks = allWeeks.slice(-3);

  // Ceiling = p85 of healthy WEEKLY totals per quality. Floor = median of recent
  // weekly totals. Both are weekly loads the plan ramps between.
  const baseline = { builtFromHealthyWeeks: healthyWeeks.length, topSpeed: 0 } as RttBaseline;
  const floor = { topSpeed: 0 } as RttFloor;
  for (const q of QUALITY_ORDER) {
    const hv = healthyWeeks.map((w) => w.totals[q]).filter((v) => v > 0).sort((a, b) => a - b);
    baseline[q] = round(percentile(hv, P_CEILING), QLABEL[q].dp);
    const rv = recentWeeks.map((w) => w.totals[q]).sort((a, b) => a - b);
    floor[q] = round(percentile(rv, 0.5), QLABEL[q].dp);
  }
  baseline.topSpeed = round(percentile(healthyWeeks.map((w) => w.topSpeed).filter((v) => v > 0).sort((a, b) => a - b), P_CEILING), 1);
  floor.topSpeed = round(percentile(recentWeeks.map((w) => w.topSpeed).filter((v) => v > 0).sort((a, b) => a - b), 0.5), 1);

  // Left/right change-of-direction asymmetry (monitor, not ramp).
  const sum = (arr: WeekAgg[], k: "codLeft" | "codRight") => arr.reduce((s, w) => s + w[k], 0);
  const pct = (l: number, r: number) => (l + r > 0 ? round((100 * l) / (l + r), 0) : null);
  const healthyLeftPct = pct(sum(healthyWeeks, "codLeft"), sum(healthyWeeks, "codRight"));
  const currentLeftPct = pct(sum(recentWeeks, "codLeft"), sum(recentWeeks, "codRight"));
  const asymmetry: RttAsymmetry = {
    healthyLeftPct, currentLeftPct,
    imbalanced: currentLeftPct != null && healthyLeftPct != null && Math.abs(currentLeftPct - healthyLeftPct) >= ASYM_TOLERANCE,
  };

  const confidence: RttResult["confidence"] = healthyWeeks.length >= 4 ? "high" : healthyWeeks.length >= 2 ? "medium" : "low";

  if (inp.currentlyInjured && !inp.rttStartDate) {
    return { currentlyInjured: true, unit: "week", baseline, floor, asymmetry, plan: null, confidence };
  }

  const unlockWeek = (qi: number) => Math.max(1, Math.round(1 + (qi * (weeks - 1)) / (QUALITY_ORDER.length - 1)));
  const targetsByQuality = Object.fromEntries(QUALITY_ORDER.map((q) => [q, [] as number[]])) as Record<QualityKey, number[]>;
  const weekTargets: RttWeekTarget[] = [];
  const riskSet = new Set(inp.riskQualities ?? []);

  for (let w = 1; w <= weeks; w++) {
    let weekAcwr = 0; // the week's LOAD acute:chronic — the guardrail, shared by all qualities
    for (let qi = 0; qi < QUALITY_ORDER.length; qi++) {
      const q = QUALITY_ORDER[qi];
      const uw = unlockWeek(qi);
      const ceiling = baseline[q] || 0;
      const locked = w < uw;
      const risky = riskSet.has(q);
      const ramp = risky ? RAMP_CAUTION : RAMP;
      const reintroFrac = risky ? REINTRO_CAUTION : REINTRO_FRAC;
      const prevArr = targetsByQuality[q];
      const prev = prevArr.length ? prevArr[prevArr.length - 1] : floor[q];

      let target: number;
      if (locked) target = floor[q];
      else if (w === uw) {
        const startFromFloor = floor[q] * ramp;
        const reintro = ceiling * reintroFrac;
        target = Math.min(ceiling || startFromFloor, Math.max(startFromFloor, floor[q] > 0.05 * ceiling ? startFromFloor : reintro));
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

  const w1 = QUALITY_ORDER.filter((_, qi) => unlockWeek(qi) <= 1).map((q) => QLABEL[q].en.toLowerCase().replace("weekly ", ""));
  const verdict = `Week 1 of ${weeks} · rebuild ${w1.join(" + ") || "weekly load"}` + (inp.headInjury ? " · load is a ceiling (symptom-limited return)" : "");

  return { currentlyInjured: inp.currentlyInjured, unit: "week", baseline, floor, asymmetry, plan: { verdict, weeks: weekTargets }, confidence };
}

export { QLABEL as RTT_QUALITY_LABELS };
