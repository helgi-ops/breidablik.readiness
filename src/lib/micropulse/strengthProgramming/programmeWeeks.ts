import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWeekPhase } from "@/lib/micropulse/weekSetup/weekPhaseServer";
import type { DeliveryWeek } from "./deliveryView";

/**
 * The team's Custom Programme per week (2026-11-25) — for the Meso pages and Micro in standard mode, so they show the
 * session the players get. Resolved the way the player's Today and the standard send resolve it
 * (customProgrammeActive.ts / PlayerClient.fetchStage4Plan):
 *   - the week's season phase: the coach's saved one, else the season plan's, else in season (resolveWeekPhase);
 *   - the team table: a dated block that covers the week (the one covering Monday, else the newest overlapping one),
 *     else the recurring set (active first, newest first); the shared `microdose_templates` default never counts;
 *   - the rows: the table's GREEN rows for the team and that phase, title per md_day (MD day / weekday code / GENERIC).
 * Per-player override windows are not shown (team view). Read-only; any failure → no programme for the week.
 */

const DEFAULT_TABLE = "microdose_templates";

type SetRow = { set_name: string | null; table_name: string; start_date: string | null; end_date: string | null; is_active: boolean | null; created_at: string | null };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The team table for a week: a block covering Monday, else the newest block overlapping the week, else the recurring set. */
export function tableForWeek(sets: SetRow[], weekStart: string): SetRow | null {
  const weekEnd = addDays(weekStart, 6);
  const blocks = sets.filter((s) => s.start_date && s.end_date).sort((a, b) => (b.start_date! < a.start_date! ? -1 : b.start_date! > a.start_date! ? 1 : 0));
  const pick = blocks.find((s) => s.start_date! <= weekStart && weekStart <= s.end_date!)
    ?? blocks.find((s) => s.start_date! <= weekEnd && weekStart <= s.end_date!)
    ?? sets.filter((s) => !s.start_date)
      .sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0]
    ?? null;
  return pick && pick.table_name !== DEFAULT_TABLE ? pick : null;
}

/** Title per md_day from the programme's rows (GREEN = the full session the player gets on a normal day). */
export function slotsFromRows(rows: Array<{ md_day?: string | null; readiness_level?: string | null; title?: string | null }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.readiness_level !== "GREEN" || !r.md_day || !r.title?.trim()) continue;
    if (!(r.md_day in out)) out[r.md_day] = r.title.trim();
  }
  return out;
}

export async function loadProgrammeWeeks(sb: SupabaseClient, teamId: string, weekStarts: string[]): Promise<DeliveryWeek[]> {
  if (!weekStarts.length) return [];
  const [phases, setsRes] = await Promise.all([
    Promise.all(weekStarts.map((ws) => resolveWeekPhase(sb, teamId, ws).then((r) => r.phase ?? "inseason", () => "inseason"))),
    sb.from("custom_template_sets").select("set_name, table_name, start_date, end_date, is_active, created_at").eq("team_id", teamId).is("player_id", null),
  ]);
  const sets = ((setsRes.data ?? []) as SetRow[]).filter((s) => /^[a-z][a-z0-9_]*$/.test(String(s.table_name ?? "")));

  const picks = weekStarts.map((ws) => tableForWeek(sets, ws));
  // One read per (table, phase) the weeks need.
  const keys = new Set<string>();
  picks.forEach((p, i) => { if (p) keys.add(`${p.table_name}|${phases[i]}`); });
  const slotsByKey = new Map<string, Record<string, string>>();
  await Promise.all([...keys].map(async (k) => {
    const [table, phase] = k.split("|");
    try {
      const { data, error } = await sb.rpc("read_custom_template_records", { p_table_name: table, p_team_id: teamId, p_season_phase: phase });
      slotsByKey.set(k, error ? {} : slotsFromRows((data ?? []) as Array<{ md_day?: string; readiness_level?: string; title?: string }>));
    } catch {
      slotsByKey.set(k, {});
    }
  }));

  return weekStarts.map((ws, i) => {
    const p = picks[i];
    return {
      weekStart: ws,
      phase: phases[i],
      programme: p ? { setName: p.set_name ?? p.table_name, tableName: p.table_name } : null,
      slots: p ? slotsByKey.get(`${p.table_name}|${phases[i]}`) ?? {} : {},
    };
  });
}
