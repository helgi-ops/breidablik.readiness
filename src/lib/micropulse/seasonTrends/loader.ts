import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClockGrid } from "../directionalSignature";
import { buildSeasonTrends, type SeasonSessionRow, type SeasonTrends } from "./index";

/**
 * Assemble a player's season HSR + IMA trends from the auto-synced daily load. Match-days
 * are flagged from match_schedule (the app's match source). Read-only; descriptive — never
 * touches the readiness colour. The peak-window HSR curve is NOT built here (not available).
 */
export async function loadSeasonTrends(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; sinceDays?: number },
): Promise<SeasonTrends> {
  const sinceDays = args.sinceDays ?? 300;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);

  const { data: rowsData } = await sb
    .from("player_external_load_daily")
    .select("date, velocity_band5_total_distance, velocity_band6_total_distance, hir_dist, high_speed_distance, ima_accel, ima_decel, accelerations, decelerations, accel_decel_efforts, ima_clock_gen2, session_duration_minutes")
    .eq("player_id", args.playerId)
    .gte("date", since)
    .order("date", { ascending: true });

  const { data: matchData } = await sb
    .from("match_schedule").select("match_date").eq("team_id", args.teamId).gte("match_date", since);
  const matchDates = new Set(((matchData ?? []) as Array<{ match_date: string | null }>).map((m) => m.match_date).filter(Boolean));

  type Raw = {
    date: string;
    velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null;
    hir_dist: number | null; high_speed_distance: number | null;
    ima_accel: number | null; ima_decel: number | null;
    accelerations: number | null; decelerations: number | null; accel_decel_efforts: number | null;
    ima_clock_gen2: ClockGrid | null; session_duration_minutes: number | null;
  };
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const rows: SeasonSessionRow[] = ((rowsData ?? []) as Raw[]).map((r) => {
    const v5 = num(r.velocity_band5_total_distance), v6 = num(r.velocity_band6_total_distance);
    // >19.8 km/h metres = V5 + V6 (this account's band-5 edge); else the hir / high-speed fallback.
    const hsrM = v5 != null || v6 != null ? (v5 ?? 0) + (v6 ?? 0) : num(r.hir_dist) ?? num(r.high_speed_distance);
    return {
      date: r.date,
      isMatch: matchDates.has(r.date),
      hsrM,
      accel: num(r.ima_accel) ?? num(r.accelerations),
      decel: num(r.ima_decel) ?? num(r.decelerations),
      accelDecelEfforts: num(r.accel_decel_efforts),
      durationMin: num(r.session_duration_minutes),
      clock: r.ima_clock_gen2 ?? null,
    };
  });

  return buildSeasonTrends(rows);
}
