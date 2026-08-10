export const runtime = "nodejs";

/**
 * /api/coach/team-match-stats/upload  (Wyscout Team → Stats in-app import)
 *
 * Lets a coach load Team Match Insight data WITHOUT terminal access — the same job
 * the scripts/ingest-team-match-stats.ts CLI does, behind an upload UI.
 *
 * multipart/form-data:
 *   phase = "preview" → parse the file(s), report what WOULD be written (fixtures,
 *                       dates, PPDA/def-duels coverage, dates missing from the
 *                       fixture list). NO writes.
 *   phase = "commit"  → idempotently upsert team_match_stats on
 *                       (team_id, match_date, is_opponent).
 * Files:  general (required, DISPLAY General + "Show opponents"), indexes (optional,
 *         DISPLAY Indexes → PPDA), defending (optional, DISPLAY Defending → def-duels).
 *
 * Descriptive football context only — never touches the readiness colour. Writes
 * are service-role but strictly scoped to the coach's own (or coach_teams) team.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildTeamMatchStatRows, selectWyscoutMatrices } from "@/lib/micropulse/statsIngestion/buildTeamMatchRows";
import { parseStatsbombTeamStats, toSbDbRows } from "@/lib/micropulse/statsIngestion/statsbombCsv";
import { mergeUpsertSbTeamRow } from "@/lib/micropulse/statsIngestion/sbTeamRowMerge";

const sbHeaderOf = (matrix: unknown[][]): string[] => (matrix[0] ?? []).map((h) => String(h ?? "").replace(/﻿/g, "").trim());
const SB_ANY = ["OBV", "Non Penalty xG", "Set Piece xG", "PPDA", "Passing%", "Opposition Passes"];
// Team-only per-match markers: present in the team Match Stats export, ABSENT from
// the per-player Match Stats export (a player has no "Opposition Passes"/…). This is
// the only reliable team-vs-player discriminator — OBV/Non Penalty xG exist in both.
// Opposition aggregates only — a goalkeeper's per-player file also has "Non Penalty
// Shots Faced", so it isn't a reliable team-file tell.
const SB_TEAM_MATCH_MARKERS = ["Opposition Passes", "Opposition xG"];

/** StatsBomb IQ per-match TEAM "Match Stats" export — one row per game (key Match +
 * Date), NO "Team Name" (season Team Stats) and NO "Player" (Squad), carrying the
 * team-only opposition markers. Recognised even if the source flag is missing. */
function isSbMatchStats(matrix: unknown[][]): boolean {
  const header = sbHeaderOf(matrix);
  if (header.includes("Team Name") || header.includes("Player")) return false;
  return header.includes("Match") && header.some((h) => SB_TEAM_MATCH_MARKERS.includes(h));
}

/** StatsBomb IQ season "Team Stats" export (a.k.a. "Custom Parameters" / the
 * per-category *-vs-LeagueAvg files): season aggregate keyed on "Team Name" with a
 * built-in League Average row → belongs on Opponent Scouting, NOT here. */
function isSbTeamStats(matrix: unknown[][]): boolean {
  const header = sbHeaderOf(matrix);
  return header.includes("Team Name") && header.some((h) => SB_ANY.includes(h));
}

/** StatsBomb IQ per-PLAYER export (Squad season = has "Player"; Player Match Stats =
 * per-match, no "Team Name", no team-only markers) → belongs on Player Season Analysis,
 * NOT here. Guards against writing a player's numbers as a team match row. */
