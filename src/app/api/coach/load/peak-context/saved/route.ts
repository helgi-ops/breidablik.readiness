/**
 * GET /api/coach/load/peak-context/saved
 *   → the team's SAVED peak-context fusion reads (persisted by the upload route).
 *   ?matchDate=YYYY-MM-DD  → that match's stored payload (players[], hasStarterData, …)
 *   (no param)             → { matches: [{matchDate, savedAt, players}], latest: payload|null }
 *
 * Lets the Power Curve fusion widget show the team overview + player bars on page load
 * without re-uploading. Coach-scoped. Descriptive tactical context; never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type HsrPeak = { windowMin: number; hsrM: number };
type PayloadPlayer = { playerId?: string; hsrPeaks?: HsrPeak[]; [k: string]: unknown };
type Payload = { players?: PayloadPlayer[]; [k: string]: unknown };

/**
 * Read-time enrichment: attach each player's peak HSR windows (1/3/5-min, from the CTR
 * peak-window feed) to the saved fusion payload. These carry a value but NO in-match clock,
 * so they can't be time-aligned to Wyscout events (unlike the MII distance / Player Load
 * windows) — hence they ride alongside the fusion as a descriptive magnitude, never fused.
 * Done at read time so it appears on already-saved matches without re-uploading the XML.
 */
async function attachHsrPeaks(
  sb: ReturnType<typeof getSupabaseAdmin>,
  teamId: string,
  matchDate: string,
  payload: Payload | null,
): Promise<Payload | null> {
  if (!payload || !Array.isArray(payload.players) || payload.players.length === 0) return payload;
  const { data } = await sb
    .from("player_peak_window")
    .select("player_id, window_min, hsr_m")
    .eq("team_id", teamId).eq("match_date", matchDate).eq("source", "catapult_ctr")
    .ilike("window_label", "%HSR%").not("hsr_m", "is", null).not("window_min", "is", null);
  const rows = (data ?? []) as Array<{ player_id: string; window_min: number; hsr_m: number }>;
  if (rows.length === 0) return payload;
  const byPlayer = new Map<string, HsrPeak[]>();
  for (const r of rows) {
    const w = Number(r.window_min), v = Number(r.hsr_m);
    if (!Number.isFinite(w) || !Number.isFinite(v)) continue;
    const arr = byPlayer.get(r.player_id) ?? [];
    const hit = arr.find((x) => x.windowMin === w);
    if (hit) hit.hsrM = Math.max(hit.hsrM, v); // dedupe: keep the peak if a window repeats
    else arr.push({ windowMin: w, hsrM: v });
    byPlayer.set(r.player_id, arr);
  }
  for (const p of payload.players) {
    const arr = p.playerId ? byPlayer.get(p.playerId) : undefined;
    if (arr && arr.length) p.hsrPeaks = arr.sort((a, b) => a.windowMin - b.windowMin);
  }
  return payload;
}

async function authCoachTeam(req: Request): Promise<{ sb: ReturnType<typeof getSupabaseAdmin>; teamId: string }> {
  const sb = getSupabaseAdmin();
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) throw new Error("No team context");
  return { sb, teamId };
}

export async function GET(req: Request) {
  let sb: ReturnType<typeof getSupabaseAdmin>, teamId: string;
  try { ({ sb, teamId } = await authCoachTeam(req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ ok: false, error: m }, { status: /forbidden/i.test(m) ? 403 : /team/i.test(m) ? 400 : 401 }); }

  const url = new URL(req.url);
  const matchDate = (url.searchParams.get("matchDate") ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
    const { data } = await sb
      .from("peak_context_reads")
      .select("payload, updated_at")
      .eq("team_id", teamId).eq("match_date", matchDate).maybeSingle();
    const row = data as { payload?: Record<string, unknown>; updated_at?: string } | null;
    if (!row) return NextResponse.json({ ok: true, matchDate, payload: null });
    const payload = await attachHsrPeaks(sb, teamId, matchDate, (row.payload ?? null) as Payload | null);
    return NextResponse.json({ ok: true, matchDate, savedAt: row.updated_at, payload });
  }

  // List all saved matches (newest first) + inline the most recent payload for immediate render.
  const { data: rowsData } = await sb
    .from("peak_context_reads")
    .select("match_date, updated_at, payload")
    .eq("team_id", teamId).order("match_date", { ascending: false });
  const rows = (rowsData ?? []) as Array<{ match_date: string; updated_at: string; payload: Record<string, unknown> }>;
  const matches = rows.map((r) => ({
    matchDate: r.match_date,
    savedAt: r.updated_at,
    players: Array.isArray((r.payload as { players?: unknown[] })?.players) ? (r.payload as { players: unknown[] }).players.length : 0,
  }));
  const latest = rows[0]
    ? await attachHsrPeaks(sb, teamId, rows[0].match_date, (rows[0].payload ?? null) as Payload | null)
    : null;
  return NextResponse.json({ ok: true, matches, latest });
}
