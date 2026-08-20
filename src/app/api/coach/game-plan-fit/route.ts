export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/game-plan-fit?date=YYYY-MM-DD&styleTag=...
 *
 * Game-Plan Fit board (differentiator #1). Per matchday, per active player: is he
 * physically ready TODAY to execute his ROLE's tactical-physical demands vs THIS
 * opponent? Composes four transparent layers:
 *   1. role demand (position → capacity-axis weights, Modric 2019)
 *   2. opponent modifier (auto-suggested from the scouting report; coach can override)
 *   3. player capacity (position-percentiled AthleteProfile qualities — GPS/VALD/VBT)
 *   4. readiness (v_coach_readiness_today_v8.final_color)
 * Rules compute; ADVISORY ONLY — READ-ONLY, never writes and NEVER touches the
 * readiness verdict, the load target, or the daily decision.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { loadCmjFreshnessForTeam } from "@/lib/micropulse/vald/cmjFreshnessForTeam";
import { computeGamePlanFit, classifyOpponentStyle, styleLabel, type StyleTag, type FitRead } from "@/lib/micropulse/gamePlanFit";
import { metricsFromScoutRow, metricsFromLeagueRef } from "@/lib/micropulse/scouting/aggregate";

type AuthProfile = { role: string | null; team_id: string | null };
const STYLE_TAGS: StyleTag[] = ["low_block", "high_press", "direct", "possession", "balanced"];

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}
function daysBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof, error: profErr } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  if (profErr) throw new Error(profErr.message);
  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

type Fixture = { date: string; opponent: string | null; isHome: boolean | null; kickoff: string | null };

/** Suggest the opponent style from the scouted season profile (StatsBomb preferred — it
 *  carries a league_ref for the PPDA benchmark). Falls back to `balanced` when unscouted. */
async function suggestOpponentStyle(sb: ReturnType<typeof getAdminClient>, teamId: string, opponent: string | null, season: string): Promise<{ tag: StyleTag; why: { en: string; is: string }; scouted: boolean }> {
  if (!opponent) return { tag: "balanced", why: { en: "No fixture opponent selected.", is: "Enginn andstæðingur valinn." }, scouted: false };
  const { data } = await sb.from("scout_team_season").select("*")
    .eq("owner_team_id", teamId).eq("opponent_name", opponent).eq("season", season).eq("is_self", false);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return { tag: "balanced", why: { en: `No scouting for ${opponent} — treating as balanced.`, is: `Engin njósn um ${opponent} — meðhöndlað sem jafnvægi.` }, scouted: false };
  const row = rows.find((r) => String(r.source ?? "") === "statsbomb") ?? rows[0];
  const opp = metricsFromScoutRow(row);
  const league = metricsFromLeagueRef(row.league_ref) ?? { possession: null, ppda: null };
  const { tag, why } = classifyOpponentStyle({ possession: opp.possession, ppda: opp.ppda }, { possession: league.possession ?? null, ppda: league.ppda ?? null });
  return { tag, why, scouted: true };
}

const VERDICT_RANK: Record<FitRead["verdict"], number> = { poor: 0, caution: 1, unknown: 2, strong: 3 };

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const url = new URL(req.url);
    const today = todayInReykjavik();
    const dateParam = url.searchParams.get("date");
    const styleOverride = url.searchParams.get("styleTag");

    // Upcoming fixtures for the selector (+ resolve the selected one).
    const { data: fxData } = await sb.from("match_schedule")
      .select("match_date, opponent, is_home, kickoff_time")
      .eq("team_id", teamId).gte("match_date", today).order("match_date", { ascending: true }).limit(10);
    const fixtures: Fixture[] = ((fxData ?? []) as Array<Record<string, unknown>>).map((r) => ({
      date: String(r.match_date ?? ""), opponent: (r.opponent as string) ?? null, isHome: (r.is_home as boolean) ?? null, kickoff: (r.kickoff_time as string) ?? null,
    }));
    let selected: Fixture | null = dateParam ? (fixtures.find((f) => f.date === dateParam) ?? null) : (fixtures[0] ?? null);
    if (!selected && dateParam) {
      const { data: one } = await sb.from("match_schedule").select("match_date, opponent, is_home, kickoff_time").eq("team_id", teamId).eq("match_date", dateParam).maybeSingle();
      if (one) selected = { date: String((one as Record<string, unknown>).match_date ?? ""), opponent: ((one as Record<string, unknown>).opponent as string) ?? null, isHome: ((one as Record<string, unknown>).is_home as boolean) ?? null, kickoff: ((one as Record<string, unknown>).kickoff_time as string) ?? null };
    }
    const readinessDate = selected?.date && selected.date <= today ? selected.date : today; // readiness is TODAY's state
    const season = (selected?.date ?? today).slice(0, 4);

    // The four layers, in parallel: capacity profiles, readiness colours, opponent style.
    // Readiness = today's check-in if present, else the most recent within 5 days (flagged
    // as estimated, confidence-capped) so the board still reads on a non-matchday.
    const readinessWindow = daysBefore(readinessDate, 5);
    const [{ roster, profiles }, cmjByPlayer, readinessRes, oppStyle] = await Promise.all([
      loadAthleteProfilesForTeam(teamId),
      loadCmjFreshnessForTeam(teamId, readinessDate),   // CMJ neuromuscular freshness (Janetzki)
      sb.from("v_coach_readiness_today_v8").select("player_id, final_color, is_imputed, entry_date")
        .eq("team_id", teamId).gte("entry_date", readinessWindow).lte("entry_date", readinessDate).order("entry_date", { ascending: false }),
      suggestOpponentStyle(sb, teamId, selected?.opponent ?? null, season),
    ]);

    // Keep the most recent row per player; stale (not today) reads as an estimate.
    const readinessBy = new Map<string, { color: string | null; imputed: boolean }>();
    for (const r of (readinessRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.player_id ?? ""); if (!pid || readinessBy.has(pid)) continue;
      const stale = String(r.entry_date ?? "") !== readinessDate;
      readinessBy.set(pid, { color: (r.final_color as string) ?? null, imputed: r.is_imputed === true || stale });
    }

    const usedTag: StyleTag = styleOverride && STYLE_TAGS.includes(styleOverride as StyleTag) ? (styleOverride as StyleTag) : oppStyle.tag;

    const rows: FitRead[] = roster.map((p) => {
      const rd = readinessBy.get(p.id) ?? { color: null, imputed: false };
      const cmj = cmjByPlayer.get(p.id);
      return computeGamePlanFit({
        playerId: p.id, name: p.full_name, position: p.position,
        profile: profiles.get(p.id) ?? null,
        readinessColor: rd.color, readinessImputed: rd.imputed, opponentTag: usedTag,
        cmj: cmj ? { dropPct: cmj.dropPct, daysSince: cmj.daysSince } : null,
      });
    });
    // Most-actionable first: poor → caution → unknown → strong, then by name.
    rows.sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || a.name.localeCompare(b.name));

    return NextResponse.json({
      ok: true,
      generatedFor: readinessDate,
      fixture: selected,
      fixtures,
      opponentTag: { suggested: oppStyle.tag, used: usedTag, why: oppStyle.why, scouted: oppStyle.scouted, label: styleLabel(usedTag) },
      styleTags: STYLE_TAGS.map((t) => ({ tag: t, label: styleLabel(t) })),
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg.includes("team") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
