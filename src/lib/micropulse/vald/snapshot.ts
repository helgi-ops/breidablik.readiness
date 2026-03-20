import { getSupabaseServer } from "@/lib/supabaseServer";
import { VALD_RUNTIME, VALD_THRESHOLDS } from "@/lib/integrations/vald/config";
import type { ValdDailySnapshot, ValdFlag, ValdFreshnessStatus } from "./types";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function freshness(latestAt: string | null | undefined, targetDate: string, maxDays: number): ValdFreshnessStatus {
  if (!latestAt) return "missing";
  const latest = new Date(latestAt);
  const target = new Date(`${targetDate}T23:59:59.999Z`);
  const deltaDays = Math.floor((target.getTime() - latest.getTime()) / 86400000);
  return deltaDays <= maxDays ? "fresh" : "stale";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentDrop(latest: number | null, baseline: number | null): number | null {
  if (latest == null || baseline == null || baseline <= 0) return null;
  return ((latest - baseline) / baseline) * 100;
}

function scoreFromDrop(dropPct: number | null, moderate: number, severe: number): { score: number | null; flag: ValdFlag } {
  if (dropPct == null) return { score: null, flag: null };
  if (dropPct <= -severe) return { score: 0.25, flag: "red" };
  if (dropPct <= -moderate) return { score: 0.55, flag: "yellow" };
  return { score: 0.85, flag: "green" };
}

function scoreAsymmetry(asymmetry: number | null, moderate: number, severe: number): { score: number | null; flag: ValdFlag } {
  if (asymmetry == null) return { score: null, flag: null };
  if (asymmetry >= severe) return { score: 0.25, flag: "red" };
  if (asymmetry >= moderate) return { score: 0.55, flag: "yellow" };
  return { score: 0.85, flag: "green" };
}

export async function buildValdDailySnapshot(teamId: string, microplayerId: string, snapshotDate: string): Promise<ValdDailySnapshot> {
  const sb = getSupabaseServer();
  const baselineStart = new Date(`${snapshotDate}T00:00:00.000Z`);
  baselineStart.setUTCDate(baselineStart.getUTCDate() - VALD_THRESHOLDS.baselineWindowDays);
  const baselineDate = baselineStart.toISOString();
  const snapshotEnd = `${snapshotDate}T23:59:59.999Z`;

  const [cmjRes, nordRes, ffRes] = await Promise.all([
    sb.from("vald_forcedecks_results").select("*").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).lte("test_timestamp", snapshotEnd).order("test_timestamp", { ascending: false }).limit(10),
    sb.from("vald_nordbord_results").select("*").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).lte("test_timestamp", snapshotEnd).order("test_timestamp", { ascending: false }).limit(10),
    sb.from("vald_forceframe_results").select("*").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).lte("test_timestamp", snapshotEnd).order("test_timestamp", { ascending: false }).limit(10),
  ]);

  const latestCmj = (cmjRes.data ?? [])[0] as Record<string, unknown> | undefined;
  const latestNord = (nordRes.data ?? [])[0] as Record<string, unknown> | undefined;
  const latestForce = (ffRes.data ?? [])[0] as Record<string, unknown> | undefined;

  const [cmjBaselineRes, nordBaselineRes, ffBaselineRes] = await Promise.all([
    sb.from("vald_forcedecks_results").select("jump_height_cm").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).gte("test_timestamp", baselineDate).lt("test_timestamp", snapshotEnd),
    sb.from("vald_nordbord_results").select("left_peak_force_n,right_peak_force_n,asymmetry_percent").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).gte("test_timestamp", baselineDate).lt("test_timestamp", snapshotEnd),
    sb.from("vald_forceframe_results").select("left_peak_force_n,right_peak_force_n,asymmetry_percent,movement_pattern,body_region").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).gte("test_timestamp", baselineDate).lt("test_timestamp", snapshotEnd),
  ]);

  const cmjBaselineValues = (cmjBaselineRes.data ?? []).map((row) => toNumber((row as Record<string, unknown>).jump_height_cm)).filter((n): n is number => n != null);
  const cmjBaseline = cmjBaselineValues.length >= VALD_THRESHOLDS.baselineMinTests ? median(cmjBaselineValues) : null;
  const latestCmjValue = toNumber(latestCmj?.jump_height_cm);
  const cmjDrop = percentDrop(latestCmjValue, cmjBaseline);
  const cmjScored = scoreFromDrop(cmjDrop, VALD_THRESHOLDS.cmjModerateDropPct, VALD_THRESHOLDS.cmjSevereDropPct);

  const latestNordAsym = toNumber(latestNord?.asymmetry_percent);
  const nordScored = scoreAsymmetry(
    latestNordAsym,
    VALD_THRESHOLDS.nordbordModerateAsymmetryPct,
    VALD_THRESHOLDS.nordbordHighAsymmetryPct
  );

  const latestForceAsym = toNumber(latestForce?.asymmetry_percent);
  const ffScored = scoreAsymmetry(
    latestForceAsym,
    VALD_THRESHOLDS.nordbordModerateAsymmetryPct,
    VALD_THRESHOLDS.forceframeHighAsymmetryPct
  );

  const cmjFreshnessStatus = freshness((latestCmj?.test_timestamp as string | null) ?? null, snapshotDate, VALD_RUNTIME.freshness.cmjDays);
  const nordbordFreshnessStatus = freshness((latestNord?.test_timestamp as string | null) ?? null, snapshotDate, VALD_RUNTIME.freshness.nordbordDays);
  const forceframeFreshnessStatus = freshness((latestForce?.test_timestamp as string | null) ?? null, snapshotDate, VALD_RUNTIME.freshness.forceframeDays);

  const overallValdStatus: ValdFlag =
    [cmjScored.flag, nordScored.flag, ffScored.flag].includes("red")
      ? "red"
      : [cmjScored.flag, nordScored.flag, ffScored.flag].includes("yellow")
      ? "yellow"
      : [cmjScored.flag, nordScored.flag, ffScored.flag].includes("green")
      ? "green"
      : null;

  const explanation = {
    cmj: {
      baseline: cmjBaseline,
      latest: latestCmjValue,
      delta_percent: cmjDrop,
      message:
        cmjDrop == null
          ? "No stable CMJ baseline available."
          : cmjDrop <= -VALD_THRESHOLDS.cmjSevereDropPct
          ? "Latest CMJ is meaningfully below recent baseline."
          : cmjDrop <= -VALD_THRESHOLDS.cmjModerateDropPct
          ? "Latest CMJ is moderately below recent baseline."
          : "CMJ output is within expected recent range.",
    },
    nordbord: {
      asymmetry_percent: latestNordAsym,
      message:
        latestNordAsym == null
          ? "No recent NordBord asymmetry value available."
          : latestNordAsym >= VALD_THRESHOLDS.nordbordHighAsymmetryPct
          ? "Hamstring asymmetry is elevated versus recent normal range."
          : latestNordAsym >= VALD_THRESHOLDS.nordbordModerateAsymmetryPct
          ? "Hamstring asymmetry is mildly elevated."
          : "Hamstring profile is within expected recent range.",
    },
    forceframe: {
      asymmetry_percent: latestForceAsym,
      message:
        latestForceAsym == null
          ? "No recent ForceFrame asymmetry value available."
          : latestForceAsym >= VALD_THRESHOLDS.forceframeHighAsymmetryPct
          ? "ForceFrame groin profile indicates possible adductor readiness concern."
          : "ForceFrame profile is within expected recent range.",
    },
  };

  const snapshot: ValdDailySnapshot = {
    teamId,
    microplayerId,
    snapshotDate,
    latestCmjAt: (latestCmj?.test_timestamp as string | null) ?? null,
    latestNordbordAt: (latestNord?.test_timestamp as string | null) ?? null,
    latestForceframeAt: (latestForce?.test_timestamp as string | null) ?? null,
    cmjFreshnessStatus,
    nordbordFreshnessStatus,
    forceframeFreshnessStatus,
    cmjScore: cmjScored.score,
    nordbordScore: nordScored.score,
    forceframeScore: ffScored.score,
    neuromuscularFlag: cmjScored.flag,
    hamstringFlag: nordScored.flag,
    groinFlag: ffScored.flag,
    overallValdStatus,
    explanation,
  };

  await sb.from("vald_daily_player_snapshot").upsert({
    team_id: teamId,
    microplayer_id: microplayerId,
    snapshot_date: snapshotDate,
    latest_cmj_at: snapshot.latestCmjAt ?? null,
    latest_nordbord_at: snapshot.latestNordbordAt ?? null,
    latest_forceframe_at: snapshot.latestForceframeAt ?? null,
    cmj_freshness_status: cmjFreshnessStatus,
    nordbord_freshness_status: nordbordFreshnessStatus,
    forceframe_freshness_status: forceframeFreshnessStatus,
    cmj_score: snapshot.cmjScore ?? null,
    nordbord_score: snapshot.nordbordScore ?? null,
    forceframe_score: snapshot.forceframeScore ?? null,
    neuromuscular_flag: snapshot.neuromuscularFlag,
    hamstring_flag: snapshot.hamstringFlag,
    groin_flag: snapshot.groinFlag,
    overall_vald_status: snapshot.overallValdStatus,
    explanation,
  }, { onConflict: "team_id,microplayer_id,snapshot_date" });

  return snapshot;
}

