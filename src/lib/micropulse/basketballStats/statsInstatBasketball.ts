/**
 * InStat (Hudl) basketball adapter — SKELETON.
 *
 * InStat is a SOURCE, not a new surface. Its adapter emits the exact normalized
 * shapes every basketball feed does (BasketballBoxScoreRow + BasketballTeamMatchRow,
 * source='instat'); nothing InStat-specific leaks past this file. Its rows coexist
 * with baskethotel under the existing (team, source, game, player) unique keys, and
 * box-score baskethotel stays the canonical KKÍ feed. Descriptive box-score data
 * only — this NEVER touches the readiness colour, the load, or the daily decision.
 *
 * ── What is BUILT (unblocked) ─────────────────────────────────────────────────
 *   • normalizeInstatPlayer / normalizeInstatTeam — the real, testable mapping
 *     from a documented InStat raw row to the normalized model, incl. the Four
 *     Factors + advanced metrics landed by migration 20260813120000.
 *   • INSTAT_FIELD_MAP — the single place to correct field names once a real
 *     export sample is in hand.
 *
 * ── What is STUBBED (blocked on Hudl) ─────────────────────────────────────────
 *   • parseInstatBasketballExport — the only piece that depends on the confirmed
 *     export PATH/FORMAT (xlsx? csv? JSON API? per-match file vs season pull).
 *     It throws `not_implemented:instat_export_path_unconfirmed` so callers can
 *     wire the UI/route now and fail loudly-but-cleanly until the path lands —
 *     exactly how syncBasketballTeam already treats `not_implemented`.
 *
 * When the export path is confirmed: implement extractInstatRows() for that
 * format, verify INSTAT_FIELD_MAP against a real sample, drop the throw, done.
 */

import type {
  BasketballAdvancedMetrics,
  BasketballBoxScoreRow,
  BasketballSource,
  BasketballTeamMatchRow,
} from "./types";

export const INSTAT_SOURCE: BasketballSource = "instat";

/** Context the caller supplies (the raw export knows nothing of our team ids). */
export type InstatIngestContext = {
  ownerTeamId: string;        // our team.id these rows belong to
  matchRef: string;           // stable per-match id (source game id)
  matchDate?: string | null;  // ISO yyyy-mm-dd
  opponent?: string | null;
  homeAway?: "home" | "away" | null;
  /** Which side of a two-team export (PDF Game Report) is our club. Match by
   *  name-fold; if omitted, HOME is treated as our team. */
  ownerTeamName?: string | null;
  ownerIsHome?: boolean;
};

/**
 * A single InStat player row as we EXPECT the export to expose it, before any
 * normalization. Deliberately permissive: values may arrive as numbers or as
 * strings ("41.7%", "12"), and any of these keys may be absent. This is the
 * contract to reconcile against the first real sample — see INSTAT_FIELD_MAP.
 */
export type InstatRawRow = Record<string, number | string | null | undefined>;

/** Maps our normalized field → the candidate InStat column names to read for it.
 *  First key that is present (case-insensitive) wins. CORRECT THIS against a real
 *  export; the shape is right, the exact strings are best-effort until then. */
