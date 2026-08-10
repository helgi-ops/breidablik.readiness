export const runtime = "nodejs";

/**
 * /api/coach/stats/smart-import  (multipart: file, phase, season, decisions?)
 *
 * The "drop any StatsBomb/Wyscout file" endpoint. It classifies the file from its
 * header (smartDetect), reports column coverage (what will fill / what's missing),
 * and — for the common per-player SEASON exports (StatsBomb Squad / Player Stats and
 * the Wyscout player list) — resolves players against the squad and upserts
 * player_season_stats, reusing the same pure parsers + persist as the dedicated
 * uploader so the two never diverge. Any other recognized kind is detected and the
 * coach is told which dedicated box to use (no silent mis-import). Descriptive
 * football data — never touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseWyscoutPlayerList, type WyscoutRow } from "@/lib/micropulse/statsIngestion/wyscoutExcel";
import { parseStatsbombSquad } from "@/lib/micropulse/statsIngestion/statsbombSquad";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import { seasonStatToDbRow, SEASON_CONFLICT } from "@/lib/micropulse/statsIngestion/persist";
import type { SquadPlayer } from "@/lib/micropulse/statsIngestion/types";
import { detectStatsFile } from "@/lib/micropulse/statsIngestion/smartDetect";
import { computeCoverage } from "@/lib/micropulse/statsIngestion/statsCoverage";
import { collapseStatsbombSeasonSiblings } from "@/lib/micropulse/statsIngestion/collapseSeasonSiblings";

async function getCoachTeam(req: NextRequest) {
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

function readRows(buf: ArrayBuffer): WyscoutRow[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<WyscoutRow>(ws, { defval: null, raw: true });
}

const PER_PLAYER_SEASON = new Set(["sb_squad_season", "wyscout_player"]);

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const phase = String(form.get("phase") ?? "preview");
  const season = String(form.get("season") ?? "").trim() || String(new Date().getFullYear());
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });

  const rows = readRows(await file.arrayBuffer());
  const headers = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [];
  if (headers.length === 0) return NextResponse.json({ ok: false, error: "Could not read any columns from the file." }, { status: 400 });

  const detection = detectStatsFile(headers, rows as Record<string, unknown>[]);
  const coverage = computeCoverage(detection.kind, headers);

  // Files that need a dedicated flow (name-mapping review, player picker, fixture
  // mapping) or are unrecognized: detect + report, but don't import here.
  if (!PER_PLAYER_SEASON.has(detection.kind)) {
    return NextResponse.json({ ok: true, phase: "detected", detection, coverage, imported: false });
  }

  // ── Per-player SEASON import (StatsBomb Squad/Player Stats OR Wyscout player list) ──
  const parsed = detection.kind === "sb_squad_season"
    ? parseStatsbombSquad(rows as Record<string, unknown>[], { teamId: auth.teamId, season, sourceRef: file.name })
    : parseWyscoutPlayerList(rows, { teamId: auth.teamId, season, sourceRef: file.name });
  const stats = parsed.stats;
  if (stats.length === 0) {
    return NextResponse.json({ ok: true, phase, detection, coverage, imported: false, rows: [], counts: { exact: 0, fuzzy: 0, none: 0 }, note: "No player rows parsed from this file." });
  }

  const { data: squadRows } = await auth.supabase.from("players").select("id, full_name, is_active").eq("team_id", auth.teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));

  const { data: mapRows } = await auth.supabase.from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", auth.teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) remembered.set(m.source_player_ref, m.player_id);

  const resolved = stats.map((s) => {
    const mem = remembered.get(s.sourcePlayerRef);
    if (mem) return { stat: s, playerId: mem, confidence: "exact" as const, candidates: [] as { playerId: string; fullName: string; score: number }[] };
    const m = matchByInitialSurname(s.wyscoutPlayerName, squad);
    return { stat: s, playerId: m.playerId, confidence: m.confidence, candidates: m.candidates };
  });

  if (phase === "preview") {
    return NextResponse.json({
      ok: true, phase: "preview", detection, coverage, imported: false, season, squad,
      rows: resolved.map((r) => ({
        sourcePlayerRef: r.stat.sourcePlayerRef, wyscoutPlayerName: r.stat.wyscoutPlayerName,
        minutes: r.stat.minutes, goals: r.stat.goals, assists: r.stat.assists, xg: r.stat.xg,
        suggestedPlayerId: r.playerId, confidence: r.confidence,
      })),
      counts: {
        exact: resolved.filter((r) => r.confidence === "exact").length,
        fuzzy: resolved.filter((r) => r.confidence === "fuzzy").length,
        none: resolved.filter((r) => r.confidence === "none").length,
      },
    });
  }

  // ── COMMIT ──
  let decisions: Record<string, string> = {};
  try { decisions = JSON.parse(String(form.get("decisions") ?? "{}")); } catch { decisions = {}; }
  const finalRows = resolved.map((r) => {
    const decided = Object.prototype.hasOwnProperty.call(decisions, r.stat.sourcePlayerRef) ? (decisions[r.stat.sourcePlayerRef] || null) : undefined;
    const playerId = decided !== undefined ? decided : (r.confidence === "exact" ? r.playerId : null);
    return { stat: r.stat, playerId, wasDecided: decided !== undefined };
  });

  const dedupe = <T,>(arr: T[], key: (r: T) => string): T[] => { const m = new Map<string, T>(); for (const r of arr) m.set(key(r), r); return [...m.values()]; };

  const mappingUpserts = dedupe(
    finalRows.filter((r) => r.playerId).map((r) => ({
      team_id: auth.teamId, source_player_ref: r.stat.sourcePlayerRef, wyscout_player_name: r.stat.wyscoutPlayerName,
      player_id: r.playerId, confidence: r.wasDecided ? "manual" : "exact", confirmed_at: new Date().toISOString(),
    })),
    (m) => m.source_player_ref,
  );
  if (mappingUpserts.length > 0) {
    const { error } = await auth.supabase.from("stat_player_mapping").upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Mapping save: ${error.message}` }, { status: 500 });
  }

  const dbRows = dedupe(
    finalRows.map((r) => seasonStatToDbRow(r.stat, r.playerId)),
    (row) => `${(row as { source?: string }).source ?? ""}|${(row as { source_player_ref?: string }).source_player_ref ?? ""}`,
  );
  const { error: upErr } = await auth.supabase.from("player_season_stats").upsert(dbRows as never, { onConflict: SEASON_CONFLICT });
  if (upErr) return NextResponse.json({ ok: false, error: `Upsert: ${upErr.message}` }, { status: 500 });

  // One statsbomb_csv row per player per season (Squad + Player-Stats exports of the
  // same player carry different refs) — shared with the dedicated uploader.
  if (detection.kind === "sb_squad_season") {
    await collapseStatsbombSeasonSiblings(auth.supabase, auth.teamId, season, stats.map((s) => ({ name: s.wyscoutPlayerName, ref: s.sourcePlayerRef })));
  }

  return NextResponse.json({
    ok: true, phase: "commit", detection, coverage, imported: true, season,
    rowsUpserted: dbRows.length,
    mapped: finalRows.filter((r) => r.playerId).length,
    unmatched: finalRows.filter((r) => !r.playerId).length,
  });
}
