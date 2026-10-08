/**
 * Team-wide wearable-recovery loader (server helper).
 *
 * Reads wearable_daily_data (HRV / resting HR / recovery score + Garmin stress /
 * body battery) for the team's active players and runs the SAME pure engine the
 * Signal Pack + the player/coach cards use (buildWearableRecoveryInput →
 * wearableRecoveryContributor). Produces one minimal "flag" per player for the
 * proactive coach signal (Today chips + morning digest). Dormant until wearables
 * are connected (no rows → empty). READ-ONLY / ADVISORY — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { buildWearableRecoveryInput, wearableRecoveryContributor, type WearableDailyRow } from "@/lib/micropulse/signalPack/wearableRecovery";
import type { WearableRecoveryReadLite } from "@/lib/micropulse/coachSignals";

const WINDOW_DAYS = 42; // own-norm baseline (matches the Signal Pack / card)
const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

export async function loadTeamWearableRecovery(sb: SupabaseClient, teamId: string): Promise<WearableRecoveryReadLite[]> {
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) return [];
  const nameById = new Map(roster.map((p) => [p.id, p.full_name ?? "Player"]));

  const start = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - WINDOW_DAYS); return d.toISOString().slice(0, 10); })();
  const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
    sb.from("wearable_daily_data")
      .select("player_id, measurement_date, hrv_rmssd_ms, resting_hr_bpm, provider_recovery_score, stress_avg, body_battery")
      .in("player_id", roster.map((p) => p.id))
      .gte("measurement_date", start)
      .order("measurement_date", { ascending: true }).range(from, to));
  if (rows.length === 0) return [];

  const byPlayer = new Map<string, WearableDailyRow[]>();
  for (const r of rows) {
    const pid = String(r.player_id ?? ""); const d = String(r.measurement_date ?? "").slice(0, 10);
    if (!pid || !d) continue;
    const arr = byPlayer.get(pid) ?? [];
    arr.push({ d, hrv: num(r.hrv_rmssd_ms), rhr: num(r.resting_hr_bpm), rec: num(r.provider_recovery_score), stress: num(r.stress_avg), body: num(r.body_battery) });
    byPlayer.set(pid, arr);
  }

  const out: WearableRecoveryReadLite[] = [];
  for (const [pid, daily] of byPlayer) {
    const input = buildWearableRecoveryInput(daily, "coach");
    if (!input) continue;
    const c = wearableRecoveryContributor(input);
    if (!c) continue;
    out.push({
      playerId: pid,
      name: nameById.get(pid) ?? "Player",
      flagged: c.flagged,
      severity: c.severity,
      why: c.why,
      counterfactual: c.counterfactual,
      confidence: c.confidence,
    });
  }
  return out;
}
