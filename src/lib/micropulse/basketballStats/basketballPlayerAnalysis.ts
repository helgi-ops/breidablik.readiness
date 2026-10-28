/**
 * basketballPlayerAnalysis — a basketball-native player read from box-score game lines.
 *
 * Pure (no IO). Aggregates per-game box lines into per-player season averages, then ranks each
 * player WITHIN THEIR OWN SQUAD (percentiles) across scoring / rebounding / playmaking /
 * defence / efficiency. The box metrics come from whatever fed the game (InStat upload or the
 * KKÍ box), so every player in the pool is scored on the same columns. Descriptive — never a
 * readiness or training signal.
 */

export type BoxLine = {
  name: string;
  pts?: number | null; reb?: number | null; oreb?: number | null; dreb?: number | null;
  ast?: number | null; stl?: number | null; blk?: number | null; tov?: number | null;
  fgm?: number | null; fga?: number | null; tpm?: number | null; tpa?: number | null; ftm?: number | null; fta?: number | null;
};

export type PlayerSeason = {
  name: string; games: number;
  ppg: number; rpg: number; oreb: number; dreb: number; apg: number; spg: number; bpg: number; topg: number;
  fgPct: number | null; tpPct: number | null; ftPct: number | null; efgPct: number | null; tsPct: number | null;
  // Per-game shooting volume, split by shot type (makes & attempts).
  twoM: number; twoA: number; threeM: number; threeA: number; ftM: number; ftA: number;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const pct = (m: number, a: number): number | null => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);

/** Group per-game box lines by a stable player key (handles InStat vs KKÍ name spellings) and
 *  reduce to per-player season averages. `keyFn` folds names to a comparable key. */
