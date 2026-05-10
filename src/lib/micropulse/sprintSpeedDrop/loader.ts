import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSprintDrop,
  type DailySprint,
  type SprintDropPayload,
} from "./index";

/**
 * Pull the last 28 days of max_velocity + HSR for `playerId` ending on
 * `todayIso`, then compute the sprint-drop payload.
 *
 * NOTE on column duality: API sync writes to `max_velocity`, CSV/PDF upload
 * writes to `max_vel`. We coalesce both via two columns then prefer max(.,.).
 * Both are in m/s.
 */
export async function loadSprintDrop(
  sb: SupabaseClient,
  args: { playerId: string; todayIso: string },
): Promise<SprintDropPayload> {
  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await sb
    .from("player_external_load_daily")
    .select("date, max_velocity, max_vel, high_speed_distance")
    .eq("player_id", args.playerId)
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", args.todayIso)
    .order("date", { ascending: true });

  if (error) {
    return {
      referenceMs: null,
      todayMs: null,
      dropPct: null,
      band: "INSUFFICIENT_DATA",
      refSessionCount: 0,
    };
  }

  const rows: DailySprint[] = ((data ?? []) as Array<{
    date: string;
    max_velocity: number | null;
    max_vel: number | null;
    high_speed_distance: number | null;
  }>).map((r) => {
    const a = typeof r.max_velocity === "number" && Number.isFinite(r.max_velocity) ? r.max_velocity : null;
    const b = typeof r.max_vel === "number" && Number.isFinite(r.max_vel) ? r.max_vel : null;
    let mv: number | null = null;
    if (a != null && b != null) mv = Math.max(a, b);
    else mv = a ?? b;
    return {
      date: r.date,
      maxVelocityMs: mv,
      hsrM: typeof r.high_speed_distance === "number" && Number.isFinite(r.high_speed_distance)
        ? r.high_speed_distance
        : null,
    };
  });

  return computeSprintDrop(rows, args.todayIso);
}

/**
 * Batch loader — same logic but for many players in a single round-trip.
 * Returns a Map<playerId, SprintDropPayload>. Used by the team decisions
 * page to enrich every row at once.
 */
export async function loadSprintDropBatch(
  sb: SupabaseClient,
  args: { playerIds: ReadonlyArray<string>; todayIso: string },
): Promise<Map<string, SprintDropPayload>> {
  const result = new Map<string, SprintDropPayload>();
  if (args.playerIds.length === 0) return result;

  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await sb
    .from("player_external_load_daily")
    .select("player_id, date, max_velocity, max_vel, high_speed_distance")
    .in("player_id", args.playerIds as string[])
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", args.todayIso)
    .order("date", { ascending: true });

  if (error) {
    for (const id of args.playerIds) {
      result.set(id, {
        referenceMs: null,
        todayMs: null,
        dropPct: null,
        band: "INSUFFICIENT_DATA",
        refSessionCount: 0,
      });
    }
    return result;
  }

  const byPlayer = new Map<string, DailySprint[]>();
  for (const id of args.playerIds) byPlayer.set(id, []);
  for (const row of (data ?? []) as Array<{
    player_id: string;
    date: string;
    max_velocity: number | null;
    max_vel: number | null;
    high_speed_distance: number | null;
  }>) {
    const arr = byPlayer.get(row.player_id);
    if (!arr) continue;
    const a = typeof row.max_velocity === "number" && Number.isFinite(row.max_velocity) ? row.max_velocity : null;
    const b = typeof row.max_vel === "number" && Number.isFinite(row.max_vel) ? row.max_vel : null;
    let mv: number | null = null;
    if (a != null && b != null) mv = Math.max(a, b);
    else mv = a ?? b;
    arr.push({
      date: row.date,
      maxVelocityMs: mv,
      hsrM: typeof row.high_speed_distance === "number" && Number.isFinite(row.high_speed_distance)
        ? row.high_speed_distance
        : null,
    });
  }

  for (const id of args.playerIds) {
    const rows = byPlayer.get(id) ?? [];
    result.set(id, computeSprintDrop(rows, args.todayIso));
  }
  return result;
}
