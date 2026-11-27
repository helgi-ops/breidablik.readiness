import "server-only";

/**
 * The done side of "Did we do enough?" for a week or a block: the squad's medians per day over [from, to], read once
 * (roster, fixtures + minutes, load rows) and summed by the pure weekEnough engine against the hub's plan, which the
 * client already has. Same gate as the session card: football + Vector Pro (Catapult tier "full").
 *
 * READ-ONLY / descriptive — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatapultDataTier } from "@/lib/micropulse/catapultTier";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import { fetchRows } from "./loader";
import { squadDayMedians } from "./dayRows";
import type { ActualDay } from "./weekEnough";

/** Days before `from` read too, so a Monday top-up knows who started the weekend's match. */
const MATCH_LOOKBACK_DAYS = 14;
/** At most this many days per call (the hub's Meso horizon is 8 weeks). */
export const MAX_RANGE_DAYS = 63;

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export type WeekEnoughActuals = { state: "ok" | "not_available"; days: ActualDay[] };

export async function loadWeekEnoughActuals(sb: SupabaseClient, teamId: string, from: string, to: string): Promise<WeekEnoughActuals> {
  const [sport, tier] = await Promise.all([resolveTeamSport(sb, teamId), getCatapultDataTier(sb, teamId)]);
  if (sport !== "football" || tier !== "full") return { state: "not_available", days: [] };

  const { data: roster } = await sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true);
  const playerIds = ((roster ?? []) as Array<{ id: string }>).map((p) => p.id);
  const dates: string[] = [];
  for (let d = from; d <= to && dates.length < MAX_RANGE_DAYS; d = addDays(d, 1)) dates.push(d);
  if (!playerIds.length || !dates.length) return { state: "ok", days: [] };

  const lookFrom = addDays(from, -MATCH_LOOKBACK_DAYS);
  const [{ data: sched }, { data: mins }, rows] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", lookFrom).lte("match_date", to),
    sb.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", lookFrom).lte("match_date", to),
    fetchRows(sb, playerIds, { from: lookFrom, to }),
  ]);
  const matchDates = new Set<string>();
  for (const s of (sched ?? []) as Array<{ match_date: string }>) matchDates.add(s.match_date);
  const minutesByKey = new Map<string, number>();
  for (const m of (mins ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    matchDates.add(m.match_date);
    minutesByKey.set(`${m.player_id}|${m.match_date}`, m.is_dnp ? 0 : (m.minutes_played ?? 0));
  }
  return { state: "ok", days: squadDayMedians({ dates, rows, matchDates, minutesByKey }) };
}
