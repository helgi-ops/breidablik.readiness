/**
 * StatsBomb IQ "Match Stats" CSV parser — pure, no IO.
 *
 * The coach exports StatsBomb IQ → team → Match Stats → CSV. That file has ONE row
 * per match for the club, with the club's own metrics AND a full `Opposition …` set
 * in the same row — so one file yields both the own-side and the against-side of
 * every fixture (no separate opponent export needed). 222 columns; ~50 coach-facing
 * ones are promoted to typed fields, the rest kept verbatim in `raw`, and the empty
 * Iceland 360 families (`Line Breaking Passes …`, `Ball Receipts in Space …`,
 * `Space Received …`) are ignored.
 *
 * `Match` is "Home vs. Away"; the club is the team present in every fixture, so we
 * infer it, then per row set is_home / opponent from the split. StatsBomb has no
 * possession% or PPDA — possession is proxied from Passes / (Passes + Opposition
 * Passes) and clearly labelled a proxy; pressing/value come from Pressures + OBV.
 *
 * Descriptive football context only — it never touches the readiness colour.
 */

import { normTeam } from "./wyscoutTeamStats";

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
/** StatsBomb stores ratios as fractions (0.8256); promote *_pct fields as 0–100. */
const pctOf = (v: unknown): number | null => { const n = num(v); return n == null ? null : Math.round(n * 1000) / 10; };
const isoFromDate = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const toIso = (v: unknown): string | null => {
  // XLSX read with cellDates:true yields JS Date objects for date cells; the route
  // then String()s them to "Tue Aug 04 2026 00:00:00 GMT+0000 (…)". Handle the Date
  // object, a clean ISO string, AND that stringified form — otherwise every row is
  // dropped as "no date" and a valid Match Stats export parses to zero matches.
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoFromDate(v);
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d/.test(s)) { const d = new Date(s); if (!Number.isNaN(d.getTime())) return isoFromDate(d); }
  return null;
};

export type SbTeamMatchRow = {
  matchDate: string | null; gameWeek: number | null; opponent: string | null; isHome: boolean | null; minutes: number | null;
  goals: number | null; goalsAgainst: number | null; xg: number | null; xgAgainst: number | null; xgPerShot: number | null; openPlayXg: number | null;
  shots: number | null; shotsAgainst: number | null; passes: number | null; passingPct: number | null; passesIntoBox: number | null;
  deepProgressions: number | null; crosses: number | null; boxTouches: number | null; longBallPct: number | null; possessionProxyPct: number | null;
  obv: number | null; passObv: number | null; shotObv: number | null; carryObv: number | null; defActionObv: number | null; oppositionObv: number | null;
  pressures: number | null; counterpressures: number | null; pressuresOppHalfPct: number | null; aggression: number | null;
  setPieceXg: number | null; setPieceGoals: number | null; setPieceShots: number | null; xgPerCorner: number | null; cornerXg: number | null;
  goalsFromCorners: number | null; shotsPerCorner: number | null; oppSetPieceXg: number | null; oppSetPieceGoals: number | null; oppGoalsFromCorners: number | null;
  gkLongBallPct: number | null; gkPassLength: number | null; yellowCards: number | null; redCards: number | null;
  raw: Record<string, unknown>;
};

export type SbParse = { rows: SbTeamMatchRow[]; fixtures: number; club: string | null; unmappedHeaders: string[]; skipped: { reason: string; label: string | null }[] };

/** own-side scalar columns: [field, header, kind] */
type Kind = "num" | "pct";
const OWN: Array<[keyof SbTeamMatchRow, string, Kind]> = [
  ["goals", "Goals", "num"], ["xg", "xG", "num"], ["xgPerShot", "xG/Shot", "num"], ["openPlayXg", "Open Play xG", "num"],
  ["shots", "Shots", "num"], ["passes", "Passes", "num"], ["passingPct", "Passing%", "pct"], ["passesIntoBox", "Passes Into Box", "num"],
  ["deepProgressions", "Deep Progressions", "num"], ["crosses", "Crosses", "num"], ["boxTouches", "Touches in box", "num"], ["longBallPct", "Long Ball%", "pct"],
  ["obv", "OBV", "num"], ["passObv", "Pass OBV", "num"], ["shotObv", "Shot OBV", "num"], ["carryObv", "Dribble & Carry OBV", "num"], ["defActionObv", "Defensive Action OBV", "num"],
  ["pressures", "Pressures", "num"], ["counterpressures", "Counterpressures", "num"], ["pressuresOppHalfPct", "Pressures in Opposing Half%", "pct"], ["aggression", "Aggression", "num"],
  ["setPieceXg", "Set Piece xG", "num"], ["setPieceGoals", "Set Piece Goals", "num"], ["setPieceShots", "Set Piece Shots", "num"],
  ["xgPerCorner", "xG/Corner", "num"], ["cornerXg", "Corner xG", "num"], ["goalsFromCorners", "Goals From Corners", "num"], ["shotsPerCorner", "Shots/Corner", "num"],
  ["gkLongBallPct", "Goalkeeper Long Ball%", "pct"], ["gkPassLength", "Goalkeeper Pass Length", "num"], ["yellowCards", "Yellow Cards", "num"], ["redCards", "Red Cards", "num"],
];
/** against-side columns (the CSV's own conceded + Opposition set). */
const AGAINST: Array<[keyof SbTeamMatchRow, string, Kind]> = [
  ["goalsAgainst", "Goals Conceded", "num"], ["xgAgainst", "Opposition xG", "num"], ["shotsAgainst", "Non Penalty Shots Faced", "num"],
  ["oppositionObv", "Opposition OBV", "num"], ["oppSetPieceXg", "Opposition Set Piece xG", "num"], ["oppSetPieceGoals", "Opposition Set Piece Goals", "num"], ["oppGoalsFromCorners", "Opposition Goals from Corners", "num"],
];
/** empty-for-Iceland 360 families to drop from raw. */
const DROP360 = /^(Line Breaking Passes|Ball Receipts in Space|Space Received)/i;

