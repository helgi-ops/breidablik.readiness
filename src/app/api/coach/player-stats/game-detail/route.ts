export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player-stats/game-detail?gameId=<kkiGameId>
 *
 * The FULL box score for one game — both teams, every column — plus computed
 * team totals (the KKÍ boxscore + team-comparison views). Proxied server-side
 * (kki referer, key stays server-side) and parsed with parseBoxScore. KKÍ
 * season comes from the team's feed config. Coach-scoped, descriptive only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseBoxScore } from "@/lib/micropulse/basketballStats/parseWidget";
import { buildBoxScoreUrl, fetchWidget } from "@/lib/integrations/basketball/kkiWidget";

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

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
  if (!/^\d+$/.test(gameId)) return NextResponse.json({ error: "Bad gameId" }, { status: 400 });

  const { data: cfg } = await supabase.from("stat_ingestion_config").select("basketball_team_ref").eq("team_id", teamId).maybeSingle();
  const teamRef = (cfg as { basketball_team_ref?: string | null } | null)?.basketball_team_ref ?? "";
  const seasonId = teamRef.split(":")[0]?.trim();
  const myTeamName = teamRef.split(":").slice(1).join(":").trim(); // KKÍ team name, e.g. "Tindastóll"
  if (!/^\d+$/.test(seasonId ?? "")) return NextResponse.json({ error: "No KKÍ season configured" }, { status: 400 });

  let rows;
  try {
    rows = parseBoxScore(await fetchWidget(buildBoxScoreUrl(gameId, seasonId!)), gameId, teamId, "baskethotel");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "No box score" }, { status: 404 });

  const player = (r: typeof rows[number]) => ({
    name: r.playerName,
    min: r.minutes, pts: n(r.points),
    twoM: n(r.fgm) - n(r.tpm), twoA: n(r.fga) - n(r.tpa),
    threeM: n(r.tpm), threeA: n(r.tpa),
    fgM: n(r.fgm), fgA: n(r.fga), ftM: n(r.ftm), ftA: n(r.fta),
    oreb: n(r.oreb), dreb: n(r.dreb), reb: n(r.reb),
    ast: n(r.assists), fouls: n(r.fouls), to: n(r.turnovers), stl: n(r.steals), blk: n(r.blocks),
    eff: r.efficiency ?? null, pm: r.plusMinus ?? null,
  });
  type P = ReturnType<typeof player>;
  const sum = (ps: P[], k: keyof P) => ps.reduce((a, p) => a + n(p[k] as number), 0);

  const byTeam = new Map<string, P[]>();
  for (const r of rows) {
    const t = r.team ?? "—";
    const arr = byTeam.get(t) ?? [];
    arr.push(player(r));
    byTeam.set(t, arr);
  }
  let teams = [...byTeam.entries()].map(([name, players]) => ({
    name,
    players: players.sort((a, b) => b.pts - a.pts),
    totals: {
      pts: sum(players, "pts"), reb: sum(players, "reb"), oreb: sum(players, "oreb"), dreb: sum(players, "dreb"),
      ast: sum(players, "ast"), stl: sum(players, "stl"), blk: sum(players, "blk"), to: sum(players, "to"), fouls: sum(players, "fouls"),
      fgM: sum(players, "fgM"), fgA: sum(players, "fgA"), threeM: sum(players, "threeM"), threeA: sum(players, "threeA"),
      ftM: sum(players, "ftM"), ftA: sum(players, "ftA"), twoM: sum(players, "twoM"), twoA: sum(players, "twoA"),
    },
  }));

  // The coach only wants their OWN team. Keep just the configured team; if the
  // name can't be matched (config drift), fall back to returning both so the
  // surface never goes blank.
  const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
  if (myTeamName) {
    const mine = teams.filter((t) => norm(t.name) === norm(myTeamName));
    if (mine.length > 0) teams = mine;
  }

  return NextResponse.json({ teams });
}
