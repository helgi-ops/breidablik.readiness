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
import type { BasketballBoxScoreRow } from "@/lib/micropulse/basketballStats/types";

type SupabaseClient = ReturnType<typeof getSupabase>;

type ResolvedPlayer = {
  row: BasketballBoxScoreRow;
  playerId: string | null;
  confidence: "exact" | "fuzzy" | "none";
  remembered: boolean;
  candidates: { playerId: string; fullName: string; score: number }[];
};

/**
 * Resolve parsed player rows against the squad — remembered mapping first, then the
 * initial+surname matcher. NO writes. Shared by the CSV and PDF per-player paths so
 * both feeds resolve identically (same `instat:<name>` ref key).
 */
async function resolvePlayers(
  supabase: SupabaseClient,
  teamId: string,
  players: BasketballBoxScoreRow[],
): Promise<{ squad: SquadPlayer[]; resolved: ResolvedPlayer[] }> {
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));

  const { data: mapRows } = await supabase
    .from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) {
    remembered.set(m.source_player_ref, m.player_id);
  }

  const resolved = players.map((p): ResolvedPlayer => {
    const mem = remembered.get(p.sourcePlayerRef);
    if (mem) return { row: p, playerId: mem, confidence: "exact", remembered: true, candidates: [] };
    const m = matchByInitialSurname(p.playerName, squad);
    return { row: p, playerId: m.playerId, confidence: m.confidence, remembered: false, candidates: m.candidates };
  });
  return { squad, resolved };
}

const dedupeByKey = <T>(items: T[], key: (r: T) => string): { rows: T[]; collapsed: number } => {
  const byKey = new Map<string, T>();
  for (const it of items) byKey.set(key(it), it);
  return { rows: [...byKey.values()], collapsed: items.length - byKey.size };
};

/**
 * Persist resolved players: remember confirmed mappings + idempotently upsert
 * player_basketball_match_stats (unmatched kept, id=null). `decisions` is the
 * coach's per-ref override map ("" = keep unmatched). Returns counts or an error.
 */
