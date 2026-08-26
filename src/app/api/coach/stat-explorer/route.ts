export const runtime = "nodejs";

/**
 * GET /api/coach/stat-explorer?window=5|10|all
 *
 * Returns one aggregate row per player over the requested window of the team's most-recent
 * matches (from player_match_stats), plus the metric catalog. The client picks a metric / mode /
 * line and ranks instantly with the SAME pure engine (rankLeaderboard) — one round-trip per window.
 *
 * Descriptive football data — never touches the readiness colour, load, or any decision. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { aggregatePlayers, METRICS, GROUP_LABEL, type MatchRow, type PlayerRef } from "@/lib/micropulse/statExplorer";

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;

  const wRaw = (new URL(req.url).searchParams.get("window") ?? "5").toLowerCase();
  const window = wRaw === "all" ? null : Math.max(1, Number(wRaw) || 5);

  // Roster (active) → names + positions.
  const { data: squadRows } = await supabase.from("players").select("id, full_name, position, is_active").eq("team_id", teamId);
  const players: PlayerRef[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ playerId: (p as { id: string }).id, name: (p as { full_name: string | null }).full_name ?? "—", position: (p as { position: string | null }).position ?? null }));

  // Own-squad per-match rows (mapped players only — an unmapped row has no identity to rank).
  const raw = await fetchAllPages<{ player_id: string | null; match_date: string; minutes: number | null; metrics: Record<string, unknown> | null }>(
    (from, to) => supabase
      .from("player_match_stats")
      .select("player_id, match_date, minutes, metrics")
      .eq("team_id", teamId)
      .not("player_id", "is", null)
      .order("match_date", { ascending: false })
      .range(from, to),
  );
  const rows: MatchRow[] = raw
    .filter((r) => r.player_id)
    .map((r) => ({ playerId: r.player_id as string, matchDate: r.match_date, minutes: r.minutes, metrics: r.metrics }));

  const { players: aggs, matchDates } = aggregatePlayers(rows, players, window);

  return NextResponse.json({
    ok: true,
    hasData: aggs.length > 0,
    window: window ?? "all",
    matchDates,
    players: aggs,
    catalog: METRICS.map((m) => ({ key: m.key, label: m.label, group: m.group, agg: m.agg, per90: m.per90, higherIsBetter: m.higherIsBetter, tip: m.tip ?? null })),
    groupLabels: GROUP_LABEL,
  });
}
