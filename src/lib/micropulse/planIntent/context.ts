import "server-only";

/**
 * Plan intent — a light read of the team's situation for `recommend.ts`: the week's phase, matches around the
 * window, the coach's strength settings (reps a set per MD day, the weekday plan for weeks without a match), the
 * periodization model and how many players have a MAS test.
 *
 * Deliberately NOT `loadPeriodization` (too heavy for a card): the block's goal and phase come from the hub as
 * hints (it already has them on screen); a week's phase comes from `resolveWeekPhase` (saved phase, else the
 * season plan's). Every read is resilient: a failure leaves that part empty, never the whole read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWeekPhase } from "@/lib/micropulse/weekSetup/weekPhaseServer";
import { mondayOfWeek } from "@/lib/micropulse/weekSetup/weekPhase";
import { resolveMas } from "@/lib/micropulse/load/speedZonesData";
import { modelFromStored, type PeriodizationModel } from "@/lib/micropulse/periodization/periodizationModel";
import { sanitizeMdRepsPerSet } from "@/lib/micropulse/strengthProgramming/weekRule";
import { sanitizeNoMatchWeek } from "@/lib/micropulse/strengthProgramming/structures";
import { addDays, type BlockGoal, type PlanContext, type PlanPhase } from "./recommend";
import type { PlanScope } from "./vocabulary";

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const BLOCK_GOALS: BlockGoal[] = ["accum", "transmute", "realize"];
export const asBlockGoal = (v: unknown): BlockGoal | null => (BLOCK_GOALS as string[]).includes(String(v)) ? (v as BlockGoal) : null;

/** The hub's phase keys and the week's phase keys onto the three the rules use (playoffs = in season). */
export function asPlanPhase(v: unknown): PlanPhase | null {
  switch (String(v ?? "")) {
    case "preseason": return "preseason";
    case "offseason": return "offseason";
    case "inseason": case "competitive": case "playoffs": return "inseason";
    default: return null;
  }
}

export async function loadPlanContext(
  sb: SupabaseClient,
  teamId: string,
  input: { scope: PlanScope; start: string; weeks?: number | null; blockGoal?: unknown; phaseHint?: unknown },
): Promise<PlanContext> {
  const start = mondayOfWeek(isIso(input.start) ? input.start : new Date().toISOString().slice(0, 10));
  const weeks = input.scope === "week" ? 1 : Math.max(1, Math.min(12, Math.round(Number(input.weeks) || 4)));
  const from = addDays(start, -7);
  const to = addDays(start, weeks * 7 + 7);

  const [phase, matches, palette, model, squad, mas] = await Promise.all([
    (async (): Promise<PlanPhase | null> => {
      const hint = asPlanPhase(input.phaseHint);
      if (hint) return hint;
      try { return asPlanPhase((await resolveWeekPhase(sb, teamId, start)).phase); } catch { return null; }
    })(),
    (async () => {
      try {
        const { data } = await sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", to);
        return [...new Set(((data ?? []) as { match_date: string | null }[]).map((r) => String(r.match_date ?? "").slice(0, 10)).filter(isIso))].sort();
      } catch { return [] as string[]; }
    })(),
    (async () => {
      try {
        const { data } = await sb.from("team_strength_palette").select("no_match_week, md_reps_per_set").eq("team_id", teamId).maybeSingle();
        const row = data as { no_match_week?: unknown; md_reps_per_set?: unknown } | null;
        return { repsPerSet: sanitizeMdRepsPerSet(row?.md_reps_per_set), noMatchWeek: row?.no_match_week ? sanitizeNoMatchWeek(row.no_match_week) : null };
      } catch { return { repsPerSet: sanitizeMdRepsPerSet(null), noMatchWeek: null }; }
    })(),
    (async (): Promise<PeriodizationModel> => {
      try {
        const { data } = await sb.from("team_periodization_model").select("source, model").eq("team_id", teamId).maybeSingle();
        const row = data as { source?: string | null; model?: unknown } | null;
        return modelFromStored({ source: row?.source ?? null, days: Array.isArray(row?.model) ? row!.model : null });
      } catch { return modelFromStored(null); }
    })(),
    (async () => {
      try {
        const { data } = await sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true);
        return ((data ?? []) as { id: string }[]).map((r) => r.id);
      } catch { return [] as string[]; }
    })(),
    resolveMas(teamId, sb).catch(() => new Map<string, unknown>()),
  ]);

  const squadSet = new Set(squad);
  const withMas = [...mas.keys()].filter((id) => squadSet.has(id)).length;
  return {
    scope: input.scope,
    start,
    weeks,
    phase,
    blockGoal: input.scope === "block" ? asBlockGoal(input.blockGoal) : null,
    matchDates: matches,
    repsPerSet: palette.repsPerSet,
    noMatchWeek: palette.noMatchWeek,
    mas: { withMas, squad: squad.length },
    model,
  };
}
