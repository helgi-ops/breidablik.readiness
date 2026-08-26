export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/coach/best-matches/ai-summary  { top, lens, lang }
 *
 * On-demand (button-triggered) AI summary for Best Match Analysis: recomputes the ranked best games
 * server-side (rankMatches — same as the report) and, in ONE model call, returns both a whole-set
 * summary and a one-line note per match. Descriptive — never touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { rankMatches, type TeamMatch, type Lens } from "@/lib/micropulse/bestMatches";
import { buildBestMatchesAiSummary } from "@/lib/micropulse/bestMatches/aiSummary";

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

const n = (v: unknown): number | null => { if (v == null || v === "") return null; const x = Number(v); return Number.isFinite(x) ? x : null; };

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;

  const body = await req.json().catch(() => ({}));
  const top = Math.max(1, Math.min(30, Number(body?.top) || 10));
  const lRaw = String(body?.lens ?? "overall").toLowerCase();
  const lens: Lens = lRaw === "attack" || lRaw === "defense" ? lRaw : "overall";
  const lang: "EN" | "IS" = String(body?.lang ?? "EN").toUpperCase() === "IS" ? "IS" : "EN";

  const { data: tm } = await supabase
    .from("sb_team_match_stats")
    .select("match_date, opponent, is_home, goals, goals_against, xg, xg_against, obv, pressures, open_play_xg, set_piece_xg, deep_progressions")
    .eq("team_id", teamId).eq("source", "statsbomb");
  const rows: TeamMatch[] = (tm ?? []).map((r: Record<string, unknown>) => ({
    matchDate: String(r.match_date), opponent: (r.opponent as string | null) ?? null, isHome: (r.is_home as boolean | null) ?? null,
    goals: n(r.goals), goalsAgainst: n(r.goals_against), xg: n(r.xg), xgAgainst: n(r.xg_against),
    obv: n(r.obv), pressures: n(r.pressures), openPlayXg: n(r.open_play_xg), setPieceXg: n(r.set_piece_xg), deepProgressions: n(r.deep_progressions),
  }));
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "No team match data yet." }, { status: 400 });

  const ranked = rankMatches(rows, { topN: top, lens });
  try {
    const summary = await buildBestMatchesAiSummary(ranked, lens, lang);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI summary failed." }, { status: 502 });
  }
}
