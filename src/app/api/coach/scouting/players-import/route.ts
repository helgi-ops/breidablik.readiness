export const runtime = "nodejs";

/**
 * POST /api/coach/scouting/players-import  (multipart: files[] — one or many StatsBomb "Player Stats"
 * category exports for ONE opponent squad)
 *
 * StatsBomb splits player stats across many category downloads (shooting, passing, pressures, OBV…),
 * each keyed on Name. This merges them all into one rich per-90 bag per player and stores them as the
 * opponent's scouting squad → drives the Opponent Analysis "Players" tab (per-90 percentiles). Attaches
 * to the opponent's existing scouting season when there is one, else creates a minimal season header.
 * Descriptive scouting — never touches readiness. Service-role write, scoped to the coach's own team.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";
import { isStatsbombScoutPlayerHeader, mergeStatsbombScoutPlayerFiles } from "@/lib/micropulse/statsIngestion/statsbombScoutPlayers";

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

function rowsOf(file: File, buf: ArrayBuffer): { headers: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [] };
  const headers = ((XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][])[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
  return { headers, rows };
}

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!(await isEliteTeam(getSupabase(), auth.teamId))) return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ ok: false, error: "No files uploaded." }, { status: 400 });

  const parsedFiles: Record<string, unknown>[][] = [];
  const skipped: string[] = [];
  let teamFromFile: string | null = null;
  for (const f of files) {
    const { headers, rows } = rowsOf(f, await f.arrayBuffer());
    if (!isStatsbombScoutPlayerHeader(headers)) { skipped.push(f.name); continue; }
    if (!teamFromFile && rows[0]) teamFromFile = String((rows[0] as Record<string, unknown>)["Team"] ?? "").trim() || null;
    parsedFiles.push(rows);
  }
  if (!parsedFiles.length) return NextResponse.json({ ok: false, error: "None of the files are StatsBomb “Player Stats” exports (expected Name + Team + per-90 metrics)." }, { status: 400 });

  const opponent = (String(form.get("opponent") ?? "").trim() || teamFromFile || "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "Could not determine the opponent (no Team column)." }, { status: 400 });

  const players = mergeStatsbombScoutPlayerFiles(parsedFiles, { teamName: opponent });
  if (!players.length) return NextResponse.json({ ok: false, error: "No player rows found after merging." }, { status: 400 });

  // Attach to the opponent's existing scouting season when there is one, else create a header.
  const { data: existing } = await auth.supabase.from("scout_team_season")
    .select("id, season").eq("owner_team_id", auth.teamId).eq("opponent_name", opponent).eq("is_self", false)
    .order("updated_at", { ascending: false }).limit(1);
  let seasonId = (existing?.[0] as { id?: string } | undefined)?.id ?? null;
  const season = (existing?.[0] as { season?: string } | undefined)?.season ?? String(new Date().getUTCFullYear());
  if (!seasonId) {
    const { data: created, error: cErr } = await auth.supabase.from("scout_team_season").upsert({
      owner_team_id: auth.teamId, opponent_name: opponent, season, is_self: false,
      source_ref: "statsbomb_player_stats", updated_at: new Date().toISOString(),
    } as never, { onConflict: "owner_team_id,opponent_name,season" }).select("id").single();
    if (cErr || !created) return NextResponse.json({ ok: false, error: `Season save failed: ${cErr?.message}` }, { status: 500 });
    seasonId = (created as { id: string }).id;
  }

  await auth.supabase.from("scout_player").delete().eq("scout_team_season_id", seasonId);
  const { error: pErr } = await auth.supabase.from("scout_player").insert(players.map((p) => ({
    scout_team_season_id: seasonId, player_name: p.player_name, position: p.position, minutes: p.minutes,
    goals: p.goals, xg: p.xg, assists: p.assists, xa: p.xa, received_passes: p.received_passes, metrics: p.metrics,
  })) as never);
  if (pErr) return NextResponse.json({ ok: false, error: `Player save failed: ${pErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, opponent, season, players: players.length, filesUsed: parsedFiles.length, skipped });
}
