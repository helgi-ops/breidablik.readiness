/**
 * Player analysis — own-squad player read from StatsBomb per-90 stats.
 *
 * Pure, IO-free. Ranks a player's per-90 metrics into PERCENTILES within the squad
 * (players over a minutes floor), groups them by area (attacking / possession /
 * defending), and surfaces strengths (top quartile) and weaknesses (bottom quartile)
 * plus a role hint (the area they rate highest in). Descriptive context only — it
 * never touches the readiness colour. The AI layer only phrases these numbers.
 */

export type PlayerRow = { name: string; minutes: number | null; goals: number | null; assists: number | null; xg: number | null; metrics: Record<string, number | null>; isGoalkeeper?: boolean };

export type Category = "attacking" | "possession" | "defending";
export type MetricRow = { key: string; label: string; category: Category; value: number | null; percentile: number | null };

export type PlayerAnalysis = {
  player: string; minutes: number | null; goals: number | null; assists: number | null;
  poolSize: number;
  metrics: MetricRow[];
  strengths: MetricRow[];
  weaknesses: MetricRow[];
  byCategory: { attacking: number | null; possession: number | null; defending: number | null };
  role: Category | null;
  goalkeeper: boolean; // ranked on outfield metrics would be meaningless → surfaced as a note
};

/**
 * Is this row a goalkeeper? StatsBomb reports GK-only columns (Save%, xSv%, Goalkeeper
 * OBV, GK Aggressive Dist, Shots Faced) as ZERO/blank for outfielders and as real values
 * for a keeper — so a NON-ZERO value there is the tell (mere presence is not: the export
 * stores these as 0 for everyone). Plus an explicit "Goalkeeper"/"GK" position when the
 * export carries one. NB: "Shot Stopping%" is populated for everyone, so it is NOT used.
 * Pure.
 */
const GK_KEYS = ["Save%", "xSv%", "Goalkeeper OBV", "GK Aggressive Dist", "Shots Faced"];
export function looksLikeGoalkeeper(raw: Record<string, unknown> | null | undefined, position?: string | null): boolean {
  if (position && /goal\s?keeper|^gk$/i.test(position.trim())) return true;
  if (!raw) return false;
  const lowerWanted = GK_KEYS.map((k) => k.toLowerCase());
  for (const [k, v] of Object.entries(raw)) {
    if (!lowerWanted.includes(k.toLowerCase())) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (v != null && v !== "" && Number.isFinite(n) && n !== 0) return true; // real GK output, not a 0 placeholder
  }
  return false;
}

/** metric key (in the StatsBomb per-90 bag) → [display label, area]. All higher = better. */
export const ANALYSIS_METRICS: Array<[string, string, Category]> = [
  ["Non Penalty xG", "Non-penalty xG", "attacking"],
  ["xG Assisted", "xG assisted", "attacking"],
  ["Shots", "Shots", "attacking"],
  ["Key Passes", "Key passes", "attacking"],
  ["Touches in box", "Touches in box", "attacking"],
  ["Dribbles", "Dribbles", "attacking"],
  ["Shot OBV", "Shot OBV", "attacking"],
  ["OBV", "Total OBV", "possession"],
  ["Dribble & Carry OBV", "Carry OBV", "possession"],
  ["Pass OBV", "Pass OBV", "possession"],
  ["Deep Progressions", "Deep progressions", "possession"],
  ["Deep Completions", "Deep completions", "possession"],
  ["Passing%", "Passing %", "possession"],
  ["Defensive Action OBV", "Defensive OBV", "defending"],
  ["Tackles", "Tackles", "defending"],
  ["Interceptions", "Interceptions", "defending"],
  ["Ball Recoveries", "Ball recoveries", "defending"],
  ["Pressures", "Pressures", "defending"],
];

