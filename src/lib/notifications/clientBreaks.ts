/**
 * Per-client vacations / breaks (PT). Mirror of team breaks but scoped to one
 * player, since PT clients take time off individually.
 *
 * During a client break: reminders suppressed, no streak/compliance penalty,
 * return ease-in afterwards. Server-safe (types + Supabase reads only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { RETURN_RAMP, RETURN_DAYS, type ReturnPhase } from "@/lib/notifications/teamBreaks";

export type BreakRange = { start_date: string; end_date: string; label: string | null };

/** player_ids that are on a declared client break on `dateKey`. Empty on error. */
export async function getPlayersOnBreak(sb: SupabaseClient, dateKey: string): Promise<Set<string>> {
  try {
    const { data, error } = await sb
      .from("client_breaks")
      .select("player_id")
      .lte("start_date", dateKey)
      .gte("end_date", dateKey);
    if (error) return new Set();
    return new Set(((data ?? []) as Array<{ player_id: string }>).map((r) => String(r.player_id)));
  } catch {
    return new Set();
  }
}

/** The current break covering `dateKey` for one client, or null. */
export async function getClientBreakToday(sb: SupabaseClient, playerId: string, dateKey: string): Promise<BreakRange | null> {
  try {
    const { data } = await sb
      .from("client_breaks")
      .select("start_date, end_date, label")
      .eq("player_id", playerId)
      .lte("start_date", dateKey)
      .gte("end_date", dateKey)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as BreakRange | null) ?? null;
  } catch {
    return null;
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime()) / 86_400_000);
}

/** Return-to-training phase for one client after a break ended. */
export async function getClientReturnPhase(sb: SupabaseClient, playerId: string, dateKey: string): Promise<ReturnPhase> {
  const none: ReturnPhase = { in_return: false, day: 0, total_days: RETURN_DAYS, ease_pct: 100, label: null, break_end: null };
  try {
    const earliestEnd = (() => { const d = new Date(dateKey + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - RETURN_DAYS); return d.toISOString().slice(0, 10); })();
    const { data } = await sb
      .from("client_breaks")
      .select("end_date, label")
      .eq("player_id", playerId)
      .lt("end_date", dateKey)
      .gte("end_date", earliestEnd)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return none;
    const row = data as { end_date: string; label: string | null };
    const day = daysBetween(row.end_date, dateKey);
    if (day < 1 || day > RETURN_DAYS) return none;
    return { in_return: true, day, total_days: RETURN_DAYS, ease_pct: Math.round(RETURN_RAMP[day - 1] * 100), label: row.label, break_end: row.end_date };
  } catch {
    return none;
  }
}

/** All break ranges for a client within [sinceIso, today] — used to exclude
 *  vacation days from streak / compliance (no penalty). */
export async function getClientBreakRanges(sb: SupabaseClient, playerId: string, sinceIso: string): Promise<BreakRange[]> {
  try {
    const { data } = await sb
      .from("client_breaks")
      .select("start_date, end_date, label")
      .eq("player_id", playerId)
      .gte("end_date", sinceIso)
      .order("start_date", { ascending: true });
    return ((data ?? []) as BreakRange[]);
  } catch {
    return [];
  }
}

/** True if `dateIso` falls within any of the given break ranges. */
export function dateInRanges(dateIso: string, ranges: BreakRange[]): boolean {
  return ranges.some((b) => b.start_date <= dateIso && dateIso <= b.end_date);
}
