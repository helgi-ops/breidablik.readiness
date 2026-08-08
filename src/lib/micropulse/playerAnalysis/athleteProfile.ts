/**
 * Athlete profile — the physical axis of Total Player Analysis.
 *
 * Pure, IO-free. Given each squad player's summarised per-quality signal (already
 * reduced from the source tables by the API loader), it ranks the target player
 * into a POSITION-GROUP percentile (falling back to the whole squad when the
 * position pool is too small) and assigns a transparent verdict
 * (strength / neutral / weakness) plus a confidence and a development trend.
 *
 * "Rules decide, AI explains" (manifesto): every number here is rule-based and
 * carries its source + date; the AI layer only phrases them. This is a
 * PERFORMANCE read — it never touches the readiness colour, the load decision, or
 * the medical/injury view. Asymmetry is surfaced as a robustness quality, NOT an
 * injury prediction (the medical read stays in RTP/readiness).
 *
 * The engine takes ALREADY-SUMMARISED values (one headline number per quality per
 * player) so the GPS/VALD/VBT reduction rules stay in their own modules; here we
 * only distribute, rank, and label. Keeps it deterministic and unit-testable.
 */

import { positionGroup } from "@/lib/micropulse/positionStyle";

// ── Quality catalogue ──────────────────────────────────────────────────────
// One headline metric per quality → one radar axis. `higherIsBetter=false` means
// a lower raw value is the better athlete outcome (asymmetry), so its percentile
// and trend are inverted to always read "higher percentile = better".

export type QualityId =
  | "speed"
  | "acceleration"
  | "deceleration"
  | "reactive_power"
  | "max_strength"
  | "vbt_power"
  | "change_of_direction"
  | "work_capacity"
  | "robustness";

export type QualityDef = {
  id: QualityId;
  en: string;
  is: string;
  higherIsBetter: boolean;
  /** short plain-language note (behind a tooltip in the UI) */
  noteEn: string;
  noteIs: string;
};

export const QUALITIES: QualityDef[] = [
  { id: "speed", en: "Speed", is: "Hraði", higherIsBetter: true,
    noteEn: "Top running speed reached in games.", noteIs: "Hámarkshraði í leikjum." },
  { id: "acceleration", en: "Acceleration", is: "Hröðun", higherIsBetter: true,
    noteEn: "How explosively he gets up to speed.", noteIs: "Hversu sprengikröftugt hann nær hraða." },
  { id: "deceleration", en: "Deceleration", is: "Hemlun", higherIsBetter: true,
    noteEn: "Braking — a high-cost, protective quality.", noteIs: "Hemlun — kostnaðarsöm, verndandi geta." },
  { id: "reactive_power", en: "Reactive power", is: "Viðbragðskraftur", higherIsBetter: true,
    noteEn: "Jump / stretch-shortening power (force plates).", noteIs: "Stökk-/teygju-kraftur (kraftplötur)." },
  { id: "max_strength", en: "Max strength", is: "Hámarkskraftur", higherIsBetter: true,
    noteEn: "Peak force he can produce (relative to mass).", noteIs: "Hámarkskraftur (miðað við líkamsþyngd)." },
  { id: "vbt_power", en: "Power output", is: "Aflframleiðsla", higherIsBetter: true,
    noteEn: "Bar power / velocity in the gym (VBT).", noteIs: "Stangar-afl/hraði í ræktinni (VBT)." },
  { id: "change_of_direction", en: "Change of direction", is: "Stefnubreytingar", higherIsBetter: true,
    noteEn: "Cutting / turning volume in games.", noteIs: "Stefnubreytingar og snúningar í leikjum." },
  { id: "work_capacity", en: "Work capacity", is: "Vinnugeta", higherIsBetter: true,
    noteEn: "High-speed running he sustains (a GPS proxy, not an aerobic test).", noteIs: "Háhraðahlaup sem hann heldur út (GPS-nálgun, ekki þolpróf)." },
  { id: "robustness", en: "Robustness (symmetry)", is: "Samhverfa", higherIsBetter: false,
    noteEn: "Left-right balance on force plates — a performance/robustness read, not an injury flag.", noteIs: "Vinstri-hægri jafnvægi á kraftplötum — frammistöðu-/styrkleikamerki, ekki meiðslamerki." },
];

