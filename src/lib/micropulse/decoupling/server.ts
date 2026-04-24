import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPlayerBaselines } from "../baselines/queries";
import { flagDecoupling, type DecouplingResult, type SessionInputs } from "./index";

/**
 * Compute decoupling for a player on a given session date by joining
 * session_rpe_entries × player_external_load_daily and looking up the
 * athlete's baselines. Returns null when no paired session exists.
 */
export async function getDecouplingForSession(
  playerId: string,
  sessionDate: string,
): Promise<DecouplingResult | null> {
  const sb = getSupabaseAdmin();

  const [{ data: rpeRow }, { data: extRow }] = await Promise.all([
    sb
      .from("session_rpe_entries")
      .select("rpe, duration_minutes")
      .eq("player_id", playerId)
      .eq("session_date", sessionDate)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("player_external_load_daily")
      .select("total_distance, avg_heart_rate, player_load")
      .eq("player_id", playerId)
      .eq("date", sessionDate)
      .maybeSingle(),
  ]);

  if (!rpeRow || !extRow) return null;

  const inputs: SessionInputs = {
    rpe: (rpeRow as any).rpe ?? null,
    durationMinutes: (rpeRow as any).duration_minutes ?? null,
    totalDistanceMetres: (extRow as any).total_distance ?? null,
    avgHeartRate: (extRow as any).avg_heart_rate ?? null,
    playerLoad: (extRow as any).player_load ?? null,
  };

  const baselineMap = await getPlayerBaselines(playerId);
  return flagDecoupling(inputs, {
    rpePerKm: baselineMap.get("decoupling.rpe_per_km") ?? null,
    hrPerPlayerLoad: baselineMap.get("decoupling.hr_per_player_load") ?? null,
  });
}
