/**
 * Goalkeeper analysis — a season read for a keeper from his per-match StatsBomb stats
 * (the per-player Match Stats export → player_match_stats.metrics). Pure, IO-free.
 *
 * Outfield per-90 percentiles don't describe a keeper, so this is the GK-specific view:
 * shot-stopping (Goals Saved Above Average, Save%, post-shot xG faced) and distribution
 * (pass completion, playing short vs long, passes into the final third). Rules aggregate;
 * the AI layer only phrases them. Descriptive — never touches the readiness verdict.
 */

export type GkMatch = {
  minutes: number | null;
  shotsFaced: number | null; saves: number | null; psxgFaced: number | null; gsaa: number | null; savePct: number | null;
  passes: number | null; successfulPasses: number | null; passesToFinalThird: number | null; passLength: number | null;
  longGoalKicks: number | null; shortGoalKicks: number | null;
};

export type GoalkeeperAnalysis = {
  matches: number; minutes: number;
  shotStopping: {
    shotsFaced: number; saves: number; savePct: number | null;
    psxgFaced: number; goalsConceded: number; gsaa: number; // gsaa = goals PREVENTED vs an average keeper (psxgFaced − conceded)
    perMatchGsaa: number | null;
  };
  distribution: {
    passes: number; passCompletionPct: number | null; passesToFinalThird: number; avgPassLength: number | null;
    longGoalKicks: number; shortGoalKicks: number; longBallPct: number | null; // share of goal kicks played long
  };
};

const n = (v: number | null): number => (v == null || !Number.isFinite(v) ? 0 : v);
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

export function buildGoalkeeperAnalysis(matches: GkMatch[]): GoalkeeperAnalysis {
  const minutes = matches.reduce((a, m) => a + n(m.minutes), 0);
  const shotsFaced = matches.reduce((a, m) => a + n(m.shotsFaced), 0);
  const saves = matches.reduce((a, m) => a + n(m.saves), 0);
  const psxgFaced = r2(matches.reduce((a, m) => a + n(m.psxgFaced), 0));
  const gsaa = r2(matches.reduce((a, m) => a + n(m.gsaa), 0));
  // Non-penalty goals conceded is not exported directly; GSAA = post-shot xG faced − goals
  // conceded, so conceded = psxgFaced − gsaa (rounded, floored at 0).
  const goalsConceded = Math.max(0, Math.round(psxgFaced - gsaa));

  const passes = matches.reduce((a, m) => a + n(m.passes), 0);
  const successful = matches.reduce((a, m) => a + n(m.successfulPasses), 0);
  const passesToFinalThird = matches.reduce((a, m) => a + n(m.passesToFinalThird), 0);
  // Average pass length weighted by pass volume (fall back to a plain mean).
  const lenRows = matches.filter((m) => m.passLength != null);
  const avgPassLength = lenRows.length
    ? r2(lenRows.reduce((a, m) => a + n(m.passLength) * (n(m.passes) || 1), 0) / lenRows.reduce((a, m) => a + (n(m.passes) || 1), 0))
    : null;
  const longGoalKicks = matches.reduce((a, m) => a + n(m.longGoalKicks), 0);
  const shortGoalKicks = matches.reduce((a, m) => a + n(m.shortGoalKicks), 0);

  return {
    matches: matches.length, minutes: Math.round(minutes),
    shotStopping: {
      shotsFaced, saves, savePct: pct(saves, shotsFaced),
      psxgFaced, goalsConceded, gsaa,
      perMatchGsaa: matches.length ? r2(gsaa / matches.length) : null,
    },
    distribution: {
      passes, passCompletionPct: pct(successful, passes), passesToFinalThird, avgPassLength,
      longGoalKicks, shortGoalKicks, longBallPct: pct(longGoalKicks, longGoalKicks + shortGoalKicks),
    },
  };
}
