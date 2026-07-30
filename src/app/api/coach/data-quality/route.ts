/**
 * GET /api/coach/data-quality?teamId=…&window=60
 *
 * Does the system trust its own data? Feed health + impossible values for one team.
 *
 * The load-bearing question is ENTITLEMENT: is this team supposed to be receiving
 * this signal at all? Answered by the tier the platform already resolves
 * (`getCatapultDataTier` → 'full' | 'lite'), never guessed.
 *
 *   full → IMA is included. Its absence is a FAULT.
 *   lite → limited Catapult data, no IMA. Its absence is CORRECT — stay quiet.
 *
 * Getting this backwards is not a cosmetic error. An early version inferred
 * entitlement by comparing teams to each other ("others get IMA, so you should
 * too") and flagged four perfectly healthy Lite teams as broken. A monitor that
 * cries wolf on healthy teams teaches the coach to ignore the warnings that matter.
 *
 * What it DOES catch, and what nothing else did: a team on the FULL tier receiving
 * nothing. That is a club paying for data it is not getting — and because such a
 * feed has no last-seen date to go stale, a plain "has it gone quiet?" check can
 * never fire on it. It is exactly the hole HK sat in for three months, surfacing
 * only because a coach happened to mention it.
 *
 * Coverage is computed against sessions where the signal COULD exist. A gym day
 * legitimately has no GPS distance, so counting it as a GPS gap would cry wolf
 * until the coach stopped listening.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import {
  classifyFeed, checkRow, sortFeeds, isEntitled,
  type FeedVerdict, type RowIssue, type SignalKey,
} from "@/lib/micropulse/dataQuality";
import { getCatapultDataTier } from "@/lib/micropulse/catapultTier";
import { strideLength } from "@/lib/micropulse/strideLength";

export const runtime = "nodejs";

interface LoadRow {
  player_id: string;
  date: string;
  source: string | null;
  total_distance: number | null;
  max_velocity: number | null;
  ima_total: number | null;
  ima_fr_band1_stride_count: number | null;
  ima_fr_band58_total_distance: number | null;
  ima_fr_band5_stride_count: number | null;
  ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null;
  ima_fr_band8_stride_count: number | null;
  ima_cod_left_high: number | null;
  impacts: number | null;
  jumps: number | null;
  fmp_dynamic_high_s: number | null;
  avg_heart_rate: number | null;
}

/** A signal is "present" only when it carries real information — zero is absence. */
const PRESENT: Record<SignalKey, (r: LoadRow) => boolean> = {
  gps: (r) => (r.total_distance ?? 0) > 0,
  ima: (r) => (r.ima_total ?? 0) > 0,
  ima_strides: (r) => (r.ima_fr_band1_stride_count ?? 0) > 0,
  // Free-running distance is GPS-derived: null (not 0) indoors by design, so a
  // present reading is any non-null value. Coverage is scored on outdoor sessions.
  ima_run_distance: (r) => r.ima_fr_band58_total_distance != null,
  cod: (r) => (r.ima_cod_left_high ?? 0) > 0,
  impacts: (r) => (r.impacts ?? 0) > 0,
  jumps: (r) => (r.jumps ?? 0) > 0,
  fmp: (r) => (r.fmp_dynamic_high_s ?? 0) > 0,
  heart_rate: (r) => (r.avg_heart_rate ?? 0) > 0,
  readiness: () => false, // sourced separately below
};

/** Outdoor sessions only — a gym day has no GPS and that is not a fault. */
function isOutdoor(r: LoadRow): boolean {
  return (r.total_distance ?? 0) > 0 || (r.ima_total ?? 0) > 0;
}

/**
 * Metres per high-cadence stride for one row — computed by the STRIDE ENGINE
 * itself rather than re-derived here, so the data-quality check only ever sees a
 * value the engine would actually use (≥ MIN_STRIDES, real distance) and the two
 * can never disagree. null when there's nothing to judge.
 */
function rowStrideLength(r: LoadRow): number | null {
  const strides =
    (Number(r.ima_fr_band5_stride_count ?? 0) || 0) +
    (Number(r.ima_fr_band6_stride_count ?? 0) || 0) +
    (Number(r.ima_fr_band7_stride_count ?? 0) || 0) +
    (Number(r.ima_fr_band8_stride_count ?? 0) || 0);
  return strideLength({
    date: r.date,
    kind: "match", // irrelevant here — strideLength() only divides distance by strides
    highCadenceDistanceM:
      r.ima_fr_band58_total_distance != null ? Number(r.ima_fr_band58_total_distance) : null,
    highCadenceStrides: strides > 0 ? strides : null,
  });
}

const SIGNALS: SignalKey[] = [
  "gps", "ima", "ima_strides", "ima_run_distance",
  "cod", "impacts", "jumps", "fmp", "heart_rate",
];

