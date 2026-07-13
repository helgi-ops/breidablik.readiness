/**
 * /api/player/game-report?season=2026
 *
 * GET — the PLAYER's OWN per-match physical performance report (so he can follow
 * his profile). Self-scoped: the player_id comes from his auth, never a param —
 * he can only ever see himself. Same computation as the coach report (shared lib),
 * minus the squad roster. Capability-aware (works on Lite + Pro).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { computePlayerGameReport } from "@/lib/micropulse/playerGameReport";
import { loadStrideVerdict, type StrideVerdictResult } from "@/lib/micropulse/strideLength/loader";
import { VERDICT_KINDS } from "@/lib/micropulse/strideLength";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();

  const { data: p } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const teamId = (p?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ error: "Player not linked to a team" }, { status: 400 });

  const res = await computePlayerGameReport(sb, teamId, playerId, season);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  // Club theming (for the shareable match card) + the player's season bests of
  // the three shareable stats, computed from his own matches (one extra query).
  const { data: team } = await sb.from("teams").select("name, club_theme_color, club_logo_url").eq("id", teamId).maybeSingle();
  const t = team as { name?: string | null; club_theme_color?: string | null; club_logo_url?: string | null } | null;

  const gps = (res.report.matches as Array<{ has_gps?: boolean; estimated?: boolean; raw?: { top_speed_kmh?: number; total_distance?: number; sprint?: number } | null }>)
    .filter((m) => m.has_gps && m.raw && !m.estimated); // estimates never define a season best
  const clampSpeed = (v: number | undefined) => (typeof v === "number" && v > 0 && v <= 45 ? v : 0);
  const maxOf = (f: (m: { raw?: { top_speed_kmh?: number; total_distance?: number; sprint?: number } | null }) => number) =>
    gps.reduce((mx, m) => Math.max(mx, f(m)), 0);
  const seasonBests = {
    topSpeed: maxOf((m) => clampSpeed(m.raw?.top_speed_kmh)),
    distance: maxOf((m) => (m.raw?.total_distance ?? 0)),
    sprints: maxOf((m) => (m.raw?.sprint ?? 0)),
  };

  // Stride verdict for his LATEST match — "is he still pushing, or just turning
  // his legs over?" A DRIVER-side signal neither GPS distance nor cadence shows.
  let strideVerdict: StrideVerdictResult | null = null;
  try {
    const dates = (res.report.matches as Array<{ date?: string }>)
      .map((m) => m.date)
      .filter((d): d is string => typeof d === "string");
    const latest = dates.sort().at(-1);
    if (latest) {
      const sv = await loadStrideVerdict(sb, { playerId, date: latest });
      if (VERDICT_KINDS.includes(sv.kind)) strideVerdict = sv;
    }
  } catch { /* stride verdict optional — never break the report */ }

  // Player sees ONLY his own report — no squad roster / teammate list.
  return NextResponse.json({
    ...res.report,
    club: { name: t?.name ?? "", themeColor: t?.club_theme_color ?? null, logoUrl: t?.club_logo_url ?? null },
    seasonBests,
    strideVerdict,
  });
}
