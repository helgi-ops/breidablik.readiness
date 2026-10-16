import "server-only";

/**
 * Pipeline-health loader — assembles the serialisable `TeamHealthFacts` for every
 * active team from cheap max(date) / count(*) reads, with the existing tier/mode
 * gating so the pure checks never fire a false red. Read-only; never writes the
 * monitored tables.
 *
 * Trap-aware (verified in exploration):
 *   - stage4_decisions & player_external_load_daily have NO team_id → scope by the
 *     team's active player_ids.
 *   - v_coach_readiness_today_v8 may expose the team column as `team_id` OR `team`.
 *   - readiness_entries.is_imputed rows are auto-filled, not real submissions.
 *   - wearable_connections link via profile_id, not team/player → scope by the
 *     team's profiles.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatapultDataTier } from "@/lib/micropulse/catapultTier";
import { getTeamMode } from "@/lib/teamMode";
import type { TeamHealthFacts } from "./checks";

const GPS_SOURCES = ["catapult", "manual", "titan", "wimu"];
const todayInReykjavik = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());

/** Resolve a single-row date query to its YYYY-MM-DD value (or null). */
async function dateOf(builder: PromiseLike<{ data: Record<string, unknown> | null }>, col: string): Promise<string | null> {
  const { data } = await builder;
  const v = data?.[col];
  return v ? String(v).slice(0, 10) : null;
}
/** Resolve a head:true count query to a number (0 on error). */
async function countOf(builder: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count } = await builder;
  return count ?? 0;
}

/** v8 count-today, tolerating the `team_id` vs `team` column difference. */
async function coachViewRowsToday(sb: SupabaseClient, teamId: string, today: string): Promise<number> {
  const base = () => sb.from("v_coach_readiness_today_v8").select("player_id", { count: "exact", head: true }).eq("entry_date", today);
  const first = await base().eq("team_id", teamId);
  if (!first.error) return first.count ?? 0;
  const second = await base().eq("team", teamId);
  if (!second.error) return second.count ?? 0;
  return 0;
}

async function loadTeamFacts(sb: SupabaseClient, teamId: string, teamName: string, today: string, nowMs: number): Promise<TeamHealthFacts> {
  // Active players (strict is_active) + the team's profiles (for wearable scoping).
  const [{ data: players }, { data: profiles }, mode, tier] = await Promise.all([
    sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true),
    sb.from("profiles").select("id").eq("team_id", teamId),
    getTeamMode(sb, teamId).catch(() => ({ usesWellnessFeatures: true } as { usesWellnessFeatures: boolean })),
    getCatapultDataTier(sb, teamId).catch(() => "lite" as const),
  ]);
  const playerIds = ((players ?? []) as Array<{ id: string }>).map((p) => p.id);
  const profileIds = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);

  const [
    readinessMaxDate, realCheckinTodayCount, viewRowsToday, stage4MaxDate,
    teamSignalRowToday, weekPlanTodayExists, externalLoadMaxDate, wearables,
  ] = await Promise.all([
    dateOf(sb.from("readiness_entries").select("entry_date").eq("team_id", teamId).order("entry_date", { ascending: false }).limit(1).maybeSingle(), "entry_date"),
    countOf(sb.from("readiness_entries").select("player_id", { count: "exact", head: true }).eq("team_id", teamId).eq("entry_date", today).eq("is_imputed", false)),
    coachViewRowsToday(sb, teamId, today),
    playerIds.length ? dateOf(sb.from("stage4_decisions").select("entry_date").in("player_id", playerIds).order("entry_date", { ascending: false }).limit(1).maybeSingle(), "entry_date") : Promise.resolve(null),
    sb.from("v_team_readiness_today").select("team_id", { count: "exact", head: true }).eq("team_id", teamId).eq("entry_date", today).then((r) => (r.count ?? 0) > 0, () => false),
    sb.from("week_plans").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("day_date", today).then((r) => (r.count ?? 0) > 0, () => false),
    playerIds.length ? dateOf(sb.from("player_external_load_daily").select("date").in("player_id", playerIds).in("source", GPS_SOURCES).order("date", { ascending: false }).limit(1).maybeSingle(), "date") : Promise.resolve(null),
    profileIds.length
      ? sb.from("wearable_connections").select("last_synced_at, last_sync_error").in("profile_id", profileIds).eq("is_active", true)
      : Promise.resolve({ data: [] as Array<{ last_synced_at: string | null; last_sync_error: string | null }> }),
  ]);

  const conns = ((wearables as { data?: Array<{ last_synced_at: string | null; last_sync_error: string | null }> }).data ?? []);
  const wearableMaxSync = conns.map((c) => c.last_synced_at).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const wearableErrorCount = conns.filter((c) => c.last_sync_error != null && c.last_sync_error !== "").length;

  return {
    teamId, teamName, today, nowMs,
    activePlayerCount: playerIds.length,
    usesWellness: mode.usesWellnessFeatures !== false,
    gpsExpected: tier === "full",
    hasActiveWearables: conns.length > 0,
    readinessMaxDate,
    realCheckinTodayCount: realCheckinTodayCount,
    coachViewRowsToday: viewRowsToday,
    stage4MaxDate,
    teamSignalRowToday,
    weekPlanTodayExists,
    externalLoadMaxDate,
    wearableMaxSync,
    wearableErrorCount,
  };
}

/** Facts for every active team (distinct non-null profiles.team_id). Bounded concurrency. */
export async function loadAllTeamHealth(sb: SupabaseClient): Promise<TeamHealthFacts[]> {
  const today = todayInReykjavik();
  const nowMs = Date.now();

  const { data: teamRows } = await sb.from("profiles").select("team_id").not("team_id", "is", null);
  const teamIds = [...new Set(((teamRows ?? []) as Array<{ team_id: string }>).map((r) => r.team_id).filter(Boolean))];
  if (teamIds.length === 0) return [];

  const { data: teams } = await sb.from("teams").select("id, name").in("id", teamIds);
  const nameById = new Map(((teams ?? []) as Array<{ id: string; name: string | null }>).map((t) => [t.id, t.name ?? "—"]));

  const out: TeamHealthFacts[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < teamIds.length; i += CONCURRENCY) {
    const chunk = teamIds.slice(i, i + CONCURRENCY);
    const facts = await Promise.all(chunk.map((id) =>
      loadTeamFacts(sb, id, nameById.get(id) ?? "—", today, nowMs).catch(() => null),
    ));
    for (const f of facts) if (f) out.push(f);
  }
  return out;
}
