export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/peak-period/upload  (BETA — pending verification against a real export)
 *
 * POST multipart { file, phase: "preview"|"commit", date? } — ingest a Catapult OpenField
 * "Peak Period" / rolling / interval export into `player_load_peak_period` (long format:
 * window × metric = worst rolling window), which lights up the power curve (peakPeriod.ts).
 *
 * The parser (parseCatapultPeakPeriod) pattern-detects the peak columns, so it is resilient
 * to the exact OpenField template. Athletes are matched to players via the existing
 * catapult_athlete_map (falling back to players.full_name). preview reports matches +
 * warnings without writing; commit upserts. Descriptive load context — it never touches the
 * readiness colour, the load target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseCatapultPeakPeriod } from "@/lib/micropulse/load/parseCatapultPeakPeriod";

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

/** Read the first sheet of a CSV/XLSX file into a string matrix (header row + data). */
function readMatrix(buf: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });
  return rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
}

/** athlete display name (normalised) → player_id, from the catapult map + roster fallback. */
async function nameToPlayer(supabase: SupabaseClient, teamId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data: roster } = await supabase.from("players").select("id, full_name").eq("team_id", teamId);
  for (const p of (roster ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (p.full_name) out.set(normName(p.full_name), p.id);
  }
  const { data: map } = await supabase
    .from("catapult_athlete_map")
    .select("catapult_athlete_name, micropulse_player_id, source_team_id")
    .eq("source_team_id", teamId);
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
  const defaultDate = String(form.get("date") ?? "").trim() || null; // used when the export has no date column

  let matrix: string[][];
  try { matrix = readMatrix(await file.arrayBuffer()); } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the file" }, { status: 400 }); }

  const parsed = parseCatapultPeakPeriod(matrix);
  if (parsed.detectedColumns === 0) {
    return NextResponse.json({ ok: false, error: "No peak-period columns recognised in this file.", warnings: parsed.warnings }, { status: 422 });
  }

  const name2player = await nameToPlayer(auth.supabase, auth.teamId);
  const matched: string[] = [], unmatched: string[] = [];
  for (const a of parsed.athletes) (name2player.has(normName(a)) ? matched : unmatched).push(a);

  // Build upsert rows: attribute each datum to a player + a date (row date, else default).
  const upserts: Array<Record<string, unknown>> = [];
  const skippedNoDate = new Set<string>();
  for (const r of parsed.rows) {
    const pid = name2player.get(normName(r.athlete));
    if (!pid) continue;
    const date = r.date ?? defaultDate;
    if (!date) { skippedNoDate.add(r.athlete); continue; }
    upserts.push({
      player_id: pid, team_id: auth.teamId, date, source: "catapult",
      window_min: r.windowMin, metric: r.metric, value: r.value, unit: r.unit,
    });
  }

  const summary = {
    detectedColumns: parsed.detectedColumns,
    windows: parsed.windows,
    metrics: parsed.metrics,
    athletesMatched: matched.length,
    athletesUnmatched: unmatched,
    rows: upserts.length,
    skippedNoDate: [...skippedNoDate],
    warnings: [
      ...parsed.warnings,
      ...(skippedNoDate.size && !defaultDate ? ["Some rows had no date column — supply a session date to import them."] : []),
    ],
  };

  if (phase === "preview") return NextResponse.json({ ok: true, phase, ...summary });

  if (upserts.length === 0) return NextResponse.json({ ok: false, error: "Nothing to import (no matched athletes with a date).", ...summary }, { status: 422 });
  const { error } = await auth.supabase
    .from("player_load_peak_period")
    .upsert(upserts as never, { onConflict: "player_id,date,source,window_min,metric" });
  if (error) return NextResponse.json({ ok: false, error: error.message, ...summary }, { status: 500 });

  return NextResponse.json({ ok: true, phase, imported: upserts.length, ...summary });
}
