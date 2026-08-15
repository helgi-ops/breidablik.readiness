export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/capacity-reference  (GET)
 *
 * Every team player's capacity reference (peakCapacity.buildCapacityReference) — the peak
 * per-minute PlayerLoad per duration band, from his drill-load history. The Session Builder
 * uses these to predict a planned session's load per player, live and client-side. Descriptive
 * planning context — never touches the readiness colour, the load target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { buildCapacityReference, type DrillLoad } from "@/lib/micropulse/load/peakCapacity";
import { isSessionTotalName } from "@/lib/micropulse/drillActuals";

type DrillRow = { player_id: string; period_name: string | null; player_load_per_min: number | string | null; duration_min: number | string | null };

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team" }, { status: 400 });

  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const names = new Map<string, string>();
  for (const p of (roster ?? []) as Array<{ id: string; full_name: string | null }>) names.set(p.id, p.full_name ?? "Player");

  const rows = await fetchAllPages<DrillRow>((from, to) => sb
    .from("player_drill_load")
    .select("player_id, period_name, player_load_per_min, duration_min")
    .eq("team_id", teamId)
    .range(from, to));

  const byPlayer = new Map<string, DrillLoad[]>();
  for (const r of rows ?? []) {
    if (isSessionTotalName(r.period_name)) continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push({
      durationMin: r.duration_min == null ? null : Number(r.duration_min),
      valuePerMin: r.player_load_per_min == null ? null : Number(r.player_load_per_min),
    });
    byPlayer.set(r.player_id, list);
  }

  const players = [...byPlayer.entries()]
    .filter(([id]) => names.has(id))
    .map(([id, hist]) => ({ playerId: id, name: names.get(id) ?? "Player", reference: buildCapacityReference(hist) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    ok: true,
    players,
    note: "Peak per-minute PlayerLoad per duration band, from each player's drill history — the ceiling the Session Builder plans against. Descriptive planning context.",
  });
}
