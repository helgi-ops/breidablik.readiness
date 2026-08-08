export const runtime = "nodejs";
export const maxDuration = 60; // AI extraction of a full-squad PDF

/**
 * /api/coach/match-report/upload — ingest a StatsBomb "Match Report" (Game Team
 * Analysis) PDF into per-match player stats for the coach's OWN squad.
 *
 * Two-phase (preview → commit), multipart/form-data:
 *   phase=preview → extract (deterministic team line + AI per-player rows), reconcile
 *                   the AI's per-player sums against the page-4 totals, resolve each own
 *                   player to the roster, return everything for review. NO writes.
 *   phase=commit  → persist confirmed mappings + upsert player_match_stats.
 *
 * v1 ingests only the coach's own-squad players (they map to the roster); the opponent
 * half is surfaced-but-skipped. Descriptive football data — it NEVER touches the
 * readiness colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { extractMatchReport, reconcile, playerMetricsBag, type Side, type MatchReportPlayer } from "@/lib/micropulse/statsIngestion/matchReportExtract";
import { matchByInitialSurname, initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";
import { matchStatToDbRow, MATCH_CONFLICT } from "@/lib/micropulse/statsIngestion/persist";
import type { PlayerMatchStat, SquadPlayer } from "@/lib/micropulse/statsIngestion/types";

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
  return { teamId, userId: userRes.user.id } as const;
}

/** Team-name key tolerant of Icelandic folding (Breiðablik ↔ BREIDABLIK). */
const teamKey = (s: string): string =>
  (s || "").toLowerCase().replace(/þ/g, "th").replace(/ð/g, "d").replace(/æ/g, "ae").replace(/ø|ö/g, "o")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const phase = String(form.get("phase") ?? "preview");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No PDF uploaded." }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI extraction unavailable (no API key configured)." }, { status: 503 });

  const supabase = getSupabase();
  const { data: team } = await supabase.from("teams").select("name").eq("id", auth.teamId).maybeSingle();
  const ownName = String((team as { name?: string } | null)?.name ?? "").trim();

  let extract;
  try {
    extract = await extractMatchReport({ apiKey, buffer: Buffer.from(await file.arrayBuffer()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Extraction failed." }, { status: 422 });
  }
  const { meta, teamLine, players } = extract;
  if (!meta.date) return NextResponse.json({ ok: false, error: "Couldn't read the match date from the report." }, { status: 422 });

  // Which side is the coach's own team? Fold the names; require a confident match.
  const ownKey = teamKey(ownName);
  const homeKey = teamKey(meta.home), awayKey = teamKey(meta.away);
  let ownSide: Side | null = null;
  if (ownKey && (homeKey.includes(ownKey) || ownKey.includes(homeKey))) ownSide = "home";
  else if (ownKey && (awayKey.includes(ownKey) || ownKey.includes(awayKey))) ownSide = "away";
  if (!ownSide) {
    return NextResponse.json({ ok: false, error: `This report is ${meta.home} v ${meta.away} — neither matches your team (${ownName || "unknown"}). Upload a report your team played in.` }, { status: 400 });
  }
  const opponent = ownSide === "home" ? meta.away : meta.home;
  const homeAway = ownSide;
  const ownPlayers = players.filter((p) => p.team === ownSide);
  const reconciliation = reconcile(ownSide === "home" ? teamLine.home : teamLine.away, ownPlayers);

  // Roster + remembered mappings (reuse the season-import approach).
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", auth.teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));
  const { data: mapRows } = await supabase.from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", auth.teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) remembered.set(m.source_player_ref, m.player_id);

  const srefOf = (p: MatchReportPlayer) => `sbmr:${initialSurnameKey(p.name)}`;
  const resolved = ownPlayers.map((p) => {
    const sref = srefOf(p);
    const mem = remembered.get(sref);
    if (mem) return { p, sref, playerId: mem, confidence: "exact" as const, remembered: true, candidates: [] as Array<{ playerId: string; fullName: string; score: number }> };
    const m = matchByInitialSurname(p.name, squad);
    return { p, sref, playerId: m.playerId, confidence: m.confidence, remembered: false, candidates: m.candidates };
  });

  const summary = {
    opponent, homeAway, date: meta.date, home: meta.home, away: meta.away, ownSide,
    reconciliation,
    counts: {
      exact: resolved.filter((r) => r.confidence === "exact").length,
      fuzzy: resolved.filter((r) => r.confidence === "fuzzy").length,
      none: resolved.filter((r) => r.confidence === "none").length,
    },
    rows: resolved.map((r) => ({
      sourcePlayerRef: r.sref, name: r.p.name,
      shots: r.p.shots, goals: r.p.goals, assists: r.p.assists, xg: r.p.xg, keyPasses: r.p.keyPasses, xgChain: r.p.xgChain,
      suggestedPlayerId: r.playerId, confidence: r.confidence, remembered: r.remembered, candidates: r.candidates,
    })),
    skippedOpponent: players.filter((p) => p.team !== ownSide).length,
  };

  if (phase === "preview") return NextResponse.json({ ok: true, phase: "preview", ...summary });

  // ── COMMIT ──
  let decisions: Record<string, string> = {};
  try { decisions = JSON.parse(String(form.get("decisions") ?? "{}")); } catch { decisions = {}; }

  const finalRows = resolved.map((r) => {
    const decided = Object.prototype.hasOwnProperty.call(decisions, r.sref) ? (decisions[r.sref] || null) : undefined;
    const playerId = decided !== undefined ? decided : (r.confidence === "exact" ? r.playerId : null);
    return { r, playerId, wasDecided: decided !== undefined };
  });

  // Persist mappings for resolved players (remembered next time).
  const mappingUpserts = finalRows.filter((f) => f.playerId).map((f) => ({
    team_id: auth.teamId, source_player_ref: f.r.sref, wyscout_player_name: f.r.p.name,
    player_id: f.playerId, confidence: f.wasDecided ? "manual" : "exact", confirmed_at: new Date().toISOString(),
  }));
  if (mappingUpserts.length) {
    const byKey = new Map(mappingUpserts.map((m) => [m.source_player_ref, m]));
    const { error } = await supabase.from("stat_player_mapping").upsert([...byKey.values()] as never, { onConflict: "team_id,source_player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Mapping save: ${error.message}` }, { status: 500 });
  }

  // Build + upsert player_match_stats rows (idempotent on MATCH_CONFLICT).
  const dbByKey = new Map<string, ReturnType<typeof matchStatToDbRow>>();
  for (const f of finalRows) {
    const p = f.r.p;
    const stat: PlayerMatchStat = {
      teamId: auth.teamId, matchDate: meta.date!, opponent, homeAway,
      minutes: null, goals: p.goals, assists: p.assists, shots: p.shots, shotsOnTarget: null,
      passes: p.passes, passAccuracyPct: null, keyPasses: p.keyPasses, duelsWon: null, xg: p.xg, rating: null,
      metrics: playerMetricsBag(p), source: "statsbomb_match_report", sourceRef: file.name,
      sourcePlayerRef: f.r.sref, wyscoutPlayerName: p.name,
    };
    dbByKey.set(f.r.sref, matchStatToDbRow(stat, f.playerId));
  }
  const { error: upErr } = await supabase.from("player_match_stats").upsert([...dbByKey.values()] as never, { onConflict: MATCH_CONFLICT });
  if (upErr) return NextResponse.json({ ok: false, error: `Upsert: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({
    ok: true, phase: "commit", ...summary,
    rowsUpserted: dbByKey.size,
    mapped: finalRows.filter((f) => f.playerId).length,
    unmatched: finalRows.filter((f) => !f.playerId).length,
  });
}
