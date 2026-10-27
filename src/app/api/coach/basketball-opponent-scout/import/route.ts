export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/coach/basketball-opponent-scout/import  (multipart)
 *
 * Upload an opponent's InStat SEASON export (the Games / Players / Lineups tables) to
 * build the whole-season scouting report from a richer feed than the free KKÍ box
 * scores — FG playtypes, per-player tendencies and 5-man units. Each file is detected
 * by its header, parsed, and merged into the one scout_basketball_season row for this
 * (team, opponent) tagged source='instat' (uploads accumulate — Games now, Players
 * later). Coach/team-scoped. Descriptive scouting only — never touches the readiness
 * colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isInstatGamesHeader } from "@/lib/micropulse/basketballStats/statsInstatGamesCsv";
import { isInstatPlayersSeasonHeader } from "@/lib/micropulse/basketballStats/statsInstatPlayersCsv";
import { isInstatLineupsHeader } from "@/lib/micropulse/basketballStats/statsInstatLineupsCsv";
import {
  parseScoutGames, parseScoutPlayers, parseScoutLineups, buildInstatOpponentScout,
  type InstatOpponentPayload,
} from "@/lib/micropulse/basketballStats/scoutInstatOpponent";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

function readRows(buf: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
}

type SupabaseClient = ReturnType<typeof getSupabase>;

const EMPTY: InstatOpponentPayload = { season: "", teamGames: [], players: [], lineups: [] };

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const supabase: SupabaseClient = auth.supabase;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected a multipart form upload." }, { status: 400 });
  const opponent = String(form.get("opponent") ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });

  const files = [...form.getAll("file"), ...form.getAll("files")].filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ ok: false, error: "Attach at least one InStat table (Games, Players or Lineups)." }, { status: 400 });

  // One InStat row per (team, opponent) — reuse its season + existing payload so uploads
  // accumulate (Games today, Players tomorrow) instead of replacing each other.
  const { data: existing } = await supabase.from("scout_basketball_season")
    .select("id, season, payload").eq("owner_team_id", auth.teamId).eq("opponent_name", opponent).eq("source", "instat").maybeSingle();
  const existingPayload = ((existing as { payload?: InstatOpponentPayload | null } | null)?.payload ?? null);
  const season = (existing as { season?: string } | null)?.season
    || String(form.get("season") ?? "").trim()
    || "unknown";

  const payload: InstatOpponentPayload = { ...EMPTY, ...(existingPayload ?? {}), season };
  const parsed: string[] = [];
  const unknownFiles: string[] = [];

  for (const file of files) {
    const rows = readRows(await file.arrayBuffer());
    const headers = rows.length ? Object.keys(rows[0]) : [];
    if (isInstatGamesHeader(headers)) {
      payload.teamGames = parseScoutGames(rows, season);
      parsed.push(`games:${payload.teamGames.length}`);
    } else if (isInstatPlayersSeasonHeader(headers)) {
      payload.players = parseScoutPlayers(rows);
      parsed.push(`players:${payload.players.length}`);
    } else if (isInstatLineupsHeader(headers)) {
      payload.lineups = parseScoutLineups(rows);
      parsed.push(`lineups:${payload.lineups.length}`);
    } else {
      unknownFiles.push(file.name);
    }
  }

  if (payload.teamGames.length === 0 && payload.players.length === 0 && payload.lineups.length === 0) {
    return NextResponse.json({
      ok: false,
      error: `No InStat Games / Players / Lineups table recognised${unknownFiles.length ? ` (${unknownFiles.join(", ")})` : ""}. Download the opponent's season tables from InStat and upload those.`,
    }, { status: 400 });
  }

  // games = the team game log when present, else the most games any player appeared in.
  const games = payload.teamGames.length || payload.players.reduce((mx, p) => Math.max(mx, p.games || 0), 0);
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase.from("scout_basketball_season").upsert({
    owner_team_id: auth.teamId, opponent_name: opponent, season, season_id: null,
    source: "instat", games, payload, synced_at: nowIso, updated_at: nowIso,
  }, { onConflict: "owner_team_id,opponent_name,season,source" });
  if (upErr) return NextResponse.json({ ok: false, error: `Save failed: ${upErr.message}` }, { status: 500 });

  // Preview the report the coach will see (keeps the UI honest about what imported).
  const scout = buildInstatOpponentScout(opponent, payload);
  return NextResponse.json({
    ok: true, opponent, season, games,
    parsed, unknownFiles,
    counts: { teamGames: payload.teamGames.length, players: payload.players.length, lineups: payload.lineups.length },
    topScorer: scout.report.keyPlayers[0]?.name ?? scout.report.players[0]?.name ?? null,
    playtypes: scout.playtypes.length,
  });
}
