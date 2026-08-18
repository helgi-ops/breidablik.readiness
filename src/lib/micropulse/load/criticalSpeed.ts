/**
 * Critical Speed (CS) + D′ — the running (field-sport) form of the critical-power model,
 * fitted from the DISTANCE power curve we already populate. CS is a speed (the pace he can
 * sustain), D′ is a distance reserve in metres (work available above CS). The watts form
 * (critical power / W′) is NOT available on a GPS feed — see the feasibility brief — so this
 * is CS/D′ only.
 *
 * MODEL — two-parameter critical-speed, distance–time linear form:
 *   D(t) = D′ + CS · t          (t = window length, D = peak distance in that window)
 * fitted by ordinary least squares over the player's season-best distance curve.
 *
 * ⚠️ UNITS: peakPeriod.ts stores the distance curve value as PER-MINUTE intensity (m/min),
 * i.e. point.value = D(t) / t (miiPeakPeriod.ts divides the cumulative interval by windowMin).
 * So we reconstruct D_i = point.value × point.windowMin before regressing. CS comes out in
 * m/min → also exposed as km/h (×0.06) and m/s (÷60); D′ in metres.
 *
 * Descriptive load/conditioning context ONLY — it must NEVER feed the readiness colour, the
 * load target, or the daily decision (same rule as peakPeriod.ts). Pure, no I/O.
 *
 * Cite: Pettitt 2016 (CS & D′ from distance) · Monod & Scherrer 1965 (power-duration) ·
 * Morton & Billat 2004 (intermittent running).
 */

import type { PowerCurve, Bi, Confidence } from "./peakPeriod";
import { MIN_MATURE_PEAKPERIOD_SESSIONS } from "./peakPeriod";

export interface CriticalSpeedRead {
  metric: string;                 // "distance"
  csMetresPerMin: number | null;  // slope
  csKmh: number | null;           // csMetresPerMin × 0.06
  csMs: number | null;            // csMetresPerMin ÷ 60
  dPrimeM: number | null;         // intercept, metres
  rSquared: number | null;        // fit quality 0–1
  nPoints: number;                // windows used in the fit
  csPercentile: number | null;    // vs squad, when squad CS values supplied
  dPrimePercentile: number | null;
  confidence: Confidence;         // "low" | "medium" | "high"
  verdict: Bi;                    // one plain-language line, EN + IS
  citation: string;
  caveat: Bi;
}

const CITATION = "Pettitt 2016 (critical speed & D′ from distance) · Monod & Scherrer 1965 (power-duration) · Morton & Billat 2004 (intermittent running)";

