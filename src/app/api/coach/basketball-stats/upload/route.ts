export const runtime = "nodejs";

/**
 * /api/coach/basketball-stats/upload  (InStat / Hudl basketball ingestion)
 *
 * InStat is a descriptive SOURCE (source='instat'), not a new surface — box-score
 * `baskethotel` stays the canonical KKÍ feed and is NEVER overwritten here. Two
 * confirmed export paths (Hudl rep, Aug 2026), auto-detected by file type:
 *
 *   • CSV/Excel manual table export → per-PLAYER box score + advanced metrics.
 *     Two-phase like the football route:
 *       phase="preview" → resolve each player vs the squad (remembered mapping,
 *                         then the initial+surname matcher); NO writes.
 *       phase="commit"  → persist confirmed mappings + idempotently upsert
 *                         player_basketball_match_stats (unmatched kept, id=null).
 *
 *   • Game Report PDF → TEAM box score + per-quarter + Four Factors, BOTH sides
 *     from one file. preview parses; commit upserts basketball_team_match_stats.
 *
 * Purely descriptive — NEVER touches the readiness colour, load, or daily decision.
 * Per-player OPPONENT scouting (scout_basketball_*) is Phase B; team-level opponent
 * data is already captured from the PDF (the opponent side of each match row).
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import type { SquadPlayer } from "@/lib/micropulse/statsIngestion/types";
import {
  isInstatBasketballHeader,
  parseInstatBasketballCsv,
} from "@/lib/micropulse/basketballStats/statsInstatBasketballCsv";
import { extractInstatGameReport } from "@/lib/micropulse/basketballStats/statsInstatBasketballPdf";
import type { InstatIngestContext } from "@/lib/micropulse/basketballStats/statsInstatBasketball";
import {
  basketballGameStatToDbRow,
  basketballTeamMatchToDbRow,
  BASKETBALL_MATCH_CONFLICT,
  BASKETBALL_TEAM_MATCH_CONFLICT,
} from "@/lib/micropulse/basketballStats/persist";

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

/** First worksheet → header-keyed row objects (SheetJS), for CSV/Excel exports. */
function readRows(buf: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
}

