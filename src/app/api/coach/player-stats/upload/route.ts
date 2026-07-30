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
import { parseWyscoutPlayerList, parseWyscoutMatchReport, type WyscoutRow } from "@/lib/micropulse/statsIngestion/wyscoutExcel";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import { seasonStatToDbRow, matchStatToDbRow, SEASON_CONFLICT, MATCH_CONFLICT } from "@/lib/micropulse/statsIngestion/persist";
import type { SquadPlayer, PlayerSeasonStat, PlayerMatchStat } from "@/lib/micropulse/statsIngestion/types";

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
  const kind = String(form.get("kind") ?? "season") === "match" ? "match" : "season";
  const season = String(form.get("season") ?? "").trim();
  const matchDate = String(form.get("match_date") ?? "").trim();
  const opponent = String(form.get("opponent") ?? "").trim() || null;
  const homeAwayRaw = String(form.get("home_away") ?? "").trim();
  const homeAway = homeAwayRaw === "home" || homeAwayRaw === "away" ? homeAwayRaw : null;
  const teamName = String(form.get("team_name") ?? "Breidablik").trim() || "Breidablik";
  const requestedTeamId = (String(form.get("team_id") ?? "").trim()) || null;
  const file = form.get("file");

  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (kind === "season" && !season) return NextResponse.json({ ok: false, error: "Season is required" }, { status: 400 });
  if (kind === "match" && !/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return NextResponse.json({ ok: false, error: "A valid match date (YYYY-MM-DD) is required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });

  const rows = readRows(await file.arrayBuffer());
  let stats: (PlayerSeasonStat | PlayerMatchStat)[];
  let skipped: { player: string; team: string; reason: string }[];
  if (kind === "match") {
    const r = parseWyscoutMatchReport(rows, { teamId: auth.teamId, matchDate, opponent, homeAway, sourceRef: file.name, teamName });
    stats = r.stats; skipped = r.skipped;
  } else {
    const r = parseWyscoutPlayerList(rows, { teamId: auth.teamId, season, sourceRef: file.name, teamName });
    stats = r.stats; skipped = r.skipped;
  }
  if (stats.length === 0) {
    return NextResponse.json({
      ok: true, phase, kind, season, matchDate, sourceRef: file.name, rows: [], skipped, squad: [],
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
      ok: true, phase: "preview", kind, season, matchDate, sourceRef: file.name,
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

  // Persist mappings for every resolved player (remembered for next time).
  const mappingUpserts = finalRows
    .filter((r) => r.playerId)
    .map((r) => ({
      team_id: auth.teamId,
      source_player_ref: r.stat.sourcePlayerRef,
      wyscout_player_name: r.stat.wyscoutPlayerName,
      player_id: r.playerId,
      confidence: r.wasDecided ? "manual" : "exact",
      confirmed_at: new Date().toISOString(),
    }));
  if (mappingUpserts.length > 0) {
    const { error } = await supabase.from("stat_player_mapping")
      .upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Mapping save: ${error.message}` }, { status: 500 });
  }

  // Upsert ALL parsed rows (mapped + unmatched-kept), idempotent on the natural key.
  const table = kind === "match" ? "player_match_stats" : "player_season_stats";
  const conflict = kind === "match" ? MATCH_CONFLICT : SEASON_CONFLICT;
  const dbRows = finalRows.map((r) =>
    kind === "match"
      ? matchStatToDbRow(r.stat as PlayerMatchStat, r.playerId)
      : seasonStatToDbRow(r.stat as PlayerSeasonStat, r.playerId),
  );
  const { error: upErr } = await supabase.from(table).upsert(dbRows as never, { onConflict: conflict });
  if (upErr) return NextResponse.json({ ok: false, error: `Upsert: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({
    ok: true, phase: "commit", kind, season, matchDate, sourceRef: file.name,
    rowsUpserted: dbRows.length,
    mapped: finalRows.filter((r) => r.playerId).length,
    unmatched: finalRows.filter((r) => !r.playerId).length,
    skipped: skipped.length,
  });
}
