export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/fixtures-kki — import a team's fixtures (leikjaplan) from a KKÍ.is team-season link.
 *   POST { url }                      → PREVIEW: parse + fetch the season schedule, return the games
 *                                       and the team names (the coach picks which team is theirs). No write.
 *   POST { commit: true, fixtures:[…]}→ upsert the chosen fixtures into match_schedule (team-scoped).
 *
 * Reuses the basketball KKÍ widget stack (parseKkiTeamUrl / buildScheduleUrl / fetchWidget / parseSchedule).
 * Descriptive import — writes the schedule the periodization/week-setup already reads. Never a readiness action.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseKkiTeamUrl, buildScheduleUrl, fetchWidget, DEFAULT_STAGE_ID } from "@/lib/integrations/basketball/kkiWidget";
import { parseSchedule } from "@/lib/micropulse/basketballStats/parseWidget";

const fold = (s: string | null | undefined): string =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

type FixtureIn = { date: string; opponent: string; isHome: boolean };

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));

  // ── COMMIT: write the chosen fixtures into match_schedule ─────────────────────────────────────
  if (body?.commit === true) {
    const fixtures: FixtureIn[] = Array.isArray(body?.fixtures) ? body.fixtures : [];
    const valid = fixtures.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f?.date)) && String(f?.opponent ?? "").trim());
    if (!valid.length) return NextResponse.json({ ok: false, error: "No valid fixtures to import." }, { status: 400 });
    const rows = valid.slice(0, 80).map((f) => ({
      team_id: auth.teamId, match_date: f.date, opponent: String(f.opponent).trim().slice(0, 120),
      competition: "Deild", is_home: !!f.isHome, is_friendly: false,
    }));
    const { error } = await auth.supabase.from("match_schedule").upsert(rows as never, { onConflict: "team_id,match_date" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, imported: rows.length });
  }

  // ── PREVIEW: parse the link, fetch the season schedule, return games + team names ─────────────
  const url = String(body?.url ?? "").trim();
  const { seasonId } = parseKkiTeamUrl(url);
  if (!seasonId) return NextResponse.json({ ok: false, error: "Not a KKÍ team-season link (needs season_id + team_id)." }, { status: 400 });

  const games: Array<{ gameId: string; date: string; homeTeam: string; awayTeam: string; finished: boolean }> = [];
  const seen = new Set<string>();
  try {
    for (let page = 0; page < 20; page++) {
      const sched = await fetchWidget(buildScheduleUrl(seasonId, DEFAULT_STAGE_ID, page));
      const parsed = parseSchedule(sched).filter((g) => g.date);
      const fresh = parsed.filter((g) => !seen.has(g.gameId));
      if (!fresh.length) break;
      for (const g of fresh) { seen.add(g.gameId); games.push({ gameId: g.gameId, date: g.date, homeTeam: g.homeTeam, awayTeam: g.awayTeam, finished: g.finished }); }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Couldn't read the KKÍ schedule: ${e instanceof Error ? e.message : "fetch failed"}` }, { status: 502 });
  }
  if (!games.length) return NextResponse.json({ ok: false, error: "No games found on that schedule." }, { status: 422 });

  const teams = Array.from(new Set(games.flatMap((g) => [g.homeTeam, g.awayTeam]).filter(Boolean))).sort();
  // Pre-select the coach's own team by matching its name against the KKÍ team names.
  const { data: teamRow } = await auth.supabase.from("teams").select("name").eq("id", auth.teamId).maybeSingle();
  const ourFold = fold((teamRow as { name?: string } | null)?.name);
  const suggestedTeam = teams.find((t) => ourFold && fold(t) === ourFold) ?? teams.find((t) => ourFold && (fold(t).includes(ourFold) || ourFold.includes(fold(t)))) ?? null;

  return NextResponse.json({ ok: true, seasonId, teams, suggestedTeam, games });
}
