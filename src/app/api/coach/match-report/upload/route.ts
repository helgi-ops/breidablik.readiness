export const runtime = "nodejs";
export const maxDuration = 60; // AI extraction of a full-squad PDF

/**
 * /api/coach/match-report/upload — ingest a StatsBomb per-match export into per-match
 * player stats for the coach's OWN squad, from EITHER:
 *   • the "Match Report" (Game Team Analysis) PDF — AI reads the concatenated appendix,
 *     the page-4 team totals reconcile it; or
 *   • the per-match "Match Stats" CSV (one row per player, both teams) — deterministic,
 *     every metric a column, no AI. The CSV has no date → the coach supplies it.
 *
 * Two-phase (preview → commit). v1 ingests only own-squad players; the opponent half is
 * surfaced-but-skipped. Descriptive — never touches the readiness colour/load/decision.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { extractMatchReport, reconcile, playerMetricsBag, type Side, type MatchReportPlayer, type ReconcileCheck, type TeamLine } from "@/lib/micropulse/statsIngestion/matchReportExtract";
import { parseStatsbombMatchStats, isStatsbombMatchStatsHeader, type MatchStatsCsvPlayer } from "@/lib/micropulse/statsIngestion/statsbombMatchStatsCsv";
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
  return { teamId } as const;
}

/** Team-name key tolerant of Icelandic folding (Breiðablik ↔ BREIDABLIK). */
const teamKey = (s: string): string =>
  (s || "").toLowerCase().replace(/þ/g, "th").replace(/ð/g, "d").replace(/æ/g, "ae").replace(/ø|ö/g, "o")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const bagNum = (m: Record<string, unknown>, ...keys: string[]): number | null => {
  const lo: Record<string, unknown> = {}; for (const [k, v] of Object.entries(m)) lo[k.toLowerCase()] = v;
  for (const k of keys) { const v = lo[k.toLowerCase()]; const n = v == null || v === "" ? null : Number(v); if (n != null && Number.isFinite(n)) return n; }
  return null;
};

