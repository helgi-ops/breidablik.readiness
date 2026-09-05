import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { loadPlayerLoadAcwr } from "@/lib/micropulse/playerLoadAcwr/loader";
import type { BuildUpAcwr, BuildUpKpi, WeekActual } from "./index";
import { BUILD_UP_KPIS } from "./index";

/**
 * Actuals side of build-up tracking. Reads `player_external_load_daily` over the
 * block window, maps the raw columns to the same six KPIs the plan uses (the
 * mapping mirrors `externalLoad/weeklyLoadTracker.extractMetric`), buckets by
 * ISO-Monday week, and excludes the block's match dates so the comparison is
 * training-load-only (matching the hub's pct-of-match convention). Chronic
 * maturity (`daysObserved`) + the ACWR echo come from `playerLoadAcwr`.
 *
 * Descriptive: reads load only — never the readiness colour.
 */

const SELECT_COLS = [
  "date",
  "source",
  "total_distance",
  "total_player_load",
  "player_load",
  "velocity_band5_total_distance",
  "velocity_band6_total_distance",
  "accel_b2_3_tot_effs_gen2",
  "decel_b2_3_tot_effs_gen2",
  "ima_fr_band6_stride_count",
  "ima_fr_band7_stride_count",
  "ima_fr_band8_stride_count",
].join(", ");

type Row = {
  date: string;
  source?: string | null;
  total_distance: number | null;
  total_player_load: number | null;
  player_load: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
  ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null;
  ima_fr_band8_stride_count: number | null;
};

/** Sum non-null parts; null only when every part is null (a genuine no-data row
 *  stays null rather than a misleading 0). */
function sumNull(...parts: Array<number | null>): number | null {
  if (parts.every((v) => v == null)) return null;
  return parts.reduce((s: number, v) => s + (v ?? 0), 0);
}

function kpiVals(r: Row): Partial<Record<BuildUpKpi, number | null>> {
  return {
    dist: r.total_distance,
    hsr: sumNull(r.velocity_band5_total_distance, r.velocity_band6_total_distance),
    load: r.total_player_load ?? r.player_load,
    accHiEff: r.accel_b2_3_tot_effs_gen2,
    decHiEff: r.decel_b2_3_tot_effs_gen2,
    stride: sumNull(r.ima_fr_band6_stride_count, r.ima_fr_band7_stride_count, r.ima_fr_band8_stride_count),
  };
}

/** ISO Monday (UTC) of the week containing `iso`. */
function weekMonday(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export async function loadBuildUpActuals(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; from: string; to: string; matchDates: readonly string[] },
): Promise<{ weeks: WeekActual[]; daysObserved: number; acwr: BuildUpAcwr }> {
  const { data, error } = await sb
    .from("player_external_load_daily")
    .select(SELECT_COLS)
    .eq("player_id", args.playerId)
    .eq("team_id", args.teamId)
    .in("source", ["catapult", "manual"])
    .gte("date", args.from)
    .lte("date", args.to)
    .order("date", { ascending: true });

  const acwrPayload = await loadPlayerLoadAcwr(sb, { playerId: args.playerId, todayIso: args.to });
  const acwr: BuildUpAcwr = { ratio: acwrPayload.ratio, band: acwrPayload.band, daysObserved: acwrPayload.daysObserved };

  if (error || !data) {
    return { weeks: [], daysObserved: acwrPayload.daysObserved, acwr };
  }

  // A manual coach entry overrides the pod reading for the same day.
  const rows = oneRowPerDate(data as unknown as Row[]);
  const matchSet = new Set(args.matchDates);

  type Bucket = { byKpi: Partial<Record<BuildUpKpi, number>>; present: Set<BuildUpKpi>; days: Set<string> };
  const byWeek = new Map<string, Bucket>();

  for (const r of rows) {
    if (matchSet.has(r.date)) continue; // training-load only
    const wk = weekMonday(r.date);
    let b = byWeek.get(wk);
    if (!b) {
      b = { byKpi: {}, present: new Set(), days: new Set() };
      byWeek.set(wk, b);
    }
    const vals = kpiVals(r);
    let anyData = false;
    for (const kpi of BUILD_UP_KPIS) {
      const v = vals[kpi];
      if (v != null) {
        b.byKpi[kpi] = (b.byKpi[kpi] ?? 0) + v;
        b.present.add(kpi);
        anyData = true;
      }
    }
    if (anyData) b.days.add(r.date);
  }

  const weeks: WeekActual[] = [...byWeek.entries()]
    .sort((a, z) => (a[0] < z[0] ? -1 : 1))
    .map(([weekStart, b]) => ({ weekStart, trainingDays: b.days.size, byKpi: b.byKpi }));

  return { weeks, daysObserved: acwrPayload.daysObserved, acwr };
}
