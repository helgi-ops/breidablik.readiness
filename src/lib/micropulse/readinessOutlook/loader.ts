/**
 * Async data layer for the Readiness Outlook — fetches the rows, delegates all logic to
 * the pure assembler + engine. Reads only: session_rpe_entries, readiness_entries.total_score
 * (never `color`), match_schedule, and the coach's Week-setup plan (via resolveMdContext /
 * planSessionLoad). Nothing here touches the canonical verdict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMdContext } from "@/lib/micropulse/loadPlan/forTeam";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { buildOutlookInputs, parseMdOffset, mdOffsetForDate, type RpeRow, type WellnessRow, type RosterPlayer } from "./assemble";
import { computeTeamOutlook, type TeamOutlook, type PlannedDay } from "./index";

const HISTORY_DAYS = 210; // ~30 weeks — enough for the maturity gate + EWMA runway
const HORIZON_DAYS = 6;   // forecast the next microcycle days

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface LoadOutlookResult {
  outlook: TeamOutlook;
  asOf: string;
  plannedDays: PlannedDay[];
}

/**
 * Build the team's Readiness Outlook as of `asOf` (default today). Returns null when the
 * team has no active players. The forecast covers the next few planned microcycle days.
 */
export async function loadReadinessOutlook(
  sb: SupabaseClient,
  teamId: string,
  asOf: string,
): Promise<LoadOutlookResult | null> {
  const since = addDaysISO(asOf, -HISTORY_DAYS);

  const { data: playerRows } = await sb
    .from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (playerRows ?? []) as RosterPlayer[];
  if (players.length === 0) return null;
  const ids = players.map((p) => p.id);

  const [rpeRes, wellnessRes, matchRes] = await Promise.all([
    sb.from("session_rpe_entries").select("player_id, session_date, session_load")
      .eq("team_id", teamId).gte("session_date", since).lte("session_date", asOf),
    sb.from("readiness_entries").select("player_id, entry_date, total_score")
      .in("player_id", ids).gte("entry_date", since).lte("entry_date", asOf),
    sb.from("match_schedule").select("match_date")
      .eq("team_id", teamId).gte("match_date", since).lte("match_date", addDaysISO(asOf, 21)),
  ]);

  const rpeRows = (rpeRes.data ?? []) as RpeRow[];
  const wellnessRows = (wellnessRes.data ?? []) as WellnessRow[];
  const matchDates = ((matchRes.data ?? []) as Array<{ match_date: string | null }>)
    .map((m) => (m.match_date ? String(m.match_date).slice(0, 10) : "")).filter(Boolean);

  const inputs = buildOutlookInputs({ players, rpeRows, wellnessRows, matchDates });

  // Planned week ahead: one PlannedDay per upcoming microcycle day, its planned load from
  // the coach's Week setup (resolveMdContext → planSessionLoad).
  const plannedDays: PlannedDay[] = [];
  for (let i = 1; i <= HORIZON_DAYS; i++) {
    const date = addDaysISO(asOf, i);
    const md = await resolveMdContext(sb, teamId, date);
    const plan = planSessionLoad({ mdDay: md.mdDay, dayType: md.dayType, focus: md.focus });
    const mdOffset = parseMdOffset(md.mdDay) ?? mdOffsetForDate(date, matchDates);
    plannedDays.push({
      date,
      mdOffset,
      plannedLoad: plan.applicable ? plan.sessionLoad : 0,
      mdLabel: md.mdDay ?? (mdOffset === 0 ? "MD" : mdOffset > 0 ? `MD+${mdOffset}` : `MD${mdOffset}`),
    });
  }

  const outlook = computeTeamOutlook(inputs, plannedDays);
  return { outlook, asOf, plannedDays };
}
