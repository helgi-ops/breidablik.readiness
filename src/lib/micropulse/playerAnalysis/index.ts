/**
 * Player analysis — own-squad player read from StatsBomb per-90 stats.
 *
 * Pure, IO-free. Ranks a player's per-90 metrics into PERCENTILES within the squad
 * (players over a minutes floor), groups them by area (attacking / possession /
 * defending), and surfaces strengths (top quartile) and weaknesses (bottom quartile)
 * plus a role hint (the area they rate highest in). Descriptive context only — it
 * never touches the readiness colour. The AI layer only phrases these numbers.
 */

export type PlayerRow = { name: string; minutes: number | null; goals: number | null; assists: number | null; xg: number | null; metrics: Record<string, number | null> };

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
};

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
  // Percentile pool: squad-mates over the minutes floor (always include the player).
  const pool = squad.filter((p) => (p.minutes ?? 0) >= minMinutes || p.name === player);

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

  return { player, minutes: me.minutes, goals: me.goals, assists: me.assists, poolSize: pool.length, metrics, strengths, weaknesses, byCategory, role };
}