export async function getValdDailySnapshot(teamId: string, microplayerId: string, snapshotDate: string): Promise<ValdDailySnapshot | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("vald_daily_player_snapshot")
    .select("*")
    .eq("team_id", teamId)
    .eq("microplayer_id", microplayerId)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    teamId,
    microplayerId,
    snapshotDate,
    latestCmjAt: (data as Record<string, unknown>).latest_cmj_at as string | null,
    latestNordbordAt: (data as Record<string, unknown>).latest_nordbord_at as string | null,
    latestForceframeAt: (data as Record<string, unknown>).latest_forceframe_at as string | null,
    cmjFreshnessStatus: ((data as Record<string, unknown>).cmj_freshness_status as ValdFreshnessStatus | null) ?? "missing",
    nordbordFreshnessStatus: ((data as Record<string, unknown>).nordbord_freshness_status as ValdFreshnessStatus | null) ?? "missing",
    forceframeFreshnessStatus: ((data as Record<string, unknown>).forceframe_freshness_status as ValdFreshnessStatus | null) ?? "missing",
    cmjScore: toNumber((data as Record<string, unknown>).cmj_score),
    nordbordScore: toNumber((data as Record<string, unknown>).nordbord_score),
    forceframeScore: toNumber((data as Record<string, unknown>).forceframe_score),
    neuromuscularFlag: ((data as Record<string, unknown>).neuromuscular_flag as ValdFlag) ?? null,
    hamstringFlag: ((data as Record<string, unknown>).hamstring_flag as ValdFlag) ?? null,
    groinFlag: ((data as Record<string, unknown>).groin_flag as ValdFlag) ?? null,
    overallValdStatus: ((data as Record<string, unknown>).overall_vald_status as ValdFlag) ?? null,
    explanation: ((data as Record<string, unknown>).explanation as Record<string, unknown>) ?? {},
  };
}
