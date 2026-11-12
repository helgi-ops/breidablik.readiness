import "server-only";

/**
 * Team-wide near-top-speed read for the Today coach-signal chip (`near_max_exposure`).
 *
 * One paged read of the roster's GPS rows for the last 12 months (by player id, so rows from a previous club
 * count — top speed is the player's own), plus the latest sprint test and the open injury rows. Returns ONLY
 * flagged players: more than 10 days ("due") or 21 days ("long_gap") since a day at ≥90% of top speed.
 *
 * Not flagged, by design: goalkeepers; players marked injured / in rehab / in return-to-train; players with
 * no measured GPS day in the last 10 days (away, off-season, indoors only) — unknown is not overdue.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour, load target or daily decision.
 * Service-role read (tokenless → cron-safe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { positionGroup } from "@/lib/micropulse/periodization";
import type { NearMaxLite } from "@/lib/micropulse/coachSignals";
import { computeNearMaxExposure, mergeSpeedDays, LOOKBACK_DAYS, type SpeedRow } from "./index";

/** GPS feeds that carry a real top speed (imputed / seeded rows are not measurements). */
const GPS_SOURCES = ["catapult", "manual", "titan", "kinexon", "wimu"];
/** `player_injuries.status` values that mean "not in full training". */
const UNAVAILABLE_STATUS = ["injured", "rehabilitation", "rtp_training"];

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function loadTeamNearMaxSignals(sb: SupabaseClient, teamId: string, todayIso: string): Promise<NearMaxLite[]> {
  const { data: players } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const roster = ((players ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)
    .filter((p) => positionGroup(p.position).key !== 0); // goalkeepers rarely sprint flat out
  if (roster.length === 0) return [];
  const ids = roster.map((p) => p.id);

  const from = new Date(`${todayIso}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  const fromIso = from.toISOString().slice(0, 10);

  const [rows, tests, injuries] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((a, b) =>
      sb.from("player_external_load_daily")
        .select("player_id, date, max_velocity, max_vel, player_load, total_distance")
        .in("player_id", ids).in("source", GPS_SOURCES)
        .gte("date", fromIso).lte("date", todayIso)
        .order("date", { ascending: true }).order("player_id", { ascending: true })
        .range(a, b)),
    sb.from("player_fitness_test").select("player_id, test_date, result_value")
      .in("player_id", ids).eq("test_type", "sprint_max").order("test_date", { ascending: false }).limit(2000),
    sb.from("player_injuries").select("player_id, status").in("player_id", ids).in("status", UNAVAILABLE_STATUS).limit(2000),
  ]);

  const byPlayer = new Map<string, SpeedRow[]>();
  for (const r of rows) {
    const pid = String(r.player_id ?? "");
    if (!pid) continue;
    const arr = byPlayer.get(pid) ?? [];
    arr.push({
      date: String(r.date ?? "").slice(0, 10),
      maxVelocity: num(r.max_velocity), maxVel: num(r.max_vel),
      playerLoad: num(r.player_load), totalDistance: num(r.total_distance),
    });
    byPlayer.set(pid, arr);
  }

  const testBy = new Map<string, number>();
  for (const t of (tests.data ?? []) as Array<{ player_id: string; result_value: number | null }>) {
    const v = num(t.result_value);
    if (t.player_id && v != null && v > 0 && !testBy.has(t.player_id)) testBy.set(t.player_id, v); // latest first
  }
  const unavailable = new Set(((injuries.data ?? []) as Array<{ player_id: string }>).map((i) => i.player_id));

  const out: NearMaxLite[] = [];
  for (const p of roster) {
    if (unavailable.has(p.id)) continue;
    const read = computeNearMaxExposure({
      days: mergeSpeedDays(byPlayer.get(p.id) ?? []),
      todayIso,
      sprintTestKmh: testBy.get(p.id) ?? null,
    });
    if (!read || read.level === "ok") continue;
    out.push({
      playerId: p.id,
      name: (p.full_name ?? "").trim() || "—",
      level: read.level,
      daysSince: read.daysSince,
      lastKmh: read.lastKmh,
      refKmh: read.ref.kmh,
      refSource: read.ref.source,
      targetKmh: read.targetKmh,
      confidence: read.confidence,
    });
  }
  return out;
}
