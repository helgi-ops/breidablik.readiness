import "server-only";
/**
 * Server read for the week rules (brief §5): the saved week (week_plans) with three days either side, the fixtures
 * around it, the week's season phase (resolveWeekPhase, the one phase rule) and the coach's newest "keep the plan"
 * for the week. Read on Week setup's Apply and by Build Session's week plan; never in a cron. Never reads or writes
 * the readiness colour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/micropulse/goalPlan/today";
import { resolveWeekPhase } from "./weekPhaseServer";
import {
  THREE_IN_A_ROW_RULE, WEEK_RULE_LOG_SOURCE, checkThreeInARow, dayKindOf, runSignature,
  type ThreeInARowCheck, type WeekRuleDay,
} from "./weekRules";

/** Days either side of the week that count for a run. */
const EDGE_DAYS = 3;

export type WeekRuleKeep = { reason: string | null; at: string };

export type WeekRuleContext = {
  weekStart: string;
  phase: string | null;
  /** Match dates from a week before to a week after. */
  matchDates: string[];
  /** The saved days before and after the week (count only; the fix never touches them). */
  before: WeekRuleDay[];
  after: WeekRuleDay[];
};

export type WeekRuleRead = {
  context: WeekRuleContext;
  /** The saved week's check. */
  check: ThreeInARowCheck;
  /** The coach kept this exact run (same days) with a reason. Null = not kept, or the week changed since. */
  kept: WeekRuleKeep | null;
};

type PlanRow = { day_date: string; day_type: string | null };

export async function loadWeekRuleContext(sb: SupabaseClient, teamId: string, weekStart: string): Promise<{ ctx: WeekRuleContext; week: WeekRuleDay[] }> {
  const lo = addDays(weekStart, -EDGE_DAYS), hi = addDays(weekStart, 6 + EDGE_DAYS);
  const [{ data: plans }, { data: fx }, phase] = await Promise.all([
    sb.from("week_plans").select("day_date, day_type").eq("team_id", teamId).gte("day_date", lo).lte("day_date", hi),
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", addDays(weekStart, -7)).lte("match_date", addDays(weekStart, 13)),
    resolveWeekPhase(sb, teamId, weekStart).catch(() => null),
  ]);
  const byDate = new Map(((plans ?? []) as PlanRow[]).map((r) => [r.day_date, r.day_type]));
  const dayAt = (iso: string, editable: boolean): WeekRuleDay => ({ date: iso, kind: dayKindOf(byDate.get(iso)), editable });
  const matchDates = [...new Set(((fx ?? []) as Array<{ match_date: string }>).map((f) => f.match_date))].sort();
  return {
    ctx: {
      weekStart,
      phase: phase?.phase ?? null,
      matchDates,
      before: Array.from({ length: EDGE_DAYS }, (_, i) => dayAt(addDays(lo, i), false)),
      after: Array.from({ length: EDGE_DAYS }, (_, i) => dayAt(addDays(weekStart, 7 + i), false)),
    },
    week: Array.from({ length: 7 }, (_, i) => dayAt(addDays(weekStart, i), true)),
  };
}

/** The check for a week (the saved days unless `week` is given), with the coach's keep when it still matches. */
export async function loadWeekRuleRead(sb: SupabaseClient, teamId: string, weekStart: string): Promise<WeekRuleRead> {
  const { ctx, week } = await loadWeekRuleContext(sb, teamId, weekStart);
  const check = checkThreeInARow({ days: [...ctx.before, ...week, ...ctx.after], matchDates: ctx.matchDates, phase: ctx.phase });
  let kept: WeekRuleKeep | null = null;
  if (!check.ok) {
    const { data } = await sb.from("session_fit_override_log")
      .select("reason, md_day, created_at")
      .eq("team_id", teamId).eq("model_source", WEEK_RULE_LOG_SOURCE).eq("session_date", weekStart)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const row = data as { reason: string | null; md_day: string | null; created_at: string } | null;
    if (row && row.md_day === runSignature(check)) kept = { reason: row.reason, at: row.created_at };
  }
  return { context: ctx, check, kept };
}

/** Logs the coach's "keep the plan" (append-only; the plan is never blocked either way). */
export async function logWeekRuleKeep(sb: SupabaseClient, args: { teamId: string; weekStart: string; check: ThreeInARowCheck; reason: string; userId: string | null }) {
  return sb.from("session_fit_override_log").insert({
    team_id: args.teamId,
    session_date: args.weekStart,
    md_day: runSignature(args.check),
    model_source: WEEK_RULE_LOG_SOURCE,
    verdict: "kept",
    warnings: [{ kind: THREE_IN_A_ROW_RULE, level: "advice", off: (args.check.fix?.off ?? []).map((d) => d.date) }],
    reason: args.reason.slice(0, 2000),
    created_by: args.userId,
  });
}
