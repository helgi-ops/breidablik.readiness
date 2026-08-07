export const runtime = "nodejs";

/**
 * /api/coach/scouting/upload — ingest a scouted OPPONENT's Wyscout Team → Stats
 * export(s) (General required; Indexes/Defending/Passing/Attacking optional) + an
 * optional Advanced Search player export, into the scout_* tables for the coach's
 * own team. Reuses the exact team-stats parser; the opponent's file parses with the
 * team inferred from the file. Descriptive context only — never touches readiness.
 *
 * multipart/form-data: opponent, season, phase (preview|commit), files[] (team stats),
 *                      players (optional player-list xlsx).
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { selectWyscoutMatrices, buildTeamMatchStatRows } from "@/lib/micropulse/statsIngestion/buildTeamMatchRows";
import { inferOwnTeamName, normTeam } from "@/lib/micropulse/statsIngestion/wyscoutTeamStats";
import { parseStatsbombLeagueTeam } from "@/lib/micropulse/statsIngestion/statsbombLeagueTeam";
import { aggregateScoutSeason, metricsFromSbSeason } from "@/lib/micropulse/scouting/aggregate";
import { parseWyscoutPlayerList, type WyscoutRow } from "@/lib/micropulse/statsIngestion/wyscoutExcel";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const primary = prof?.team_id as string | null;
  if (!primary) return { error: "Coach not linked to a team", status: 400 } as const;
  if (!targetTeamId || targetTeamId === primary) return { teamId: primary } as const;
  const { data: ct } = await supabase.from("coach_teams").select("team_id").eq("coach_id", userRes.user.id).eq("team_id", targetTeamId).maybeSingle();
  if (!ct) return { error: "No access to that team", status: 403 } as const;
  return { teamId: targetTeamId } as const;
}

async function matrixOf(v: FormDataEntryValue | null): Promise<unknown[][] | null> {
  if (!(v instanceof File) || v.size === 0) return null;
  const wb = XLSX.read(new Uint8Array(await v.arrayBuffer()), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]) : null;
}
async function playerRowsOf(v: FormDataEntryValue | null): Promise<WyscoutRow[] | null> {
  if (!(v instanceof File) || v.size === 0) return null;
  const wb = XLSX.read(new Uint8Array(await v.arrayBuffer()), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return ws ? XLSX.utils.sheet_to_json<WyscoutRow>(ws, { defval: null, raw: true }) : null;
}
const mnum = (m: Record<string, number | string | null>, ...keys: string[]): number | null => {
  for (const k of Object.keys(m)) {
    const nk = k.toLowerCase();
    if (keys.some((t) => nk === t || nk.startsWith(t))) { const n = Number(m[k]); if (Number.isFinite(n)) return n; }
  }
  return null;
};
const mstr = (m: Record<string, number | string | null>, key: string): string | null => {
  for (const k of Object.keys(m)) if (k.toLowerCase().startsWith(key)) return m[k] == null ? null : String(m[k]);
  return null;
};

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }

  const phase = String(form.get("phase") ?? "preview");
  const season = String(form.get("season") ?? "").trim();
  const requestedTeamId = (String(form.get("team_id") ?? "").trim()) || null;
  let opponent = String(form.get("opponent") ?? "").trim();

  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!season) return NextResponse.json({ ok: false, error: "Season is required." }, { status: 400 });

  const uploaded = [...form.getAll("files"), form.get("general"), form.get("indexes"), form.get("defending")];
  const matrices: unknown[][][] = [];
  for (const f of uploaded) { const m = await matrixOf(f); if (m) matrices.push(m); }
  if (matrices.length === 0) return NextResponse.json({ ok: false, error: "No team-stats file uploaded." }, { status: 400 });

  // StatsBomb IQ "Team Stats" category files (keyed on "Team Name", StatsBomb-only
  // columns) → provider-agnostic season profile + captured League Average. Deeper
  // than Wyscout where the league is covered; falls through to Wyscout otherwise.
  const sbHeader = (m: unknown[][]): string[] => (m[0] ?? []).map((c) => String(c ?? "").replace(/﻿/g, "").trim());
  const isSb = (m: unknown[][]): boolean => { const h = sbHeader(m); return h.includes("Team Name") && h.some((x) => ["Non Penalty xG", "PPDA", "OBV", "Set Piece xG", "Passing%"].includes(x)); };
  const sbMatrices = matrices.filter(isSb);
  if (sbMatrices.length > 0) {
    const asStr = (m: unknown[][]): string[][] => m.map((r) => r.map((c) => (c == null ? "" : String(c))));
    const parsed = parseStatsbombLeagueTeam(sbMatrices.map((m) => ({ matrix: asStr(m) })));
    const team = (opponent ? parsed.teams.find((t) => normTeam(t.name) === normTeam(opponent)) : undefined) ?? parsed.teams[0];
    if (!team) return NextResponse.json({ ok: false, error: "No team row found in the StatsBomb export (expected a team + League Average)." }, { status: 400 });
    if (!opponent) opponent = team.name;
    const m = metricsFromSbSeason(team);
    const leagueRef = parsed.leagueAverage ? metricsFromSbSeason(parsed.leagueAverage) : null;
    const sbExtras = { team: team.sb, league: parsed.leagueAverage?.sb ?? null, games: team.games, possessionIsProxy: team.possessionIsProxy };

    const sbSummary = {
      opponent, season, source: "statsbomb", categories: parsed.categories,
      metricsPreview: { xgf: m.xgf, xga: m.xga, ppda: m.ppda, obv: team.sb.obv ?? null, obvAgainst: team.sb.obvAgainst ?? null },
      unmappedHeaders: parsed.unknownColumns,
    };
    if (phase === "preview") return NextResponse.json({ ok: true, phase: "preview", ...sbSummary });

    const supabase = getSupabase();
    const { data: row, error } = await supabase.from("scout_team_season").upsert({
      owner_team_id: auth.teamId, opponent_name: opponent, season, source: "statsbomb", source_ref: "statsbomb_team_stats_csv",
      matches: team.games != null ? Math.round(team.games) : null, updated_at: new Date().toISOString(),
      xgf: m.xgf, xga: m.xga, gf: m.gf, ga: m.ga, shots: m.shots, shots_against: m.shotsAgainst,
      possession: m.possession, ppda: m.ppda, crosses: m.crosses, cross_acc_pct: m.crossAccPct,
      passes_final_third: m.passesFinalThird, forward_pass_acc_pct: m.forwardPassAccPct,
      league_ref: leagueRef, sb_extras: sbExtras,
    } as never, { onConflict: "owner_team_id,opponent_name,season" }).select("id").single();
    if (error || !row) return NextResponse.json({ ok: false, error: `Save failed: ${error?.message}` }, { status: 500 });
    // Preserve any existing scout_team_match (real results / form) + scout_player.
    return NextResponse.json({ ok: true, phase: "commit", seasonId: (row as { id: string }).id, ...sbSummary });
  }

  // Wrong-grain guards: Opponent Scouting takes the season "Team Stats" export (Team
  // Name + League Average, handled above). Redirect the other StatsBomb exports to
  // their own page instead of falling through to a confusing Wyscout error.
  const TEAM_MATCH_MARKERS = ["Opposition Passes", "Opposition xG", "Non Penalty Shots Faced"];
  const SB_ANY = ["OBV", "Non Penalty xG", "Set Piece xG", "PPDA", "Passing%", "Opposition Passes"];
  const isSbTeamMatch = (m: unknown[][]): boolean => { const h = sbHeader(m); return !h.includes("Team Name") && !h.includes("Player") && h.includes("Match") && h.some((x) => TEAM_MATCH_MARKERS.includes(x)); };
  const isSbPlayer = (m: unknown[][]): boolean => { const h = sbHeader(m); if (!h.some((x) => SB_ANY.includes(x))) return false; if (h.includes("Player")) return true; return h.includes("Match") && !h.includes("Team Name") && !h.some((x) => TEAM_MATCH_MARKERS.includes(x)); };
  if (matrices.some(isSbTeamMatch)) {
    return NextResponse.json({ ok: false, error: "This is a StatsBomb per-match team “Match Stats” export (one row per game). Upload it on Team Match Insight. Opponent Scouting needs the season “Team Stats” export (with a League Average row)." }, { status: 400 });
  }
  if (matrices.some(isSbPlayer)) {
    return NextResponse.json({ ok: false, error: "This is a StatsBomb per-player export (Squad or Player Match Stats). Upload it on the Player Statistics page. Opponent Scouting needs the season “Team Stats” export (with a League Average row)." }, { status: 400 });
  }

  const picked = selectWyscoutMatrices(matrices, opponent || undefined);
  if (!picked.general) return NextResponse.json({ ok: false, error: "Need the opponent's General export (goals + xG + possession, 'Show opponents' ON)." }, { status: 400 });

  if (!opponent) opponent = inferOwnTeamName(picked.general) ?? "Opponent";

  const built = buildTeamMatchStatRows({
    generalMatrix: picked.general, indexesMatrix: picked.indexes, defendingMatrix: picked.defending,
    passingMatrix: picked.passing, attackingMatrix: picked.attacking, teamId: auth.teamId, teamName: opponent,
  });
  const agg = aggregateScoutSeason(built.dbRows);

  // Optional player export.
  const playerMatrix = await playerRowsOf(form.get("players"));
  let players: Array<{ player_name: string; position: string | null; minutes: number | null; goals: number | null; xg: number | null; assists: number | null; xa: number | null; received_passes: number | null; raw: Record<string, unknown> }> = [];
  if (playerMatrix) {
    const parsed = parseWyscoutPlayerList(playerMatrix, { teamId: auth.teamId, season, sourceRef: "scout", teamName: opponent });
    players = parsed.stats.map((s) => {
      const met = s.metrics as Record<string, number | string | null>;
      return {
        player_name: s.wyscoutPlayerName, position: mstr(met, "position"),
        minutes: s.minutes ?? null, goals: s.goals ?? null, xg: s.xg ?? null, assists: s.assists ?? null,
        xa: mnum(met, "xa"), received_passes: mnum(met, "received pass", "received passes"),
        raw: met,
      };
    });
  }

  const summary = {
    opponent, season,
    matches: agg.nMatches,
    detected: { general: true, indexes: !!picked.indexes, defending: !!picked.defending, passing: !!picked.passing, attacking: !!picked.attacking },
    metricsPreview: { xgf: agg.metrics.xgf, xga: agg.metrics.xga, possession: agg.metrics.possession, ppda: agg.metrics.ppda },
    players: players.length,
    unmappedHeaders: built.unmappedHeaders,
  };

  if (phase === "preview") return NextResponse.json({ ok: true, phase: "preview", ...summary });

  const supabase = getSupabase();
  const m = agg.metrics;
  const { data: seasonRow, error: sErr } = await supabase.from("scout_team_season").upsert({
    owner_team_id: auth.teamId, opponent_name: opponent, season, source_ref: "wyscout_team_stats_xlsx",
    matches: agg.nMatches, updated_at: new Date().toISOString(),
    xgf: m.xgf, xga: m.xga, gf: m.gf, ga: m.ga, shots: m.shots, shots_against: m.shotsAgainst,
    possession: m.possession, ppda: m.ppda, def_duels_won_pct: m.defDuelsWonPct,
    forward_passes: m.forwardPasses, forward_pass_acc_pct: m.forwardPassAccPct,
    passes_final_third: m.passesFinalThird, passes_final_third_acc_pct: m.passesFinalThirdAccPct,
    progressive_passes: m.progressivePasses, smart_passes: m.smartPasses, smart_pass_acc_pct: m.smartPassAccPct,
    crosses: m.crosses, cross_acc_pct: m.crossAccPct,
    positional_attacks: m.positionalAttacks, counterattacks: m.counterattacks, offensive_duels_won_pct: m.offensiveDuelsWonPct,
    passing: agg.passingJson, attacking: agg.attackingJson,
  } as never, { onConflict: "owner_team_id,opponent_name,season" }).select("id").single();
  if (sErr || !seasonRow) return NextResponse.json({ ok: false, error: `Save failed: ${sErr?.message}` }, { status: 500 });
  const seasonId = (seasonRow as { id: string }).id;

  // Refresh child rows.
  await supabase.from("scout_team_match").delete().eq("scout_team_season_id", seasonId);
  if (agg.matches.length) {
    await supabase.from("scout_team_match").insert(agg.matches.map((mm) => ({
      scout_team_season_id: seasonId, match_date: mm.date, opponent: mm.opponent, is_home: mm.isHome,
      goals: mm.goals, goals_against: mm.goalsAgainst, xg: mm.xg, xg_against: mm.xgAgainst, result: mm.result,
    })) as never);
  }
  await supabase.from("scout_player").delete().eq("scout_team_season_id", seasonId);
  if (players.length) {
    await supabase.from("scout_player").insert(players.map((p) => ({ scout_team_season_id: seasonId, ...p })) as never);
  }

  return NextResponse.json({ ok: true, phase: "commit", seasonId, ...summary });
}