export const INSTAT_FIELD_MAP = {
  playerName: ["player", "player_name", "name", "Player"],
  playerRef: ["player_id", "instat_id", "id"],
  minutes: ["min", "minutes", "MIN"],
  points: ["pts", "points", "PTS"],
  fgm: ["fgm", "2fgm+3fgm", "field_goals_made"],
  fga: ["fga", "field_goals_attempted"],
  tpm: ["3pm", "tpm", "three_made"],
  tpa: ["3pa", "tpa", "three_att"],
  ftm: ["ftm", "free_throws_made"],
  fta: ["fta", "free_throws_attempted"],
  oreb: ["oreb", "off_reb", "offensive_rebounds"],
  dreb: ["dreb", "def_reb", "defensive_rebounds"],
  reb: ["reb", "rebounds", "total_rebounds"],
  assists: ["ast", "assists"],
  steals: ["stl", "steals"],
  blocks: ["blk", "blocks"],
  turnovers: ["to", "tov", "turnovers"],
  fouls: ["pf", "fouls", "personal_fouls"],
  plusMinus: ["+/-", "plus_minus"],
  efficiency: ["eff", "efficiency", "pir"],
  // Advanced
  efgPct: ["efg%", "efg_pct", "effective_fg"],
  tsPct: ["ts%", "ts_pct", "true_shooting"],
  toPct: ["to%", "to_pct", "turnover_pct"],
  orebPct: ["oreb%", "oreb_pct"],
  drebPct: ["dreb%", "dreb_pct"],
  ftf: ["ftr", "ft_factor", "ftf"],
  ppp: ["ppp", "points_per_possession"],
  pointsOffTo: ["pts_off_to", "points_off_turnovers"],
  secondChancePts: ["2nd_chance", "second_chance_pts"],
  pointsInPaint: ["paint_pts", "points_in_paint"],
  fastbreakPts: ["fastbreak_pts", "transition_pts", "fb_pts"],
  deflections: ["deflections"],
  chargesDrawn: ["charges", "charges_drawn"],
  usagePct: ["usg%", "usage_pct"],
  astPct: ["ast%", "ast_pct"],
  astToRatio: ["ast/to", "ast_to", "assist_to_turnover"],
} as const;

/** Reads a value for one normalized field from a raw row, trying each candidate
 *  key case-insensitively. Returns the raw (unparsed) value or undefined. */
function pick(row: InstatRawRow, candidates: readonly string[]): number | string | null | undefined {
  const lowerKeys = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const cand of candidates) {
    const hit = lowerKeys.get(cand.toLowerCase());
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

/** Coerces "41.7%", "12", 12, "" → number | null. A missing/blank value is null,
 *  never 0 (principle: a missing stat is unknown, not zero). */
export function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = v.replace(/%/g, "").replace(/,/g, ".").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function readAdvanced(row: InstatRawRow): BasketballAdvancedMetrics {
  const M = INSTAT_FIELD_MAP;
  return {
    efgPct: num(pick(row, M.efgPct)),
    tsPct: num(pick(row, M.tsPct)),
    toPct: num(pick(row, M.toPct)),
    orebPct: num(pick(row, M.orebPct)),
    drebPct: num(pick(row, M.drebPct)),
    ftf: num(pick(row, M.ftf)),
    ppp: num(pick(row, M.ppp)),
    pointsOffTo: num(pick(row, M.pointsOffTo)),
    secondChancePts: num(pick(row, M.secondChancePts)),
    pointsInPaint: num(pick(row, M.pointsInPaint)),
    fastbreakPts: num(pick(row, M.fastbreakPts)),
    deflections: num(pick(row, M.deflections)),
    chargesDrawn: num(pick(row, M.chargesDrawn)),
    usagePct: num(pick(row, M.usagePct)),
    astPct: num(pick(row, M.astPct)),
    astToRatio: num(pick(row, M.astToRatio)),
  };
}

/** Normalizes one raw InStat player row → BasketballBoxScoreRow (source='instat').
 *  Real and unit-testable now; independent of the export path. */
export function normalizeInstatPlayer(row: InstatRawRow, ctx: InstatIngestContext): BasketballBoxScoreRow {
  const M = INSTAT_FIELD_MAP;
  const playerName = String(pick(row, M.playerName) ?? "").trim();
  const rawRef = pick(row, M.playerRef);
  // Stable per-source id, namespaced so it can never collide with a football
  // sbpm: ref or a baskethotel ref in the shared player-mapping table.
  const sourcePlayerRef = `instat:${rawRef ?? playerName.toLowerCase()}`;

  // Preserve the entire raw row losslessly.
  const stats: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(row)) stats[k] = v ?? null;

  return {
    teamId: ctx.ownerTeamId,
    playerId: null, // resolved downstream by the name-matcher; never guessed
    gameId: ctx.matchRef,
    gameDate: ctx.matchDate ?? "",
    opponent: ctx.opponent ?? null,
    homeAway: ctx.homeAway ?? null,
    minutes: num(pick(row, M.minutes)),
    points: num(pick(row, M.points)),
    fgm: num(pick(row, M.fgm)), fga: num(pick(row, M.fga)),
    tpm: num(pick(row, M.tpm)), tpa: num(pick(row, M.tpa)),
    ftm: num(pick(row, M.ftm)), fta: num(pick(row, M.fta)),
    oreb: num(pick(row, M.oreb)), dreb: num(pick(row, M.dreb)), reb: num(pick(row, M.reb)),
    assists: num(pick(row, M.assists)),
    steals: num(pick(row, M.steals)),
    blocks: num(pick(row, M.blocks)),
    turnovers: num(pick(row, M.turnovers)),
    fouls: num(pick(row, M.fouls)),
    plusMinus: num(pick(row, M.plusMinus)),
    efficiency: num(pick(row, M.efficiency)),
    advanced: readAdvanced(row),
    stats,
    source: INSTAT_SOURCE,
    sourceRef: ctx.matchRef,
    sourcePlayerRef,
    playerName,
  };
}

