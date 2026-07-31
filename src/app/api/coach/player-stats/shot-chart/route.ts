export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player-stats/shot-chart?gameId=<kkiGameId>[&playerId=<kkiPlayerId>]
 *
 * Proxies the KKÍ (baskethotel) shot-chart IMAGE (a rendered court GIF with
 * made/missed dots by location) for one game — optionally filtered to one player.
 * Server-side so the kki referer is sent (the graph endpoint needs it) and the
 * public widget key never touches the client. Descriptive — never the readiness
 * colour. Coach-scoped. The KKÍ season_id comes from the team's feed config.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseShotChartFilters } from "@/lib/micropulse/basketballStats/parseWidget";
import { buildShotChartScaffoldUrl, buildShotChartImageUrl, fetchWidget, fetchWidgetBinary } from "@/lib/integrations/basketball/kkiWidget";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const gameId = (url.searchParams.get("gameId") || "").trim();
  const playerId = (url.searchParams.get("playerId") || "").trim();
  if (!/^\d+$/.test(gameId)) return NextResponse.json({ error: "Bad gameId" }, { status: 400 });

  // KKÍ season_id from the team's feed config (basketball_team_ref = "season:team").
  const { data: cfg } = await supabase.from("stat_ingestion_config").select("basketball_team_ref").eq("team_id", teamId).maybeSingle();
  const ref = (cfg as { basketball_team_ref?: string | null } | null)?.basketball_team_ref ?? "";
  const seasonId = ref.split(":")[0]?.trim();
  if (!/^\d+$/.test(seasonId ?? "")) return NextResponse.json({ error: "No KKÍ season configured" }, { status: 400 });

  try {
    const scaffold = await fetchWidget(buildShotChartScaffoldUrl(gameId, seasonId!));
    const f = parseShotChartFilters(scaffold);
    if (f.quarters.length === 0) return NextResponse.json({ error: "No shot data for this game" }, { status: 404 });

    // All shots, or just one player (in whichever team he's on).
    let playersA = f.playerA, playersB = f.playerB;
    if (playerId) {
      if (f.playerA.includes(playerId)) { playersA = [playerId]; playersB = []; }
      else if (f.playerB.includes(playerId)) { playersA = []; playersB = [playerId]; }
      else return NextResponse.json({ error: "Player not in this game" }, { status: 404 });
    }

    const { bytes, contentType } = await fetchWidgetBinary(buildShotChartImageUrl(gameId, seasonId!, f.quarters, playersA, playersB));
    return new NextResponse(bytes, {
      status: 200,
      headers: { "content-type": contentType, "cache-control": "private, max-age=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "shot-chart failed" }, { status: 502 });
  }
}