// A source-agnostic per-player row (from PDF or CSV) the rest of the route works on.
type SrcPlayer = { name: string; teamName: string; shots: number | null; goals: number | null; assists: number | null; xg: number | null; keyPasses: number | null; passes: number | null; metrics: Record<string, number | string | null> };

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const phase = String(form.get("phase") ?? "preview");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const supabase = getSupabase();
  const { data: team } = await supabase.from("teams").select("name").eq("id", auth.teamId).maybeSingle();
  const ownName = String((team as { name?: string } | null)?.name ?? "").trim();

  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  let meta: { home: string; away: string; date: string | null };
  let src: SrcPlayer[];
  let reconciliation: ReconcileCheck[] = [];
  let pdfPlayers: MatchReportPlayer[] = [];       // kept for the PDF reconcile
  let pdfTeamLine: { home: TeamLine; away: TeamLine } | null = null;

  if (isPdf) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "AI extraction unavailable (no API key configured)." }, { status: 503 });
    let ex;
    try { ex = await extractMatchReport({ apiKey, buffer: Buffer.from(await file.arrayBuffer()) }); }
    catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Extraction failed." }, { status: 422 }); }
    if (!ex.meta.date) return NextResponse.json({ ok: false, error: "Couldn't read the match date from the report." }, { status: 422 });
    meta = ex.meta; pdfPlayers = ex.players; pdfTeamLine = ex.teamLine;
    src = ex.players.map((p) => ({ name: p.name, teamName: p.team === "home" ? ex.meta.home : ex.meta.away, shots: p.shots, goals: p.goals, assists: p.assists, xg: p.xg, keyPasses: p.keyPasses, passes: p.passes, metrics: playerMetricsBag(p) }));
  } else {
    const date = String(form.get("date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: "Pick the match date — the CSV doesn't contain it." }, { status: 400 });
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true }) : [];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    if (!isStatsbombMatchStatsHeader(headers)) return NextResponse.json({ ok: false, error: "This isn't a StatsBomb per-match Match Stats CSV (expected Team + Player columns with xGChain / OBV). For the season Squad export use Player Season Analysis." }, { status: 400 });
    const parsed = parseStatsbombMatchStats(rows);
    meta = { home: parsed.teams[0] ?? "", away: parsed.teams[1] ?? "", date };
    src = parsed.players.map((p: MatchStatsCsvPlayer) => ({ name: p.name, teamName: p.teamName, shots: p.shots, goals: p.goals, assists: p.assists, xg: p.xg, keyPasses: p.keyPasses, passes: p.passes, metrics: p.metrics }));
  }

  // Which side is the coach's own team? (Match own name to a team in the file.)
  const ownKey = teamKey(ownName);
  const distinct = [...new Set(src.map((s) => s.teamName))];
  const ownTeamName = distinct.find((t) => { const k = teamKey(t); return ownKey && (k.includes(ownKey) || ownKey.includes(k)); }) ?? null;
  if (!ownTeamName) {
    return NextResponse.json({ ok: false, error: `This match is ${distinct.join(" v ")} — none matches your team (${ownName || "unknown"}). Upload a match your team played in.` }, { status: 400 });
  }
  const ownSide: Side = teamKey(meta.home) === teamKey(ownTeamName) ? "home" : "away";
  const opponent = distinct.find((t) => t !== ownTeamName) ?? (ownSide === "home" ? meta.away : meta.home);
  const ownPlayers = src.filter((s) => s.teamName === ownTeamName);

  // Real home/away from the fixtures if we have it (the CSV order is arbitrary; the PDF's is real).
  const { data: fx } = await supabase.from("match_schedule").select("is_home").eq("team_id", auth.teamId).eq("match_date", meta.date).maybeSingle();
  const homeAway: "home" | "away" | null = (fx as { is_home: boolean | null } | null)?.is_home != null ? ((fx as { is_home: boolean }).is_home ? "home" : "away") : (isPdf ? ownSide : null);

  if (isPdf && pdfTeamLine) reconciliation = reconcile(ownSide === "home" ? pdfTeamLine.home : pdfTeamLine.away, pdfPlayers.filter((p) => p.team === ownSide));

  // Roster + remembered mappings (reuse the season-import approach).
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", auth.teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));
  const { data: mapRows } = await supabase.from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", auth.teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) remembered.set(m.source_player_ref, m.player_id);

  const srefOf = (sp: SrcPlayer) => `sbmr:${initialSurnameKey(sp.name)}`;
  const resolved = ownPlayers.map((sp) => {
    const sref = srefOf(sp);
    const mem = remembered.get(sref);
    if (mem) return { sp, sref, playerId: mem, confidence: "exact" as const, remembered: true, candidates: [] as Array<{ playerId: string; fullName: string; score: number }> };
    const m = matchByInitialSurname(sp.name, squad);
    return { sp, sref, playerId: m.playerId, confidence: m.confidence, remembered: false, candidates: m.candidates };
  });

  const nameOf = (id: string | null) => (id ? squad.find((s) => s.id === id)?.fullName ?? null : null);
  const summary = {
    opponent, homeAway, date: meta.date, home: meta.home, away: meta.away, ownSide, source: isPdf ? "pdf" : "csv",
    reconciliation,
    counts: {
      exact: resolved.filter((r) => r.confidence === "exact").length,
      fuzzy: resolved.filter((r) => r.confidence === "fuzzy").length,
      none: resolved.filter((r) => r.confidence === "none").length,
    },
    squad: squad.map((s) => ({ id: s.id, name: s.fullName })).sort((a, b) => a.name.localeCompare(b.name)),
    rows: resolved.map((r) => ({
      sourcePlayerRef: r.sref, name: r.sp.name,
      shots: r.sp.shots, goals: r.sp.goals, assists: r.sp.assists, xg: r.sp.xg, keyPasses: r.sp.keyPasses,
      xgChain: bagNum(r.sp.metrics, "xG Chain", "xGChain"),
      suggestedPlayerId: r.playerId, suggestedPlayerName: nameOf(r.playerId), confidence: r.confidence, remembered: r.remembered, candidates: r.candidates,
    })),
    skippedOpponent: src.length - ownPlayers.length,
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

  const mappingUpserts = finalRows.filter((f) => f.playerId).map((f) => ({
    team_id: auth.teamId, source_player_ref: f.r.sref, wyscout_player_name: f.r.sp.name,
    player_id: f.playerId, confidence: f.wasDecided ? "manual" : "exact", confirmed_at: new Date().toISOString(),
  }));
  if (mappingUpserts.length) {
    const byKey = new Map(mappingUpserts.map((m) => [m.source_player_ref, m]));
    const { error } = await supabase.from("stat_player_mapping").upsert([...byKey.values()] as never, { onConflict: "team_id,source_player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Mapping save: ${error.message}` }, { status: 500 });
  }

  const dbByKey = new Map<string, ReturnType<typeof matchStatToDbRow>>();
  for (const f of finalRows) {
    const sp = f.r.sp;
    const stat: PlayerMatchStat = {
      teamId: auth.teamId, matchDate: meta.date!, opponent, homeAway,
      minutes: null, goals: sp.goals ?? null, assists: sp.assists ?? null, shots: sp.shots ?? null, shotsOnTarget: null,
      passes: sp.passes ?? null, passAccuracyPct: null, keyPasses: sp.keyPasses ?? null, duelsWon: null, xg: sp.xg ?? null, rating: null,
      metrics: sp.metrics, source: "statsbomb_match_report", sourceRef: file.name,
      sourcePlayerRef: f.r.sref, wyscoutPlayerName: sp.name,
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