const CAVEAT: Bi = {
  en: "CS/D′ is the running form of the critical-power model, fitted from the peak distance at each window (1/3/5 min). It's a field estimate from maximal observed efforts, not a test to exhaustion — and with only three points in the 1–5 min band, D′ (the intercept) is the uncertain parameter. Descriptive context — it never changes the readiness verdict or the daily plan.",
  is: "CS/D′ er hlaupa-útgáfa critical-power líkansins, metin úr hámarks-vegalengd í hverjum glugga (1/3/5 mín). Þetta er vallar-mat úr hámarks-átökum sem sáust, ekki próf til örmögnunar — og með aðeins þrjá punkta í 1–5 mín bandinu er D′ (skurðpunkturinn) óvissi þátturinn. Lýsandi samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

const INSUFFICIENT: Bi = {
  en: "Not enough of a curve yet to fit critical speed reliably.",
  is: "Ekki næg kúrfa enn til að meta critical speed áreiðanlega.",
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Percentile rank (0–100) of `target` within `pool` (self-inclusive). Null if pool < 2. */
function percentile(target: number, pool: Array<number | null>): number | null {
  const vals = pool.filter((v): v is number => num(v) !== null);
  if (vals.length <= 1) return null;
  let below = 0, equal = 0;
  for (const v of vals) { if (v < target) below += 1; else if (v === target) equal += 1; }
  const rank = below + 0.5 * Math.max(0, equal - 1);
  return Math.round((rank / (vals.length - 1)) * 100);
}

function insufficientRead(metric: string, nPoints: number): CriticalSpeedRead {
  return {
    metric, csMetresPerMin: null, csKmh: null, csMs: null, dPrimeM: null, rSquared: null,
    nPoints, csPercentile: null, dPrimePercentile: null, confidence: "low",
    verdict: INSUFFICIENT, citation: CITATION, caveat: CAVEAT,
  };
}

/** Fit CS + D′ from ONE metric's power curve (default "distance"). Pure.
 *  opts.isTest = the points are genuine maximal test efforts (not observed peaks), so 2
 *  points are trustworthy — confidence is not gated on session maturity or nPoints≥3. */
export function computeCriticalSpeed(
  curve: PowerCurve | null | undefined,
  opts?: { sessions?: number; isTest?: boolean; squadCs?: Array<number | null>; squadDPrime?: Array<number | null> },
): CriticalSpeedRead {
  const metric = curve?.metric ?? "distance";
  const sessions = opts?.sessions ?? 0;

  // Reconstruct distance (m) from per-minute intensity: D_i = value × windowMin.
  const pts = (curve?.points ?? [])
    .map((p) => ({ t: num(p.windowMin), D: num(p.value) != null && (p.value as number) > 0 ? (p.value as number) * (p.windowMin as number) : null }))
    .filter((p): p is { t: number; D: number } => p.t != null && p.t > 0 && p.D != null);
  if (pts.length < 2) return insufficientRead(metric, pts.length);

  const n = pts.length;
  const tBar = pts.reduce((s, p) => s + p.t, 0) / n;
  const DBar = pts.reduce((s, p) => s + p.D, 0) / n;
  let sxx = 0, sxy = 0;
  for (const p of pts) { sxx += (p.t - tBar) ** 2; sxy += (p.t - tBar) * (p.D - DBar); }
  if (sxx <= 0) return insufficientRead(metric, n); // all windows identical — can't fit

  const cs = sxy / sxx;                 // m/min (slope)
  const dPrime = DBar - cs * tBar;      // metres (intercept)

  let ssRes = 0, ssTot = 0;
  for (const p of pts) { const pred = dPrime + cs * p.t; ssRes += (p.D - pred) ** 2; ssTot += (p.D - DBar) ** 2; }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1; // distinct windows → ssTot>0

  // Physiologically valid fit: a downward speed curve gives CS>0 and a small positive D′.
  if (!(cs > 0) || dPrime < 0) return insufficientRead(metric, n);

  let confidence: Confidence;
  if (opts?.isTest) {
    // Genuine maximal test efforts: 2 points already trustworthy; no session-maturity gate.
    if (rSquared < 0.85) confidence = "low";
    else if (n >= 3 && rSquared >= 0.95) confidence = "high";
    else confidence = "medium";
  } else if (sessions < MIN_MATURE_PEAKPERIOD_SESSIONS || n < 3 || rSquared < 0.90) {
    confidence = "low";
  } else if (sessions >= 2 * MIN_MATURE_PEAKPERIOD_SESSIONS && n >= 3 && rSquared >= 0.95) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  const csKmh = cs * 0.06;
  const csMs = cs / 60;
  const kmhEn = csKmh.toFixed(1);
  const kmhIs = kmhEn.replace(".", ",");
  const dpr = Math.round(dPrime);
  const verdict: Bi = {
    en: `Critical speed ≈ ${kmhEn} km/h — the pace he can sustain — with a ~${dpr} m reserve above it.`,
    is: `Critical speed ≈ ${kmhIs} km/klst — hraðinn sem hann heldur — með ~${dpr} m forða yfir henni.`,
  };

  return {
    metric,
    csMetresPerMin: r1(cs), csKmh: r1(csKmh), csMs: r2(csMs), dPrimeM: Math.round(dPrime),
    rSquared: r3(rSquared), nPoints: n,
    csPercentile: opts?.squadCs ? percentile(cs, opts.squadCs) : null,
    dPrimePercentile: opts?.squadDPrime ? percentile(dPrime, opts.squadDPrime) : null,
    confidence, verdict, citation: CITATION, caveat: CAVEAT,
  };
}

// ── Field-test path: CS/D′ from genuine maximal efforts (e.g. a 4-min "go as far as you
// can" run). One effort → a maximal-speed benchmark; two+ different durations → a true fit. ──

export interface CsTestEffort { durationMin: number; distanceM: number }

export interface CsTestRead {
  efforts: number;
  /** The longest effort as a plain benchmark (its average speed) — always shown. */
  maxEffort: { durationMin: number; distanceM: number; kmh: number; ms: number } | null;
  /** The fitted CS/D′ — only when ≥2 efforts of different durations exist. */
  cs: CriticalSpeedRead | null;
  verdict: Bi;
}

/**
 * Fit CS/D′ from maximal field-test efforts. With ≥2 distinct-duration efforts this is the
 * TRUE test-based read (preferred over the peak estimate); with 1 it returns a maximal-speed
 * benchmark and prompts for a second effort. Pure.
 */
export function computeCriticalSpeedFromTests(
  raw: CsTestEffort[],
  opts?: { squadCs?: Array<number | null>; squadDPrime?: Array<number | null> },
): CsTestRead {
  // Keep valid efforts; one per duration (the longest distance wins a duplicate duration).
  const byDur = new Map<number, number>();
  for (const e of raw ?? []) {
    const d = num(e.durationMin), m = num(e.distanceM);
    if (d === null || d <= 0 || m === null || m <= 0) continue;
    const prev = byDur.get(d);
    if (prev == null || m > prev) byDur.set(d, m);
  }
  const efforts = [...byDur.entries()].map(([durationMin, distanceM]) => ({ durationMin, distanceM }))
    .sort((a, b) => a.durationMin - b.durationMin);

  if (efforts.length === 0) {
    return { efforts: 0, maxEffort: null, cs: null, verdict: { en: "No test effort recorded yet.", is: "Engin prófmæling skráð enn." } };
  }

  const longest = efforts[efforts.length - 1];
  const perMin = longest.distanceM / longest.durationMin;
  const maxEffort = { durationMin: longest.durationMin, distanceM: Math.round(longest.distanceM), kmh: r1(perMin * 0.06), ms: r2(perMin / 60) };

  if (efforts.length < 2) {
    return {
      efforts: efforts.length, maxEffort, cs: null,
      verdict: {
        en: `Max ${longest.durationMin}-min speed ≈ ${maxEffort.kmh} km/h. Add a second all-out effort of a different length to compute critical speed.`,
        is: `Hámarkshraði á ${String(longest.durationMin).replace(".", ",")} mín ≈ ${String(maxEffort.kmh).replace(".", ",")} km/klst. Bættu við annarri all-out mælingu af annarri lengd til að reikna critical speed.`,
      },
    };
  }

  // ≥2 efforts → fit via the shared engine (build a curve of per-min values so value×window = distance).
  const curve: PowerCurve = {
    metric: "distance", unit: "m/min",
    points: efforts.map((e) => ({ windowMin: e.durationMin, value: e.distanceM / e.durationMin, index: null })),
  };
  const cs = computeCriticalSpeed(curve, { isTest: true, squadCs: opts?.squadCs, squadDPrime: opts?.squadDPrime });
  return { efforts: efforts.length, maxEffort, cs, verdict: cs.verdict };
}

// ── Combined path: a trusted maximal test anchor + the (guardrailed) MII envelope ──
//
// The strongest single input is a genuine maximal effort (e.g. a 4-min "go as far as you can"
// run) stored in `player_running_test`. One effort alone can't fix a two-parameter model, so we
// COMBINE it with the player's MII season-best distance curve — but only the MII windows that
// stay physically consistent with the trusted anchor:
//   • a SHORTER window must be at least as fast (higher m/min) AND cover no more distance;
//   • a LONGER window must be no faster AND cover at least as much distance.
// MII points that violate that — a "peak" longer window faster than the maximal test (physically
// impossible), or a short window slower than the maximal pace (a non-maximal burst) — are
// dropped so they can't distort the line. If too little of a curve survives (only the anchor, or
// windows spanning under `MIN_FIT_SPAN_MIN`), we say so rather than guess a CS.

const MIN_FIT_SPAN_MIN = 2;                        // fitted windows must span ≥2 min → a real slope
const CS_PLAUSIBLE_KMH: [number, number] = [8, 24]; // reject degenerate fits outside team-sport range

const CAVEAT_COMBINED: Bi = {
  en: "Anchored on a genuine maximal test (the 4-min run) and completed with the session peak windows that stay physically consistent with it. A field estimate, not a lab test to exhaustion — with only a few points D′ (the reserve) is the softer number. Descriptive context — it never changes the readiness verdict or the daily plan.",
  is: "Fest við raunverulegt hámarkspróf (4-mín hlaupið) og fyllt með þeim topp-gluggum úr æfingum sem standast eðlisfræðilega. Vallar-mat, ekki rannsóknarstofupróf til örmögnunar — með aðeins fáa punkta er D′ (forðinn) mýkri talan. Lýsandi samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

const NEED_SECOND_EFFORT: Bi = {
  en: "One maximal test recorded — but the session peaks all sit below it, so they can't pin the curve. Add a shorter all-out effort (e.g. a 1-min max) to compute critical speed.",
  is: "Eitt hámarkspróf skráð — en topp-gluggar úr æfingum liggja allir undir því og festa ekki kúrfuna. Bættu við styttri all-out mælingu (t.d. 1-mín hámark) til að reikna critical speed.",
};

export interface CsCombinedResult extends CriticalSpeedRead {
  usedTestAnchor: boolean;                       // ≥1 trusted maximal test point entered the fit
  anchorEfforts: number;                         // trusted test efforts supplied
  droppedMiiPoints: number;                      // MII windows removed by the guardrail
  fitPoints: Array<{ t: number; D: number }>;    // the (window, cumulative distance) points fitted
}

/**
 * Fit CS/D′ from a trusted maximal test anchor combined with the guardrailed MII curve. Pure.
 * With no test effort supplied this is exactly the MII estimate (`usedTestAnchor:false`).
 */
export function computeCriticalSpeedCombined(
  miiCurve: PowerCurve | null | undefined,
  testEfforts: CsTestEffort[],
  opts?: { sessions?: number; squadCs?: Array<number | null>; squadDPrime?: Array<number | null> },
): CsCombinedResult {
  const metric = miiCurve?.metric ?? "distance";

  // Trusted maximal anchors — one per duration, longest distance wins a duplicate.
  const byDur = new Map<number, number>();
  for (const e of testEfforts ?? []) {
    const t = num(e.durationMin), D = num(e.distanceM);
    if (t === null || t <= 0 || D === null || D <= 0) continue;
    const prev = byDur.get(t);
    if (prev == null || D > prev) byDur.set(t, D);
  }
  const anchors = [...byDur.entries()].map(([t, D]) => ({ t, D, speed: D / t }));

  // No anchor → the plain MII estimate, unchanged, flagged as an estimate.
  if (anchors.length === 0) {
    const est = computeCriticalSpeed(miiCurve, opts);
    const pts = (miiCurve?.points ?? [])
      .map((p) => ({ t: num(p.windowMin), v: num(p.value) }))
      .filter((p): p is { t: number; v: number } => p.t != null && p.t > 0 && p.v != null && p.v > 0)
      .map((p) => ({ t: p.t, D: Math.round(p.v * p.t) }));
    return { ...est, usedTestAnchor: false, anchorEfforts: 0, droppedMiiPoints: 0, fitPoints: pts };
  }

  // MII candidates (per-minute value → cumulative distance).
  const cand = (miiCurve?.points ?? [])
    .map((p) => ({ t: num(p.windowMin), v: num(p.value) }))
    .filter((p): p is { t: number; v: number } => p.t != null && p.t > 0 && p.v != null && p.v > 0)
    .map((p) => ({ t: p.t, D: p.v * p.t, speed: p.v }));

  // Guardrail: keep only MII points consistent with EVERY trusted anchor.
  const kept = cand.filter((m) =>
    anchors.every((a) => {
      if (m.t === a.t) return false;                          // trust the test at that exact window
      if (m.t < a.t) return m.speed >= a.speed && m.D <= a.D; // shorter: ≥ as fast, ≤ distance
      return m.speed <= a.speed && m.D >= a.D;                // longer:  ≤ as fast, ≥ distance
    }),
  );
  const droppedMiiPoints = cand.length - kept.length;

  // Merge (anchor wins a shared window) → distinct (t, cumulative distance) points.
  const merged = new Map<number, number>();
  for (const m of kept) { const prev = merged.get(m.t); if (prev == null || m.D > prev) merged.set(m.t, m.D); }
  for (const a of anchors) merged.set(a.t, a.D);
  const ts = [...merged.keys()].sort((x, y) => x - y);
  const fitPoints = ts.map((t) => ({ t, D: Math.round(merged.get(t) as number) }));

  const insufficient = (): CsCombinedResult => ({
    ...insufficientRead(metric, ts.length), verdict: NEED_SECOND_EFFORT,
    usedTestAnchor: true, anchorEfforts: anchors.length, droppedMiiPoints, fitPoints,
  });

  if (ts.length < 2 || ts[ts.length - 1] - ts[0] < MIN_FIT_SPAN_MIN) return insufficient();

  const curve: PowerCurve = {
    metric, unit: "m/min",
    points: ts.map((t) => ({ windowMin: t, value: (merged.get(t) as number) / t, index: null })),
  };
  const fit = computeCriticalSpeed(curve, {
    isTest: true, sessions: opts?.sessions, squadCs: opts?.squadCs, squadDPrime: opts?.squadDPrime,
  });
  // Degenerate fits (near-adjacent windows) can yield an out-of-range slope → reject honestly.
  if (fit.csMetresPerMin == null || (fit.csKmh != null && (fit.csKmh < CS_PLAUSIBLE_KMH[0] || fit.csKmh > CS_PLAUSIBLE_KMH[1]))) {
    return insufficient();
  }
  return {
    ...fit, caveat: CAVEAT_COMBINED,
    usedTestAnchor: true, anchorEfforts: anchors.length, droppedMiiPoints, fitPoints,
  };
}

// ── Anaerobic "tank" over a match — how many times he spent & refilled the D′ reserve ──
//
// D′ is a SINGLE-effort reserve that refills below CS, so there is no bigger fixed "total tank" —
// the match total depends on recovery. What IS meaningful and computable: how many tankfuls he
// actually spent = (distance run above CS this match) ÷ D′. Above-CS distance is proxied by the
// high-speed bands (5+6, fixed thresholds ~ just above these players' CS). This is a MATCH-LEVEL
// COUNT, not the second-by-second D′-balance (Skiba W′bal), which needs a 10 Hz trace we don't hold.

const TANK_MANY = 8;   // ≥ → repeated-sprint lean (many small refills)
const TANK_FEW = 4;    // ≤ → single big-effort lean (few large bursts)

const CAVEAT_TANK: Bi = {
  en: "Above-CS distance is proxied by the high-speed bands (5+6) at fixed thresholds — close to, not exactly, CS. \"Tankfuls\" counts how many times the reserve was spent and refilled across the match; it is NOT the second-by-second D′ balance (that needs a 10 Hz trace). Descriptive only — never touches readiness.",
  is: "Vegalengd yfir CS er metin úr háhraðaböndunum (5+6) við fasta þröskulda — nálægt, ekki nákvæmlega, CS. „Tankfyllingar\" telja hversu oft forðinn var eyddur og endurhlaðinn yfir leikinn; það er EKKI D′-staðan sekúndu-fyrir-sekúndu (hún þarf 10 Hz feril). Lýsandi — snertir aldrei readiness.",
};

const TANK_CITATION = "Skiba 2012 (D′/W′ balance model) · Pettitt 2016 (critical speed & D′)";

export interface AnaerobicTankRead {
  aboveCsDistanceM: number;   // ≈ HSR (velocity band 5+6) covered in the match
  dPrimeM: number;            // the single-effort reserve
  tankfuls: number;           // aboveCsDistanceM ÷ dPrimeM (1 decimal)
  matchDate: string | null;
  minutes: number | null;
  profile: Bi;                // repeated-sprint / single-effort / balanced (provisional)
  verdict: Bi;
  citation: string;
  caveat: Bi;
}

/**
 * How many times a player spent & refilled his D′ reserve in a match. Pure. Returns null when
 * there is no valid D′ (no CS fit) or no above-CS distance for the match.
 */
export function computeAnaerobicTank(opts: {
  dPrimeM: number | null | undefined;
  aboveCsDistanceM: number | null | undefined;
  matchDate?: string | null;
  minutes?: number | null;
}): AnaerobicTankRead | null {
  const dPrime = num(opts.dPrimeM);
  const above = num(opts.aboveCsDistanceM);
  if (dPrime === null || dPrime <= 0 || above === null || above <= 0) return null;

  const tankfuls = r1(above / dPrime);
  const fills = Math.round(tankfuls);
  const aboveR = Math.round(above);
  const dR = Math.round(dPrime);

  const profile: Bi = tankfuls >= TANK_MANY
    ? { en: "repeated-sprint profile — many small refills", is: "endurtekin-sprett prófíll — margar litlar fyllingar" }
    : tankfuls <= TANK_FEW
      ? { en: "single big-effort profile — few large bursts", is: "stór-átaka prófíll — fáar stórar sprengingar" }
      : { en: "balanced — a mix of bursts and refills", is: "í jafnvægi — blanda af sprengingum og fyllingum" };

  const fillsIs = String(fills).replace(".", ",");
  const verdict: Bi = {
    en: `Emptied his anaerobic reserve ~${fills}× this match — ${aboveR} m above CS ÷ ${dR} m tank.`,
    is: `Tæmdi loftfirrta forðann ~${fillsIs}× í leiknum — ${aboveR} m yfir CS ÷ ${dR} m tankur.`,
  };

  return {
    aboveCsDistanceM: aboveR, dPrimeM: dR, tankfuls,
    matchDate: opts.matchDate ?? null, minutes: num(opts.minutes),
    profile, verdict, citation: TANK_CITATION, caveat: CAVEAT_TANK,
  };
}

// ── D′ spend per sprint — how many metres of the reserve one sprint draws (∝ intensity) ──
//
// D′ is the finite distance a player can cover ABOVE critical speed. A single sprint at speed v
// for t seconds draws (v − CS) × t metres of it — so faster and longer sprints cost more, exactly
// as a coach expects. Dividing D′ by that per-sprint cost gives how many such sprints the reserve
// affords before it is empty. This is the EXPENDITURE side of the Skiba D′-balance model, evaluated
// for one clean all-out effort; it deliberately ignores the partial refill that happens between
// sprints (that needs a 10 Hz trace, which we don't hold), so read it as "per single sprint", not a
// whole-match budget. Pure. Descriptive — never touches readiness.
const SPRINT_COST_CITATION = "Skiba 2012 (D′/W′ balance) · Pettitt 2016 (critical speed & D′) · Morton & Billat 2004 (intermittent running)";
const CAVEAT_SPRINT_COST: Bi = {
  en: "Each sprint's cost is the distance run above CS during it: (sprint speed − CS) × duration. \"Sprints before empty\" = D′ ÷ that cost — for clean, back-to-back all-out efforts with no recovery. In reality the reserve refills whenever he drops below CS, so a match affords far more sprints than this; it is a per-single-sprint estimate from CS + D′, not a second-by-second D′ balance. Descriptive only — never touches readiness.",
  is: "Kostnaður hvers spretts er vegalengdin sem hlaupin er yfir CS í honum: (spretthraði − CS) × tími. „Sprettir áður en tómt\" = D′ ÷ sá kostnaður — fyrir hreina, samfellda hámarkssprett án hvíldar. Í raun endurhleðst forðinn alltaf þegar hann fer undir CS, svo leikur leyfir mun fleiri spretti en þetta; þetta er mat á einn-sprett úr CS + D′, ekki D′-staða sekúndu-fyrir-sekúndu. Lýsandi — snertir aldrei readiness.",
};

export interface SprintCostRow {
  label: Bi;
  speedKmh: number;      // the sprint speed modelled
  aboveCsKmh: number;    // how far above CS that is
  costM: number;         // metres of D′ drawn by ONE sprint of refDurationSec at this speed
  sprintsToEmpty: number; // D′ ÷ costM (1 decimal)
}
export interface SprintCostRead {
  dPrimeM: number;
  csKmh: number;
  refDurationSec: number;
  usesMss: boolean;       // true when the intensities are anchored on the player's own MSS
  rows: SprintCostRow[];
  verdict: Bi;
  caveat: Bi;
  citation: string;
}

/**
 * D′ metres drawn per sprint, at a few intensities, plus how many such sprints the reserve affords.
 * Intensities are anchored on the player's own top speed (MSS) when available — 70/85/100 % of the
 * CS→MSS span — else fixed offsets above CS. Pure. Returns null without a valid CS + D′.
 */
export function computeSprintCost(opts: {
  csKmh: number | null | undefined;
  dPrimeM: number | null | undefined;
  mssKmh?: number | null | undefined;
  refDurationSec?: number;
}): SprintCostRead | null {
  const cs = num(opts.csKmh), dPrime = num(opts.dPrimeM);
  if (cs === null || cs <= 0 || dPrime === null || dPrime <= 0) return null;
  const t = opts.refDurationSec && opts.refDurationSec > 0 ? opts.refDurationSec : 3;
  const mss = num(opts.mssKmh);
  const usesMss = mss !== null && mss > cs;

  // Sprint speeds: fractions of the CS→MSS reserve when MSS is known, else fixed km/h over CS.
  const specs: Array<{ speedKmh: number; label: Bi }> = usesMss
    ? [
        { speedKmh: cs + 0.6 * (mss! - cs), label: { en: "hard run", is: "hart hlaup" } },
        { speedKmh: cs + 0.85 * (mss! - cs), label: { en: "fast sprint", is: "hraður sprettur" } },
        { speedKmh: mss!, label: { en: "max sprint", is: "hámarkssprettur" } },
      ]
    : [
        { speedKmh: cs + 6, label: { en: "hard run (CS+6)", is: "hart hlaup (CS+6)" } },
        { speedKmh: cs + 10, label: { en: "fast sprint (CS+10)", is: "hraður sprettur (CS+10)" } },
        { speedKmh: cs + 14, label: { en: "max sprint (CS+14)", is: "hámarkssprettur (CS+14)" } },
      ];

  const rows: SprintCostRow[] = specs.map((s) => {
    const aboveCsKmh = s.speedKmh - cs;
    const costM = (aboveCsKmh / 3.6) * t; // (km/h → m/s) × seconds = metres above CS
    return {
      label: s.label,
      speedKmh: r1(s.speedKmh),
      aboveCsKmh: r1(aboveCsKmh),
      costM: r1(costM),
      sprintsToEmpty: costM > 0 ? r1(dPrime / costM) : 0,
    };
  });

  const maxRow = rows[rows.length - 1];
  const verdict: Bi = {
    en: `A ${t}-s max sprint (${maxRow.speedKmh} km/h) draws ~${Math.round(maxRow.costM)} m of his ${Math.round(dPrime)} m reserve → ~${Math.round(maxRow.sprintsToEmpty)} back-to-back max sprints before empty. It refills whenever he drops below CS, so a match affords many more.`,
    is: `${t}-s hámarkssprettur (${maxRow.speedKmh} km/h) tekur ~${Math.round(maxRow.costM)} m af ${Math.round(dPrime)} m forðanum → ~${Math.round(maxRow.sprintsToEmpty)} samfelldir hámarkssprettir áður en tómt. Hann endurhleðst alltaf þegar farið er undir CS, svo leikur leyfir mun fleiri.`,
  };

  return { dPrimeM: Math.round(dPrime), csKmh: r1(cs), refDurationSec: t, usesMss, rows, verdict, caveat: CAVEAT_SPRINT_COST, citation: SPRINT_COST_CITATION };
}

// ── Coach-usable numbers from a SINGLE 4-min maximal run (works even without a CS fit) ──
//
// A 3–6 min "go as far as you can" run's average pace is the standard field estimate of a
// player's Maximal Aerobic Speed (MAS) — the speed a coach anchors running conditioning to.
// From it we derive prescribable target speeds (% of MAS) so the card is useful for EVERY player,
// not only the few with a two-point CS fit. A provisional CS band (≈85–90 % of MAS) is offered as
// a rough guide until a shorter maximal effort pins the real CS/D′.

const MAS_ZONES: Array<{ key: string; pct: number; en: string; is: string }> = [
  { key: "recovery",  pct: 0.65, en: "Recovery",        is: "Endurheimt" },
  { key: "aerobic",   pct: 0.80, en: "Aerobic",         is: "Þolþjálfun" },
  { key: "threshold", pct: 0.90, en: "Threshold",       is: "Þröskuldur" },
  { key: "mas",       pct: 1.00, en: "MAS (4-min max)",  is: "MAS (4-mín hámark)" },
  { key: "vo2",       pct: 1.10, en: "VO₂ intervals",    is: "VO₂ interval" },
  { key: "speed",     pct: 1.20, en: "Speed",            is: "Hraði" },
];
const CS_FROM_MAS_LOW = 0.85, CS_FROM_MAS_HIGH = 0.90; // provisional CS band vs MAS
const REP_SECONDS = [15, 30, 45];                      // rep durations coaches design intervals around
const FIELD_TEST_CITATION = "Léger & Boucher 1980 (MAS) · Buchheit 2013 (speed-based conditioning) · Pettitt 2016 (CS↔MAS)";

export interface FieldTestZone {
  key: string; label: Bi; pct: number; kmh: number; mPerMin: number;
  reps: Array<{ sec: number; m: number }>; // distance to cover in a rep of that length at this speed
}
export interface FieldTestRead {
  durationMin: number; distanceM: number;
  masKmh: number; masMs: number; masMPerMin: number;
  estCsKmhLow: number; estCsKmhHigh: number;
  zones: FieldTestZone[];
  note: Bi; citation: string;
}

/**
 * Turn the longest maximal test effort into MAS + prescribable running-conditioning speeds and a
 * provisional CS band. Pure. Returns null with no valid effort. Best from a 3–6 min effort; from a
 * much shorter one the MAS proxy over-reads (the note flags it).
 */
export function computeFieldTestZones(effort: { durationMin: number; distanceM: number } | null | undefined): FieldTestRead | null {
  const t = num(effort?.durationMin), d = num(effort?.distanceM);
  if (t === null || t <= 0 || d === null || d <= 0) return null;

  const masMPerMin = d / t;
  const masKmh = masMPerMin * 0.06;
  const zones: FieldTestZone[] = MAS_ZONES.map((z) => {
    const mPerMin = masMPerMin * z.pct;
    return {
      key: z.key, label: { en: z.en, is: z.is }, pct: z.pct,
      kmh: r1(masKmh * z.pct), mPerMin: Math.round(mPerMin),
      reps: REP_SECONDS.map((sec) => ({ sec, m: Math.round((mPerMin * sec) / 60) })),
    };
  });

  const shortTest = t < 2.5;
  const note: Bi = {
    en: `Speeds are % of his ${t}-min maximal pace (≈ his maximal aerobic speed, MAS). The 15/30/45 s columns are how far he should cover in a rep of that length at each speed — e.g. a 30-30 interval at 110 % MAS = the "30 s" distance out and back.${shortTest ? " ⚠ From a sub-3-min effort the MAS proxy over-reads." : ""} The provisional CS band is a rough estimate from one test; record a shorter maximal effort to compute the real CS/D′.`,
    is: `Hraðarnir eru % af ${String(t).replace(".", ",")}-mín hámarkshraða hans (≈ maximal aerobic speed, MAS). 15/30/45 s dálkarnir eru hversu langt hann á að fara í spretti af þeirri lengd á hverjum hraða — t.d. 30-30 interval á 110 % MAS = „30 s" vegalengdin fram og til baka.${shortTest ? " ⚠ Úr <3-mín átaki ofmetur MAS-nálgunin." : ""} Áætlaða CS-bilið er gróft mat úr einu prófi; skráðu styttri hámarksmælingu til að reikna raunverulegt CS/D′.`,
  };

  return {
    durationMin: t, distanceM: Math.round(d),
    masKmh: r1(masKmh), masMs: r2(masMPerMin / 60), masMPerMin: Math.round(masMPerMin),
    estCsKmhLow: r1(masKmh * CS_FROM_MAS_LOW), estCsKmhHigh: r1(masKmh * CS_FROM_MAS_HIGH),
    zones, note, citation: FIELD_TEST_CITATION,
  };
}

// ── Anaerobic Speed Reserve (ASR) — the SPEED reserve above aerobic max ──
//
// ASR = maximal sprint speed (MSS) − maximal aerobic speed (MAS). It is a distinct "anaerobic
// reserve" from D′ (which is a distance/work reserve): ASR is the band of speed a player has above
// the pace his aerobic system can drive. Two players with the same MAS but different top speed need
// different supra-MAS prescriptions — so high-intensity running is best anchored on %ASR, not %MAS.
// MSS here is the season-best GPS max velocity (a proxy for a dedicated flying-sprint test).
// Cite: Sandford 2019 · Buchheit & Laursen 2013 · Bundle & Weyand 2012 · Blondel 2001.

const ASR_ANCHORS = [0, 0.25, 0.5, 0.75, 1.0]; // fraction of ASR added onto MAS
const ASR_CITATION = "Sandford 2019 · Buchheit & Laursen 2013 · Bundle & Weyand 2012 · Blondel 2001 (anaerobic speed reserve)";

export interface AsrAnchor { pctAsr: number; kmh: number; mPerMin: number }
export interface AnaerobicSpeedReserveRead {
  masKmh: number; mssKmh: number; asrKmh: number;
  anchors: AsrAnchor[];
  percentile: number | null;      // ASR rank vs squad
  profile: Bi;                    // speed-type / endurance-type / balanced
  verdict: Bi;
  citation: string; caveat: Bi;
}

/**
 * Anaerobic Speed Reserve from MAS (4-min test) + MSS (season-best GPS max velocity). Pure.
 * Returns null unless MSS > MAS > 0. `%ASR` anchors give individualised supra-MAS running speeds.
 */
export function computeAnaerobicSpeedReserve(opts: {
  masKmh: number | null | undefined; mssKmh: number | null | undefined; squadAsr?: Array<number | null>;
}): AnaerobicSpeedReserveRead | null {
  const mas = num(opts.masKmh), mss = num(opts.mssKmh);
  if (mas === null || mas <= 0 || mss === null || mss <= mas) return null;
  const asr = mss - mas;

  const anchors: AsrAnchor[] = ASR_ANCHORS.map((f) => {
    const kmh = mas + f * asr;
    return { pctAsr: f, kmh: r1(kmh), mPerMin: Math.round(kmh / 0.06) };
  });

  const pctile = opts.squadAsr ? percentile(asr, opts.squadAsr) : null;
  const profile: Bi = pctile == null
    ? { en: "speed reserve above his aerobic ceiling", is: "hraðaforði yfir loftháða þakinu" }
    : pctile >= 66
      ? { en: "speed-type — a big reserve above aerobic max", is: "hraða-gerð — stór forði yfir loftháða hámarki" }
      : pctile <= 33
        ? { en: "endurance-type — a small reserve above aerobic max", is: "úthalds-gerð — lítill forði yfir loftháða hámarki" }
        : { en: "balanced aerobic/speed profile", is: "í jafnvægi (loftháð/hraði)" };

  const verdict: Bi = {
    en: `Anaerobic speed reserve ${r1(asr)} km/h — from ${r1(mas)} km/h (MAS) up to ${r1(mss)} km/h (top speed). Anchor supra-MAS running on %ASR.`,
    is: `Loftfirrtur hraðaforði ${String(r1(asr)).replace(".", ",")} km/klst — frá ${String(r1(mas)).replace(".", ",")} km/klst (MAS) upp í ${String(r1(mss)).replace(".", ",")} km/klst (topphraði). Akkuru supra-MAS hlaup á %ASR.`,
  };
  const caveat: Bi = {
    en: "MSS is the season-best GPS max velocity (a match/training sprint) — a proxy for a dedicated flying-sprint test; MAS is the 4-min run. %ASR anchors individualise high-speed running. Descriptive — never touches readiness.",
    is: "MSS er besti GPS-hámarkshraði tímabilsins (spretti úr leik/æfingu) — nálgun á sérhæft flug-sprett-próf; MAS er 4-mín hlaupið. %ASR akkeri einstaklingsmiða háhraða-hlaup. Lýsandi — snertir aldrei readiness.",
  };

  return { masKmh: r1(mas), mssKmh: r1(mss), asrKmh: r1(asr), anchors, percentile: pctile, profile, verdict, citation: ASR_CITATION, caveat };
}

// ── D′ from a SINGLE 3-min all-out running test (3MT) — CS + D′ from one effort ──
//
// The 3-min all-out test (Pettitt/Burnley): run flat-out for 3 min; D′ is fully spent within the
// first ~2.5 min, so the FINISHING speed (mean of the last 30 s) = critical speed, and the distance
// covered ABOVE that end speed over the whole test = D′. Unlike a single 4-min TOTAL, this yields
// BOTH parameters from one test — the coach just needs total distance + finishing speed.
// Cite: Pettitt, Jamnick & Clark 2012 · Burnley, Doust & Vanhatalo 2006 · Vanhatalo 2011.

const THREEMT_CITATION = "Pettitt, Jamnick & Clark 2012 (3-min all-out running test) · Burnley 2006 · Vanhatalo 2011";
const CAVEAT_3MT: Bi = {
  en: "From a 3-min all-out test: the finishing speed (last 30 s) is critical speed, the distance above it over the test is D′. Valid only if the effort was truly all-out and evenly attacked. Descriptive — never touches readiness.",
  is: "Úr 3-mín all-out prófi: lokahraðinn (síðustu 30 s) er critical speed, vegalengdin yfir honum yfir prófið er D′. Gildir aðeins ef átakið var raunverulega all-out. Lýsandi — snertir aldrei readiness.",
};

/**
 * CS + D′ from one 3-min all-out test. Pure. Returns an insufficient read if the inputs are out of
 * range (end speed implausible, or a negative D′ → the finish wasn't a true asymptote).
 */
export function computeCriticalSpeedFrom3MT(opts: {
  endSpeedKmh: number | null | undefined; totalDistanceM: number | null | undefined; durationS?: number | null;
}): CriticalSpeedRead {
  const endKmh = num(opts.endSpeedKmh), dist = num(opts.totalDistanceM);
  const durationMin = (num(opts.durationS) ?? 180) / 60;
  if (endKmh === null || endKmh <= 0 || dist === null || dist <= 0 || durationMin <= 0) return insufficientRead("distance", 1);

  const csMPerMin = endKmh / 0.06;
  const dPrime = dist - csMPerMin * durationMin;
  if (endKmh < 8 || endKmh > 24 || dPrime < 0) return insufficientRead("distance", 1);

  const kmhEn = endKmh.toFixed(1);
  const verdict: Bi = {
    en: `Critical speed ${kmhEn} km/h with a ${Math.round(dPrime)} m reserve above it — from one 3-min all-out test.`,
    is: `Critical speed ${kmhEn.replace(".", ",")} km/klst með ${Math.round(dPrime)} m forða yfir henni — úr einu 3-mín all-out prófi.`,
  };
  return {
    metric: "distance", csMetresPerMin: r1(csMPerMin), csKmh: r1(endKmh), csMs: r2(csMPerMin / 60),
    dPrimeM: Math.round(dPrime), rSquared: null, nPoints: 1, csPercentile: null, dPrimePercentile: null,
    confidence: "high", verdict, citation: THREEMT_CITATION, caveat: CAVEAT_3MT,
  };
}
