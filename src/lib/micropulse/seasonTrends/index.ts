/**
 * Season-level HSR + IMA trends (surfacing, not ingest — the data auto-syncs).
 *
 * Per player, over the season: (1) an HSR load trend from the synced velocity bands
 * (V5+V6 = >19.8 km/h at this account's band-5 edge), (2) an IMA accel/decel DENSITY
 * trend (efforts per minute), and (3) the directional balance (forward / backward /
 * lateral share) of his intense inertial efforts, reusing peakMovementSignature.
 *
 * HONEST: these are SESSION (per-match) totals — a season load trend — NOT a peak-window
 * HSR curve. OpenField exposes MII peak windows for Distance / Player Load only, never HSR,
 * so a peak-window HSR rate is not fabricated here; the Power Curve's peak track stays
 * PL/Distance. Descriptive — never the readiness colour.
 */

import type { ClockGrid } from "../directionalSignature";
import { computePeakMovementSignature, ARCHETYPE_LABEL } from "../peakMovementSignature";

export type Bi = { en: string; is: string };
export type Trend = "up" | "flat" | "down";
export type Point = { date: string; value: number };

export type MetricTrend = {
  series: Point[];
  rollingMean: number | null; // mean over the last ROLLING_DAYS
  latest: number | null;
  trend: Trend;
};

export type DirectionRead = { forward: number; backward: number; lateral: number; archetype: Bi | null };
/** One point of the directional balance OVER TIME (shares sum to ~1). */
export type DirectionPoint = { date: string; forward: number; backward: number; lateral: number };

export type SeasonTrends = {
  scope: "match" | "all";     // which sessions the trend is built from
  n: number;                  // sessions in scope with data
  hsr: MetricTrend | null;    // >19.8 km/h metres per session
  imaDensity: MetricTrend | null; // accel+decel efforts per minute
  direction: DirectionRead | null;       // season-aggregate mix (the summary read)
  directionSeries: DirectionPoint[];      // the mix trended over the season (empty when no clock)
  verdict: Bi;
  facts: Bi[];
  confidence: "high" | "medium" | "low";
};

/** Trailing window (in clocked sessions) summed before classifying each directional point —
 *  smooths a single match's noise and guarantees enough intense events to read a share. */
const DIRECTION_WINDOW = 5;

/** One synced session for a player (the loader maps player_external_load_daily rows). */
export type SeasonSessionRow = {
  date: string;
  isMatch: boolean;
  /** >19.8 km/h metres = V5 + V6, or the hir/high-speed fallback. Null if none. */
  hsrM: number | null;
  accel: number | null;
  decel: number | null;
  accelDecelEfforts: number | null;
  durationMin: number | null;
  clock: ClockGrid | null;
};

const ROLLING_DAYS = 70;      // ~10-week rolling band
const MIN_MATCHES_FOR_MATCH_SCOPE = 5;
const TREND_DEADBAND = 0.1;   // ±10% between recent and prior mean before a trend is called

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Recent-vs-prior trend over an ordered series (oldest→newest). */
function trendOf(series: Point[]): Trend {
  if (series.length < 4) return "flat";
  const k = Math.min(6, Math.floor(series.length / 2));
  const recent = mean(series.slice(-k).map((p) => p.value)) ?? 0;
  const prior = mean(series.slice(-2 * k, -k).map((p) => p.value)) ?? 0;
  if (prior <= 0) return "flat";
  if (recent > prior * (1 + TREND_DEADBAND)) return "up";
  if (recent < prior * (1 - TREND_DEADBAND)) return "down";
  return "flat";
}