function isSbPlayerExport(matrix: unknown[][]): boolean {
  const header = sbHeaderOf(matrix);
  if (!header.some((h) => SB_ANY.includes(h))) return false;
  if (header.includes("Player")) return true; // Squad
  return header.includes("Match") && !header.includes("Team Name") && !header.some((h) => SB_TEAM_MATCH_MARKERS.includes(h));
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

async function matrixOf(v: FormDataEntryValue | null): Promise<unknown[][] | null> {
  if (!(v instanceof File) || v.size === 0) return null;
  const wb = XLSX.read(new Uint8Array(await v.arrayBuffer()), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }

  const phase = String(form.get("phase") ?? "preview");
  // Optional override only. When absent, the parser infers our team from the file
  // itself (the side present in every fixture), so any club's export works — not
  // just Breiðablik. Previously this defaulted to "Breiðablik", which made every
  // other club's General export parse to zero fixtures ("General export required").
  const teamName = (String(form.get("team_name") ?? "").trim()) || undefined;
  const requestedTeamId = (String(form.get("team_id") ?? "").trim()) || null;

  const authRes = await getCoachTeam(req, requestedTeamId);
  if ("error" in authRes) return NextResponse.json({ ok: false, error: authRes.error }, { status: authRes.status });
  const teamId = authRes.teamId;

  // Accept a single multi-file picker ("files") — the coach drops 1–3 Wyscout
  // exports in any order (or one all-columns file) and we auto-detect which supplies
  // General / PPDA / defensive-duels. Legacy named slots still work as a fallback.
  const uploaded = [
    ...form.getAll("files"),
    form.get("general"), form.get("indexes"), form.get("defending"),
  ];
  const matrices: unknown[][][] = [];
  for (const f of uploaded) { const m = await matrixOf(f); if (m) matrices.push(m); }
  if (matrices.length === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });

  // StatsBomb IQ Match Stats CSV — a distinct per-match provider. The coach picks
  // the StatsBomb tab (source=statsbomb) OR the file is auto-recognised. Writes go
  // to sb_team_match_stats (never mixed with the Wyscout team_match_stats table).
  const requestedSource = String(form.get("source") ?? "").trim().toLowerCase();
  const sbMatrix = matrices.find(isSbMatchStats) ?? null;

  // Wrong-grain guards: redirect the other exports to their own page instead of
  // throwing a confusing Wyscout error (or, worse, mis-ingesting a player file here).
  if (!sbMatrix && matrices.some(isSbTeamStats)) {
    return NextResponse.json({
      ok: false,
      error: "This is a StatsBomb season Team Stats export (it has a League Average row). Upload it on Opponent Analysis — it becomes the opponent’s season profile. Season Match Analysis needs the per-match “Match Stats” export (one row per game).",
    }, { status: 400 });
  }
  if (!sbMatrix && matrices.some(isSbPlayerExport)) {
    return NextResponse.json({
      ok: false,
      error: "This is a StatsBomb per-player export (one row per player: Team + Player columns). Upload it on Player Season Analysis (the StatsBomb view). Season Match Analysis needs the per-match TEAM “Match Stats” export instead — one row per team per game (team totals: xG, OBV, pressures, set-piece xG for & against), not per player.",
    }, { status: 400 });
  }

  if (requestedSource === "statsbomb" || sbMatrix) {
    if (!sbMatrix) {
      return NextResponse.json({
        ok: false,
        error: "This doesn’t look like a StatsBomb IQ Match Stats CSV (need the per-team Match Stats export, columns like OBV / Opposition Passes). If it’s a Wyscout export, switch to the Wyscout tab.",
      }, { status: 400 });
    }
    return await handleStatsbomb(sbMatrix, teamId, teamName, phase);
  }

  const picked = selectWyscoutMatrices(matrices, teamName);
  if (!picked.general) {
    const recognised: string[] = [];
    if (picked.indexes) recognised.push("Indexes (PPDA)");
    if (picked.defending) recognised.push("Defending (defensive duels)");
    if (picked.passing) recognised.push("Passing");
    if (picked.attacking) recognised.push("Attacking");
    const tail = recognised.length
      ? ` You uploaded ${recognised.join(" + ")}, but still need the General export — add it and try again.`
      : "";
    return NextResponse.json({
      ok: false,
      error: `The General export is required — the one with goals + xG + possession (DISPLAY “General”, “Show opponents” ON).${tail}`,
    }, { status: 400 });
  }

  const built = buildTeamMatchStatRows({
    generalMatrix: picked.general,
    indexesMatrix: picked.indexes,
    defendingMatrix: picked.defending,
    passingMatrix: picked.passing,
    attackingMatrix: picked.attacking,
    teamId,
    teamName,
  });

  if (built.dbRows.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No matches parsed. Make sure this is the Team → Stats 'General' export with 'Show opponents' ON.",
      skipped: built.skipped,
    }, { status: 400 });
  }

  const supabase = getSupabase();

  // Which parsed dates aren't in match_schedule (they store fine but won't join to
  // GPS/IMA movement until a fixture exists for them).
  const { data: sched } = await supabase
    .from("match_schedule").select("match_date").eq("team_id", teamId).in("match_date", built.dates);
  const schedSet = new Set(((sched ?? []) as { match_date: string }[]).map((s) => s.match_date));
  const unjoined = built.dates.filter((d) => !schedSet.has(d));

  const summary = {
    fixtures: built.fixtures,
    rows: built.dbRows.length,
    dates: built.dates.length,
    seasons: Array.from(new Set(built.dates.map((d) => d.slice(0, 4)))).sort(),
    ppda: { provided: built.aux.ppdaProvided, matched: built.aux.ppdaMatched, hits: built.ppdaHits, orphans: built.ppdaOrphans },
    defDuels: { provided: built.aux.defProvided, matched: built.aux.defMatched, hits: built.defDuelsHits, orphans: built.defDuelsOrphans },
    passing: { provided: built.aux.passingProvided, matched: built.aux.passingMatched, hits: built.passingHits, orphans: built.passingOrphans },
    attacking: { provided: built.aux.attackingProvided, matched: built.aux.attackingMatched, hits: built.attackingHits, orphans: built.attackingOrphans },
    unmappedHeaders: built.unmappedHeaders,
    unjoined,
  };

  if (phase === "preview") {
    return NextResponse.json({ ok: true, phase: "preview", teamId, ...summary });
  }

  const { error } = await supabase
    .from("team_match_stats").upsert(built.dbRows, { onConflict: "team_id,match_date,is_opponent" });
  if (error) return NextResponse.json({ ok: false, error: `Save failed: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, phase: "commit", teamId, upserted: built.dbRows.length, ...summary });
}

/** StatsBomb per-match branch → sb_team_match_stats. Same preview/commit contract
 * and summary shape as Wyscout, so the shared panel renders it unchanged; the
 * provider-specific aux blocks (PPDA / defensive duels / passing / attacking) are
 * marked not-provided because StatsBomb carries none of them per match. */
async function handleStatsbomb(matrix: unknown[][], teamId: string, teamName: string | undefined, phase: string) {
  // XLSX (cellDates:true) turns date cells into JS Date objects — format them as ISO
  // so both the parser and the stored raw payload get "2026-08-04", not a locale
  // string. (The parser's toIso is also Date-tolerant, as a belt-and-braces guard.)
  const str: string[][] = matrix.map((row) => row.map((c) =>
    c == null ? "" : c instanceof Date ? (Number.isNaN(c.getTime()) ? "" : `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, "0")}-${String(c.getUTCDate()).padStart(2, "0")}`) : String(c)));
  const parsed = parseStatsbombTeamStats(str, { teamName });
  if (parsed.rows.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No matches parsed from this StatsBomb file. Make sure it’s the IQ “Match Stats” CSV export (one row per match).",
    }, { status: 400 });
  }

  const supabase = getSupabase();
  const dates = Array.from(new Set(parsed.rows.map((r) => r.matchDate).filter((d): d is string => !!d))).sort();
  const seasons = Array.from(new Set(dates.map((d) => d.slice(0, 4)))).sort();
  // Season label = the year most matches fall in (label column only; the conflict
  // key is (team_id, match_date, source), so this never affects idempotency).
  const yearCounts = new Map<string, number>();
  for (const d of dates) yearCounts.set(d.slice(0, 4), (yearCounts.get(d.slice(0, 4)) ?? 0) + 1);
  const season = [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? seasons[0] ?? "";

  const { data: mapRow } = await supabase
    .from("sb_team_map").select("sb_team_id").eq("team_id", teamId).maybeSingle();
  const sbTeamId = (mapRow?.sb_team_id as number | null | undefined) ?? null;

  const dbRows = toSbDbRows(parsed.rows, { teamId, sbTeamId, season });

  const { data: sched } = await supabase
    .from("match_schedule").select("match_date").eq("team_id", teamId).in("match_date", dates);
  const schedSet = new Set(((sched ?? []) as { match_date: string }[]).map((s) => s.match_date));
  const unjoined = dates.filter((d) => !schedSet.has(d));

  const none = { provided: false, matched: false, hits: 0, orphans: [] as string[] };
  const summary = {
    fixtures: parsed.rows.length,
    rows: dbRows.length,
    dates: dates.length,
    seasons,
    ppda: none, defDuels: none, passing: none, attacking: none,
    unmappedHeaders: parsed.unmappedHeaders,
    unjoined,
  };

  if (phase === "preview") {
    return NextResponse.json({ ok: true, phase: "preview", teamId, source: "statsbomb", ...summary });
  }

  // Merge (non-null wins) rather than a clobbering upsert, so a season file from a
  // basic export template (no OBV / set-piece columns) never nulls fields that the
  // Single Match Analysis summary/aggregate already set for the same match — the same
  // merge the single-match paths use. One row per (team, match_date, source).
  for (const row of dbRows) {
    const r = row as Record<string, unknown> & { match_date?: string };
    const matchDate = String(r.match_date ?? "");
    if (!matchDate) continue;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "id" || k === "created_at" || k === "updated_at" || k === "team_id" || k === "match_date" || k === "source") continue;
      patch[k] = v;
    }
    const err = await mergeUpsertSbTeamRow(supabase, teamId, matchDate, patch);
    if (err) return NextResponse.json({ ok: false, error: `Save failed: ${err}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phase: "commit", teamId, source: "statsbomb", upserted: dbRows.length, ...summary });
}
