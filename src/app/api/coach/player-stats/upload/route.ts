export const runtime = "nodejs";

/**
 * /api/coach/player-stats/upload  (Adapter A — Wyscout Excel/CSV import)
 *
 * Two-phase, multipart/form-data (the .xlsx/.csv file + fields):
 *   phase = "preview" → parse the export, resolve each player against the squad
 *                       (remembered mapping first, then the (initial, surname)
 *                       matcher), return grouped rows for the review UI. NO writes.
 *   phase = "commit"  → persist confirmed mappings (stat_player_mapping) and
 *                       idempotently upsert player_season_stats. Unmatched rows
 *                       are kept with player_id = null, never dropped.
 *
 * Descriptive football data — never touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseWyscoutPlayerList, type WyscoutRow } from "@/lib/micropulse/statsIngestion/wyscoutExcel";
import { parseStatsbombSquad, isStatsbombSquadHeader } from "@/lib/micropulse/statsIngestion/statsbombSquad";
import { parseStatsbombPlayerMatch, isStatsbombPlayerMatchHeader } from "@/lib/micropulse/statsIngestion/statsbombPlayerMatch";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import { seasonStatToDbRow, matchStatToDbRow, SEASON_CONFLICT, MATCH_CONFLICT } from "@/lib/micropulse/statsIngestion/persist";
import type { SquadPlayer } from "@/lib/micropulse/statsIngestion/types";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach not linked to a team", status: 400 } as const;
  if (!targetTeamId || targetTeamId === primaryTeamId) return { userId, teamId: primaryTeamId } as const;
  const { data: coachRow } = await supabase
    .from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", targetTeamId).maybeSingle();
  if (!coachRow) return { error: "No access to that team", status: 403 } as const;
  return { userId, teamId: targetTeamId } as const;
}

/** First worksheet → array of header-keyed row objects (SheetJS). */
function readRows(buf: ArrayBuffer): WyscoutRow[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<WyscoutRow>(ws, { defval: null, raw: true });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }
  const phase = String(form.get("phase") ?? "preview");
  const season = String(form.get("season") ?? "").trim();
  // Optional override only. When absent, the parser infers the senior team from
  // the file itself (most common Team value), so every club's export works —
  // not just Breiðablik. Previously this defaulted to "Breidablik", which made
  // every other club's rows skip as "not the senior team".
  const teamName = String(form.get("team_name") ?? "").trim() || undefined;
  const requestedTeamId = (String(form.get("team_id") ?? "").trim()) || null;
  const file = form.get("file");

  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!season) return NextResponse.json({ ok: false, error: "Season is required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });

  // Season totals only — per-match football stats are Adapter B (Wyscout Data
  // API), never Excel (Wyscout has no per-match Excel export; the metered PDF is
  // rejected). See docs/samples/wyscout/README.md.
  const rows = readRows(await file.arrayBuffer());
  const headers = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [];

  // Wrong-grain guards — this page takes per-PLAYER exports (Squad season / Player
  // Match Stats). A TEAM-level StatsBomb file must be caught BEFORE the player-match
  // detection below, because the per-match team file also has Match+Date+OBV and no
  // "Player" column, so it would otherwise be silently written as one player's stats.
  const H = headers.map((x) => String(x ?? "").replace(/﻿/g, "").trim());
  const hasH = (c: string) => H.includes(c);
  const SB_ANY = ["OBV", "Non Penalty xG", "Set Piece xG", "PPDA", "Passing%", "Opposition Passes"];
  // Opposition aggregates only — a GOALKEEPER's per-player file also has "Non Penalty
  // Shots Faced", so it must NOT be a team-file tell (it wrongly rejected keeper stats).
  const TEAM_MATCH_MARKERS = ["Opposition Passes", "Opposition xG"];
  if (H.some((h) => SB_ANY.includes(h)) && hasH("Team Name")) {
    return NextResponse.json({ ok: false, error: "This is a StatsBomb season Team Stats export (Team Name + League Average). Upload it on Opponent Scouting — this page takes the per-player Squad or Player Match Stats export." }, { status: 400 });
  }
  if (hasH("Match") && !hasH("Player") && !hasH("Team Name") && H.some((h) => TEAM_MATCH_MARKERS.includes(h))) {
    return NextResponse.json({ ok: false, error: "This is a StatsBomb team Match Stats export (per-match TEAM totals). Upload it on Season Match Analysis — this page takes the per-player Squad or Player Match Stats export." }, { status: 400 });
  }

  // StatsBomb IQ per-PLAYER match file (one file/player, no player column) → the
  // coach picks the player (player_id); rows go straight to player_match_stats.
  if (isStatsbombPlayerMatchHeader(headers)) {
    const playerId = String(form.get("player_id") ?? "").trim();
    if (!playerId) return NextResponse.json({ ok: false, error: "Choose the player this StatsBomb match file belongs to." }, { status: 400 });
    const supabase = getSupabase();
    const { data: pl } = await supabase.from("players").select("full_name").eq("id", playerId).eq("team_id", auth.teamId).maybeSingle();
    if (!pl) return NextResponse.json({ ok: false, error: "That player is not on your team." }, { status: 400 });
    const playerName = (pl as { full_name: string | null }).full_name ?? "—";
    const { stats: pmStats, skipped: pmSkipped } = parseStatsbombPlayerMatch(rows as Record<string, unknown>[], { teamId: auth.teamId, playerName, sourcePlayerRef: `sbpm:${playerId}`, sourceRef: file.name });
    const dates = pmStats.map((s) => s.matchDate).sort();
    if (phase === "preview") {
      return NextResponse.json({ ok: true, phase: "preview", kind: "player_match", player: playerName, matches: pmStats.length, dateFrom: dates[0] ?? null, dateTo: dates[dates.length - 1] ?? null, skipped: pmSkipped });
    }
    const byKey = new Map<string, ReturnType<typeof matchStatToDbRow>>();
    for (const s of pmStats) { const row = matchStatToDbRow(s, playerId); byKey.set(`${row.match_date}`, row); }
    const { error } = await supabase.from("player_match_stats").upsert([...byKey.values()] as never, { onConflict: MATCH_CONFLICT });
    if (error) return NextResponse.json({ ok: false, error: `Upsert: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "commit", kind: "player_match", player: playerName, rowsUpserted: byKey.size, skipped: pmSkipped.length });
  }

  // StatsBomb IQ Squad CSV (per-90 season aggregates, deeper than Wyscout) OR the
  // Wyscout player list — same normalized output, so the resolve/commit is shared.
  const { stats, skipped } = isStatsbombSquadHeader(headers)
    ? parseStatsbombSquad(rows as Record<string, unknown>[], { teamId: auth.teamId, season, sourceRef: file.name })
    : parseWyscoutPlayerList(rows, { teamId: auth.teamId, season, sourceRef: file.name, teamName });
  if (stats.length === 0) {
    return NextResponse.json({
      ok: true, phase, season, sourceRef: file.name, rows: [], skipped, squad: [],
      note: "No senior rows parsed — check the Team filter matches the export.",
    });
  }

  const supabase = getSupabase();
  const { data: squadRows } = await supabase
    .from("players").select("id, full_name, is_active").eq("team_id", auth.teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));

  const { data: mapRows } = await supabase
    .from("stat_player_mapping").select("source_player_ref, player_id, confidence").eq("team_id", auth.teamId);
  const remembered = new Map<string, { playerId: string | null }>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) {
    remembered.set(m.source_player_ref, { playerId: m.player_id });
  }

  // Resolve each parsed player: remembered mapping wins, else the matcher.
  const resolved = stats.map((s) => {
    const mem = remembered.get(s.sourcePlayerRef);
    if (mem && mem.playerId) {
      return { stat: s, playerId: mem.playerId, confidence: "exact" as const, remembered: true, candidates: [] as { playerId: string; fullName: string; score: number }[] };
    }
    const m = matchByInitialSurname(s.wyscoutPlayerName, squad);
    return { stat: s, playerId: m.playerId, confidence: m.confidence, remembered: false, candidates: m.candidates };
  });

  if (phase === "preview") {
    const rowsOut = resolved.map((r) => ({
      sourcePlayerRef: r.stat.sourcePlayerRef,
      wyscoutPlayerName: r.stat.wyscoutPlayerName,
      minutes: r.stat.minutes, goals: r.stat.goals, assists: r.stat.assists, xg: r.stat.xg,
      suggestedPlayerId: r.playerId,
      confidence: r.confidence,
      remembered: r.remembered,
      candidates: r.candidates,
    }));
    return NextResponse.json({
      ok: true, phase: "preview", season, sourceRef: file.name,
      rows: rowsOut, skipped, squad,
      counts: {
        exact: resolved.filter((r) => r.confidence === "exact").length,
        fuzzy: resolved.filter((r) => r.confidence === "fuzzy").length,
        none: resolved.filter((r) => r.confidence === "none").length,
      },
    });
  }

  // ── COMMIT ──
  // decisions: { [sourcePlayerRef]: playerId | "" }  — the coach's confirmed picks.
  let decisions: Record<string, string> = {};
  try { decisions = JSON.parse(String(form.get("decisions") ?? "{}")); } catch { decisions = {}; }

  const finalRows = resolved.map((r) => {
    const decided = Object.prototype.hasOwnProperty.call(decisions, r.stat.sourcePlayerRef)
      ? (decisions[r.stat.sourcePlayerRef] || null)
      : undefined;
    // A coach decision overrides; otherwise only an EXACT auto-match is applied.
    const playerId = decided !== undefined ? decided : (r.confidence === "exact" ? r.playerId : null);
    return { stat: r.stat, playerId, wasDecided: decided !== undefined, autoExact: r.confidence === "exact" };
  });

  // Postgres aborts an upsert if the SAME conflict key appears twice in one batch
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"). The Wyscout
  // export can list a player on more than one row, and sourcePlayerRef is only an
  // initial+surname key, so collisions happen. Collapse to one row per conflict key
  // (last wins — same as what the DB would end on) before every upsert.
  const dedupeByKey = <T>(rows: T[], key: (r: T) => string): { rows: T[]; collapsed: number } => {
    const byKey = new Map<string, T>();
    for (const r of rows) byKey.set(key(r), r);
    return { rows: [...byKey.values()], collapsed: rows.length - byKey.size };
  };

  // Persist mappings for every resolved player (remembered for next time).
  const mappingAll = finalRows
    .filter((r) => r.playerId)
    .map((r) => ({
      team_id: auth.teamId,
      source_player_ref: r.stat.sourcePlayerRef,
      wyscout_player_name: r.stat.wyscoutPlayerName,
      player_id: r.playerId,
      confidence: r.wasDecided ? "manual" : "exact",
      confirmed_at: new Date().toISOString(),
    }));
  const { rows: mappingUpserts } = dedupeByKey(mappingAll, (m) => m.source_player_ref);
  if (mappingUpserts.length > 0) {
    const { error } = await supabase.from("stat_player_mapping")
      .upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Mapping save: ${error.message}` }, { status: 500 });
  }

  // Upsert ALL parsed rows (mapped + unmatched-kept), idempotent on the natural key.
  // Dedupe on the SAME columns as SEASON_CONFLICT (season + source constant here).
  const { rows: dbRows, collapsed } = dedupeByKey(
    finalRows.map((r) => seasonStatToDbRow(r.stat, r.playerId)),
    (row) => `${(row as { source?: string }).source ?? ""}|${(row as { source_player_ref?: string }).source_player_ref ?? ""}`,
  );
  const { error: upErr } = await supabase.from("player_season_stats")
    .upsert(dbRows as never, { onConflict: SEASON_CONFLICT });
  if (upErr) return NextResponse.json({ ok: false, error: `Upsert: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({
    ok: true, phase: "commit", season, sourceRef: file.name,
    rowsUpserted: dbRows.length,
    mapped: finalRows.filter((r) => r.playerId).length,
    unmatched: finalRows.filter((r) => !r.playerId).length,
    skipped: skipped.length,
    duplicatesCollapsed: collapsed,
  });
}
