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
import { computeTeamOutlook, type TeamOutlook, type PlannedDay, type OutlookPlayerInput } from "./index";

const HISTORY_DAYS = 210; // ~30 weeks — enough for the maturity gate + EWMA runway
const HORIZON_DAYS = 6;   // forecast the next microcycle days

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const PAGE = 1000; // Supabase caps a query at 1000 rows by default — page past it.

/**
 * Fetch every row of a query, paging in 1000-row chunks. A whole squad's ~6 months of
 * daily check-ins / sRPE far exceeds the default cap; without this the history is
 * silently truncated to the first ~1000 rows (≈ a handful of players).
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
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
  /** Live plan from the Week Setup grid — when given, skips reading the saved plan. */
  plannedDaysOverride?: PlannedDay[],
): Promise<LoadOutlookResult | null> {
  const hist = await loadOutlookInputs(sb, teamId, asOf);
  if (!hist) return null;
  const plannedDays = plannedDaysOverride?.length
    ? plannedDaysOverride
    : await buildPlannedDaysFromWeekSetup(sb, teamId, asOf, hist.matchDates);
  return { outlook: computeTeamOutlook(hist.inputs, plannedDays), asOf, plannedDays };
}

export interface OutlookHistory {
  inputs: OutlookPlayerInput[];
  matchDates: string[];
}

/**
 * The HISTORY half — roster + paginated sRPE/wellness + fixtures → per-player engine
 * inputs. Independent of the plan, so a surface can fetch this ONCE and re-run the pure
 * computeTeamOutlook as the coach edits the week.
 */
export async function loadOutlookInputs(
  sb: SupabaseClient,
  teamId: string,
  asOf: string,
): Promise<OutlookHistory | null> {
  const since = addDaysISO(asOf, -HISTORY_DAYS);

  const { data: playerRows } = await sb
    .from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (playerRows ?? []) as RosterPlayer[];
  if (players.length === 0) return null;
  const ids = players.map((p) => p.id);

  const [rpeRows, wellnessRows, matchRes] = await Promise.all([
    fetchAll<RpeRow>((from, to) => sb.from("session_rpe_entries").select("player_id, session_date, session_load")
      .eq("team_id", teamId).gte("session_date", since).lte("session_date", asOf)
      .order("session_date").range(from, to)),
    fetchAll<WellnessRow>((from, to) => sb.from("readiness_entries").select("player_id, entry_date, total_score")
      .in("player_id", ids).gte("entry_date", since).lte("entry_date", asOf)
      .order("entry_date").range(from, to)),
    sb.from("match_schedule").select("match_date")
      .eq("team_id", teamId).gte("match_date", since).lte("match_date", addDaysISO(asOf, 21)),
  ]);

  const matchDates = ((matchRes.data ?? []) as Array<{ match_date: string | null }>)
    .map((m) => (m.match_date ? String(m.match_date).slice(0, 10) : "")).filter(Boolean);

  return { inputs: buildOutlookInputs({ players, rpeRows, wellnessRows, matchDates }), matchDates };
}

/**
 * The saved-plan path: read the coach's Week setup (resolveMdContext → planSessionLoad)
 * for the next few microcycle days. Used when no live grid plan is supplied.
 */
export async function buildPlannedDaysFromWeekSetup(
  sb: SupabaseClient,
  teamId: string,
  asOf: string,
  matchDates: string[],
): Promise<PlannedDay[]> {
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
  return plannedDays;
}