export interface DataQualityPlayerIssue {
  playerId: string;
  fullName: string | null;
  date: string;
  issues: RowIssue[];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const windowDays = Math.min(180, Math.max(14, Number(url.searchParams.get("window")) || 60));

    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, url.searchParams.get("teamId") ?? "");
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

    const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
    const COLS =
      "player_id, date, source, total_distance, max_velocity, ima_total, " +
      "ima_fr_band1_stride_count, ima_fr_band58_total_distance, ima_cod_left_high, " +
      "ima_fr_band5_stride_count, ima_fr_band6_stride_count, " +
      "ima_fr_band7_stride_count, ima_fr_band8_stride_count, " +
      "impacts, jumps, fmp_dynamic_high_s, avg_heart_rate";

    // Entitlement comes from the tier the system ALREADY resolves — not from a
    // peer comparison, and not from a new column. A LITE team receives limited
    // Catapult data and legitimately has no IMA; telling its coach every day that
    // he is "missing data" would be false, and would teach him to ignore the
    // warnings that are real.
    const [tier, { data: players }] = await Promise.all([
      getCatapultDataTier(sb, teamId),
      sb.from("players").select("id, full_name").eq("team_id", teamId),
    ]);
    // Page past PostgREST's 1000-row cap — a team-wide 60–180-day window is well
    // over 1000 daily rows, and the coverage + duplicate checks below need EVERY
    // row (a single truncated fetch made this data-quality report itself wrong).
    const mine: LoadRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("player_external_load_daily").select(COLS)
        .eq("team_id", teamId).gte("date", since)
        .order("date", { ascending: true }).range(from, from + 999);
      if (error || !data || data.length === 0) break;
      mine.push(...(data as unknown as LoadRow[]));
      if (data.length < 1000) break;
    }

    const rows = ((mine ?? []) as unknown as LoadRow[]).filter(isOutdoor);
    const nameOf = new Map((players ?? []).map((p) => [String(p.id), (p as { full_name: string | null }).full_name]));

    const today = Date.now();
    const feeds: FeedVerdict[] = SIGNALS.map((s) => {
      const hit = rows.filter((r) => PRESENT[s](r));
      const lastDate = hit.length ? hit.map((r) => r.date).sort().at(-1)! : null;
      const daysSinceLast = lastDate
        ? Math.floor((today - Date.parse(lastDate)) / 86400000)
        : null;
      return classifyFeed({
        signal: s,
        totalRows: rows.length,
        rowsWithSignal: hit.length,
        daysSinceLast,
        entitled: isEntitled(tier, s),
      });
    });

    // ── Row-level: values that cannot be true ────────────────────────────────
    // Pair manual entries against the device reading for the same player-day, so
    // a hand-typed guess that contradicts the pod gets caught.
    const deviceByKey = new Map<string, LoadRow>();
    const manualByKey = new Map<string, LoadRow>();
    for (const r of (mine ?? []) as unknown as LoadRow[]) {
      const k = `${r.player_id}|${r.date}`;
      if (r.source === "manual") manualByKey.set(k, r);
      else deviceByKey.set(k, r);
    }

    const seen = new Set<string>();
    const rowIssues: DataQualityPlayerIssue[] = [];
    for (const r of (mine ?? []) as unknown as LoadRow[]) {
      const k = `${r.player_id}|${r.date}`;
      if (seen.has(k)) continue;
      seen.add(k);

      const issues = checkRow({
        maxVelocityKmh: r.max_velocity != null ? Number(r.max_velocity) : null,
        totalDistanceM: r.total_distance != null ? Number(r.total_distance) : null,
        podMinutes: null,
        strideLengthM: rowStrideLength(r),
        manualDistanceM: manualByKey.get(k)?.total_distance ?? null,
        deviceDistanceM: deviceByKey.get(k)?.total_distance ?? null,
      });
      if (issues.length) {
        rowIssues.push({
          playerId: r.player_id,
          fullName: nameOf.get(r.player_id) ?? null,
          date: r.date,
          issues,
        });
      }
    }

    rowIssues.sort((a, b) => b.date.localeCompare(a.date));
    const sorted = sortFeeds(feeds);

    return NextResponse.json({
      teamId,
      windowDays,
      catapultDataTier: tier,
      sessionsChecked: rows.length,
      feeds: sorted,
      // The one-line verdict, so the UI never has to derive it (and never disagrees).
      healthy: sorted.every((f) => !f.actionable) && rowIssues.length === 0,
      actionableFeeds: sorted.filter((f) => f.actionable).length,
      rowIssues,
      blockingRows: rowIssues.filter((r) => r.issues.some((i) => i.severity === "block")).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: /forbidden|access/i.test(msg) ? 403 : 400 });
  }
}
