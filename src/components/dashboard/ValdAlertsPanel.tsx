"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { aggregateTrialsByTest, metricSeries, type TrialMetricRow } from "@/lib/micropulse/vald/trialAggregate";

type Props = {
  teamId: string | null;
  date: string;
};

type ValdSnapshotRow = {
  playerId: string;
  playerName: string;
  neuromuscularFlag: string | null;
  hamstringFlag: string | null;
  groinFlag: string | null;
  cmjFreshnessStatus: string | null;
  latestCmjAt: string | null;
  cmjScore: number | null;
  cmjBaseline: number | null;  // 42-day median jump height
  phase: PhaseSummary | null;  // CV-gated force-time phase read
};

/** One individual jump (a single trial), shown when a player row is expanded. */
type CmjTrial = {
  jh: number | null;
  rsi: number | null;
  ttt: number | null;
  pf: number | null;
  asym: number | null;
  ts: string;
};

type CmjResult = {
  playerId: string;
  jumpHeightCm: number;
  rsiMod: number | null;
  relativePeakPowerWkg: number | null;
  timeToTakeoffMs: number | null;
  peakForceN: number | null;
  asymmetryPct: number | null;
  asymmetrySide: string | null;
  testTimestamp: string;
  /** Every jump behind the mean above (Claudino 2017 — the row value is the mean). */
  trials: CmjTrial[];
};

/**
 * Per-player CMJ force-time baseline (median of best daily trials over the
 * 42 days before the selected date). Force-time metrics (RSI-mod, contraction
 * time, peak force) are 2-4x more sensitive to residual neuromuscular fatigue
 * than jump height — Marques et al. / Buchheit 2026, "Jump Height Lies".
 */
type CmjBaseline = {
  jumpHeightCm: number | null;
  rsiMod: number | null;
  contractionMs: number | null; // time-to-takeoff
  peakForceN: number | null;
  days: number;
};

