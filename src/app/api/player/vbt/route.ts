import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { computeExercisePBs, computeTodayVsPB, computeLoadBreakdowns, type VbtSetRow } from "@/lib/micropulse/vbtReadiness/personalBest";

export const runtime = "nodejs";

/**
 * GET /api/player/vbt?date=YYYY-MM-DD
 *
 * Returns VBT strength data for the authenticated player:
 * - PB records per exercise
 * - Today's performance vs PB
 * - Recent session history
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    // Fetch all VBT sessions for this player
    const { data: rawSets } = await sb
      .from("gymaware_vbt_sessions")
      .select("session_date, exercise_name, load_kg, reps, mean_velocity, peak_velocity, mean_power, peak_power")
      .eq("player_id", playerId)
      .order("session_date", { ascending: false });

    const allSets: VbtSetRow[] = (rawSets ?? []).map((row: Record<string, unknown>) => ({
      session_date: String(row.session_date ?? ""),
      exercise_name: String(row.exercise_name ?? ""),
      load_kg: typeof row.load_kg === "number" ? row.load_kg : null,
      reps: typeof row.reps === "number" ? row.reps : null,
      mean_velocity: typeof row.mean_velocity === "number" ? row.mean_velocity : null,
      peak_velocity: typeof row.peak_velocity === "number" ? row.peak_velocity : null,
      mean_power: typeof row.mean_power === "number" ? row.mean_power : null,
      peak_power: typeof row.peak_power === "number" ? row.peak_power : null,
    }));

    const todaySets = allSets.filter((s) => s.session_date === date);
    const historySets = allSets.filter((s) => s.session_date !== date);
    const exercises = computeExercisePBs(allSets);
    const todayComparisons = computeTodayVsPB(todaySets, historySets);

    // Build PB lookup: per exercise + load → best mean velocity
    const pbByExerciseLoad = new Map<string, number>();
    for (const s of allSets) {
      const key = s.exercise_name.trim();
      if (!key || s.load_kg == null || s.mean_velocity == null) continue;
      const mapKey = `${key}|${s.load_kg}`;
      const existing = pbByExerciseLoad.get(mapKey) ?? 0;
      if (s.mean_velocity > existing) {
        pbByExerciseLoad.set(mapKey, s.mean_velocity);
      }
    }

    // Build recent history (last 10 unique session dates) — all sets per day
    const sessionDates = [...new Set(allSets.map((s) => s.session_date))].slice(0, 10);
    const recentHistory = sessionDates.map((d) => {
      const daySets = allSets.filter((s) => s.session_date === d);
      const sets = daySets
        .filter((s) => s.exercise_name.trim() && s.mean_velocity != null)
        .map((s) => {
          const exerciseName = s.exercise_name.trim();
          const loadKey = `${exerciseName}|${s.load_kg}`;
          const pbVelocity = pbByExerciseLoad.get(loadKey) ?? null;
          let pbDiffPct: number | null = null;
          let isPB = false;
          if (pbVelocity != null && s.mean_velocity != null && pbVelocity > 0) {
            pbDiffPct = ((s.mean_velocity - pbVelocity) / pbVelocity) * 100;
            isPB = s.mean_velocity >= pbVelocity;
          }
          return {
            exerciseName,
            meanVelocity: s.mean_velocity!,
            loadKg: s.load_kg,
            peakPower: s.peak_power,
            reps: s.reps,
            pbVelocityAtLoad: pbVelocity,
            pbDiffPct,
            isPB,
          };
        });
      return { date: d, sets };
    });

    const loadBreakdowns = computeLoadBreakdowns(allSets);

    // Chart data: per exercise, all data points for load-velocity scatter
    const chartData: Record<string, Array<{ load: number; velocity: number; date: string }>> = {};
    for (const s of allSets) {
      const key = s.exercise_name.trim();
      if (!key || s.load_kg == null || s.mean_velocity == null || s.load_kg <= 0) continue;
      if (!chartData[key]) chartData[key] = [];
      chartData[key].push({ load: s.load_kg, velocity: s.mean_velocity, date: s.session_date });
    }

    // Velocity trend: per exercise, best velocity per session date (chronological)
    const velocityTrend: Record<string, Array<{ date: string; velocity: number; loadKg: number | null }>> = {};
    for (const s of allSets) {
      const key = s.exercise_name.trim();
      if (!key || s.mean_velocity == null) continue;
      if (!velocityTrend[key]) velocityTrend[key] = [];
      velocityTrend[key].push({ date: s.session_date, velocity: s.mean_velocity, loadKg: s.load_kg });
    }
    // Aggregate: best velocity per date per exercise, sorted chronologically
    for (const key of Object.keys(velocityTrend)) {
      const byDate = new Map<string, { velocity: number; loadKg: number | null }>();
      for (const p of velocityTrend[key]) {
        const existing = byDate.get(p.date);
        if (!existing || p.velocity > existing.velocity) {
          byDate.set(p.date, { velocity: p.velocity, loadKg: p.loadKg });
        }
      }
      velocityTrend[key] = Array.from(byDate.entries())
        .map(([d, v]) => ({ date: d, velocity: v.velocity, loadKg: v.loadKg }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    return NextResponse.json({
      date,
      exercises,
      todayComparisons,
      loadBreakdowns,
      recentHistory,
      chartData,
      velocityTrend,
      totalSets: allSets.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
