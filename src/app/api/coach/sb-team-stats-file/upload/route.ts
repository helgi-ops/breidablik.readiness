export const runtime = "nodejs";

/**
 * POST /api/coach/sb-team-stats-file/upload  (multipart: file)
 *
 * Ingests the StatsBomb IQ TEAM-level "Match Stats" export — one row per match (own-team
 * perspective, with "Opposition …" columns for the against side). Handles a whole-season file or a
 * single-game export (same shape). Each row is resolved to own/opponent + home/away from its
 * "Team A vs. Team B" match string, then merged into sb_team_match_stats (the merge preserves any
 * per-player-file contribution). Descriptive football context — never touches the readiness colour.
 * Service-role write, strictly scoped to the coach's own team.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";
import { normalizeName } from "@/lib/micropulse/statsIngestion/nameMatch";
import { mergeUpsertSbTeamRow } from "@/lib/micropulse/statsIngestion/sbTeamRowMerge";
import { parseSbTeamStatsFile, isSbTeamStatsFileHeader } from "@/lib/micropulse/statsIngestion/sbTeamStatsFile";

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

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!(await isEliteTeam(getSupabase(), auth.teamId))) return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });

  // cellDates:true → the Date column comes back as a real Date (avoids locale re-parsing).
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return NextResponse.json({ ok: false, error: "Could not read the file." }, { status: 400 });
  const header = ((XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][])[0] ?? []).map((h) => String(h ?? "").trim());
  if (!isSbTeamStatsFileHeader(header)) {
    return NextResponse.json({ ok: false, error: "This isn't the StatsBomb team “Match Stats” export (expected “Match”, “Date”, “Cumulative xG” columns, one row per game)." }, { status: 400 });
  }
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null }) as Array<Record<string, unknown>>;
  const { matches } = parseSbTeamStatsFile(rows);
  if (!matches.length) return NextResponse.json({ ok: false, error: "No match rows found in the file." }, { status: 400 });

  const { data: team } = await auth.supabase.from("teams").select("name, club_short_name").eq("id", auth.teamId).maybeSingle();
  const ownNames = [team?.name, (team as { club_short_name?: string } | null)?.club_short_name].filter(Boolean).map((s) => normalizeName(String(s)));
  const isOwn = (name: string) => { const k = normalizeName(name); return ownNames.some((o) => o && (o === k || o.includes(k) || k.includes(o))); };

  let ingested = 0; const skipped: string[] = [];
  for (const m of matches) {
    if (!m.date) { skipped.push(`${m.rawMatch} (no date)`); continue; }
    const ownIsHome = isOwn(m.homeTeam);
    const ownIsAway = isOwn(m.awayTeam);
    if (!ownIsHome && !ownIsAway) { skipped.push(`${m.rawMatch} (not your team)`); continue; }
    const opponent = ownIsHome ? m.awayTeam : m.homeTeam;
    const err = await mergeUpsertSbTeamRow(auth.supabase, auth.teamId, m.date, {
      season: m.date.slice(0, 4), opponent, is_home: ownIsHome, ...m.patch,
    });
    if (err) { skipped.push(`${m.rawMatch} (${err})`); continue; }
    ingested += 1;
  }

  return NextResponse.json({ ok: true, ingested, skippedCount: skipped.length, skipped: skipped.slice(0, 8) });
}