/** Canonical metric key → other StatsBomb column names that carry the same value.
 * The Squad export uses "Shots" / "Touches in box"; the Player Stats export uses
 * "Non Penalty Shots" / "Touches In Box" (casing handled separately). Keep both working. */
const METRIC_ALIASES: Record<string, string[]> = {
  "Shots": ["Non Penalty Shots"],
  "Touches in box": ["Touches In Box"],
};

const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Resolve the ANALYSIS_METRICS values out of a raw per-90 bag, tolerantly: exact key,
 * then case-insensitive, then known aliases. Lets both the StatsBomb Squad export and
 * the (differently-cased) Player Stats export feed the same engine. Pure.
 */
export function readMetricBag(bag: Record<string, unknown> | null | undefined): Record<string, number | null> {
  const entries = bag ? Object.entries(bag) : [];
  const find = (name: string): unknown => {
    if (bag && bag[name] != null) return bag[name];
    const lower = name.toLowerCase();
    for (const [k, v] of entries) if (k.toLowerCase() === lower) return v;
    return undefined;
  };
  const out: Record<string, number | null> = {};
  for (const [key] of ANALYSIS_METRICS) {
    let v = find(key);
    if (v == null) { for (const alias of METRIC_ALIASES[key] ?? []) { v = find(alias); if (v != null) break; } }
    out[key] = toNum(v);
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const mean = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length)) : null);

/** Percentile rank of `v` within `all` (0-100): share of the pool at or below v. */
function percentile(v: number | null, all: number[]): number | null {
  if (v == null || all.length === 0) return null;
  const atOrBelow = all.filter((x) => x <= v).length;
  return Math.round((atOrBelow / all.length) * 100);
}

export function buildPlayerAnalysis(input: { player: string; squad: PlayerRow[]; minMinutes?: number }): PlayerAnalysis | null {
  const { player, squad } = input;
  const minMinutes = input.minMinutes ?? 300;
  const me = squad.find((p) => p.name === player);
  if (!me) return null;

  // Goalkeepers can't be ranked on outfield metrics — return a flagged shell so surfaces
  // show an honest "goalkeeper" note instead of meaningless bars, and never rank them.
  if (me.isGoalkeeper) {
    return { player, minutes: me.minutes, goals: me.goals, assists: me.assists, poolSize: 0, metrics: [], strengths: [], weaknesses: [], byCategory: { attacking: null, possession: null, defending: null }, role: null, goalkeeper: true };
  }

  // Percentile pool: OUTFIELD squad-mates over the minutes floor (always include the
  // player). Goalkeepers are excluded so they don't distort the outfield distribution.
  const pool = squad.filter((p) => !p.isGoalkeeper && ((p.minutes ?? 0) >= minMinutes || p.name === player));

  const metrics: MetricRow[] = ANALYSIS_METRICS.map(([key, label, category]) => {
    const value = num(me.metrics[key]);
    const all = pool.map((p) => num(p.metrics[key])).filter((x): x is number => x != null);
    return { key, label, category, value, percentile: percentile(value, all) };
  });

  const withPct = metrics.filter((m) => m.percentile != null);
  const strengths = withPct.filter((m) => (m.percentile ?? 0) >= 75).sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0));
  const weaknesses = withPct.filter((m) => (m.percentile ?? 100) <= 25).sort((a, b) => (a.percentile ?? 0) - (b.percentile ?? 0));

  const catAvg = (c: Category) => mean(withPct.filter((m) => m.category === c).map((m) => m.percentile!));
  const byCategory = { attacking: catAvg("attacking"), possession: catAvg("possession"), defending: catAvg("defending") };
  const role = (["attacking", "possession", "defending"] as Category[])
    .filter((c) => byCategory[c] != null)
    .sort((a, b) => (byCategory[b]! - byCategory[a]!))[0] ?? null;

  return { player, minutes: me.minutes, goals: me.goals, assists: me.assists, poolSize: pool.length, metrics, strengths, weaknesses, byCategory, role, goalkeeper: false };
}