/** Normalizes one raw InStat team line → BasketballTeamMatchRow. */
export function normalizeInstatTeam(
  row: InstatRawRow,
  ctx: InstatIngestContext,
  opts: { isOpponent: boolean; period: BasketballTeamMatchRow["period"] },
): BasketballTeamMatchRow {
  const M = INSTAT_FIELD_MAP;
  const stats: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(row)) stats[k] = v ?? null;
  return {
    ownerTeamId: ctx.ownerTeamId,
    matchRef: ctx.matchRef,
    matchDate: ctx.matchDate ?? null,
    opponent: ctx.opponent ?? null,
    isOpponent: opts.isOpponent,
    period: opts.period,
    points: num(pick(row, M.points)),
    possessions: num(pick(row, ["poss", "possessions"])),
    fgm: num(pick(row, M.fgm)), fga: num(pick(row, M.fga)),
    tpm: num(pick(row, M.tpm)), tpa: num(pick(row, M.tpa)),
    ftm: num(pick(row, M.ftm)), fta: num(pick(row, M.fta)),
    oreb: num(pick(row, M.oreb)), dreb: num(pick(row, M.dreb)), reb: num(pick(row, M.reb)),
    assists: num(pick(row, M.assists)),
    steals: num(pick(row, M.steals)),
    blocks: num(pick(row, M.blocks)),
    turnovers: num(pick(row, M.turnovers)),
    fouls: num(pick(row, M.fouls)),
    advanced: readAdvanced(row),
    benchPts: num(pick(row, ["bench_pts", "bench_points"])),
    stats,
    source: INSTAT_SOURCE,
    sourceRef: ctx.matchRef,
  };
}

/** The normalized result an InStat ingest produces for one match. */
export type InstatParseResult = {
  players: BasketballBoxScoreRow[];
  teams: BasketballTeamMatchRow[];
};

/**
 * A confirmed InStat export (Hudl rep, Aug 2026). The realistic paths for KKÍ
 * clubs are the manual table export (CSV/Excel → row-objects) and the free
 * Game Report PDF; the API path is out of scope for v1.
 */
export type InstatExportInput =
  | { kind: "csv"; rows: InstatRawRow[] }
  | { kind: "pdf"; buffer: Buffer };

/**
 * Unified entry: a confirmed InStat export → normalized rows. CSV yields per-player
 * box scores (source='instat'); the Game Report PDF yields team + per-quarter rows
 * with Four Factors. Delegates via dynamic import so the CSV/PDF adapters can import
 * this module's shared normalizers without a static cycle.
 */
export async function parseInstatBasketballExport(
  input: InstatExportInput,
  ctx: InstatIngestContext,
): Promise<InstatParseResult> {
  if (input.kind === "csv") {
    const { parseInstatBasketballCsv } = await import("./statsInstatBasketballCsv");
    return { players: parseInstatBasketballCsv(input.rows, ctx).players, teams: [] };
  }
  if (input.kind === "pdf") {
    const { extractInstatGameReport } = await import("./statsInstatBasketballPdf");
    return { players: [], teams: (await extractInstatGameReport({ buffer: input.buffer, ctx })).teams };
  }
  throw new Error("not_implemented:instat_unknown_input");
}