export const QUALITY_BY_ID: Record<QualityId, QualityDef> =
  Object.fromEntries(QUALITIES.map((q) => [q.id, q])) as Record<QualityId, QualityDef>;

// ── Thresholds (transparent constants) ─────────────────────────────────────
export const STRENGTH_PCTL = 70;   // ≥ this position-percentile → strength
export const WEAKNESS_PCTL = 30;   // ≤ this → weakness
export const MIN_POSITION_POOL = 4; // fewer same-position peers → rank vs the whole squad
export const TREND_DEADBAND = 0.05; // ±5% relative change before a trend is called
export const MIN_TREND_POINTS = 3;

// ── Inputs ─────────────────────────────────────────────────────────────────
export type MetricSample = {
  value: number | null;
  unit: string;
  /** provenance label shown to the coach, e.g. "GPS", "ForceDecks", "IMTP", "GymAware". */
  source: string;
  /** ISO date of the value (latest contributing session/test), or null. */
  date: string | null;
  /** how many sessions/trials the value was reduced from (drives confidence). */
  sampleSize?: number;
  /** optional dated series (oldest→newest) for the development trend. */
  series?: Array<{ date: string; value: number }>;
};

export type AthleteSignalSet = Partial<Record<QualityId, MetricSample>>;

export type SquadAthletePlayer = {
  playerId: string;
  name?: string;
  position: string | null;
  signals: AthleteSignalSet;
};

export type SquadAthleteInput = {
  players: SquadAthletePlayer[];
  sport?: string | null;
};

// ── Outputs ────────────────────────────────────────────────────────────────
export type QualityVerdict = "strength" | "neutral" | "weakness" | "no_data";
export type Confidence = "high" | "moderate" | "low";
export type Trend = "rising" | "stable" | "falling" | null;

export type QualityRead = {
  id: QualityId;
  value: number | null;
  unit: string;
  source: string | null;
  date: string | null;
  sampleSize: number | null;
  positionPercentile: number | null; // primary percentile (position pool, or squad on fallback)
  squadPercentile: number | null;
  benchmark: "position" | "squad" | null; // which pool the primary percentile used
  poolSize: number;
  verdict: QualityVerdict;
  confidence: Confidence;
  trend: Trend;
};

export type AthleteProfile = {
  playerId: string;
  position: string | null;
  positionGroup: string | null;
  qualities: QualityRead[];
  strengths: QualityRead[];  // verdict==strength, best-percentile first
  weaknesses: QualityRead[]; // verdict==weakness, worst-percentile first
  coverage: {
    sources: string[];          // distinct provenance labels this player has
    qualitiesWithData: number;  // qualities with a non-null value
    totalQualities: number;
    ratio: number;              // qualitiesWithData / totalQualities
  };
};

// ── Helpers ────────────────────────────────────────────────────────────────
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Percentile of `target` within `pool` (both already oriented so higher raw is
 * better; caller inverts for lowerIsBetter). Ties share the midpoint. 0–100.
 */
function percentile(target: number, pool: number[]): number | null {
  const vals = pool.filter(isNum);
  if (vals.length <= 1) return null; // no distribution to rank against
  let below = 0, equal = 0;
  for (const v of vals) {
    if (v < target) below += 1;
    else if (v === target) equal += 1;
  }
  const rank = below + 0.5 * Math.max(0, equal - 1); // exclude self from the ties
  return Math.round((rank / (vals.length - 1)) * 100);
}

function trendOf(series: Array<{ date: string; value: number }> | undefined, higherIsBetter: boolean): Trend {
  if (!series || series.length < MIN_TREND_POINTS) return null;
  const pts = series.filter((p) => isNum(p.value)).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < MIN_TREND_POINTS) return null;
  const half = Math.floor(pts.length / 2);
  const early = pts.slice(0, half);
  const late = pts.slice(pts.length - half);
  const mean = (a: Array<{ value: number }>) => a.reduce((s, p) => s + p.value, 0) / a.length;
  const e = mean(early), l = mean(late);
  if (e === 0) return null;
  const rel = (l - e) / Math.abs(e);
  let dir: Trend = Math.abs(rel) < TREND_DEADBAND ? "stable" : rel > 0 ? "rising" : "falling";
  if (!higherIsBetter && dir !== "stable") dir = dir === "rising" ? "falling" : "rising"; // orient to improvement
  return dir;
}

