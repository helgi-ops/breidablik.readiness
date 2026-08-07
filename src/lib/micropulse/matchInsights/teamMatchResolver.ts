/**
 * Provider-agnostic per-match team-stats resolver for Team Match Insight.
 *
 * Returns StatsBomb per-match data (sb_team_match_stats) when it exists for a team,
 * else null so the caller keeps its Wyscout (team_match_stats) path. All-or-nothing
 * per team — providers are never silently mixed within a season. StatsBomb has no
 * PPDA / duels per match, so those OwnStat fields stay null and the UI leans on the
 * StatsBomb extras (OBV, set-piece xG, pressures) instead. Descriptive context only.
 */

/** OwnStat-compatible shape the match-insights route already consumes (superset). */
export type ResolvedOwnStat = {
  match_date: string; opponent_name: string | null; created_at: string;
  goals: number | null; xg: number | null; shots: number | null; shots_on_target: number | null;
  passes: number | null; passes_accurate: number | null; possession_pct: number | null;
  duels: number | null; duels_won: number | null; recoveries: number | null;
  ppda: number | null; def_duels_won_pct: number | null;
  passes_final_third: number | null; passes_final_third_acc_pct: number | null;
  passes_penalty_area: number | null; progressive_passes: number | null;
  crosses: number | null; cross_acc_pct: number | null;
  smart_passes: number | null; smart_pass_acc_pct: number | null; forward_passes: number | null;
  touches_in_box: number | null; positional_attacks: number | null;
  counterattacks: number | null; offensive_duels_won_pct: number | null;
  raw: Record<string, unknown> | null;
};

export type SbMatchExtra = { obv: number | null; oppositionObv: number | null; setPieceXg: number | null; setPieceXgAgainst: number | null; pressures: number | null };

export type ResolvedMatchStats = {
  source: "statsbomb";
  own: Map<string, ResolvedOwnStat>;
  xgAgainst: Map<string, number>; oppGoals: Map<string, number>; shotsAgainst: Map<string, number>;
  extras: Map<string, SbMatchExtra>;
  lastImport: string | null;
};

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Build the maps from raw sb_team_match_stats rows (pure — unit-testable). */
export function buildResolvedFromSbRows(rows: Array<Record<string, unknown>>): ResolvedMatchStats | null {
  if (!rows.length) return null;
  const own = new Map<string, ResolvedOwnStat>();
  const xgAgainst = new Map<string, number>(), oppGoals = new Map<string, number>(), shotsAgainst = new Map<string, number>();
  const extras = new Map<string, SbMatchExtra>();
  let lastImport: string | null = null;
  for (const r of rows) {
    const date = String(r.match_date ?? "");
    if (!date) continue;
    const ci = String(r.updated_at ?? r.created_at ?? "");
    if (!lastImport || ci > lastImport) lastImport = ci;
    own.set(date, {
      match_date: date, opponent_name: (r.opponent as string) ?? null, created_at: ci,
      goals: n(r.goals), xg: n(r.xg), shots: n(r.shots), shots_on_target: null,
      // StatsBomb stores completion % (passing_pct), not an accurate-pass count. Derive
      // the count so the shared Pass% column (passes_accurate/passes) fills correctly.
      passes: n(r.passes),
      passes_accurate: n(r.passing_pct) != null && n(r.passes) != null ? Math.round(n(r.passes)! * n(r.passing_pct)! / 100) : null,
      possession_pct: n(r.possession_proxy_pct),
      duels: null, duels_won: null, recoveries: null, ppda: null, def_duels_won_pct: null,
      passes_final_third: n(r.deep_progressions), passes_final_third_acc_pct: null,
      passes_penalty_area: n(r.passes_into_box), progressive_passes: n(r.deep_progressions),
      crosses: n(r.crosses), cross_acc_pct: null, smart_passes: null, smart_pass_acc_pct: null, forward_passes: null,
      touches_in_box: n(r.box_touches), positional_attacks: null, counterattacks: null, offensive_duels_won_pct: null,
      raw: null,
    });
    if (n(r.xg_against) != null) xgAgainst.set(date, n(r.xg_against)!);
    if (n(r.goals_against) != null) oppGoals.set(date, n(r.goals_against)!);
    if (n(r.shots_against) != null) shotsAgainst.set(date, n(r.shots_against)!);
    extras.set(date, { obv: n(r.obv), oppositionObv: n(r.opposition_obv), setPieceXg: n(r.set_piece_xg), setPieceXgAgainst: n(r.opp_set_piece_xg), pressures: n(r.pressures) });
  }
  return { source: "statsbomb", own, xgAgainst, oppGoals, shotsAgainst, extras, lastImport };
}
