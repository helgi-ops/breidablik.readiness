/**
 * Shared builder: Wyscout export matrices → team_match_stats DB rows.
 *
 * ONE place that turns the parsed General export (+ optional Indexes/Defending
 * aux tabs) into the exact rows we upsert, so the CLI script and the in-app
 * upload route can never drift. Pure — no IO, no DB, no match_schedule join
 * (callers do that against their own client). Descriptive football context only;
 * never touches the readiness colour.
 */

import { parseWyscoutTeamStats } from "./wyscoutTeamStats";
import { parsePpda, parseDefDuelsWonPct } from "./wyscoutAuxStats";
import { parsePassing, parseAttacking, PASSING_COLUMNS, ATTACKING_COLUMNS } from "./wyscoutAttackStats";

/**
 * Pick which uploaded matrix supplies each role, so a coach can drop the Wyscout
 * exports in ANY order (or a single all-columns file) without labelling them:
 *   • general   = the first matrix that parses as the General export (has fixtures)
 *   • indexes   = the first matrix that contains a PPDA column
 *   • defending = the first matrix that contains "Defensive duels / won"
 *   • passing   = the first matrix with passing-only columns (forward/final-third/smart…)
 *   • attacking = the first matrix with positional/counter/touches-in-box/offensive-duels
 * One file carrying every column is legitimately selected for all roles.
 */
export function selectWyscoutMatrices(
  matrices: unknown[][][],
  teamName?: string,
): { general: unknown[][] | null; indexes: unknown[][] | null; defending: unknown[][] | null; passing: unknown[][] | null; attacking: unknown[][] | null } {
  // "General" must carry the xG/possession that only the General export has — the
  // Defending and Indexes exports ALSO have Match/Team/Date columns, so requiring
  // fixtures alone would misfire on them. Goals are NOT a discriminator: they are
  // read from the match-label score, which every file's Match column carries, so
  // key detection on xG + possession (unique to General).
  const general = matrices.find((m) => {
    const rows = parseWyscoutTeamStats(m, { teamName }).rows;
    return rows.some((r) => r.xg != null || r.possessionPct != null);
  }) ?? null;
  const indexes = matrices.find((m) => parsePpda(m, teamName).matched) ?? null;
  const defending = matrices.find((m) => parseDefDuelsWonPct(m, teamName).matched) ?? null;
  const passing = matrices.find((m) => parsePassing(m, teamName).matched) ?? null;
  const attacking = matrices.find((m) => parseAttacking(m, teamName).matched) ?? null;
  return { general, indexes, defending, passing, attacking };
}

type Promoted = Record<string, number | null>;
const emptyPromoted = (cols: { key: string }[]): Promoted =>
  Object.fromEntries(cols.map((c) => [c.key, null]));

export type TeamMatchStatDbRow = {
  team_id: string;
  match_date: string;
  is_opponent: boolean;
  opponent_name: string | null;
  competition: string | null;
  scheme: string | null;
  goals: number | null;
  xg: number | null;
  shots: number | null;
  shots_on_target: number | null;
  passes: number | null;
  passes_accurate: number | null;
  possession_pct: number | null;
  losses: number | null;
  recoveries: number | null;
  duels: number | null;
  duels_won: number | null;
  ppda: number | null;
  def_duels_won_pct: number | null;
  // Passing preset (promoted) + full blob.
  forward_passes: number | null;
  forward_pass_acc_pct: number | null;
  passes_final_third: number | null;
  passes_final_third_acc_pct: number | null;
  passes_penalty_area: number | null;
  passes_penalty_area_acc_pct: number | null;
  progressive_passes: number | null;
  crosses: number | null;
  cross_acc_pct: number | null;
  smart_passes: number | null;
  smart_pass_acc_pct: number | null;
  passing: Record<string, unknown> | null;
  // Attacking preset (promoted) + full blob.
  touches_in_box: number | null;
  positional_attacks: number | null;
  counterattacks: number | null;
  offensive_duels_won_pct: number | null;
  attacking: Record<string, unknown> | null;
  source: string;
  raw: Record<string, unknown>;
};

export type BuiltTeamStats = {
  dbRows: TeamMatchStatDbRow[];
  fixtures: number;
  /** Distinct match dates present in the General export. */
  dates: string[];
  ppdaHits: number;
  defDuelsHits: number;
  passingHits: number;
  attackingHits: number;
  /** Aux dates present in an aux export but with no matching General row. */
  ppdaOrphans: string[];
  defDuelsOrphans: string[];
  passingOrphans: string[];
  attackingOrphans: string[];
  aux: {
    ppdaProvided: boolean; ppdaMatched: boolean;
    defProvided: boolean; defMatched: boolean;
    passingProvided: boolean; passingMatched: boolean;
    attackingProvided: boolean; attackingMatched: boolean;
  };
  unmappedHeaders: string[];
  skipped: { reason: string; label: string | null }[];
  headerRow: string[];
};