function metricTrend(rows: SeasonSessionRow[], value: (r: SeasonSessionRow) => number | null): MetricTrend | null {
  const series: Point[] = rows
    .map((r) => ({ date: r.date, v: value(r) }))
    .filter((p): p is { date: string; v: number } => p.v != null && Number.isFinite(p.v))
    .map((p) => ({ date: p.date, value: Math.round(p.v * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length === 0) return null;
  const latestDate = series[series.length - 1].date;
  const floor = new Date(`${latestDate}T00:00:00Z`); floor.setUTCDate(floor.getUTCDate() - ROLLING_DAYS);
  const floorIso = floor.toISOString().slice(0, 10);
  const rolling = mean(series.filter((p) => p.date >= floorIso).map((p) => p.value));
  return {
    series,
    rollingMean: rolling != null ? Math.round(rolling * 10) / 10 : null,
    latest: series[series.length - 1].value,
    trend: trendOf(series),
  };
}

/** Sum a set of IMA directional clocks cell-by-cell into one season clock. */
function sumClocks(clocks: Array<ClockGrid | null>): ClockGrid | null {
  const out: ClockGrid = {};
  let any = false;
  for (const g of clocks) {
    if (!g) continue;
    for (const [dir, cell] of Object.entries(g)) {
      if (!cell) continue;
      any = true;
      const cur = out[dir] ?? { high: 0, medium: 0, low: 0 };
      out[dir] = {
        high: (cur.high ?? 0) + (cell.high ?? 0),
        medium: (cur.medium ?? 0) + (cell.medium ?? 0),
        low: (cur.low ?? 0) + (cell.low ?? 0),
      };
    }
  }
  return any ? out : null;
}

const TREND_WORD: Record<Trend, Bi> = {
  up: { en: "trending up", is: "hækkandi" },
  flat: { en: "steady", is: "stöðugt" },
  down: { en: "trending down", is: "lækkandi" },
};

/** Build the season trends. Pure. */
export function buildSeasonTrends(rows: SeasonSessionRow[]): SeasonTrends {
  const matches = rows.filter((r) => r.isMatch);
  const useMatch = matches.length >= MIN_MATCHES_FOR_MATCH_SCOPE;
  const scope: "match" | "all" = useMatch ? "match" : "all";
  const base = useMatch ? matches : rows;

  const hsr = metricTrend(base, (r) => r.hsrM);
  const imaDensity = metricTrend(base, (r) => {
    const efforts = r.accelDecelEfforts ?? ((r.accel ?? 0) + (r.decel ?? 0));
    return r.durationMin && r.durationMin > 0 && efforts > 0 ? efforts / r.durationMin : null;
  });

  // Directional balance — reuse the movement-signature classifier over the summed season clock.
  let direction: DirectionRead | null = null;
  const clock = sumClocks(base.map((r) => r.clock));
  if (clock) {
    const sig = computePeakMovementSignature({ clock });
    if (sig.hasData) {
      const share = (k: "forward" | "backward" | "multidirectional") => sig.segments.find((s) => s.key === k)?.share ?? 0;
      direction = {
        forward: share("forward"),
        backward: share("backward"),
        lateral: share("multidirectional"),
        archetype: sig.archetype ? ARCHETYPE_LABEL[sig.archetype] ?? null : null,
      };
    }
  }

  // Directional balance OVER TIME — a trailing-window share at each clocked session, using the
  // SAME classifier as the aggregate (one clock→direction mapping, kept in peakMovementSignature).
  const directionSeries: DirectionPoint[] = [];
  const clocked = base
    .filter((r) => r.clock)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < clocked.length; i++) {
    const win = clocked.slice(Math.max(0, i - DIRECTION_WINDOW + 1), i + 1).map((r) => r.clock);
    const g = sumClocks(win);
    if (!g) continue;
    const sig = computePeakMovementSignature({ clock: g });
    if (!sig.hasData || sig.segments.length === 0) continue; // too little intense movement to read
    const sh = (k: "forward" | "backward" | "multidirectional") => sig.segments.find((s) => s.key === k)?.share ?? 0;
    directionSeries.push({ date: clocked[i].date, forward: sh("forward"), backward: sh("backward"), lateral: sh("multidirectional") });
  }

  const n = base.length;
  const confidence: SeasonTrends["confidence"] = n >= 12 ? "high" : n >= 5 ? "medium" : "low";

  // Verdict — HSR trend + movement shape, plain language.
  const isEnHsr = hsr ? TREND_WORD[hsr.trend].en : "no HSR data";
  const dirWord = direction
    ? direction.forward >= direction.backward && direction.forward >= direction.lateral ? { en: "forward-dominant (attacking)", is: "fram-drifið (sókn)" }
      : direction.lateral >= direction.forward && direction.lateral >= direction.backward ? { en: "multidirectional", is: "fjöl-átta" }
      : { en: "backward-leaning (recovery)", is: "aftur-drifið (endurheimt)" }
    : null;
  const verdict: Bi = {
    en: `HSR ${isEnHsr}${scope === "match" ? " over recent matches" : " over recent sessions"}${dirWord ? `; movement is ${dirWord.en}` : ""}.`,
    is: `Háhraði ${hsr ? TREND_WORD[hsr.trend].is : "engin gögn"}${scope === "match" ? " síðustu leiki" : " síðustu æfingar"}${dirWord ? `; hreyfing er ${dirWord.is}` : ""}.`,
  };

  const facts: Bi[] = [];
  if (hsr) facts.push({
    en: `HSR (>19.8 km/h, per ${scope === "match" ? "match" : "session"}): latest ${hsr.latest} m, ~${hsr.rollingMean} m rolling (${TREND_WORD[hsr.trend].en}).`,
    is: `Háhraði (>19,8 km/klst, per ${scope === "match" ? "leik" : "æfingu"}): nýjast ${hsr.latest} m, ~${hsr.rollingMean} m hlaupandi (${TREND_WORD[hsr.trend].is}).`,
  });
  if (imaDensity) facts.push({
    en: `Accel/decel density: ${imaDensity.latest}/min latest, ~${imaDensity.rollingMean}/min rolling (${TREND_WORD[imaDensity.trend].en}).`,
    is: `Hröðun/hraðaminnkun þéttleiki: ${imaDensity.latest}/mín nýjast, ~${imaDensity.rollingMean}/mín hlaupandi (${TREND_WORD[imaDensity.trend].is}).`,
  });
  if (direction) facts.push({
    en: `Movement mix: ${Math.round(direction.forward * 100)}% forward · ${Math.round(direction.backward * 100)}% backward · ${Math.round(direction.lateral * 100)}% lateral.`,
    is: `Hreyfi-blanda: ${Math.round(direction.forward * 100)}% fram · ${Math.round(direction.backward * 100)}% aftur · ${Math.round(direction.lateral * 100)}% til hliðar.`,
  });

  return { scope, n, hsr, imaDensity, direction, directionSeries, verdict, facts, confidence };
}
