"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

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
      // Fetch best CMJ per player for today directly from ForceDecks results
      supabase
        .from("vald_forcedecks_results")
        .select("microplayer_id, jump_height_cm, rsi_mod, relative_peak_power_w_kg, time_to_takeoff_ms, peak_force_n, asymmetry_percent, asymmetry_side, test_timestamp")
        .eq("team_id", teamId)
        .eq("test_type", "CMJ")
        .gte("test_timestamp", `${date}T00:00:00`)
        .lte("test_timestamp", `${date}T23:59:59`)
        .not("microplayer_id", "is", null)
        .order("jump_height_cm", { ascending: false }),
      // 42-day baseline window — all CMJ trials before the selected date.
      supabase
        .from("vald_forcedecks_results")
        .select("microplayer_id, jump_height_cm, rsi_mod, time_to_takeoff_ms, peak_force_n, test_timestamp")
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
      };
    });

    // Best jump per player today (first row = highest due to ordering)
    const bestPerPlayer = new Map<string, CmjResult>();
    for (const row of ((cmjRes.data ?? []) as Array<Record<string, unknown>>)) {
      const pid = String(row.microplayer_id ?? "");
      if (!pid || bestPerPlayer.has(pid)) continue;
      bestPerPlayer.set(pid, {
        playerId: pid,
        jumpHeightCm: Number(row.jump_height_cm),
        rsiMod: row.rsi_mod != null ? Number(row.rsi_mod) : null,
        relativePeakPowerWkg: row.relative_peak_power_w_kg != null ? Number(row.relative_peak_power_w_kg) : null,
        timeToTakeoffMs: row.time_to_takeoff_ms != null ? Number(row.time_to_takeoff_ms) : null,
        peakForceN: row.peak_force_n != null ? Number(row.peak_force_n) : null,
        asymmetryPct: row.asymmetry_percent != null ? Number(row.asymmetry_percent) : null,
        asymmetrySide: row.asymmetry_side ? String(row.asymmetry_side) : null,
        testTimestamp: String(row.test_timestamp ?? ""),
      });
    }
    setCmjResults(Array.from(bestPerPlayer.values()).sort((a, b) => b.jumpHeightCm - a.jumpHeightCm));

    // ── 42-day force-time baselines ──────────────────────────────────────
    // Per player: keep the best (highest-jump) trial of each test day, then
    // take the median of each metric across days. Mirrors the "best trial"
    // convention and reduces single-trial noise.
    type DayBest = { day: string; jh: number; rsi: number | null; ttt: number | null; pf: number | null };
    const dayBestByPlayer = new Map<string, Map<string, DayBest>>();
    for (const row of ((baselineRes.data ?? []) as Array<Record<string, unknown>>)) {
      const pid = String(row.microplayer_id ?? "");
      const jh = Number(row.jump_height_cm);
      if (!pid || !Number.isFinite(jh)) continue;
      const day = String(row.test_timestamp ?? "").slice(0, 10);
      if (!day) continue;
      let days = dayBestByPlayer.get(pid);
      if (!days) { days = new Map(); dayBestByPlayer.set(pid, days); }
      const prev = days.get(day);
      if (!prev || jh > prev.jh) {
        days.set(day, {
          day, jh,
          rsi: row.rsi_mod != null ? Number(row.rsi_mod) : null,
          ttt: row.time_to_takeoff_ms != null ? Number(row.time_to_takeoff_ms) : null,
          pf: row.peak_force_n != null ? Number(row.peak_force_n) : null,
        });
      }
    }
    const baselines = new Map<string, CmjBaseline>();
    for (const [pid, days] of dayBestByPlayer) {
      const rows = Array.from(days.values());
      baselines.set(pid, {
        jumpHeightCm: median(rows.map((r) => r.jh)),
        rsiMod: median(rows.flatMap((r) => (r.rsi != null ? [r.rsi] : []))),
        contractionMs: median(rows.flatMap((r) => (r.ttt != null ? [r.ttt] : []))),
        peakForceN: median(rows.flatMap((r) => (r.pf != null ? [r.pf] : []))),
        days: rows.length,
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

                        return (
                          <tr key={r.playerId} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2 font-medium text-slate-700">
                              <span className="inline-flex items-center gap-1.5">
                                {name}
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                  ⭐ Force-time metrics. Each value is shown vs the player&apos;s own 42-day baseline (median of best daily trials).
                  Jump height alone can stay flat while force-time metrics — RSI-mod, contraction time, peak force —
                  reveal residual neuromuscular fatigue 2-4× more sensitively (Marques &amp; Buchheit 2026).
                </p>
                {/* Honest RSI state — never a silent row of dashes. */}
                {!anyRsi && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
                    <strong>RSI-modified not available yet · RSI-modified ekki tiltækt enn.</strong>{" "}
                    VALD is not sending RSI-modified or time-to-takeoff in the synced result set, so it can&apos;t be shown or
                    derived. Configure the ForceDecks test profile in VALD HUB to output them; this fills in automatically once it arrives.
                    <span className="text-amber-700"> (VALD sendir ekki RSI-modified — stilltu ForceDecks prófílinn í VALD HUB.)</span>
                  </div>
                )}
                {rsiLowConfidence && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
                    <strong>Low confidence</strong> — RSI-modified baseline is still thin (&lt; {RSI_MATURE_TESTS} tests).
                    Read the trend, not a single value, until more tests accrue.
                  </div>
                )}
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
