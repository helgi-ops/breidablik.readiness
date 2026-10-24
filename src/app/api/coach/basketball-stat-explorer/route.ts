export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/basketball-stat-explorer?window=5|10|all&result=all|win|loss&opponent=<name>
 *
 * The basketball counterpart to /api/coach/stat-explorer (which reads football player_match_stats).
 * Aggregates the stored KKÍ/FIBA box scores (basketball_fiba_games.own_box) per player over a window
 * of the team's CURRENT season, optionally restricted to wins/losses or one opponent, and returns raw
 * sums + games + minutes per player. The client turns those into per-game / total / per-36 / shooting-%
 * leaderboards. Descriptive — never the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";
import { latestSeason } from "@/lib/micropulse/basketballStats/season";

type BoxRow = {
  name?: string; min?: string | number | null; pts?: number; reb?: number; oreb?: number; dreb?: number; ast?: number;
  stl?: number; blk?: number; tov?: number; fgm?: number; fga?: number; tpm?: number; tpa?: number; ftm?: number; fta?: number;
};
const nn = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** "24:42" → 24.7 min; decimal string/number → itself; blank → 0. */
const toMin = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  const mm = /^(\d+):(\d{1,2})$/.exec(s);
  if (mm) return Math.round((Number(mm[1]) + Number(mm[2]) / 60) * 10) / 10;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

type Agg = {
  key: string; name: string; playerId: string | null; gp: number; min: number;
  pts: number; oreb: number; dreb: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
};

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;

  const { data: team } = await supabase.from("teams").select("sport").eq("id", teamId).maybeSingle();
  const isBasketball = String((team as { sport?: string | null } | null)?.sport ?? "").toLowerCase() === "basketball";
  if (!isBasketball) return NextResponse.json({ ok: true, isBasketball: false, hasData: false, players: [], opponents: [] });

  const sp = new URL(req.url).searchParams;
  const wRaw = (sp.get("window") ?? "5").toLowerCase();
  const window = wRaw === "all" ? null : Math.max(1, Number(wRaw) || 5);
  const resultFilter = (sp.get("result") ?? "all").toLowerCase();  // all | win | loss
  const opponent = (sp.get("opponent") ?? "").trim();              // "" = all

  // Active roster → name-key → { id, full_name } for display + player linking.
  const { data: squad } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  const rosterByKey = new Map<string, { id: string; name: string }>();
  for (const p of (squad ?? []) as Array<{ id: string; full_name: string | null; is_active: boolean | null }>) {
    if (p.is_active === false) continue;
    const k = initialSurnameKey(p.full_name ?? "");
    if (k && !rosterByKey.has(k)) rosterByKey.set(k, { id: p.id, name: p.full_name ?? "—" });
  }

  const { data: gamesRaw } = await supabase.from("basketball_fiba_games")
    .select("match_date, opp_name, own_box, own_totals, opp_totals, season")
    .eq("owner_team_id", teamId);
  type Row = { match_date: string | null; opp_name: string | null; own_box: BoxRow[] | null; own_totals: Record<string, unknown> | null; opp_totals: Record<string, unknown> | null; season: string | null };
  const all = (gamesRaw ?? []) as Row[];

  // Scope to the current (newest) season, like the player report.
  const season = latestSeason(all.map((g) => g.season));
  let games = season ? all.filter((g) => g.season === season) : all;

  const opponents = [...new Set(games.map((g) => g.opp_name).filter((x): x is string => !!x))].sort();

  // Context filters.
  if (opponent) games = games.filter((g) => (g.opp_name ?? "") === opponent);
  if (resultFilter === "win" || resultFilter === "loss") {
    games = games.filter((g) => {
      const mine = nn((g.own_totals as { pts?: number } | null)?.pts);
      const theirs = nn((g.opp_totals as { pts?: number } | null)?.pts);
      if (mine === 0 && theirs === 0) return false; // unknown score
      return resultFilter === "win" ? mine > theirs : mine < theirs;
    });
  }

  // Newest first, then the window (most recent N).
  games.sort((a, b) => {
    if (a.match_date && b.match_date) return b.match_date.localeCompare(a.match_date);
    if (a.match_date) return -1; if (b.match_date) return 1; return 0;
  });
  if (window) games = games.slice(0, window);

  // Aggregate per player across the windowed games.
  const byKey = new Map<string, Agg>();
  for (const g of games) {
    const box = Array.isArray(g.own_box) ? g.own_box : [];
    for (const b of box) {
      const nm = (b.name ?? "").trim();
      if (!nm) continue;
      const key = initialSurnameKey(nm) || nm.toLowerCase();
      const roster = rosterByKey.get(key);
      let a = byKey.get(key);
      if (!a) {
        a = { key, name: roster?.name ?? nm, playerId: roster?.id ?? null, gp: 0, min: 0,
          pts: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
        byKey.set(key, a);
      }
      a.gp += 1; a.min += toMin(b.min);
      a.pts += nn(b.pts); a.oreb += nn(b.oreb); a.dreb += nn(b.dreb); a.reb += nn(b.reb); a.ast += nn(b.ast);
      a.stl += nn(b.stl); a.blk += nn(b.blk); a.tov += nn(b.tov);
      a.fgm += nn(b.fgm); a.fga += nn(b.fga); a.tpm += nn(b.tpm); a.tpa += nn(b.tpa); a.ftm += nn(b.ftm); a.fta += nn(b.fta);
    }
  }
  const players = [...byKey.values()].map((a) => ({ ...a, min: Math.round(a.min * 10) / 10 }));

  return NextResponse.json({
    ok: true, isBasketball: true, hasData: players.length > 0, season,
    window: window ?? "all", matchCount: games.length, opponents, players,
  });
}
