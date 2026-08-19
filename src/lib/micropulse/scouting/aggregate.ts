/**
 * Aggregate parsed Wyscout Team → Stats rows (from buildTeamMatchStatRows) into a
 * scouted team's SEASON profile + match list. The opponent's own export parses with
 * the team inferred from the file, so `is_opponent=false` rows are the scouted team
 * and `is_opponent=true` are its opponents (used for goals/xG conceded). Pure, no IO.
 */

import type { TeamMatchStatDbRow } from "../statsIngestion/buildTeamMatchRows";
import type { SbTeamSeason } from "../statsIngestion/statsbombLeagueTeam";
import type { Metrics, ScoutMatch } from "./opponentReport";

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const meanOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};
const ratioPct = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b > 0 ? Math.round((a / b) * 1000) / 10 : null;

export function aggregateScoutSeason(dbRows: TeamMatchStatDbRow[]): {
  nMatches: number; metrics: Metrics; matches: ScoutMatch[]; passingJson: Record<string, unknown> | null; attackingJson: Record<string, unknown> | null;
} {
  const own = dbRows.filter((r) => !r.is_opponent);
  const oppByDate = new Map(dbRows.filter((r) => r.is_opponent).map((r) => [r.match_date, r]));
  const M = (pick: (r: TeamMatchStatDbRow) => number | null) => meanOf(own.map((r) => num(pick(r))));

  const metrics: Metrics = {
    xgf: M((r) => r.xg), xga: meanOf(own.map((r) => num(oppByDate.get(r.match_date)?.xg ?? null))),
    gf: M((r) => r.goals), ga: meanOf(own.map((r) => num(oppByDate.get(r.match_date)?.goals ?? null))),
    shots: M((r) => r.shots), shotsAgainst: meanOf(own.map((r) => num(oppByDate.get(r.match_date)?.shots ?? null))),
    possession: M((r) => r.possession_pct),
    ppda: M((r) => r.ppda), defDuelsWonPct: M((r) => r.def_duels_won_pct),
    forwardPasses: M((r) => r.forward_passes), forwardPassAccPct: M((r) => r.forward_pass_acc_pct),
    passesFinalThird: M((r) => r.passes_final_third), passesFinalThirdAccPct: M((r) => r.passes_final_third_acc_pct),
    progressivePasses: M((r) => r.progressive_passes), smartPasses: M((r) => r.smart_passes), smartPassAccPct: M((r) => r.smart_pass_acc_pct),
    crosses: M((r) => r.crosses), crossAccPct: M((r) => r.cross_acc_pct),
    positionalAttacks: M((r) => r.positional_attacks), counterattacks: M((r) => r.counterattacks), offensiveDuelsWonPct: M((r) => r.offensive_duels_won_pct),
  };

  const matches: ScoutMatch[] = own.map((r) => {
    const opp = oppByDate.get(r.match_date);
    const gf = num(r.goals), ga = num(opp?.goals ?? null);
    const result: "W" | "D" | "L" | null = gf != null && ga != null ? (gf > ga ? "W" : gf < ga ? "L" : "D") : null;
    return {
      date: r.match_date, opponent: r.opponent_name, isHome: null, goals: gf, goalsAgainst: ga, xg: num(r.xg), xgAgainst: num(opp?.xg ?? null), result,
      // Rich per-match metrics — carried through so the recent-form window can average real data.
      shots: num(r.shots), shotsAgainst: num(opp?.shots ?? null), possession: num(r.possession_pct), ppda: num(r.ppda),
      defDuelsWonPct: num(r.def_duels_won_pct), forwardPasses: num(r.forward_passes), forwardPassAccPct: num(r.forward_pass_acc_pct),
      passesFinalThird: num(r.passes_final_third), passesFinalThirdAccPct: num(r.passes_final_third_acc_pct), progressivePasses: num(r.progressive_passes),
      smartPasses: num(r.smart_passes), smartPassAccPct: num(r.smart_pass_acc_pct), crosses: num(r.crosses), crossAccPct: num(r.cross_acc_pct),
      positionalAttacks: num(r.positional_attacks), counterattacks: num(r.counterattacks), offensiveDuelsWonPct: num(r.offensive_duels_won_pct),
    };
  }).sort((a, b) => (a.date < b.date ? -1 : 1));

  return { nMatches: own.length, metrics, matches, passingJson: own[0]?.passing ?? null, attackingJson: own[0]?.attacking ?? null };
}

export { ratioPct };

/** Reference Metrics (league avg or own team) straight from team_match_stats rows.
 *  Own-side columns come from is_opponent=false rows; the "against" columns (xga,
 *  shotsAgainst) from is_opponent=true rows. Simple means — a season aggregate. */
