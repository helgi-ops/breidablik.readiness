import "server-only";

/**
 * Tokenless team compute for the game-plan-fit coach SIGNAL.
 *
 * Mirrors the compute in `/api/coach/game-plan-fit` GET but takes an admin
 * Supabase client + teamId directly (no HTTP, no bearer token) so the Today
 * signals route AND the nightly pre-compute cron can derive the matchday-fit chip
 * without a user session. Returns only the slice `deriveGamePlanFitSignal` reads.
 *
 * READ-ONLY / ADVISORY — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { loadCmjFreshnessForTeam } from "@/lib/micropulse/vald/cmjFreshnessForTeam";
import { computeGamePlanFit, classifyOpponentStyle, styleLabel, type StyleTag, type FitRead } from "@/lib/micropulse/gamePlanFit";
import { metricsFromScoutRow, metricsFromLeagueRef } from "@/lib/micropulse/scouting/aggregate";

/** The subset `deriveGamePlanFitSignal` consumes. */
export type GamePlanFitSignalInput = {
  ok: boolean;
  fixture: { date: string; opponent: string | null } | null;
  opponentTag: { label: { en: string; is: string } } | null;
  rows: Array<{ verdict: FitRead["verdict"]; scored?: boolean }>;
};

function daysBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function suggestOpponentTag(sb: SupabaseClient, teamId: string, opponent: string | null, season: string): Promise<StyleTag> {
  if (!opponent) return "balanced";
  const { data } = await sb.from("scout_team_season").select("*")
    .eq("owner_team_id", teamId).eq("opponent_name", opponent).eq("season", season).eq("is_self", false);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return "balanced";
  const row = rows.find((r) => String(r.source ?? "") === "statsbomb") ?? rows[0];
  const opp = metricsFromScoutRow(row);
  const league = metricsFromLeagueRef(row.league_ref) ?? { possession: null, ppda: null };
  return classifyOpponentStyle({ possession: opp.possession, ppda: opp.ppda }, { possession: league.possession ?? null, ppda: league.ppda ?? null }).tag;
}

export async function loadGamePlanFitForSignal(sb: SupabaseClient, teamId: string, today: string): Promise<GamePlanFitSignalInput> {
  const empty: GamePlanFitSignalInput = { ok: true, fixture: null, opponentTag: null, rows: [] };

  // Next upcoming fixture (the signal cares only about the imminent match).
  const { data: fxData } = await sb.from("match_schedule")
    .select("match_date, opponent")
    .eq("team_id", teamId).gte("match_date", today).order("match_date", { ascending: true }).limit(1);
  const fx = ((fxData ?? []) as Array<{ match_date?: string; opponent?: string | null }>)[0];
  if (!fx?.match_date) return empty; // no upcoming match → silent (deriveGamePlanFitSignal returns steady)

  const fixture = { date: String(fx.match_date), opponent: fx.opponent ?? null };
  const readinessDate = today; // readiness is TODAY's state
  const season = fixture.date.slice(0, 4);
  const readinessWindow = daysBefore(readinessDate, 5);

  const [{ roster, profiles }, cmjByPlayer, readinessRes, oppTag] = await Promise.all([
    loadAthleteProfilesForTeam(teamId),
    loadCmjFreshnessForTeam(teamId, readinessDate),
    sb.from("v_coach_readiness_today_v8").select("player_id, final_color, is_imputed, entry_date")
      .eq("team_id", teamId).gte("entry_date", readinessWindow).lte("entry_date", readinessDate).order("entry_date", { ascending: false }),
    suggestOpponentTag(sb, teamId, fixture.opponent, season),
  ]);

  const readinessBy = new Map<string, { color: string | null; imputed: boolean }>();
  for (const r of (readinessRes.data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id ?? ""); if (!pid || readinessBy.has(pid)) continue;
    const stale = String(r.entry_date ?? "") !== readinessDate;
    readinessBy.set(pid, { color: (r.final_color as string) ?? null, imputed: r.is_imputed === true || stale });
  }

  const rows: FitRead[] = roster.map((p) => {
    const rd = readinessBy.get(p.id) ?? { color: null, imputed: false };
    const cmj = cmjByPlayer.get(p.id);
    return computeGamePlanFit({
      playerId: p.id, name: p.full_name, position: p.position,
      profile: profiles.get(p.id) ?? null,
      readinessColor: rd.color, readinessImputed: rd.imputed, opponentTag: oppTag,
      cmj: cmj ? { dropPct: cmj.dropPct, daysSince: cmj.daysSince } : null,
    });
  });

  return {
    ok: true,
    fixture,
    opponentTag: { label: styleLabel(oppTag) },
    rows: rows.map((r) => ({ verdict: r.verdict, scored: (r as { scored?: boolean }).scored })),
  };
}
