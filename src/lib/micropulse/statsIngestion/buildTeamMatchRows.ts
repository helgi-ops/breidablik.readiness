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
  /** Aux dates present in Indexes/Defending but with no matching General row. */
  ppdaOrphans: string[];
  defDuelsOrphans: string[];
  aux: { ppdaProvided: boolean; ppdaMatched: boolean; defProvided: boolean; defMatched: boolean };
  unmappedHeaders: string[];
  skipped: { reason: string; label: string | null }[];
  headerRow: string[];
};

export function buildTeamMatchStatRows(input: {
  generalMatrix: unknown[][];
  indexesMatrix?: unknown[][] | null;
  defendingMatrix?: unknown[][] | null;
  teamId: string;
  teamName?: string;
}): BuiltTeamStats {
  const { generalMatrix, indexesMatrix, defendingMatrix, teamId, teamName } = input;
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

  const ppda = buildAux(indexesMatrix, parsePpda);
  const defDuels = buildAux(defendingMatrix, parseDefDuelsWonPct);

  const dbRows: TeamMatchStatDbRow[] = parsed.rows.map((r) => ({
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
    ppda: ppda.map.get(keyOf(r.matchDate!, r.isOpponent)) ?? null,
    def_duels_won_pct: defDuels.map.get(keyOf(r.matchDate!, r.isOpponent)) ?? null,
    source: "wyscout_team_stats_xlsx",
    raw: r.raw,
  }));

  const generalKeys = new Set(parsed.rows.map((r) => keyOf(r.matchDate!, r.isOpponent)));
  const orphanDates = (map: Map<string, number>) =>
    Array.from(new Set([...map.keys()].filter((k) => !generalKeys.has(k)).map((k) => k.split("|")[0])));

  return {
    dbRows,
    fixtures: parsed.fixtures,
    dates: Array.from(new Set(parsed.rows.map((r) => r.matchDate).filter((d): d is string => !!d))),
    ppdaHits: dbRows.filter((r) => r.ppda != null).length,
    defDuelsHits: dbRows.filter((r) => r.def_duels_won_pct != null).length,
    ppdaOrphans: orphanDates(ppda.map),
    defDuelsOrphans: orphanDates(defDuels.map),
    aux: { ppdaProvided: ppda.provided, ppdaMatched: ppda.matched, defProvided: defDuels.provided, defMatched: defDuels.matched },
    unmappedHeaders: parsed.unmappedHeaders,
    skipped: parsed.skipped,
    headerRow: parsed.headerRow,
  };
}
