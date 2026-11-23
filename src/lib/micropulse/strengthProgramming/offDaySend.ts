/**
 * A coach's hand send on a day the week plan marks OFF (coach's call 2026-11-23, contradiction 11).
 *
 * The 09:00 automatic send never sends on an OFF day. A hand send does: the coach chose it, and the coach decides last.
 * It is not silent any more:
 *   - one-day sends (per player, whole squad): the session is built for the day's place in the match week (the engine
 *     has no session for OFF) and carries a `DAY_RULE_COACH_DAY_OFF` line saying the day is off in the week plan and
 *     the session went out because the coach chose to send it. The response says `offDay: true`.
 *   - the 4-week block: dates that are OFF in the week plan when the block is sent are left out and named.
 * Never reads or writes the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_RULE_COACH_DAY_OFF } from "./dayRules";
import type { StrengthSession } from "./types";

/** The dates (of `dates`) the team's week plan marks OFF. A date with no row is not OFF. */
export async function offDatesInWeekPlan(sb: SupabaseClient, teamId: string | null | undefined, dates: string[]): Promise<Set<string>> {
  if (!teamId || !dates.length) return new Set();
  const { data, error } = await sb.from("week_plans").select("day_date, day_type").eq("team_id", teamId).in("day_date", dates);
  if (error) return new Set();
  return new Set(((data ?? []) as Array<{ day_date: string; day_type: string | null }>)
    .filter((r) => String(r.day_type ?? "").trim().toUpperCase() === "OFF")
    .map((r) => String(r.day_date).slice(0, 10)));
}

/** Adds the "day off in the week plan, sent because the coach chose to" line (once). */
export function withOffDayLine(session: StrengthSession): StrengthSession {
  if (session.appliedAdaptations.some((a) => a.ruleId === DAY_RULE_COACH_DAY_OFF)) return session;
  return {
    ...session,
    appliedAdaptations: [...session.appliedAdaptations, {
      ruleId: DAY_RULE_COACH_DAY_OFF,
      triggerEN: "Today is a day off in the week plan",
      triggerIS: "Dagurinn er frídagur í vikuplaninu",
      actionEN: `Sent because the coach chose to send it; built as ${session.mdContext} (the day's place in the match week). The automatic send never sends on a day off.`,
      actionIS: `Sent því þjálfarinn valdi að senda; sett upp sem ${session.mdContext} (staða dagsins í leikvikunni). Sjálfvirka sendingin sendir aldrei á frídegi.`,
      evidence: "The coach decides last (MicroPulse rule). The week plan's OFF days come from Week setup.",
    }],
  };
}