/** Filename → a stable, filesystem-safe slug (deterministic match_ref default). */
function slug(s: string): string {
  return s.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }
  const phase = String(form.get("phase") ?? "preview");
  const requestedTeamId = String(form.get("team_id") ?? "").trim() || null;
  const file = form.get("file");

  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });

  const supabase = getSupabase();
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  // ── Game Report PDF → team + per-quarter rows (both sides) ──────────────────
  if (isPdf) {
    const { data: teamRow } = await supabase.from("teams").select("name").eq("id", auth.teamId).maybeSingle();
    const ctx: InstatIngestContext = {
      ownerTeamId: auth.teamId,
      matchRef: `instat:pdf:${slug(file.name)}`,
      ownerTeamName: (teamRow as { name?: string } | null)?.name ?? null,
    };
    const buffer = Buffer.from(await file.arrayBuffer());
    let extracted: Awaited<ReturnType<typeof extractInstatGameReport>>;
    try {
      extracted = await extractInstatGameReport({ buffer, ctx });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `PDF parse failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
    }
    const { meta, teams } = extracted;
    if (!meta || teams.length === 0) {
      return NextResponse.json({ ok: false, error: "Not an InStat basketball Game Report PDF (no team stats found)." }, { status: 400 });
    }

    const game = teams.filter((r) => r.period === "game");
    const own = game.find((r) => !r.isOpponent);
    const opp = game.find((r) => r.isOpponent);

    if (phase === "preview") {
      return NextResponse.json({
        ok: true, phase: "preview", kind: "game_report_pdf",
        match: { date: meta.date, home: meta.home, away: meta.away, homeScore: meta.homeScore, awayScore: meta.awayScore },
        ownTeam: own ? { points: own.points, efgPct: own.advanced?.efgPct, ppp: own.advanced?.ppp, isOpponent: false } : null,
        oppTeam: opp ? { points: opp.points, efgPct: opp.advanced?.efgPct, ppp: opp.advanced?.ppp } : null,
        teamRows: teams.length, quarters: teams.filter((r) => r.period !== "game").length,
        matchRef: ctx.matchRef,
      });
    }

    const dbRows = teams.map((r) => basketballTeamMatchToDbRow(r));
    const { error } = await supabase.from("basketball_team_match_stats")
      .upsert(dbRows as never, { onConflict: BASKETBALL_TEAM_MATCH_CONFLICT });
    if (error) return NextResponse.json({ ok: false, error: `Upsert: ${error.message}` }, { status: 500 });
    return NextResponse.json({
      ok: true, phase: "commit", kind: "game_report_pdf",
      match: { date: meta.date, home: meta.home, away: meta.away },
      rowsUpserted: dbRows.length, matchRef: ctx.matchRef,
    });
  }

  // ── CSV/Excel manual export → per-player box scores (own team) ───────────────
  const rows = readRows(await file.arrayBuffer());
  const headers = rows.length ? Object.keys(rows[0]) : [];
  if (!isInstatBasketballHeader(headers)) {
    return NextResponse.json({ ok: false, error: "This does not look like an InStat basketball player table (need a player name + points + a shooting/rebounding column). Upload the InStat table export, or a Game Report PDF." }, { status: 400 });
  }

  // Per-match context — the coach supplies (or we derive) the game identity. game_id
  // is the idempotency key together with (team, source, player), so re-uploading the
  // same file updates rather than duplicates.
  const matchRef = String(form.get("match_ref") ?? "").trim() || `instat:csv:${slug(file.name)}`;
  const matchDate = String(form.get("match_date") ?? "").trim() || null;
  const opponent = String(form.get("opponent") ?? "").trim() || null;
  const homeAwayRaw = String(form.get("home_away") ?? "").trim().toLowerCase();
  const homeAway = homeAwayRaw === "home" || homeAwayRaw === "away" ? (homeAwayRaw as "home" | "away") : null;
  const ctx: InstatIngestContext = { ownerTeamId: auth.teamId, matchRef, matchDate, opponent, homeAway };

  const { players, skipped } = parseInstatBasketballCsv(rows, ctx);
  if (players.length === 0) {
    return NextResponse.json({ ok: true, phase, kind: "player_csv", rows: [], skipped, squad: [], note: "No player rows parsed." });
  }

  // Squad + remembered mappings (mirrors the football route).
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", auth.teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));

  const { data: mapRows } = await supabase
    .from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", auth.teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) {
    remembered.set(m.source_player_ref, m.player_id);
  }

  const resolved = players.map((p) => {
    const mem = remembered.get(p.sourcePlayerRef);
    if (mem) return { row: p, playerId: mem, confidence: "exact" as const, remembered: true, candidates: [] as { playerId: string; fullName: string; score: number }[] };
    const m = matchByInitialSurname(p.playerName, squad);
    return { row: p, playerId: m.playerId, confidence: m.confidence, remembered: false, candidates: m.candidates };
  });

  if (phase === "preview") {
    return NextResponse.json({
      ok: true, phase: "preview", kind: "player_csv",
      match: { matchRef, matchDate, opponent },
      rows: resolved.map((r) => ({
        sourcePlayerRef: r.row.sourcePlayerRef,
        playerName: r.row.playerName,
        points: r.row.points, reb: r.row.reb, assists: r.row.assists,
        suggestedPlayerId: r.playerId, confidence: r.confidence, remembered: r.remembered, candidates: r.candidates,
      })),
      skipped, squad,
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
    const decided = Object.prototype.hasOwnProperty.call(decisions, r.row.sourcePlayerRef)
      ? (decisions[r.row.sourcePlayerRef] || null)
      : undefined;
    const playerId = decided !== undefined ? decided : (r.confidence === "exact" ? r.playerId : null);
    return { row: r.row, playerId, wasDecided: decided !== undefined };
  });

  const dedupeByKey = <T>(items: T[], key: (r: T) => string): { rows: T[]; collapsed: number } => {
    const byKey = new Map<string, T>();
    for (const it of items) byKey.set(key(it), it);
    return { rows: [...byKey.values()], collapsed: items.length - byKey.size };
  };

  // Remember confirmed mappings for next time.
  const mappingAll = finalRows
    .filter((r) => r.playerId)
    .map((r) => ({
      team_id: auth.teamId,
      source_player_ref: r.row.sourcePlayerRef,
      wyscout_player_name: r.row.playerName,
      player_id: r.playerId,
      confidence: r.wasDecided ? "manual" : "exact",
      confirmed_at: new Date().toISOString(),
    }));
  const { rows: mappingUpserts } = dedupeByKey(mappingAll, (m) => m.source_player_ref);
  if (mappingUpserts.length > 0) {
    const { error } = await supabase.from("stat_player_mapping").upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Mapping save: ${error.message}` }, { status: 500 });
  }

  // Upsert all parsed rows (mapped + unmatched-kept), idempotent on the natural key.
  const { rows: dbRows, collapsed } = dedupeByKey(
    finalRows.map((r) => basketballGameStatToDbRow(r.row, r.playerId)),
    (row) => `${(row as { source?: string }).source ?? ""}|${(row as { game_id?: string }).game_id ?? ""}|${(row as { source_player_ref?: string }).source_player_ref ?? ""}`,
  );
  const { error: upErr } = await supabase.from("player_basketball_match_stats")
    .upsert(dbRows as never, { onConflict: BASKETBALL_MATCH_CONFLICT });
  if (upErr) return NextResponse.json({ ok: false, error: `Upsert: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({
    ok: true, phase: "commit", kind: "player_csv",
    match: { matchRef, matchDate, opponent },
    rowsUpserted: dbRows.length,
    mapped: finalRows.filter((r) => r.playerId).length,
    unmatched: finalRows.filter((r) => !r.playerId).length,
    skipped: skipped.length,
    duplicatesCollapsed: collapsed,
  });
}
