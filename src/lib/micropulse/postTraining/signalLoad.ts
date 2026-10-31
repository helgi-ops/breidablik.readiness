import "server-only";

/**
 * Tokenless team compute for the post-training (actual-vs-plan) coach SIGNAL.
 *
 * Mirrors `/api/coach/post-training` GET but takes an admin Supabase client +
 * teamId directly — the "planned" side comes from `buildLoadPlanForTeam` (already
 * tokenless, the shared plan engine) instead of an HTTP self-fetch to
 * /api/coach/load-plan. So the Today signals route and the nightly cron derive the
 * session-vs-plan chip without a user session. Returns only the slice
 * `derivePostTrainingSignal` reads.
 *
 * READ-ONLY / ADVISORY — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlannedVsActual, type ActualKpis, type PlanForCompare } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { buildLoadPlanForTeam } from "@/lib/micropulse/loadPlan/forTeam";

export type PostTrainingSignalInput = {
  ok: boolean;
  sessionDate: string | null;
  plannedVsActual: ReturnType<typeof buildPlannedVsActual> | null;
};

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function loadPostTrainingForSignal(sb: SupabaseClient, teamId: string, today: string): Promise<PostTrainingSignalInput> {
  const { data: players } = await sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true);
  const playerIds = (players ?? []).map((p) => String((p as { id: string }).id));
  if (playerIds.length === 0) return { ok: true, sessionDate: null, plannedVsActual: null };

  // Most recent captured session at/before today.
  const { data: lastRow } = await sb.from("player_external_load_daily")
    .select("date").in("player_id", playerIds).in("source", ["catapult", "manual", "titan", "kinexon"])
    .lte("date", today).order("date", { ascending: false }).limit(1).maybeSingle();
  const sessionDate = (lastRow as { date?: string } | null)?.date ?? null;
  if (!sessionDate) return { ok: true, sessionDate: null, plannedVsActual: null };

  const { data: gpsRows } = await sb.from("player_external_load_daily")
    .select("player_id, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band58_total_distance, high_speed_distance, sprint_distance, accel_decel_efforts, ima_accel, ima_decel, jumps, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low")
    .in("player_id", playerIds).eq("date", sessionDate);
  const actualById = new Map<string, ActualKpis>();
  for (const r of (gpsRows ?? []) as Array<Record<string, unknown>>) {
    const z = (v: unknown) => num(v) ?? 0;
    const cod = z(r.ima_cod_left_high) + z(r.ima_cod_left_medium) + z(r.ima_cod_left_low) +
      z(r.ima_cod_right_high) + z(r.ima_cod_right_medium) + z(r.ima_cod_right_low);
    actualById.set(String(r.player_id), {
      totalDistance: num(r.total_distance), playerLoad: num(r.total_player_load),
      hsr: num(r.velocity_band5_total_distance) || num(r.high_speed_distance),
      sprint: num(r.velocity_band6_total_distance) || num(r.sprint_distance),
      accel: num(r.accel_b2_3_tot_effs_gen2), decel: num(r.decel_b2_3_tot_effs_gen2),
      efforts: num(r.accel_decel_efforts), ima: num(r.ima_fr_band58_total_distance),
      imaAccel: num(r.ima_accel), imaDecel: num(r.ima_decel), imaCod: cod || null, jumps: num(r.jumps),
    });
  }
  const mean = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null && x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const vals = Array.from(actualById.values());
  const teamActual: ActualKpis = {
    totalDistance: mean(vals.map((v) => v.totalDistance)), playerLoad: mean(vals.map((v) => v.playerLoad)),
    hsr: mean(vals.map((v) => v.hsr)), sprint: mean(vals.map((v) => v.sprint)),
    accel: mean(vals.map((v) => v.accel)), decel: mean(vals.map((v) => v.decel)),
    efforts: mean(vals.map((v) => v.efforts)), ima: mean(vals.map((v) => v.ima)),
    imaAccel: mean(vals.map((v) => v.imaAccel)), imaDecel: mean(vals.map((v) => v.imaDecel)),
    imaCod: mean(vals.map((v) => v.imaCod)), jumps: mean(vals.map((v) => v.jumps)),
  };

  // Planned side — the shared tokenless plan engine for the same session date.
  let plan: PlanForCompare | null = null;
  try {
    const built = await buildLoadPlanForTeam(sb, teamId, sessionDate, { mdDay: null, dayType: null, focus: null });
    plan = (built?.plan ?? null) as PlanForCompare | null;
  } catch { /* no plan → comparison reports no-plan → signal stays steady */ }

  return { ok: true, sessionDate, plannedVsActual: buildPlannedVsActual(plan, teamActual, actualById) };
}
