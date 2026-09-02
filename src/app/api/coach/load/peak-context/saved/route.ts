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
    return NextResponse.json({ ok: true, matchDate, savedAt: row.updated_at, payload: row.payload ?? null });
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
  return NextResponse.json({ ok: true, matches, latest: rows[0]?.payload ?? null });
}
