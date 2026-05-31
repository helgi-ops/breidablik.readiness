/**
 * Team breaks — declared rest periods.
 *
 * During a break the system gives players a real break: no check-in / RPE
 * reminders, no "missed check-in" flags, and break days are excluded from
 * streak / compliance so nobody is penalised for resting.
 *
 * Server-safe: types + a Supabase read only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** team_ids that are on a declared break on `dateKey` (YYYY-MM-DD).
 *  Returns an empty set on any error — safer to send reminders than to
 *  silently swallow them. */
export async function getTeamsOnBreak(
  sb: SupabaseClient,
  dateKey: string,
): Promise<Set<string>> {
  try {
    const { data, error } = await sb
      .from("team_breaks")
      .select("team_id")
      .lte("start_date", dateKey)
      .gte("end_date", dateKey);
    if (error) return new Set();
    const rows = (data ?? []) as Array<{ team_id: string }>;
    return new Set(rows.map((r) => String(r.team_id)));
  } catch {
    return new Set();
  }
}

/**
 * Return-to-training ramp. After a break, ACWR is depressed and the first days
 * back are the injury window — so ease the load in before returning to normal.
 * easePct[i] = recommended volume/intensity for day i+1 back (then normal).
 */
export const RETURN_RAMP = [0.6, 0.75, 0.9] as const; // day 1, 2, 3
export const RETURN_DAYS = RETURN_RAMP.length;

export type ReturnPhase = {
  in_return: boolean;
  day: number;        // 1-based day back (1 = first day after the break)
  total_days: number; // length of the ramp
  ease_pct: number;   // recommended load for today, %
  label: string | null;
  break_end: string | null;
};

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime()) / 86_400_000,
  );
}

/** The team's return-to-training phase for `dateKey`, based on the most recent
 *  break that ended within the ramp window. Not in return → in_return:false. */
export async function getTeamReturnPhase(
  sb: SupabaseClient,
  teamId: string,
  dateKey: string,
): Promise<ReturnPhase> {
  const none: ReturnPhase = { in_return: false, day: 0, total_days: RETURN_DAYS, ease_pct: 100, label: null, break_end: null };
  try {
    const earliestEnd = (() => { const d = new Date(dateKey + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - RETURN_DAYS); return d.toISOString().slice(0, 10); })();
    const { data } = await sb
      .from("team_breaks")
      .select("end_date, label")
      .eq("team_id", teamId)
      .lt("end_date", dateKey)        // break is over
      .gte("end_date", earliestEnd)   // …but ended within the ramp window
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return none;
    const row = data as { end_date: string; label: string | null };
    const day = daysBetween(row.end_date, dateKey); // 1 = first day back
    if (day < 1 || day > RETURN_DAYS) return none;
    return {
      in_return: true,
      day,
      total_days: RETURN_DAYS,
      ease_pct: Math.round(RETURN_RAMP[day - 1] * 100),
      label: row.label,
      break_end: row.end_date,
    };
  } catch {
    return none;
  }
}

/** Is a specific team on a declared break on `dateKey`? */
export async function isTeamOnBreak(
  sb: SupabaseClient,
  teamId: string,
  dateKey: string,
): Promise<boolean> {
  try {
    const { data } = await sb
      .from("team_breaks")
      .select("id")
      .eq("team_id", teamId)
      .lte("start_date", dateKey)
      .gte("end_date", dateKey)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
