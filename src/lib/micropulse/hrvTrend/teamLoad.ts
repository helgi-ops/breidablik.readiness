/**
 * Team-wide HRV recovery-trend loader (server helper).
 *
 * Reads morning wearable HRV (wearable_daily_data — Whoop/Garmin morning RMSSD)
 * for the team's active players and runs the pure `computeHrvRecoveryTrend` engine
 * per player. Dormant until wearables are connected (no rows → empty). READ-ONLY /
 * ADVISORY — never reads-as or writes the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { computeHrvRecoveryTrend, type HrvDaily, type HrvRecoveryRead } from "./index";

const HRV_WINDOW_DAYS = 35;

export type TeamHrvRead = HrvRecoveryRead & { playerId: string; playerName: string };

export async function loadTeamHrvReads(sb: SupabaseClient, teamId: string): Promise<TeamHrvRead[]> {
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) return [];
  const nameById = new Map(roster.map((p) => [p.id, p.full_name ?? "Player"]));

  const start = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - HRV_WINDOW_DAYS); return d.toISOString().slice(0, 10); })();
  const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
    sb.from("wearable_daily_data")
      .select("player_id, measurement_date, hrv_rmssd_ms, resting_hr_bpm")
      .in("player_id", roster.map((p) => p.id))
      .gte("measurement_date", start)
      .order("measurement_date", { ascending: true }).range(from, to));
  if (rows.length === 0) return [];

  const byPlayer = new Map<string, HrvDaily[]>();
  for (const r of rows) {
    const pid = String(r.player_id ?? ""); const date = String(r.measurement_date ?? "").slice(0, 10);
    const rmssd = r.hrv_rmssd_ms != null && Number.isFinite(Number(r.hrv_rmssd_ms)) ? Number(r.hrv_rmssd_ms) : null;
    if (!pid || !date || rmssd == null) continue;
    const arr = byPlayer.get(pid) ?? []; arr.push({ date, rmssd, restingHr: r.resting_hr_bpm != null ? Number(r.resting_hr_bpm) : null }); byPlayer.set(pid, arr);
  }

  const out: TeamHrvRead[] = [];
  for (const [pid, daily] of byPlayer) {
    const read = computeHrvRecoveryTrend(daily);
    out.push({ ...read, playerId: pid, playerName: nameById.get(pid) ?? "Player" });
  }
  return out;
}