async function commitPlayers(
  supabase: SupabaseClient,
  teamId: string,
  resolved: ResolvedPlayer[],
  decisions: Record<string, string>,
): Promise<{ error?: string; mapped: number; unmatched: number; rowsUpserted: number; collapsed: number }> {
  const finalRows = resolved.map((r) => {
    const decided = Object.prototype.hasOwnProperty.call(decisions, r.row.sourcePlayerRef)
      ? (decisions[r.row.sourcePlayerRef] || null)
      : undefined;
    const playerId = decided !== undefined ? decided : (r.confidence === "exact" ? r.playerId : null);
    return { row: r.row, playerId, wasDecided: decided !== undefined };
  });

  const mappingAll = finalRows
    .filter((r) => r.playerId)
    .map((r) => ({
      team_id: teamId,
      source_player_ref: r.row.sourcePlayerRef,
      wyscout_player_name: r.row.playerName,
      player_id: r.playerId,
      confidence: r.wasDecided ? "manual" : "exact",
      confirmed_at: new Date().toISOString(),
    }));
  const { rows: mappingUpserts } = dedupeByKey(mappingAll, (m) => m.source_player_ref);
  if (mappingUpserts.length > 0) {
    const { error } = await supabase.from("stat_player_mapping").upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
    if (error) return { error: `Mapping save: ${error.message}`, mapped: 0, unmatched: 0, rowsUpserted: 0, collapsed: 0 };
  }

  const { rows: dbRows, collapsed } = dedupeByKey(
    finalRows.map((r) => basketballGameStatToDbRow(r.row, r.playerId)),
    (row) => `${(row as { source?: string }).source ?? ""}|${(row as { game_id?: string }).game_id ?? ""}|${(row as { source_player_ref?: string }).source_player_ref ?? ""}`,
  );
  const { error: upErr } = await supabase.from("player_basketball_match_stats")
    .upsert(dbRows as never, { onConflict: BASKETBALL_MATCH_CONFLICT });
  if (upErr) return { error: `Upsert: ${upErr.message}`, mapped: 0, unmatched: 0, rowsUpserted: 0, collapsed: 0 };

  return {
    mapped: finalRows.filter((r) => r.playerId).length,
    unmatched: finalRows.filter((r) => !r.playerId).length,
    rowsUpserted: dbRows.length,
    collapsed,
  };
}

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
    // Optional manual override of which side is our club (the coach's "swap" in the
    // preview) — wins over name-matching when the InStat names don't line up.
    const ownerSide = String(form.get("owner_is_home") ?? "").trim().toLowerCase();
    const ctx: InstatIngestContext = {
      ownerTeamId: auth.teamId,
      matchRef: `instat:pdf:${slug(file.name)}`,
      ownerTeamName: (teamRow as { name?: string } | null)?.name ?? null,
      ownerIsHome: ownerSide === "home" ? true : ownerSide === "away" ? false : undefined,
    };
    const buffer = Buffer.from(await file.arrayBuffer());
    let extracted: Awaited<ReturnType<typeof extractInstatGameReport>>;
    try {
      extracted = await extractInstatGameReport({ buffer, ctx });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `PDF parse failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
    }
    const { meta, teams, players, oppPlayers, lineups, courtRegions, oppCourtRegions } = extracted;
    if (!meta || teams.length === 0) {
      return NextResponse.json({ ok: false, error: "Not an InStat basketball Game Report PDF (no team stats found)." }, { status: 400 });
    }

    const game = teams.filter((r) => r.period === "game");
    const own = game.find((r) => !r.isOpponent);
    const opp = game.find((r) => r.isOpponent);

    // Owner-side per-player rows (from the p5/p8 Field goals table) — resolve them to
    // the squad so the coach sees the same name-mapping the CSV path gives.
    const { squad, resolved } = await resolvePlayers(supabase, auth.teamId, players);

    if (phase === "preview") {
      const ownName = (own?.stats as { teamName?: string } | undefined)?.teamName ?? null;
      return NextResponse.json({
        ok: true, phase: "preview", kind: "game_report_pdf",
        match: { date: meta.date, home: meta.home, away: meta.away, homeScore: meta.homeScore, awayScore: meta.awayScore },
        ownTeam: own ? { name: ownName, points: own.points, efgPct: own.advanced?.efgPct, ppp: own.advanced?.ppp, isOpponent: false } : null,
        oppTeam: opp ? { name: (opp.stats as { teamName?: string } | undefined)?.teamName ?? null, points: opp.points, efgPct: opp.advanced?.efgPct, ppp: opp.advanced?.ppp } : null,
        // Which side (home/away) is currently assigned as ours — powers the "swap" toggle.
        ownIsHome: ownName != null ? ownName === meta.home : true,
        teamRows: teams.length, quarters: teams.filter((r) => r.period !== "game").length,
        // Per-player preview (owner side) — identity + shot zones, with name-mapping.
        players: resolved.map((r) => ({
          sourcePlayerRef: r.row.sourcePlayerRef,
          playerName: r.row.playerName,
          points: r.row.points, fgm: r.row.fgm, fga: r.row.fga, tpm: r.row.tpm, tpa: r.row.tpa,
          suggestedPlayerId: r.playerId, confidence: r.confidence, remembered: r.remembered, candidates: r.candidates,
        })),
        squad,
        playerCounts: {
          exact: resolved.filter((r) => r.confidence === "exact").length,
          fuzzy: resolved.filter((r) => r.confidence === "fuzzy").length,
          none: resolved.filter((r) => r.confidence === "none").length,
        },
        matchRef: ctx.matchRef,
      });
    }

    const dbRows = teams.map((r) => basketballTeamMatchToDbRow(r));
    // Attach the owner-side lineups (5-man units, minutes, +/-, pts for/against) to
    // the own full-game row's advanced jsonb — the natural per-game home, no extra
    // table. Parsed core only; the fragile per-lineup stat box is deliberately left.
    if (lineups.length || (oppPlayers && oppPlayers.players.length) || courtRegions || oppCourtRegions) {
      const ownIdx = teams.findIndex((r) => r.period === "game" && !r.isOpponent);
      if (ownIdx >= 0) {
        const row = dbRows[ownIdx] as { advanced?: Record<string, unknown> };
        row.advanced = {
          ...(row.advanced ?? {}),
          ...(lineups.length ? { lineups } : {}),
          // Opponent per-player shooting + zones for THIS game (Phase B). Stored on
          // the own game row (per-game home); the season KKÍ scout stays separate.
          ...(oppPlayers && oppPlayers.players.length ? { opp_players: oppPlayers.players, opp_team: oppPlayers.teamName } : {}),
          // 3-region shot map (Paint / Mid-range / 3PT) — ours + opponent's.
          ...(courtRegions ? { court_regions: courtRegions } : {}),
          ...(oppCourtRegions ? { opp_court_regions: oppCourtRegions } : {}),
        };
      }
    }
    const { error } = await supabase.from("basketball_team_match_stats")
      .upsert(dbRows as never, { onConflict: BASKETBALL_TEAM_MATCH_CONFLICT });
    if (error) return NextResponse.json({ ok: false, error: `Upsert: ${error.message}` }, { status: 500 });

    // Persist owner per-player rows too (mapped + unmatched-kept). Best-effort: a
    // player-side failure is reported but the team rows are already saved.
    let decisions: Record<string, string> = {};
    try { decisions = JSON.parse(String(form.get("decisions") ?? "{}")); } catch { decisions = {}; }
    const playerRes = players.length ? await commitPlayers(supabase, auth.teamId, resolved, decisions) : null;
    if (playerRes?.error) return NextResponse.json({ ok: false, error: playerRes.error }, { status: 500 });

    return NextResponse.json({
      ok: true, phase: "commit", kind: "game_report_pdf",
      match: { date: meta.date, home: meta.home, away: meta.away },
      rowsUpserted: dbRows.length, matchRef: ctx.matchRef,
      players: playerRes ? { rowsUpserted: playerRes.rowsUpserted, mapped: playerRes.mapped, unmatched: playerRes.unmatched } : null,
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

  const { squad, resolved } = await resolvePlayers(supabase, auth.teamId, players);

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

  const res = await commitPlayers(supabase, auth.teamId, resolved, decisions);
  if (res.error) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });

  return NextResponse.json({
    ok: true, phase: "commit", kind: "player_csv",
    match: { matchRef, matchDate, opponent },
    rowsUpserted: res.rowsUpserted,
    mapped: res.mapped,
    unmatched: res.unmatched,
    skipped: skipped.length,
    duplicatesCollapsed: res.collapsed,
  });
}