function confidenceOf(sampleSize: number | undefined, poolSize: number, benchmark: "position" | "squad"): Confidence {
  const n = sampleSize ?? 0;
  if (n < 2 || poolSize < MIN_POSITION_POOL) return "low";
  if (n >= 5 && poolSize >= 8 && benchmark === "position") return "high";
  return "moderate";
}

function verdictOf(pctl: number | null): QualityVerdict {
  if (pctl == null) return "neutral";
  if (pctl >= STRENGTH_PCTL) return "strength";
  if (pctl <= WEAKNESS_PCTL) return "weakness";
  return "neutral";
}

// ── Engine ─────────────────────────────────────────────────────────────────
/** Build the athlete profile for `playerId` from the squad's summarised signals. */
export function buildAthleteProfile(input: SquadAthleteInput, playerId: string): AthleteProfile | null {
  const target = input.players.find((p) => p.playerId === playerId);
  if (!target) return null;
  const sport = input.sport ?? null;
  const grp = target.position ? positionGroup(target.position, sport) : null;

  const qualities: QualityRead[] = QUALITIES.map((q) => {
    const mine = target.signals[q.id];
    const value = mine && isNum(mine.value) ? mine.value : null;

    // Assemble the two ranking pools (values only, oriented higher=better).
    const orient = (v: number) => (q.higherIsBetter ? v : -v);
    const squadPool: number[] = [];
    const positionPool: number[] = [];
    for (const p of input.players) {
      const s = p.signals[q.id];
      if (!s || !isNum(s.value)) continue;
      squadPool.push(orient(s.value));
      if (grp && p.position && positionGroup(p.position, sport) === grp) positionPool.push(orient(s.value));
    }

    let positionPercentile: number | null = null;
    let squadPercentile: number | null = null;
    let benchmark: "position" | "squad" | null = null;
    let poolSize = 0;

    if (value != null) {
      const ov = orient(value);
      squadPercentile = percentile(ov, squadPool);
      const posPctl = positionPool.length >= MIN_POSITION_POOL ? percentile(ov, positionPool) : null;
      if (posPctl != null) { positionPercentile = posPctl; benchmark = "position"; poolSize = positionPool.length; }
      else if (squadPercentile != null) { positionPercentile = squadPercentile; benchmark = "squad"; poolSize = squadPool.length; }
    }

    const primaryPctl = value == null ? null : positionPercentile;
    return {
      id: q.id,
      value,
      unit: mine?.unit ?? "",
      source: value != null ? (mine?.source ?? null) : null,
      date: value != null ? (mine?.date ?? null) : null,
      sampleSize: value != null ? (mine?.sampleSize ?? null) : null,
      positionPercentile,
      squadPercentile,
      benchmark,
      poolSize,
      verdict: value == null ? "no_data" : verdictOf(primaryPctl),
      confidence: value == null ? "low" : confidenceOf(mine?.sampleSize, poolSize, benchmark ?? "squad"),
      trend: value == null ? null : trendOf(mine?.series, q.higherIsBetter),
    } satisfies QualityRead;
  });

  const withData = qualities.filter((r) => r.value != null);
  const sources = Array.from(new Set(withData.map((r) => r.source).filter((s): s is string => !!s)));
  const strengths = withData
    .filter((r) => r.verdict === "strength")
    .sort((a, b) => (b.positionPercentile ?? 0) - (a.positionPercentile ?? 0));
  const weaknesses = withData
    .filter((r) => r.verdict === "weakness")
    .sort((a, b) => (a.positionPercentile ?? 100) - (b.positionPercentile ?? 100));

  return {
    playerId,
    position: target.position,
    positionGroup: grp,
    qualities,
    strengths,
    weaknesses,
    coverage: {
      sources,
      qualitiesWithData: withData.length,
      totalQualities: QUALITIES.length,
      ratio: withData.length / QUALITIES.length,
    },
  };
}