export function metricsFromRows(rows: Array<Record<string, unknown> & { is_opponent: boolean | null }>): Metrics {
  const own = rows.filter((r) => !r.is_opponent);
  const opp = rows.filter((r) => r.is_opponent);
  const A = (rs: typeof rows, k: string) => meanOf(rs.map((r) => num(r[k])));
  return {
    xgf: A(own, "xg"), xga: A(opp, "xg"), gf: A(own, "goals"), ga: A(opp, "goals"),
    shots: A(own, "shots"), shotsAgainst: A(opp, "shots"), possession: A(own, "possession_pct"),
    ppda: A(own, "ppda"), defDuelsWonPct: A(own, "def_duels_won_pct"),
    forwardPasses: A(own, "forward_passes"), forwardPassAccPct: A(own, "forward_pass_acc_pct"),
    passesFinalThird: A(own, "passes_final_third"), passesFinalThirdAccPct: A(own, "passes_final_third_acc_pct"),
    progressivePasses: A(own, "progressive_passes"), smartPasses: A(own, "smart_passes"), smartPassAccPct: A(own, "smart_pass_acc_pct"),
    crosses: A(own, "crosses"), crossAccPct: A(own, "cross_acc_pct"),
    positionalAttacks: A(own, "positional_attacks"), counterattacks: A(own, "counterattacks"), offensiveDuelsWonPct: A(own, "offensive_duels_won_pct"),
  };
}

/** StatsBomb merged season → the scouting engine's Metrics (agnostic keys align;
 *  StatsBomb has no defensive-duels/positional/counters, so those stay null and the
 *  UI leans on the OBV/pressing extras instead). npxG is used for xG. */
export function metricsFromSbSeason(s: SbTeamSeason): Metrics {
  const m = s.metrics;
  return {
    xgf: m.xgf, xga: m.xga, gf: m.gf, ga: m.ga, shots: m.shots, shotsAgainst: m.shotsAgainst,
    possession: m.possession, ppda: m.ppda, defDuelsWonPct: null,
    forwardPasses: null, forwardPassAccPct: m.passingPct,
    passesFinalThird: m.passesFinalThird, passesFinalThirdAccPct: null,
    progressivePasses: null, smartPasses: null, smartPassAccPct: null,
    crosses: m.crosses, crossAccPct: m.crossAccPct,
    positionalAttacks: null, counterattacks: null, offensiveDuelsWonPct: null,
  };
}

/** Metrics straight from a stored league_ref jsonb (already a Metrics object). */
export function metricsFromLeagueRef(json: unknown): Metrics | null {
  if (!json || typeof json !== "object") return null;
  const r = json as Record<string, unknown>;
  const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    xgf: n(r.xgf), xga: n(r.xga), gf: n(r.gf), ga: n(r.ga), shots: n(r.shots), shotsAgainst: n(r.shotsAgainst),
    possession: n(r.possession), ppda: n(r.ppda), defDuelsWonPct: n(r.defDuelsWonPct),
    forwardPasses: n(r.forwardPasses), forwardPassAccPct: n(r.forwardPassAccPct),
    passesFinalThird: n(r.passesFinalThird), passesFinalThirdAccPct: n(r.passesFinalThirdAccPct),
    progressivePasses: n(r.progressivePasses), smartPasses: n(r.smartPasses), smartPassAccPct: n(r.smartPassAccPct),
    crosses: n(r.crosses), crossAccPct: n(r.crossAccPct),
    positionalAttacks: n(r.positionalAttacks), counterattacks: n(r.counterattacks), offensiveDuelsWonPct: n(r.offensiveDuelsWonPct),
  };
}

/** Metrics from a stored scout_team_season row (snake_case columns). */
export function metricsFromScoutRow(r: Record<string, unknown>): Metrics {
  return {
    xgf: num(r.xgf), xga: num(r.xga), gf: num(r.gf), ga: num(r.ga), shots: num(r.shots), shotsAgainst: num(r.shots_against),
    possession: num(r.possession), ppda: num(r.ppda), defDuelsWonPct: num(r.def_duels_won_pct),
    forwardPasses: num(r.forward_passes), forwardPassAccPct: num(r.forward_pass_acc_pct),
    passesFinalThird: num(r.passes_final_third), passesFinalThirdAccPct: num(r.passes_final_third_acc_pct),
    progressivePasses: num(r.progressive_passes), smartPasses: num(r.smart_passes), smartPassAccPct: num(r.smart_pass_acc_pct),
    crosses: num(r.crosses), crossAccPct: num(r.cross_acc_pct),
    positionalAttacks: num(r.positional_attacks), counterattacks: num(r.counterattacks), offensiveDuelsWonPct: num(r.offensive_duels_won_pct),
  };
}