function inferClub(splits: Array<[string, string] | null>): string | null {
  const counts = new Map<string, { name: string; n: number }>();
  for (const s of splits) if (s) for (const t of s) { const k = normTeam(t); const e = counts.get(k) ?? { name: t, n: 0 }; e.n++; counts.set(k, e); }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n);
  return sorted[0]?.name ?? null;
}

export function parseStatsbombTeamStats(matrix: string[][], opts: { teamName?: string } = {}): SbParse {
  const skipped: SbParse["skipped"] = [];
  if (!matrix.length) return { rows: [], fixtures: 0, club: null, unmappedHeaders: [], skipped };
  const header = matrix[0].map((h) => String(h ?? "").trim());
  const idx = new Map<string, number>(); header.forEach((h, i) => { if (!idx.has(h)) idx.set(h, i); });
  const body = matrix.slice(1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const at = (row: string[], h: string): string | undefined => { const i = idx.get(h); return i == null ? undefined : row[i]; };

  const splits = body.map((r) => { const m = String(at(r, "Match") ?? "").split(/\s+vs\.?\s+/i); return m.length === 2 ? [m[0].trim(), m[1].trim()] as [string, string] : null; });
  const club = opts.teamName ?? inferClub(splits);
  const clubN = club ? normTeam(club) : "";

  const mapped = new Set<string>(["Match", "Date", "Game Week", "Minutes", "Opposition Passes", ...OWN.map(([, h]) => h), ...AGAINST.map(([, h]) => h)]);
  const unmapped = new Set<string>();

  const rows: SbTeamMatchRow[] = body.map((r, i) => {
    const sp = splits[i];
    const home = sp?.[0] ?? null, away = sp?.[1] ?? null;
    const isHome = home != null ? normTeam(home) === clubN : null;
    const opponent = sp ? (isHome ? away : home) : null;

    const row = { matchDate: toIso(at(r, "Date")), gameWeek: num(at(r, "Game Week")), opponent, isHome, minutes: num(at(r, "Minutes")), raw: {} } as SbTeamMatchRow;
    for (const [field, h, kind] of OWN) (row as Record<string, unknown>)[field] = kind === "pct" ? pctOf(at(r, h)) : num(at(r, h));
    for (const [field, h, kind] of AGAINST) (row as Record<string, unknown>)[field] = kind === "pct" ? pctOf(at(r, h)) : num(at(r, h));
    // possession proxy — StatsBomb has no possession%.
    const p = num(at(r, "Passes")), op = num(at(r, "Opposition Passes"));
    row.possessionProxyPct = p != null && op != null && p + op > 0 ? Math.round((p / (p + op)) * 1000) / 10 : null;
    // raw = every non-empty, non-360 cell verbatim.
    const raw: Record<string, unknown> = {};
    header.forEach((h, ci) => { const v = String(r[ci] ?? "").trim(); if (v !== "" && !DROP360.test(h)) raw[h] = v; if (v !== "" && !mapped.has(h) && !DROP360.test(h)) unmapped.add(h); });
    row.raw = raw;
    if (!row.matchDate) skipped.push({ reason: "no date", label: String(at(r, "Match") ?? null) });
    return row;
  }).filter((r) => r.matchDate);

  return { rows, fixtures: rows.length, club, unmappedHeaders: [...unmapped], skipped };
}

/** Map parsed rows to `sb_team_match_stats` upsert objects (snake_case columns). */
export function toSbDbRows(rows: SbTeamMatchRow[], ctx: { teamId: string; sbTeamId?: number | null; season: string }): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    team_id: ctx.teamId, sb_team_id: ctx.sbTeamId ?? null, season: ctx.season, source: "statsbomb",
    match_date: r.matchDate, game_week: r.gameWeek, opponent: r.opponent, is_home: r.isHome, minutes: r.minutes,
    goals: r.goals, goals_against: r.goalsAgainst, xg: r.xg, xg_against: r.xgAgainst, xg_per_shot: r.xgPerShot, open_play_xg: r.openPlayXg,
    shots: r.shots, shots_against: r.shotsAgainst, passes: r.passes, passing_pct: r.passingPct, passes_into_box: r.passesIntoBox,
    deep_progressions: r.deepProgressions, crosses: r.crosses, box_touches: r.boxTouches, long_ball_pct: r.longBallPct, possession_proxy_pct: r.possessionProxyPct,
    obv: r.obv, pass_obv: r.passObv, shot_obv: r.shotObv, carry_obv: r.carryObv, def_action_obv: r.defActionObv, opposition_obv: r.oppositionObv,
    pressures: r.pressures, counterpressures: r.counterpressures, pressures_opp_half_pct: r.pressuresOppHalfPct, aggression: r.aggression,
    set_piece_xg: r.setPieceXg, set_piece_goals: r.setPieceGoals, set_piece_shots: r.setPieceShots,
    xg_per_corner: r.xgPerCorner, corner_xg: r.cornerXg, goals_from_corners: r.goalsFromCorners, shots_per_corner: r.shotsPerCorner,
    opp_set_piece_xg: r.oppSetPieceXg, opp_set_piece_goals: r.oppSetPieceGoals, opp_goals_from_corners: r.oppGoalsFromCorners,
    gk_long_ball_pct: r.gkLongBallPct, gk_pass_length: r.gkPassLength, yellow_cards: r.yellowCards, red_cards: r.redCards,
    raw: r.raw, updated_at: new Date().toISOString(),
  }));
}
