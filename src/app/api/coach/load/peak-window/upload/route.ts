export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/peak-window/upload
 *
 * POST multipart { file, phase:"preview"|"commit", match_date, hsr_threshold?, export_date? } —
 * ingest a Catapult OpenField CTR / session-summary (period) export into `player_peak_window`.
 * The CTR export is time-based and carries the high-speed data (HIR Dist, Vel B5/B6) plus each
 * period's start time, so it supplies BOTH feeds the contextualised peak-period flagship needs:
 * peak-HSR (Ju-2022 Table-2 score) and the window clock (event-time alignment).
 *
 * Athletes are matched via catapult_athlete_map (falling back to players.full_name). The HSR
 * threshold behind HIR Dist is a COACH setting in OpenField — Code does not change it; the coach
 * supplies the threshold their account uses so the Ju comparison is labelled with it (provenance).
 * Descriptive load context — it never touches the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseCatapultCtr } from "@/lib/micropulse/load/parseCatapultCtr";

type SupabaseClient = ReturnType<typeof getSupabase>;

async function authTeam(req: NextRequest) {
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

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function readMatrix(buf: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });
  return rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
}

async function nameToPlayer(supabase: SupabaseClient, teamId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data: roster } = await supabase.from("players").select("id, full_name").eq("team_id", teamId);
  for (const p of (roster ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (p.full_name) out.set(normName(p.full_name), p.id);
  }
  const { data: map } = await supabase.from("catapult_athlete_map")
    .select("catapult_athlete_name, micropulse_player_id, source_team_id").eq("source_team_id", teamId);
  for (const m of (map ?? []) as Array<{ catapult_athlete_name: string | null; micropulse_player_id: string | null }>) {
    if (m.catapult_athlete_name && m.micropulse_player_id) out.set(normName(m.catapult_athlete_name), m.micropulse_player_id);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  const phase = String(form.get("phase") ?? "preview") === "commit" ? "commit" : "preview";
  const matchDate = String(form.get("match_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return NextResponse.json({ ok: false, error: "A match date (YYYY-MM-DD) is required — the CTR export has no date." }, { status: 400 });
  const hsrThreshold = ((): number | null => { const n = Number(form.get("hsr_threshold")); return Number.isFinite(n) && n > 0 ? n : null; })();
  const exportDate = String(form.get("export_date") ?? "").trim() || null;

  let matrix: string[][];
  try { matrix = readMatrix(await file.arrayBuffer()); } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the file" }, { status: 400 }); }

  const parsed = parseCatapultCtr(matrix);
  if (parsed.rows.length === 0) return NextResponse.json({ ok: false, error: parsed.warnings[0] ?? "No period rows recognised in this file.", warnings: parsed.warnings }, { status: 422 });

  const name2player = await nameToPlayer(auth.supabase, auth.teamId);
  const matched: string[] = [], unmatched: string[] = [];
  for (const a of parsed.athletes) (name2player.has(normName(a)) ? matched : unmatched).push(a);

  const upserts: Array<Record<string, unknown>> = [];
  for (const r of parsed.rows) {
    const pid = name2player.get(normName(r.athlete));
    if (!pid) continue;
    upserts.push({
      player_id: pid, team_id: auth.teamId, match_date: matchDate, source: "catapult_ctr",
      window_label: r.periodLabel, window_min: r.windowMin, window_start: r.windowStart, window_seconds: r.windowSeconds,
      hsr_m: r.hsrM, vb5_m: r.vb5M, vb6_m: r.vb6M, max_kmh: r.maxKmh, player_load: r.playerLoad, distance_m: r.distanceM,
      hsr_threshold_kmh: hsrThreshold, export_date: exportDate, raw: r,
    });
  }

  const peakWindows = parsed.rows.filter((r) => r.windowMin != null).length;
  const summary = {
    detectedColumns: parsed.detectedColumns,
    athletesMatched: matched.length, athletesUnmatched: unmatched,
    rows: upserts.length, peakWindows,
    hsrThreshold, thresholdNote: hsrThreshold == null ? "No HSR threshold supplied — record the account's high-speed threshold so the Ju-2022 comparison can be labelled (Ju uses >19.8 km/h)." : hsrThreshold !== 19.8 ? `Threshold ${hsrThreshold} km/h differs from Ju's 19.8 km/h — the benchmark will be labelled with the threshold used.` : null,
    warnings: parsed.warnings,
  };

  if (phase === "preview") return NextResponse.json({ ok: true, phase, ...summary });
  if (upserts.length === 0) return NextResponse.json({ ok: false, error: "Nothing to import (no matched athletes).", ...summary }, { status: 422 });

  const { error } = await auth.supabase.from("player_peak_window").upsert(upserts as never, { onConflict: "player_id,match_date,source,window_label" });
  if (error) return NextResponse.json({ ok: false, error: error.message, ...summary }, { status: 500 });
  return NextResponse.json({ ok: true, phase, imported: upserts.length, ...summary });
}
