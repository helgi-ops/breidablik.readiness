export const runtime = "nodejs";

/**
 * GET /api/coach/stat-explorer?window=5|10|all&home=all|home|away&result=all|win|draw|loss&opponent=<name>
 *
 * Returns one aggregate row per player over the requested window of matches (from player_match_stats),
 * optionally restricted to a context (home/away, win/draw/loss, one opponent), plus the FULL metric
 * catalog (every metric present in the data — curated where known, auto-derived otherwise). The client
 * ranks / builds the all-metrics table instantly with the shared pure engine. One round-trip per
 * window/context change. Descriptive football data — never touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { aggregatePlayers, buildSpecs, GROUP_LABEL, type MatchRow, type PlayerRef } from "@/lib/micropulse/statExplorer";

type Result = "win" | "draw" | "loss";
function resultOf(gf: number | null, ga: number | null): Result | null {
  if (gf == null || ga == null) return null;
  return gf > ga ? "win" : gf < ga ? "loss" : "draw";
}

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

  const sp = new URL(req.url).searchParams;
  const wRaw = (sp.get("window") ?? "5").toLowerCase();
  const window = wRaw === "all" ? null : Math.max(1, Number(wRaw) || 5);
  const home = (sp.get("home") ?? "all").toLowerCase();      // all | home | away
  const result = (sp.get("result") ?? "all").toLowerCase();  // all | win | draw | loss
  const opponent = (sp.get("opponent") ?? "").trim();        // "" = all

  // Roster (active) → names + positions.
  const { data: squadRows } = await supabase.from("players").select("id, full_name, position, is_active").eq("team_id", teamId);
  const players: PlayerRef[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ playerId: (p as { id: string }).id, name: (p as { full_name: string | null }).full_name ?? "—", position: (p as { position: string | null }).position ?? null }));

  // Match context per date (opponent / home-away / result) from the fixtures.
  const { data: sched } = await supabase.from("match_schedule").select("match_date, opponent, is_home, goals_for, goals_against").eq("team_id", teamId);
  const byDate = new Map<string, { opponent: string | null; isHome: boolean | null; result: Result | null }>();
  for (const s of (sched ?? []) as Array<{ match_date: string; opponent: string | null; is_home: boolean | null; goals_for: number | null; goals_against: number | null }>) {
    byDate.set(s.match_date, { opponent: s.opponent, isHome: s.is_home, result: resultOf(s.goals_for, s.goals_against) });
  }

  // Own-squad per-match rows (mapped players only).
  const raw = await fetchAllPages<{ player_id: string | null; match_date: string; minutes: number | null; metrics: Record<string, unknown> | null }>(
    (from, to) => supabase
      .from("player_match_stats")
      .select("player_id, match_date, minutes, metrics")
      .eq("team_id", teamId)
      .not("player_id", "is", null)
      .order("match_date", { ascending: false })
      .range(from, to),
  );
  const allRows: MatchRow[] = raw
    .filter((r) => r.player_id)
    .map((r) => ({ playerId: r.player_id as string, matchDate: r.match_date, minutes: r.minutes, metrics: r.metrics }));

  // Full metric catalog from every key present (stable regardless of the active filter).
  const presentKeys = [...new Set(allRows.flatMap((r) => (r.metrics ? Object.keys(r.metrics) : [])))];
  const specs = buildSpecs(presentKeys);

  // Opponents the coach can filter by (those that appear in the imported matches).
  const importedDates = new Set(allRows.map((r) => r.matchDate));
  const opponents = [...new Set([...byDate.entries()].filter(([d]) => importedDates.has(d)).map(([, c]) => c.opponent).filter((o): o is string => !!o))].sort();

  // Apply the CONTEXT filter to the rows (a filtered date must have known context that matches).
  const contextActive = home !== "all" || result !== "all" || opponent !== "";
  const rows = allRows.filter((r) => {
    if (!contextActive) return true;
    const c = byDate.get(r.matchDate);
    if (!c) return false; // context requested but this match has no fixture context → exclude
    if (home === "home" && c.isHome !== true) return false;
    if (home === "away" && c.isHome !== false) return false;
    if (result !== "all" && c.result !== result) return false;
    if (opponent && (c.opponent ?? "") !== opponent) return false;
    return true;
  });

  // Window applies AFTER the context filter → e.g. "last 5 away games".
  const { players: aggs, matchDates } = aggregatePlayers(rows, players, window, specs);

  return NextResponse.json({
    ok: true,
    hasData: aggs.length > 0,
    window: window ?? "all",
    context: { home, result, opponent: opponent || "all" },
    opponents,
    matchDates,
    matchCount: matchDates.length,
    players: aggs,
    catalog: specs.map((m) => ({ key: m.key, label: m.label, group: m.group, agg: m.agg, per90: m.per90, higherIsBetter: m.higherIsBetter, tip: m.tip ?? null })),
    groupLabels: GROUP_LABEL,
  });
}