export function buildTeamMatchStatRows(input: {
  generalMatrix: unknown[][];
  indexesMatrix?: unknown[][] | null;
  defendingMatrix?: unknown[][] | null;
  passingMatrix?: unknown[][] | null;
  attackingMatrix?: unknown[][] | null;
  teamId: string;
  teamName?: string;
}): BuiltTeamStats {
  const { generalMatrix, indexesMatrix, defendingMatrix, passingMatrix, attackingMatrix, teamId, teamName } = input;
  const parsed = parseWyscoutTeamStats(generalMatrix, { teamName });

  const keyOf = (date: string, isOpp: boolean) => `${date}|${isOpp ? 1 : 0}`;
  const buildAux = (
    matrix: unknown[][] | null | undefined,
    parse: (m: unknown[][], t?: string) => { matched: boolean; rows: { matchDate: string; isOpponent: boolean; value: number | null }[] },
  ): { provided: boolean; matched: boolean; map: Map<string, number> } => {
    if (!matrix) return { provided: false, matched: false, map: new Map() };
    const res = parse(matrix, teamName);
    const map = new Map<string, number>();
    if (res.matched) for (const r of res.rows) if (r.value != null) map.set(keyOf(r.matchDate, r.isOpponent), r.value);
    return { provided: true, matched: res.matched, map };
  };
  // Multi-column presets (Passing/Attacking): keep the promoted values AND the raw blob per (date, side).
  const buildMulti = (
    matrix: unknown[][] | null | undefined,
    parse: (m: unknown[][], t?: string) => { matched: boolean; rows: { matchDate: string; isOpponent: boolean; values: Record<string, number | null>; raw: Record<string, unknown> }[] },
  ): { provided: boolean; matched: boolean; map: Map<string, { values: Record<string, number | null>; raw: Record<string, unknown> }> } => {
    if (!matrix) return { provided: false, matched: false, map: new Map() };
    const res = parse(matrix, teamName);
    const map = new Map<string, { values: Record<string, number | null>; raw: Record<string, unknown> }>();
    if (res.matched) for (const r of res.rows) map.set(keyOf(r.matchDate, r.isOpponent), { values: r.values, raw: r.raw });
    return { provided: true, matched: res.matched, map };
  };

  const ppda = buildAux(indexesMatrix, parsePpda);
  const defDuels = buildAux(defendingMatrix, parseDefDuelsWonPct);
  const passing = buildMulti(passingMatrix, parsePassing);
  const attacking = buildMulti(attackingMatrix, parseAttacking);

  const dbRows: TeamMatchStatDbRow[] = parsed.rows.map((r) => {
    const k = keyOf(r.matchDate!, r.isOpponent);
    const pv = passing.map.get(k);
    const av = attacking.map.get(k);
    // Merge both preset value maps so a promoted column populates no matter which
    // file supplied it (e.g. crosses ships in the Attacking preset, not Passing).
    const merged = { ...emptyPromoted(PASSING_COLUMNS), ...emptyPromoted(ATTACKING_COLUMNS), ...(pv?.values ?? {}), ...(av?.values ?? {}) };
    const passingVals = merged;
    const attackingVals = merged;
    return {
      team_id: teamId,
      match_date: r.matchDate!,
      is_opponent: r.isOpponent,
      opponent_name: r.opponentName,
      competition: r.competition,
      scheme: r.scheme,
      goals: r.goals,
      xg: r.xg,
      shots: r.shots,
      shots_on_target: r.shotsOnTarget,
      passes: r.passes,
      passes_accurate: r.passesAccurate,
      possession_pct: r.possessionPct,
      losses: r.losses,
      recoveries: r.recoveries,
      duels: r.duels,
      duels_won: r.duelsWon,
      ppda: ppda.map.get(k) ?? null,
      def_duels_won_pct: defDuels.map.get(k) ?? null,
      forward_passes: passingVals.forward_passes,
      forward_pass_acc_pct: passingVals.forward_pass_acc_pct,
      passes_final_third: passingVals.passes_final_third,
      passes_final_third_acc_pct: passingVals.passes_final_third_acc_pct,
      passes_penalty_area: passingVals.passes_penalty_area,
      passes_penalty_area_acc_pct: passingVals.passes_penalty_area_acc_pct,
      progressive_passes: passingVals.progressive_passes,
      crosses: passingVals.crosses,
      cross_acc_pct: passingVals.cross_acc_pct,
      smart_passes: passingVals.smart_passes,
      smart_pass_acc_pct: passingVals.smart_pass_acc_pct,
      passing: pv?.raw ?? null,
      touches_in_box: attackingVals.touches_in_box,
      positional_attacks: attackingVals.positional_attacks,
      counterattacks: attackingVals.counterattacks,
      offensive_duels_won_pct: attackingVals.offensive_duels_won_pct,
      attacking: av?.raw ?? null,
      source: "wyscout_team_stats_xlsx",
      raw: r.raw,
    };
  });

  const generalKeys = new Set(parsed.rows.map((r) => keyOf(r.matchDate!, r.isOpponent)));
  const orphanDates = (keys: Iterable<string>) =>
    Array.from(new Set([...keys].filter((k) => !generalKeys.has(k)).map((k) => k.split("|")[0])));

  return {
    dbRows,
    fixtures: parsed.fixtures,
    dates: Array.from(new Set(parsed.rows.map((r) => r.matchDate).filter((d): d is string => !!d))),
    ppdaHits: dbRows.filter((r) => r.ppda != null).length,
    defDuelsHits: dbRows.filter((r) => r.def_duels_won_pct != null).length,
    passingHits: dbRows.filter((r) => r.passing != null).length,
    attackingHits: dbRows.filter((r) => r.attacking != null).length,
    ppdaOrphans: orphanDates(ppda.map.keys()),
    defDuelsOrphans: orphanDates(defDuels.map.keys()),
    passingOrphans: orphanDates(passing.map.keys()),
    attackingOrphans: orphanDates(attacking.map.keys()),
    aux: {
      ppdaProvided: ppda.provided, ppdaMatched: ppda.matched,
      defProvided: defDuels.provided, defMatched: defDuels.matched,
      passingProvided: passing.provided, passingMatched: passing.matched,
      attackingProvided: attacking.provided, attackingMatched: attacking.matched,
    },
    unmappedHeaders: parsed.unmappedHeaders,
    skipped: parsed.skipped,
    headerRow: parsed.headerRow,
  };
}
