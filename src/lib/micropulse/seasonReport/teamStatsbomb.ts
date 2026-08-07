/**
 * Own-team StatsBomb season read — the "Team season report (article)" data model.
 *
 * Pure, IO-free. Takes the own team's StatsBomb Team Stats profile (the `sb` extras
 * bag) and the built-in League Average row, and produces the article's spine:
 *   - the full metric table (value · league · a first-person "read" tag), and
 *   - headline signals the AI prose + verdict are written from.
 *
 * First-person / own-team framing (never "how to hurt them"). Descriptive context
 * only — nothing here touches the readiness colour. Rules compute; the AI only
 * rephrases these numbers into prose (and is labelled AI).
 */

export type Sb = Record<string, number | null>;
export type ReadTag = "strength" | "good" | "neutral" | "below" | "weak" | "above" | "even";
/** direction of "better": up = higher is better, down = lower is better, style = no value judgement. */
type Dir = "up" | "down" | "style";

export type MetricRow = {
  key: string;
  value: number | null;
  league: number | null;
  dir: Dir;
  read: ReadTag;
  /** relative to league (value/league), null-safe — for sorting the biggest gaps. */
  rel: number | null;
};

export type TeamSeasonStatsbomb = {
  team: string;
  season: string;
  matches: number | null;
  rows: MetricRow[];
  /** Headline signals (rule-computed) the verdict/facts/strengths/weaknesses lean on. */
  signals: {
    npxgDiff: number | null;         // npxg − npxgAgainst
    finishing: number | null;        // goals − npxg (overperformance)
    chanceCreationRel: number | null;// npxg vs league (<1 = below)
    obvRel: number | null;           // total OBV vs league
    shotObvFacedGap: number | null;  // team − league (more negative than league = leak quality)
    setPieceDefence: number | null;  // set-piece goals conceded vs league (lower = better)
    possessionRel: number | null;    // possession vs league
    strengths: string[];             // metric keys tagged strength/good
    weaknesses: string[];            // metric keys tagged weak/below
  };
};

/** Per-player season line (per-90 StatsBomb metrics) for the key-contributors read. */
export type PlayerRow = { name: string; minutes: number | null; obv: number | null; npxg: number | null; xa: number | null; defObv: number | null };
export type Contributors = {
  attacker: { name: string; npxg: number | null; obv: number | null } | null;
  creator: { name: string; xa: number | null } | null;
  defender: { name: string; defObv: number | null } | null;
};

/** Top output / creator / defensive value among players over a minutes floor. */
export function topContributors(players: PlayerRow[], minMinutes = 450): Contributors {
  const pool = players.filter((p) => (p.minutes ?? 0) >= minMinutes);
  const best = (rows: PlayerRow[], score: (p: PlayerRow) => number | null): PlayerRow | null => {
    let top: PlayerRow | null = null, topS = -Infinity;
    for (const p of rows) { const sc = score(p); if (sc != null && sc > topS) { topS = sc; top = p; } }
    return top;
  };
  const a = best(pool, (p) => (p.npxg != null || p.obv != null ? (p.npxg ?? 0) + (p.obv ?? 0) : null));
  const c = best(pool, (p) => p.xa);
  const d = best(pool, (p) => p.defObv);
  return {
    attacker: a ? { name: a.name, npxg: a.npxg, obv: a.obv } : null,
    creator: c ? { name: c.name, xa: c.xa } : null,
    defender: d ? { name: d.name, defObv: d.defObv } : null,
  };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rel = (v: number | null, lg: number | null): number | null => (v != null && lg != null && lg !== 0 ? v / lg : null);

/** Read tag from value vs league, given which direction counts as "better". */
function readTag(value: number | null, league: number | null, dir: Dir): ReadTag {
  if (value == null || league == null) return "neutral";
  const r = league !== 0 ? value / league : 1;
  const hi = 1.04, lo = 0.96, HI = 1.18, LO = 0.82;
  if (dir === "style") return r > 1.05 ? "above" : r < 0.95 ? "below" : "even";
  if (dir === "up") {
    if (r >= HI) return "strength"; if (r >= hi) return "good";
    if (r <= LO) return "weak"; if (r <= lo) return "below"; return "neutral";
  }
  // dir === "down": lower is better, so invert.
  if (r <= LO) return "strength"; if (r <= lo) return "good";
  if (r >= HI) return "weak"; if (r >= hi) return "below"; return "neutral";
}

/** metric key → [team sb key, league sb key, direction]. Order = table order. */
const METRICS: Array<[string, string, Dir]> = [
  ["goals", "gf", "up"], ["goalsConceded", "ga", "down"],
  ["npxg", "npxg", "up"], ["npxgFaced", "npxgAgainst", "down"],
  ["shots", "shots", "up"], ["shotsFaced", "shotsAgainst", "down"],
  ["clearShots", "clearShots", "up"], ["openPlayXg", "openPlayXg", "up"], ["counterShots", "counterAttackShots", "up"],
  ["passes", "passes", "style"], ["passingPct", "passingPct", "up"],
  ["deepCompletions", "deepCompletions", "up"], ["passesInsideBox", "passesInsideBox", "up"],
  ["passObv", "passObv", "up"], ["totalObv", "obv", "up"],
  ["passesInsideBoxConceded", "passesInsideBoxAgainst", "down"], ["oppDeepCompletions", "deepCompletionsAgainst", "down"],
  ["highPressShotsConceded", "highPressShotsConceded", "down"], ["shotObvFaced", "shotObvFaced", "up"],
  ["setPieceXg", "setPieceXg", "up"], ["cornerXg", "cornerXg", "up"], ["throwInXg", "throwInXg", "up"],
  ["setPieceGoalsConceded", "setPieceGoalsAgainst", "down"], ["setPieceXgFaced", "setPieceXgAgainst", "down"],
];

export function buildTeamSeasonStatsbomb(input: { team: string; season: string; matches: number | null; team_sb: Sb; league_sb: Sb }): TeamSeasonStatsbomb {
  const { team, season, matches, team_sb, league_sb } = input;
  const rows: MetricRow[] = METRICS.map(([key, sbKey, dir]) => {
    const value = num(team_sb[sbKey]);
    const league = num(league_sb[sbKey]);
    return { key, value, league, dir, read: readTag(value, league, dir), rel: rel(value, league) };
  });

  const strengths = rows.filter((r) => r.read === "strength" || r.read === "good").map((r) => r.key);
  const weaknesses = rows.filter((r) => r.read === "weak" || r.read === "below").map((r) => r.key);

  const npxg = num(team_sb.npxg), npxgAg = num(team_sb.npxgAgainst), goals = num(team_sb.gf);
  return {
    team, season, matches, rows,
    signals: {
      npxgDiff: npxg != null && npxgAg != null ? Math.round((npxg - npxgAg) * 100) / 100 : null,
      finishing: goals != null && npxg != null ? Math.round((goals - npxg) * 100) / 100 : null,
      chanceCreationRel: rel(npxg, num(league_sb.npxg)),
      obvRel: rel(num(team_sb.obv), num(league_sb.obv)),
      shotObvFacedGap: num(team_sb.shotObvFaced) != null && num(league_sb.shotObvFaced) != null ? Math.round((num(team_sb.shotObvFaced)! - num(league_sb.shotObvFaced)!) * 100) / 100 : null,
      setPieceDefence: rel(num(team_sb.setPieceGoalsAgainst), num(league_sb.setPieceGoalsAgainst)),
      possessionRel: rel(num(team_sb.passes), num(league_sb.passes)),
      strengths,
      weaknesses,
    },
  };
}