function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function num(value: unknown): number | null {
  return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

// ── CV-gated CMJ phase read (from the snapshot's explanation.cmj.phase) ────────
// Computed server-side in snapshot.ts with the Gathercole-2015 CV gate; the panel
// only renders it. Never re-classify here — the gate lives in one place.
type PhaseMetricRead = {
  metric: string;
  status: string; // insufficient | noise | worth-watching | real
  deltaPct: number | null;
  cvPct: number | null;
  thresholdPct: number | null;
  labelEn: string;
  labelIs: string;
};
type PhaseSummary = {
  available: boolean;
  worstRealMetric: string | null;
  messageEn: string;
  messageIs: string;
  metrics: PhaseMetricRead[];
};

function parsePhaseSummary(cmjExpl: Record<string, unknown> | null): PhaseSummary | null {
  const phase = (cmjExpl?.phase as Record<string, unknown> | null) ?? null;
  if (!phase) return null;
  const worst = (phase.worst_real as Record<string, unknown> | null) ?? null;
  const metricsRaw = Array.isArray(phase.metrics) ? (phase.metrics as Array<Record<string, unknown>>) : [];
  return {
    available: phase.available === true,
    worstRealMetric: worst ? String(worst.metric ?? "") || null : null,
    messageEn: String(phase.message_en ?? ""),
    messageIs: String(phase.message_is ?? ""),
    metrics: metricsRaw.map((m) => {
      const label = (m.label as Record<string, unknown> | null) ?? null;
      return {
        metric: String(m.metric ?? ""),
        status: String(m.status ?? ""),
        deltaPct: num(m.delta_percent),
        cvPct: num(m.effective_cv_percent),
        thresholdPct: num(m.threshold_percent),
        labelEn: String(label?.en ?? ""),
        labelIs: String(label?.is ?? ""),
      };
    }),
  };
}

type MetricDelta = { pct: number; tone: "good" | "bad" | "flat" };

/** Percentage change of a recent value vs a baseline, classified against the
 *  metric's direction-of-better. A change under 3% is treated as flat. */
function metricDelta(
  recent: number | null,
  base: number | null,
  higherIsBetter: boolean,
): MetricDelta | null {
  if (recent == null || base == null || base === 0) return null;
  const pct = ((recent - base) / Math.abs(base)) * 100;
  const worse = higherIsBetter ? pct < 0 : pct > 0;
  const tone: MetricDelta["tone"] = Math.abs(pct) < 3 ? "flat" : worse ? "bad" : "good";
  return { pct, tone };
}

const DELTA_TONE_CLASS: Record<MetricDelta["tone"], string> = {
  good: "text-emerald-600",
  bad: "text-rose-600",
  flat: "text-slate-400",
};

const PHASE_METRIC_LABEL: Record<string, string> = {
  timeToTakeoff: "Contraction time",
  peakForce: "Peak force",
  concentricImpulse: "Concentric impulse",
  eccentricDuration: "Eccentric duration",
  concentricDuration: "Concentric duration",
  peakPower: "Peak power",
  meanRFD: "RFD",
  fvAuc: "Force–velocity area",
  meanEccConPower: "Mean power",
  jumpHeight: "Jump height",
  rsiMod: "RSI-modified",
};
const PHASE_STATUS_LABEL: Record<string, string> = { real: "Real", "worth-watching": "Watch", noise: "Noise" };
const PHASE_STATUS_CLASS: Record<string, string> = { real: "text-rose-600", "worth-watching": "text-amber-600", noise: "text-slate-400" };

type ActivePlayer = {
  id: string;
  name: string;
};

type CmjRequiredEntry = {
  playerId: string;
  playerName: string;
  reason: "protocol" | "neuromuscular" | "stale" | "missing";
};

function urgencyOrder(reason: CmjRequiredEntry["reason"]): number {
  return { neuromuscular: 0, protocol: 1, stale: 2, missing: 3 }[reason];
}

const REASON_META: Record<
  CmjRequiredEntry["reason"],
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  neuromuscular: { label: "Neuromuscular flag", bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500",    border: "border-red-200" },
  protocol:      { label: "Protocol day",       bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-500",   border: "border-blue-200" },
  stale:         { label: "CMJ stale (>7d)",    bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400",  border: "border-amber-200" },
  missing:       { label: "No CMJ baseline",    bg: "bg-slate-50",  text: "text-slate-500",  dot: "bg-slate-300",  border: "border-slate-200" },
};

// Groups in display order (excluding "missing" — handled separately)
const PRIORITY_GROUPS: CmjRequiredEntry["reason"][] = ["neuromuscular", "protocol", "stale"];

export default function ValdAlertsPanel({ teamId, date }: Props) {
  const [snapshots, setSnapshots]       = useState<ValdSnapshotRow[]>([]);
  const [cmjResults, setCmjResults]     = useState<CmjResult[]>([]);
  const [cmjBaselines, setCmjBaselines] = useState<Map<string, CmjBaseline>>(new Map());
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [mdDay, setMdDay]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState<string | null>(null);
  const [expandedCmj, setExpandedCmj]   = useState<string | null>(null);

  async function fetchData() {
    if (!teamId) { setLoading(false); return; }
    const supabase = getSupabaseClient();
    setLoading(true);
    // Start of the 42-day baseline window (the 42 days BEFORE the selected date).
    const baselineWindowStart = (() => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 42);
      return d.toISOString().slice(0, 10);
    })();
    const [snapshotRes, mdRes, playersRes, cmjRes, baselineRes] = await Promise.all([
      supabase
        .from("vald_daily_player_snapshot")
        .select("microplayer_id, neuromuscular_flag, hamstring_flag, groin_flag, cmj_freshness_status, latest_cmj_at, cmj_score, explanation, players!inner(full_name)")
        .eq("team_id", teamId)
        .eq("snapshot_date", date),
      supabase
        .from("v_training_day_context_team")
        .select("md_day")
        .eq("team_id", teamId)
        .eq("date", date)
        .maybeSingle(),
      supabase
        .from("players")
        .select("id, full_name")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .order("full_name"),
      // Today's CMJ trials per player — averaged per test below (Claudino 2017).
      supabase
        .from("vald_forcedecks_results")
        .select("microplayer_id, raw_test_id, jump_height_cm, rsi_mod, relative_peak_power_w_kg, time_to_takeoff_ms, peak_force_n, asymmetry_percent, asymmetry_side, test_timestamp")
        .eq("team_id", teamId)
        .eq("test_type", "CMJ")
        .gte("test_timestamp", `${date}T00:00:00`)
        .lte("test_timestamp", `${date}T23:59:59`)
        .not("microplayer_id", "is", null)
        .order("test_timestamp", { ascending: false }),
      // 42-day baseline window — all CMJ trials before the selected date.
      supabase
        .from("vald_forcedecks_results")
        .select("microplayer_id, raw_test_id, jump_height_cm, rsi_mod, time_to_takeoff_ms, peak_force_n, test_timestamp")
        .eq("team_id", teamId)
        .eq("test_type", "CMJ")
        .gte("test_timestamp", `${baselineWindowStart}T00:00:00`)
        .lt("test_timestamp", `${date}T00:00:00`)
        .not("microplayer_id", "is", null)
        .not("jump_height_cm", "is", null),
    ]);

    const mapped = ((snapshotRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const player = (row.players as Record<string, unknown> | null) ?? null;
      const expl = (row.explanation as Record<string, unknown> | null) ?? null;
      const cmjExpl = (expl?.cmj as Record<string, unknown> | null) ?? null;
      const baselineRaw = cmjExpl?.baseline;
      const cmjBaseline = typeof baselineRaw === "number" && Number.isFinite(baselineRaw) ? baselineRaw : null;
      return {
        playerId: String(row.microplayer_id ?? ""),
        playerName: String(player?.full_name ?? "Player"),
        neuromuscularFlag: row.neuromuscular_flag ? String(row.neuromuscular_flag) : null,
        hamstringFlag: row.hamstring_flag ? String(row.hamstring_flag) : null,
        groinFlag: row.groin_flag ? String(row.groin_flag) : null,
        cmjFreshnessStatus: row.cmj_freshness_status ? String(row.cmj_freshness_status) : null,
        latestCmjAt: row.latest_cmj_at ? String(row.latest_cmj_at) : null,
        cmjScore: row.cmj_score != null ? Number(row.cmj_score) : null,
        cmjBaseline,
        phase: parsePhaseSummary(cmjExpl),
      };
    });

    // ── Today: the MEAN of each player's trials, not the best jump ────────
    // Claudino 2017 (151 studies): the trial mean is more fatigue-sensitive than
    // the best trial (~10:1), because averaging shrinks measurement error.
    const todayRowsByPlayer = new Map<string, TrialMetricRow[]>();
    const sideByPlayer = new Map<string, { side: string | null; mag: number }>();
    for (const row of ((cmjRes.data ?? []) as Array<Record<string, unknown>>)) {
      const pid = String(row.microplayer_id ?? "");
      if (!pid) continue;
      const list = todayRowsByPlayer.get(pid) ?? [];
      list.push({
        rawTestId: (row.raw_test_id as string | null) ?? null,
        testTimestamp: String(row.test_timestamp ?? ""),
        metrics: {
          jh: num(row.jump_height_cm), rsi: num(row.rsi_mod), rpp: num(row.relative_peak_power_w_kg),
          ttt: num(row.time_to_takeoff_ms), pf: num(row.peak_force_n), asym: num(row.asymmetry_percent),
        },
      });
      todayRowsByPlayer.set(pid, list);
      const asym = num(row.asymmetry_percent);
      if (asym != null) {
        const prev = sideByPlayer.get(pid);
        if (!prev || Math.abs(asym) > prev.mag) {
          sideByPlayer.set(pid, { side: row.asymmetry_side ? String(row.asymmetry_side) : null, mag: Math.abs(asym) });
        }
      }
    }
    const todayResults: CmjResult[] = [];
    for (const [pid, rows] of todayRowsByPlayer) {
      const agg = aggregateTrialsByTest(rows, ["jh", "rsi", "rpp", "ttt", "pf", "asym"])[0];
      if (!agg || agg.metrics.jh == null) continue;
      // Every individual jump behind the mean, newest first — surfaced when the
      // coach expands the row so they can see all trials, not just the average.
      const trials: CmjTrial[] = rows
        .map((t) => ({
          jh: t.metrics.jh, rsi: t.metrics.rsi, ttt: t.metrics.ttt,
          pf: t.metrics.pf, asym: t.metrics.asym, ts: t.testTimestamp,
        }))
        .filter((t) => t.jh != null)
        .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      todayResults.push({
        playerId: pid,
        jumpHeightCm: agg.metrics.jh,
        rsiMod: agg.metrics.rsi,
        relativePeakPowerWkg: agg.metrics.rpp,
        timeToTakeoffMs: agg.metrics.ttt,
        peakForceN: agg.metrics.pf,
        asymmetryPct: agg.metrics.asym,
        asymmetrySide: sideByPlayer.get(pid)?.side ?? null,
        testTimestamp: agg.testTimestamp,
        trials,
      });
    }
    setCmjResults(todayResults.sort((a, b) => b.jumpHeightCm - a.jumpHeightCm));

    // ── 42-day force-time baselines ──────────────────────────────────────
    // Per player: the MEAN of each test's valid trials (Claudino 2017), then the
    // median of that per-test value across tests. `days` now counts TESTS.
    const baselineRowsByPlayer = new Map<string, TrialMetricRow[]>();
    for (const row of ((baselineRes.data ?? []) as Array<Record<string, unknown>>)) {
      const pid = String(row.microplayer_id ?? "");
      const jh = num(row.jump_height_cm);
      if (!pid || jh == null) continue;
      const list = baselineRowsByPlayer.get(pid) ?? [];
      list.push({
        rawTestId: (row.raw_test_id as string | null) ?? null,
        testTimestamp: String(row.test_timestamp ?? ""),
        metrics: { jh, rsi: num(row.rsi_mod), ttt: num(row.time_to_takeoff_ms), pf: num(row.peak_force_n) },
      });
      baselineRowsByPlayer.set(pid, list);
    }
    const baselines = new Map<string, CmjBaseline>();
    for (const [pid, rows] of baselineRowsByPlayer) {
      const aggs = aggregateTrialsByTest(rows, ["jh", "rsi", "ttt", "pf"]);
      baselines.set(pid, {
        jumpHeightCm: median(metricSeries(aggs, "jh")),
        rsiMod: median(metricSeries(aggs, "rsi")),
        contractionMs: median(metricSeries(aggs, "ttt")),
        peakForceN: median(metricSeries(aggs, "pf")),
        days: aggs.length,
      });
    }
    setCmjBaselines(baselines);

    setSnapshots(mapped);
    setMdDay((mdRes.data as { md_day?: string | null } | null)?.md_day ?? null);
    setActivePlayers(
      ((playersRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.full_name ?? ""),
      }))
    );
    setLoading(false);
  }

  useEffect(() => { void fetchData(); }, [date, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSyncMsg("Ekki innskráður."); setSyncing(false); return; }
      const res = await fetch("/api/integrations/vald/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dateFrom: date, dateTo: date, triggerSource: "MANUAL" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync mistókst");
      setSyncMsg("✓ Sync tókst — gögnin eru uppfærð");
      await fetchData();
    } catch (e: unknown) {
      setSyncMsg(`Villa: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Build CMJ Required list ─────────────────────────────────────────────
  const isProtocolDay = mdDay === "MD-2" || mdDay === "MD+1";
  const snapshotMap   = new Map(snapshots.map((s) => [s.playerId, s]));
  const cmjRequired: CmjRequiredEntry[] = [];
  const seen = new Set<string>();

  for (const s of snapshots) {
    if (s.neuromuscularFlag === "red" || s.neuromuscularFlag === "yellow") {
      cmjRequired.push({ playerId: s.playerId, playerName: s.playerName, reason: "neuromuscular" });
      seen.add(s.playerId);
    }
  }
  if (isProtocolDay) {
    for (const p of activePlayers) {
      if (!seen.has(p.id)) {
        cmjRequired.push({ playerId: p.id, playerName: p.name, reason: "protocol" });
        seen.add(p.id);
      }
    }
  }
  for (const s of snapshots) {
    if (!seen.has(s.playerId) && s.cmjFreshnessStatus === "stale") {
      cmjRequired.push({ playerId: s.playerId, playerName: s.playerName, reason: "stale" });
      seen.add(s.playerId);
    }
  }
  for (const p of activePlayers) {
    if (!seen.has(p.id) && !snapshotMap.has(p.id)) {
      cmjRequired.push({ playerId: p.id, playerName: p.name, reason: "missing" });
      seen.add(p.id);
    }
  }
  cmjRequired.sort((a, b) => urgencyOrder(a.reason) - urgencyOrder(b.reason) || a.playerName.localeCompare(b.playerName));

  // ── Group entries ──────────────────────────────────────────────────────
  const grouped = new Map<CmjRequiredEntry["reason"], CmjRequiredEntry[]>();
  for (const e of cmjRequired) {
    if (!grouped.has(e.reason)) grouped.set(e.reason, []);
    grouped.get(e.reason)!.push(e);
  }

  const urgentCount = (grouped.get("neuromuscular")?.length ?? 0)
    + (grouped.get("protocol")?.length ?? 0)
    + (grouped.get("stale")?.length ?? 0);
  const missingCount = grouped.get("missing")?.length ?? 0;

  // ── Injury alerts ──────────────────────────────────────────────────────
  const redNeuromuscular = snapshots.filter((s) => s.neuromuscularFlag === "red");
  const hamstringConcern = snapshots.filter((s) => s.hamstringFlag === "red" || s.hamstringFlag === "yellow");
  const groinConcern     = snapshots.filter((s) => s.groinFlag === "red" || s.groinFlag === "yellow");
  const hasInjuryAlerts  = redNeuromuscular.length > 0 || hamstringConcern.length > 0 || groinConcern.length > 0;

  const noValdData = !loading && snapshots.length === 0 && missingCount === activePlayers.length && urgentCount === 0;

  return (
    <div className="space-y-4">

      {/* ── CMJ Testing card ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">CMJ Testing</h3>
            {isProtocolDay && mdDay && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{mdDay}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && urgentCount > 0 && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                {urgentCount} required
              </span>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              title="Sync VALD gögn núna"
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {syncing ? (
                <><span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> Syncing…</>
              ) : (
                <>↻ Sync VALD</>
              )}
            </button>
            <Link
              href="/settings/integrations/vald"
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              title="VALD stillingar"
            >
              Stillingar →
            </Link>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-3">
              <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
              <span className="text-xs text-slate-400">Loading…</span>
            </div>
          )}

          {!loading && !teamId && (
            <p className="text-sm text-slate-400">No team context.</p>
          )}

          {/* Sync message */}
          {syncMsg && (
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${syncMsg.startsWith("Villa") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              {syncMsg}
            </div>
          )}

          {/* CMJ Results — today's best jump per player from ForceDecks.
              Each metric is shown vs the player's own 42-day baseline.
              Force-time metrics (RSI-mod, contraction time, peak force) are
              far more sensitive to fatigue than jump height. */}
          {!loading && cmjResults.length > 0 && (() => {
            const snapshotMap = new Map(snapshots.map((s) => [s.playerId, s]));
            // Honesty: RSI-modified is the most fatigue-sensitive CMJ metric, but
            // VALD isn't sending it yet (0/731 rows). Say so plainly instead of
            // rows of silent "–". Confidence stays low until a squad's own RSI
            // baseline matures (< ~14 tests). null RSI ≠ athlete fine.
            const RSI_MATURE_TESTS = 14;
            const anyRsi = cmjResults.some((r) => r.rsiMod != null);
            const rsiBaselineTests = Array.from(cmjBaselines.values())
              .filter((b) => b.rsiMod != null)
              .reduce((max, b) => Math.max(max, b.days), 0);
            const rsiLowConfidence = anyRsi && rsiBaselineTests < RSI_MATURE_TESTS;
            return (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">CMJ Niðurstöður í dag</span>
                  <span className="ml-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-px text-[10px] font-bold">{cmjResults.length}</span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">Leikmaður</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Stökk</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">RSI-mod ⭐</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contraction ⭐</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Peak force ⭐</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Asym</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {cmjResults.map((r) => {
                        const snap = snapshotMap.get(r.playerId);
                        const name = snap?.playerName ?? r.playerId;
                        const asymAbs = r.asymmetryPct != null ? Math.abs(r.asymmetryPct) : null;
                        const asymColor = asymAbs != null && asymAbs > 10 ? "text-amber-600 font-semibold" : "text-slate-500";

                        const base = cmjBaselines.get(r.playerId) ?? null;
                        const hasBaseline = base != null && base.days >= 3;
                        const jumpD   = hasBaseline ? metricDelta(r.jumpHeightCm, base!.jumpHeightCm, true)  : null;
                        const rsiD    = hasBaseline ? metricDelta(r.rsiMod, base!.rsiMod, true)              : null;
                        const contrD  = hasBaseline ? metricDelta(r.timeToTakeoffMs, base!.contractionMs, false) : null;
                        const forceD  = hasBaseline ? metricDelta(r.peakForceN, base!.peakForceN, true)      : null;

                        // "Jump Height Lies": jump height looks fine but a
                        // force-time metric has clearly regressed = hidden
                        // residual neuromuscular fatigue.
                        const jumpLooksFine = jumpD == null || jumpD.pct >= -5;
                        const forceTimeDegraded =
                          (rsiD?.tone === "bad" && Math.abs(rsiD.pct) >= 10) ||
                          (contrD?.tone === "bad" && Math.abs(contrD.pct) >= 10) ||
                          (forceD?.tone === "bad" && Math.abs(forceD.pct) >= 8);
                        const hiddenFatigue = hasBaseline && jumpLooksFine && forceTimeDegraded;

                        const open = expandedCmj === r.playerId;
                        // Plain read of today vs his own 42-day norm.
                        const badList: string[] = [];
                        if (hasBaseline) {
                          if (jumpD?.tone === "bad" && Math.abs(jumpD.pct) >= 5) badList.push("jump height");
                          if (rsiD?.tone === "bad" && Math.abs(rsiD.pct) >= 5) badList.push("RSI-mod");
                          if (contrD?.tone === "bad" && Math.abs(contrD.pct) >= 5) badList.push("contraction time");
                          if (forceD?.tone === "bad" && Math.abs(forceD.pct) >= 5) badList.push("peak force");
                        }
                        const readText = !hasBaseline
                          ? "Not enough baseline yet (needs ≥3 test days) to compare today to his norm."
                          : hiddenFatigue
                            ? "Jump height looks normal, but a force-time metric has dropped vs his 42-day norm — possible hidden neuromuscular fatigue. Confirm before loading hard."
                            : badList.length
                              ? `Down vs his 42-day norm: ${badList.join(", ")}. Worth a look before a heavy session.`
                              : "In line with — or above — his 42-day norm. Looks fresh.";
                        const cmpRows: Array<{ label: string; today: string; norm: string; d: ReturnType<typeof metricDelta> }> = [
                          { label: "Jump height", today: `${r.jumpHeightCm.toFixed(1)} cm`, norm: base?.jumpHeightCm != null ? `${base.jumpHeightCm.toFixed(1)} cm` : "–", d: jumpD },
                          { label: "RSI-mod", today: r.rsiMod != null ? r.rsiMod.toFixed(2) : "–", norm: base?.rsiMod != null ? base.rsiMod.toFixed(2) : "–", d: rsiD },
                          { label: "Contraction time", today: r.timeToTakeoffMs != null ? `${r.timeToTakeoffMs.toFixed(0)} ms` : "–", norm: base?.contractionMs != null ? `${base.contractionMs.toFixed(0)} ms` : "–", d: contrD },
                          { label: "Peak force", today: r.peakForceN != null ? `${r.peakForceN.toFixed(0)} N` : "–", norm: base?.peakForceN != null ? `${base.peakForceN.toFixed(0)} N` : "–", d: forceD },
                        ];

                        return (
                          <Fragment key={r.playerId}>
                          <tr className="cursor-pointer hover:bg-slate-50/60" onClick={() => setExpandedCmj(open ? null : r.playerId)}>
                            <td className="px-3 py-2 font-medium text-slate-700">
                              <span className="inline-flex items-center gap-1.5">
                                {name}
                                <span className="text-[9px] text-indigo-500">{open ? "▴" : "▾"}</span>
                                {hiddenFatigue && (
                                  <span
                                    className="rounded bg-rose-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-rose-700"
                                    title="Jump height looks normal but force-time metrics have regressed vs the player's 42-day baseline — possible hidden neuromuscular fatigue."
                                  >
                                    ⚠ Hidden fatigue
                                  </span>
                                )}
                              </span>
                            </td>
                            <MetricCell value={`${r.jumpHeightCm.toFixed(1)} cm`} delta={jumpD} bold />
                            <MetricCell value={r.rsiMod != null ? r.rsiMod.toFixed(2) : "–"} delta={rsiD} />
                            <MetricCell value={r.timeToTakeoffMs != null ? `${r.timeToTakeoffMs.toFixed(0)} ms` : "–"} delta={contrD} />
                            <MetricCell value={r.peakForceN != null ? `${r.peakForceN.toFixed(0)} N` : "–"} delta={forceD} />
                            <td className={`px-3 py-2 text-right tabular-nums ${asymColor}`}>
                              {asymAbs != null ? `${asymAbs.toFixed(1)}%${r.asymmetrySide ? ` ${r.asymmetrySide[0]}` : ""}` : "–"}
                            </td>
                          </tr>

                          {open && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={6} className="px-3 py-2.5">
                                <div className="mb-2 text-[11px] font-medium leading-snug text-slate-700">{readText}</div>
                                {hasBaseline ? (
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {cmpRows.map((cr) => {
                                      const dc = cr.d?.tone === "bad" ? "text-rose-600" : cr.d?.tone === "good" ? "text-emerald-600" : "text-slate-400";
                                      return (
                                        <div key={cr.label} className="rounded-md border border-slate-200 bg-white p-2 text-[10px]">
                                          <div className="font-semibold uppercase tracking-wide text-slate-400">{cr.label}</div>
                                          <div className="mt-0.5 text-slate-700">{cr.today} <span className="text-slate-400">vs μ {cr.norm}</span></div>
                                          {cr.d && <div className={`font-semibold tabular-nums ${dc}`}>{cr.d.pct >= 0 ? "+" : ""}{cr.d.pct.toFixed(0)}%</div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}

                                {/* Every individual jump behind the mean — the coach asked to see all
                                    trials, not just the average. Best jump flagged for reference. */}
                                {r.trials.length > 0 && (() => {
                                  const bestJh = Math.max(...r.trials.map((t) => t.jh ?? -Infinity));
                                  return (
                                    <div className="mt-2.5">
                                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                        All jumps today · Öll stökk í dag ({r.trials.length})
                                        <span className="ml-1 font-normal normal-case text-slate-400">— the row above is the mean of these (Claudino 2017)</span>
                                      </div>
                                      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                        <table className="w-full text-[10px]">
                                          <thead>
                                            <tr className="border-b border-slate-100 text-left text-slate-400">
                                              <th className="px-2 py-1 font-medium">#</th>
                                              <th className="px-2 py-1 font-medium">Jump</th>
                                              <th className="px-2 py-1 font-medium">RSI-mod</th>
                                              <th className="px-2 py-1 font-medium">Contraction</th>
                                              <th className="px-2 py-1 font-medium">Peak force</th>
                                              <th className="px-2 py-1 font-medium">Asym</th>
                                            </tr>
                                          </thead>
                                          <tbody className="tabular-nums text-slate-600">
                                            {r.trials.map((t, i) => (
                                              <tr key={`${t.ts}-${i}`} className="border-b border-slate-50 last:border-0">
                                                <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                                                <td className="px-2 py-1 font-semibold text-slate-800">
                                                  {t.jh != null ? `${t.jh.toFixed(1)} cm` : "–"}
                                                  {t.jh != null && t.jh === bestJh && <span className="ml-1 text-[9px] font-medium text-emerald-600">best</span>}
                                                </td>
                                                <td className="px-2 py-1">{t.rsi != null ? t.rsi.toFixed(2) : "–"}</td>
                                                <td className="px-2 py-1">{t.ttt != null ? `${t.ttt.toFixed(0)} ms` : "–"}</td>
                                                <td className="px-2 py-1">{t.pf != null ? `${t.pf.toFixed(0)} N` : "–"}</td>
                                                <td className="px-2 py-1">{t.asym != null ? `${Math.abs(t.asym).toFixed(1)}%` : "–"}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="mt-2 text-[9px] leading-snug text-slate-400">
                                  Baseline μ = median of his best daily trials over the 42 days before today{base?.days != null ? ` (${base.days} test days)` : ""}. Force-time metrics (RSI-mod, contraction time, peak force) come from VALD /trials and are read on the player&apos;s own norm — they catch residual neuromuscular fatigue jump height alone can miss (Gathercole 2015; Claudino 2017).
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                  ⭐ Force-time metrics. Each value is the mean of the player&apos;s trials (Claudino 2017), shown vs their own
                  42-day baseline (median of per-test trial means). Jump height alone can stay flat while force-time metrics —
                  RSI-mod, contraction time, peak force — reveal residual neuromuscular fatigue 2-4× more sensitively (Marques &amp; Buchheit 2026).
                </p>
                {/* Honest RSI state — never a silent row of dashes. The blocker is
                    NOT a VALD HUB toggle (RSI already exists in VALD); the sync now
                    pulls the full per-trial result set, so RSI fills in on its own. */}
                {!anyRsi && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
                    <strong>RSI-modified not available yet · RSI-modified ekki tiltækt enn.</strong>{" "}
                    The synced VALD result set isn&apos;t carrying RSI-modified or time-to-takeoff yet, so it can&apos;t be shown or
                    derived. Nothing to configure — the sync now pulls the full per-trial result set from VALD and this fills in
                    automatically once those metrics arrive.
                    <span className="text-amber-700"> (VALD skilar ekki RSI-modified enn — fyllist sjálfkrafa þegar full niðurstaða kemur; ekkert að stilla.)</span>
                  </div>
                )}
                {rsiLowConfidence && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
                    <strong>Low confidence</strong> — RSI-modified baseline is still thin (&lt; {RSI_MATURE_TESTS} tests).
                    Read the trend, not a single value, until more tests accrue.
                  </div>
                )}

                {/* ── CV-gated force-time PHASE read ─────────────────────────────
                    HOW the jump was produced. Each metric only flags a move beyond
                    its own measurement noise (Gathercole 2015 CV gate, computed in
                    snapshot.ts). Headline = worst `real` per player; numbers + CV +
                    citation behind the toggle. Honest empty state when phase columns
                    aren't populated. */}
                <PhaseRead snapshots={snapshots} />
              </div>
            );
          })()}

          {/* No VALD data at all — friendly setup state */}
          {!loading && noValdData && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-5 text-center space-y-1">
              <p className="text-sm font-medium text-slate-600">No VALD data connected</p>
              <p className="text-xs text-slate-400">
                CMJ baselines will appear here once VALD force plate data is synced for this team.
              </p>
            </div>
          )}

          {/* All good */}
          {!loading && !noValdData && cmjRequired.length === 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs text-emerald-700 font-medium">All CMJ data current — no tests required today.</span>
            </div>
          )}

          {/* Priority groups: neuromuscular / protocol / stale */}
          {!loading && PRIORITY_GROUPS.map((reason) => {
            const entries = grouped.get(reason);
            if (!entries?.length) return null;
            const m = REASON_META[reason];
            return (
              <div key={reason}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.label}</span>
                  <span className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-bold ${m.bg} ${m.text}`}>{entries.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entries.map((e) => (
                    <span key={e.playerId} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.text} ${m.border}`}>
                      {e.playerName}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Missing / no baseline — collapsible */}
          {!loading && missingCount > 0 && !noValdData && (
            <details className="group">
              <summary className="flex cursor-pointer select-none list-none items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">No CMJ baseline</span>
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-500">{missingCount}</span>
                <svg className="ml-auto w-3 h-3 text-slate-300 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(grouped.get("missing") ?? []).map((e) => (
                  <span key={e.playerId} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500">
                    {e.playerName}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* ── VALD Injury Alerts card ──────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">VALD Injury Alerts</h3>
          {!loading && hasInjuryAlerts && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              Attention
            </span>
          )}
        </div>

        <div className="px-4 py-3 space-y-2">
          {loading && (
            <p className="text-xs text-slate-400 py-1">Loading…</p>
          )}

          {!loading && !hasInjuryAlerts && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs text-emerald-700 font-medium">No injury alerts today.</span>
            </div>
          )}

          {!loading && hasInjuryAlerts && (
            <>
              <InjuryAlertRow
                color="text-red-700"
                dot="bg-red-500"
                title="Neuromuscular red"
                names={redNeuromuscular.map((s) => s.playerName)}
              />
              <InjuryAlertRow
                color="text-amber-700"
                dot="bg-amber-400"
                title="Hamstring concern"
                names={hamstringConcern.map((s) => s.playerName)}
              />
              <InjuryAlertRow
                color="text-amber-700"
                dot="bg-amber-400"
                title="Groin concern"
                names={groinConcern.map((s) => s.playerName)}
              />
            </>
          )}
        </div>
      </div>

    </div>
  );
}

function MetricCell({ value, delta, bold }: { value: string; delta: MetricDelta | null; bold?: boolean }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums align-top">
      <div className={bold ? "font-bold text-emerald-700" : "text-slate-600"}>{value}</div>
      {delta != null && (
        <div className={`text-[10px] font-semibold ${DELTA_TONE_CLASS[delta.tone]}`}>
          {delta.pct >= 0 ? "+" : ""}{delta.pct.toFixed(1)}%
        </div>
      )}
    </td>
  );
}

/**
 * CV-gated force-time PHASE read. Layered: (0) headline = players with a `real`
 * change in plain language; (1) the "within normal limits" / honest empty state;
 * (2) per-metric numbers, CV gate and citation behind "Show phase details" — the
 * S&C surface. The gate itself is computed once, server-side, in snapshot.ts.
 */
function PhaseRead({ snapshots }: { snapshots: ValdSnapshotRow[] }) {
  const withPhase = snapshots.filter((s) => s.phase != null);
  if (withPhase.length === 0) return null; // pre-rebuild snapshots carry no phase block

  const anyAvailable = withPhase.some((s) => s.phase!.available);
  if (!anyAvailable) {
    // Honest empty state — same discipline as the RSI banner. Never a fabricated read.
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
        <strong>Force-time phase read not available yet.</strong>{" "}
        Contraction time, phase durations, impulse and RFD aren&apos;t in the synced VALD result set yet, so no phase read is
        shown or fabricated. Fills in automatically once the full per-trial result set syncs.
        <span className="text-slate-400"> (Fasamælingar ekki tiltækar enn — fyllast sjálfkrafa þegar full niðurstaða kemur.)</span>
      </div>
    );
  }

  const flagged = withPhase.filter((s) => s.phase!.worstRealMetric);
  const detailPlayers = withPhase.filter((s) => s.phase!.available);

  return (
    <div className="mt-2 space-y-2">
      {flagged.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Force-time change (beyond noise)</span>
            <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">{flagged.length}</span>
          </div>
          <ul className="space-y-1">
            {flagged.map((s) => (
              <li key={s.playerId} className="text-[11px] leading-snug text-rose-900">
                <span className="font-semibold">{s.playerName}:</span> {s.phase!.messageEn}
                <span className="block text-rose-700/80">{s.phase!.messageIs}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-[11px] text-emerald-700 font-medium">
            CMJ force-time phases within normal limits · innan eðlilegra marka (no change beyond measurement noise).
          </span>
        </div>
      )}

      <details className="group">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Show phase details</span>
          <svg className="ml-auto w-3 h-3 text-slate-300 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-2 space-y-2">
          {detailPlayers.map((s) => {
            const metrics = s.phase!.metrics.filter((m) => m.status !== "insufficient");
            if (metrics.length === 0) return null;
            return (
              <div key={s.playerId} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                <div className="text-[11px] font-semibold text-slate-700 mb-1">{s.playerName}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-left font-semibold py-0.5">Metric</th>
                        <th className="text-right font-semibold py-0.5">Δ vs usual</th>
                        <th className="text-right font-semibold py-0.5">Noise gate</th>
                        <th className="text-right font-semibold py-0.5">Read</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => (
                        <tr key={m.metric} className="border-t border-slate-50">
                          <td className="py-0.5 text-slate-600">{PHASE_METRIC_LABEL[m.metric] ?? m.metric}</td>
                          <td className="py-0.5 text-right tabular-nums text-slate-600">
                            {m.deltaPct != null ? `${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct.toFixed(1)}%` : "–"}
                          </td>
                          <td className="py-0.5 text-right tabular-nums text-slate-400">
                            {m.thresholdPct != null ? `${m.thresholdPct.toFixed(1)}%` : "–"}
                            {m.cvPct != null ? ` · CV ${m.cvPct.toFixed(1)}` : ""}
                          </td>
                          <td className={`py-0.5 text-right font-semibold ${PHASE_STATUS_CLASS[m.status] ?? "text-slate-400"}`}>
                            {PHASE_STATUS_LABEL[m.status] ?? m.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] leading-snug text-slate-400">
            A change only flags when it clears the metric&apos;s own measurement noise — the literature CV (Gathercole 2015),
            widened by the player&apos;s own CV, ×1.5. Noisy metrics (RFD) need a bigger move than reliable ones (jump height),
            so a one-off wobble can&apos;t masquerade as fatigue. Marques &amp; Buchheit 2026; Claudino 2017.
          </p>
        </div>
      </details>
    </div>
  );
}

function InjuryAlertRow({ title, names, color, dot }: { title: string; names: string[]; color: string; dot: string }) {
  if (!names.length) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 flex items-start gap-2">
      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <div>
        <span className={`text-xs font-semibold ${color}`}>{title}: </span>
        <span className="text-xs text-slate-600">{names.join(", ")}</span>
      </div>
    </div>
  );
}
