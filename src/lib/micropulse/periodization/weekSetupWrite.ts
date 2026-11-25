/**
 * Write week skeletons into Week Setup (week_setups + week_plans) — the tables the Week Setup grid reads.
 * One writer shared by the hub's "Apply to Week Setup" / day editor and the pre-season proposal's accept,
 * so both produce the same rows. Declared team breaks own their days: a break day is always written OFF.
 * Server-only (service-role client, team-scoped by the caller).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type WeekSetupDay = { day_index: number; day_date: string; day_type: string; focus?: string | null; day_intent?: string | null };
export type WeekSetupWeek = {
  week_start: string; system_key: string; intensity_target: number; notes?: string | null; days: WeekSetupDay[];
  /** false = keep an existing week_setups row as it is (only the day rows are written). Default true. */
  upsertSetup?: boolean;
};

// Mirror week-setup/apply's load scale so week_plans stays consistent with the Week Setup grid (1–9).
export function computePlannedLoad(systemKey: string, dayType: string, intensityTarget: number): number {
  if (dayType === "OFF") return 1;
  if (dayType === "RECOVERY") return Math.max(2, Math.min(4, intensityTarget - 3));
  if (dayType === "GAME") return 9;
  switch (systemKey) {
    case "RECOVERY": return 3;
    case "POWER": return Math.max(6, Math.min(8, intensityTarget));
    case "STRENGTH": return Math.max(7, Math.min(9, intensityTarget + 1));
    default: return Math.max(5, Math.min(8, intensityTarget));
  }
}

/** Returns an error message, or null on success. */
export async function writeWeekSetup(sb: SupabaseClient, teamId: string, weeks: WeekSetupWeek[]): Promise<string | null> {
  const earliest = weeks.map((w) => w.week_start).filter(Boolean).sort()[0];
  const { data: breakRows } = earliest
    ? await sb.from("team_breaks").select("start_date, end_date").eq("team_id", teamId).gte("end_date", earliest)
    : { data: [] };
  const breaks = (breakRows ?? []) as Array<{ start_date: string; end_date: string }>;
  const onBreak = (d: string) => breaks.some((b) => b.start_date <= d && d <= b.end_date);
  for (const wk of weeks) {
    if (!wk?.week_start || !wk?.system_key || wk.intensity_target == null) continue;
    if (wk.upsertSetup !== false) {
      const { error: sErr } = await sb.from("week_setups").upsert({ team_id: teamId, week_start: wk.week_start, system_key: wk.system_key, intensity_target: wk.intensity_target, notes: wk.notes ?? null }, { onConflict: "team_id,week_start" });
      if (sErr) return sErr.message;
    }
    const rows = (wk.days ?? []).filter((d) => d?.day_date && Number.isFinite(d.day_index)).map((d) => {
      const dt = onBreak(d.day_date) ? "OFF" : (d.day_type || "TRAIN").toUpperCase();
      return {
        team_id: teamId, week_start: wk.week_start, day_date: d.day_date, day_index: d.day_index,
        day_type: dt, focus: onBreak(d.day_date) ? "OFF" : (d.focus ?? null),
        planned_load: computePlannedLoad(wk.system_key, dt, wk.intensity_target),
        system_key: wk.system_key, notes: null, day_intent: onBreak(d.day_date) ? null : (d.day_intent ?? null),
      };
    });
    if (rows.length) { const { error: pErr } = await sb.from("week_plans").upsert(rows, { onConflict: "team_id,day_date" }); if (pErr) return pErr.message; }
  }
  return null;
}
