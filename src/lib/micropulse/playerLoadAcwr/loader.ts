import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePlayerLoadAcwr,
  type AcwrPayload,
  type DailyLoad,
} from "./index";
import { oneRowPerDate, oneRowPerPlayerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { fetchAllPages } from "@/lib/supabasePaginate";

/**
 * Pull the last 28 days of total_player_load for `playerId` ending on
 * `todayIso`, then compute the ACWR payload. Returns the payload regardless
 * of band — the caller decides whether to surface it.
 *
 * If the player has no Catapult source rows in the window, returns a
 * INSUFFICIENT_DATA payload (so callers can show a uniform "no data" tile).
 */
export async function loadPlayerLoadAcwr(
  sb: SupabaseClient,
  args: { playerId: string; todayIso: string },
): Promise<AcwrPayload> {
  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await sb
    .from("player_external_load_daily")
    .select("date, source, total_player_load")
    .eq("player_id", args.playerId)
    .in("source", ["catapult", "manual"])
    .gte("date", startIso)
    .lte("date", args.todayIso)
    .order("date", { ascending: true });

  if (error) {
    return {
      acuteMean: null,
      chronicMean: null,
      ratio: null,
      band: "INSUFFICIENT_DATA",
      daysObserved: 0,
    };
  }

  // A manual coach entry overrides the pod reading for the same day.
  const rows: DailyLoad[] = oneRowPerDate(
    (data ?? []) as Array<{ date: string; source?: string | null; total_player_load: number | null }>,
  ).map((r) => ({ date: r.date, load: r.total_player_load }));

  return computePlayerLoadAcwr(rows, args.todayIso);
}

/**
 * Batch loader — same logic but for many players in a single round-trip.
 * Returns a Map<playerId, AcwrPayload>. Useful for the team decisions page
 * where we render N players at once.
 */
export async function loadPlayerLoadAcwrBatch(
  sb: SupabaseClient,
  args: { playerIds: ReadonlyArray<string>; todayIso: string },
): Promise<Map<string, AcwrPayload>> {
  const result = new Map<string, AcwrPayload>();
  if (args.playerIds.length === 0) return result;

  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await (async () => {
    try {
      // Team-wide 28d × dual source → page past the 1000-row cap.
      const rows = await fetchAllPages<{ player_id: string; date: string; source: string; total_player_load: number | null }>((from, to) =>
        sb.from("player_external_load_daily")
          .select("player_id, date, source, total_player_load")
          .in("player_id", args.playerIds as string[])
          .in("source", ["catapult", "manual"])
          .gte("date", startIso).lte("date", args.todayIso)
          .order("date", { ascending: true }).range(from, to));
      return { data: rows, error: null as null | { message: string } };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : "fetch failed" } };
    }
  })();

  if (error) {
    for (const id of args.playerIds) {
      result.set(id, {
        acuteMean: null,
        chronicMean: null,
        ratio: null,
        band: "INSUFFICIENT_DATA",
        daysObserved: 0,
      });
    }
    return result;
  }

  const byPlayer = new Map<string, DailyLoad[]>();
  for (const id of args.playerIds) byPlayer.set(id, []);
  // Manual coach entries override the pod reading per (player, date) before the
  // per-player ACWR series is built.
  for (const row of oneRowPerPlayerDate(
    (data ?? []) as Array<{ player_id: string; date: string; source?: string | null; total_player_load: number | null }>,
  )) {
    const arr = byPlayer.get(row.player_id);
    if (arr) arr.push({ date: row.date, load: row.total_player_load });
  }

  for (const id of args.playerIds) {
    const rows = byPlayer.get(id) ?? [];
    result.set(id, computePlayerLoadAcwr(rows, args.todayIso));
  }
  return result;
}