export function aggregatePlayers(lines: BoxLine[], keyFn: (name: string) => string): PlayerSeason[] {
  type Acc = { name: string; g: number; pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number };
  const by = new Map<string, Acc>();
  for (const l of lines) {
    const nm = String(l.name ?? "").trim(); if (!nm) continue;
    const k = keyFn(nm); if (!k) continue;
    const a = by.get(k) ?? { name: nm, g: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
    a.g += 1;
    a.pts += num(l.pts); a.reb += num(l.reb); a.oreb += num(l.oreb); a.dreb += num(l.dreb);
    a.ast += num(l.ast); a.stl += num(l.stl); a.blk += num(l.blk); a.tov += num(l.tov);
    a.fgm += num(l.fgm); a.fga += num(l.fga); a.tpm += num(l.tpm); a.tpa += num(l.tpa); a.ftm += num(l.ftm); a.fta += num(l.fta);
    if (nm.length > a.name.length) a.name = nm; // keep the fuller spelling
    by.set(k, a);
  }
  return [...by.values()].map((a) => ({
    name: a.name, games: a.g,
    ppg: r1(a.pts / a.g), rpg: r1(a.reb / a.g), oreb: r1(a.oreb / a.g), dreb: r1(a.dreb / a.g),
    apg: r1(a.ast / a.g), spg: r1(a.stl / a.g), bpg: r1(a.blk / a.g), topg: r1(a.tov / a.g),
    fgPct: pct(a.fgm, a.fga), tpPct: pct(a.tpm, a.tpa), ftPct: pct(a.ftm, a.fta),
    efgPct: a.fga > 0 ? Math.round(((a.fgm + 0.5 * a.tpm) / a.fga) * 1000) / 10 : null,
    tsPct: (a.fga + 0.44 * a.fta) > 0 ? Math.round((a.pts / (2 * (a.fga + 0.44 * a.fta))) * 1000) / 10 : null,
    // 2-pt = all field goals minus threes; per game.
    twoM: r1((a.fgm - a.tpm) / a.g), twoA: r1((a.fga - a.tpa) / a.g),
    threeM: r1(a.tpm / a.g), threeA: r1(a.tpa / a.g), ftM: r1(a.ftm / a.g), ftA: r1(a.fta / a.g),
  }));
}

// ── Percentile analysis ──────────────────────────────────────────────────────
type MetricKey = "ppg" | "twoA" | "threeA" | "ftA" | "fgPct" | "tpPct" | "efgPct" | "tsPct" | "rpg" | "oreb" | "dreb" | "apg" | "topg" | "spg" | "bpg";
type CatKey = "scoring" | "rebounding" | "playmaking" | "defense" | "efficiency";

const METRIC_LABELS: Record<MetricKey, { en: string; is: string }> = {
  ppg: { en: "Points / game", is: "Stig / leik" },
  twoA: { en: "2PT made/att", is: "2ja hitt/skot" }, threeA: { en: "3PT made/att", is: "3ja hitt/skot" }, ftA: { en: "FT made/att", is: "Víti hitt/skot" },
  fgPct: { en: "FG%", is: "Skotnýting" }, tpPct: { en: "3PT%", is: "Þriggja %" },
  efgPct: { en: "eFG%", is: "Virk FG%" }, tsPct: { en: "TS%", is: "Sönn nýting" },
  rpg: { en: "Rebounds / game", is: "Fráköst / leik" }, oreb: { en: "Off. reb / game", is: "Sóknarfrák. / leik" }, dreb: { en: "Def. reb / game", is: "Varnarfrák. / leik" },
  apg: { en: "Assists / game", is: "Stoðsendingar / leik" }, topg: { en: "Turnovers / game", is: "Tapaðir / leik" },
  spg: { en: "Steals / game", is: "Stolnir / leik" }, bpg: { en: "Blocks / game", is: "Varin / leik" },
};
const CAT_LABELS: Record<CatKey, { en: string; is: string }> = {
  scoring: { en: "Scoring", is: "Skor" }, rebounding: { en: "Rebounding", is: "Fráköst" },
  playmaking: { en: "Playmaking", is: "Leikstjórnun" }, defense: { en: "Defense", is: "Vörn" }, efficiency: { en: "Efficiency", is: "Nýting" },
};
const CATEGORIES: Record<CatKey, MetricKey[]> = {
  scoring: ["ppg", "twoA", "threeA", "ftA"], efficiency: ["fgPct", "tpPct", "efgPct", "tsPct"],
  rebounding: ["rpg", "oreb", "dreb"], playmaking: ["apg", "topg"], defense: ["spg", "bpg"],
};
// Shot-volume splits: shown as "makes/attempts" with a volume percentile bar, but NOT counted as a
// strength/weakness (raw volume isn't a skill) — the makes come from a sibling field, see below.
const SHOT_SPLIT: Partial<Record<MetricKey, (p: PlayerSeason) => { m: number; a: number }>> = {
  twoA: (p) => ({ m: p.twoM, a: p.twoA }), threeA: (p) => ({ m: p.threeM, a: p.threeA }), ftA: (p) => ({ m: p.ftM, a: p.ftA }),
};
// Lower is better for turnovers; everything else higher is better.
const LOWER_BETTER = new Set<MetricKey>(["topg"]);

const metricVal = (p: PlayerSeason, k: MetricKey): number | null => (p[k] as number | null);

/** Percentile of a value within the pool (share at/below), inverted for lower-is-better. */
function percentile(pool: PlayerSeason[], k: MetricKey, value: number): number {
  const vals = pool.map((p) => metricVal(p, k)).filter((v): v is number => v != null);
  if (vals.length <= 1) return 50;
  const atOrBelow = vals.filter((v) => v <= value).length;
  const base = Math.round((atOrBelow / vals.length) * 100);
  return LOWER_BETTER.has(k) ? 100 - base : base;
}

export type MetricCell = { key: MetricKey; label: { en: string; is: string }; value: number | null; percentile: number | null; valueText?: string };
export type Category = { key: CatKey; label: { en: string; is: string }; avgPercentile: number | null; metrics: MetricCell[] };
export type PlayerAnalysis = {
  name: string; games: number; season: PlayerSeason;
  role: { key: CatKey; label: { en: string; is: string } } | null;
  categories: Category[];
  strengths: MetricCell[]; weaknesses: MetricCell[];
  smallSample: boolean; poolSize: number;
};

export const MIN_GAMES_POOL = 1;   // every player with at least one game is in the pool
export const SMALL_SAMPLE_GAMES = 3;

/** Build the within-squad percentile read for one player. `pool` is the whole squad's seasons. */
export function buildBasketballPlayerAnalysis(pool: PlayerSeason[], pickedName: string, keyFn: (name: string) => string): PlayerAnalysis | null {
  const scored = pool.filter((p) => p.games >= MIN_GAMES_POOL);
  const picked = scored.find((p) => keyFn(p.name) === keyFn(pickedName)) ?? pool.find((p) => keyFn(p.name) === keyFn(pickedName));
  if (!picked) return null;

  const categories: Category[] = (Object.keys(CATEGORIES) as CatKey[]).map((cat) => {
    const metrics: MetricCell[] = CATEGORIES[cat].map((k) => {
      const value = metricVal(picked, k);
      const pc = value == null ? null : percentile(scored, k, value);
      const split = SHOT_SPLIT[k]?.(picked);
      return { key: k, label: METRIC_LABELS[k], value, percentile: pc, ...(split ? { valueText: `${split.m}/${split.a}` } : {}) };
    });
    // The category percentile (role detection, Total Player Analysis) is the mean of its SKILL
    // metrics; shot-volume splits are display-only context and don't move it.
    const pcs = metrics.filter((m) => !(m.key in SHOT_SPLIT)).map((m) => m.percentile).filter((v): v is number => v != null);
    return { key: cat, label: CAT_LABELS[cat], avgPercentile: pcs.length ? Math.round(pcs.reduce((a, b) => a + b, 0) / pcs.length) : null, metrics };
  });

  const role = categories.filter((c) => c.avgPercentile != null).sort((a, b) => (b.avgPercentile! - a.avgPercentile!))[0] ?? null;
  // Shot-volume splits are descriptive context, not a skill ranking → keep them out of strengths/weaknesses.
  const allCells = categories.flatMap((c) => c.metrics).filter((m) => m.percentile != null && !(m.key in SHOT_SPLIT));
  const strengths = allCells.filter((m) => m.percentile! >= 75).sort((a, b) => b.percentile! - a.percentile!);
  const weaknesses = allCells.filter((m) => m.percentile! <= 25).sort((a, b) => a.percentile! - b.percentile!);

  return {
    name: picked.name, games: picked.games, season: picked,
    role: role ? { key: role.key, label: role.label } : null,
    categories, strengths, weaknesses,
    smallSample: picked.games < SMALL_SAMPLE_GAMES, poolSize: scored.length,
  };
}
