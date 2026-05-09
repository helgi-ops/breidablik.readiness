"use client";

/**
 * Coach view — Load Intelligence v2: McBurnie 2022 Deceleration Module.
 *
 * Surfaces 4 dimensions per player from the McBurnie framework:
 *   1. Overload exposure (cumulative 28-day vs personal baseline)
 *   2. Underload risk (recent 7-day vs match-day demand)
 *   3. Decel:Sprint coupling (must brake after sprinting)
 *   4. Exposure concentration (single-day spike vs distributed volume)
 *
 * Reference: McBurnie, Harper, Jones & Dos'Santos 2022. Sports Medicine.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
// PlayerSummaryCard + PlayerAskCard intentionally NOT imported here — see
// the comment in the expanded-row body. Both live in the Decision Summary
// modal only to keep the per-player overall AI features in one place.
//
// PlayerDecelSummaryCard is different: it's a NARROW AI feature that
// translates the 6 decel metrics into coach speak. Lives only on this page.
import { PlayerDecelSummaryCard } from "@/components/coach/PlayerDecelSummaryCard";
import StrideIntelligenceCard from "@/components/coach/StrideIntelligenceCard";
import PlayerLoadAcwrCard from "@/components/coach/PlayerLoadAcwrCard";
import CoachAssignProtocolButton from "@/components/recovery/CoachAssignProtocolButton";
import LiteTierBanner from "@/components/coach/LiteTierBanner";

type Flag = "green" | "yellow" | "red" | "unknown";

type McBurnieStatus = {
  overall_flag: Flag;
  explanation: string;
  /**
   * Which decel field the SQL function actually used (priority order):
   *   - "ima_band3_decel_count"      → IMU-based high-intensity (preferred —
   *     Catapult exposes this in the base payload, works indoor and outdoor)
   *   - "decel_b3_plus_tot_effs_gen2" → GPS Gen-2 high-intensity (fallback,
   *     not currently populated because Catapult API V6 silently drops the
   *     parameter request)
   *   - "decel_b2_3_tot_effs_gen2"   → combined moderate+high GPS (last-ditch
   *     fallback for historical data with no IMA Band 3 capture)
   */
  decel_source?:
    | "ima_band3_decel_count"
    | "decel_b3_plus_tot_effs_gen2"
    | "decel_b2_3_tot_effs_gen2";
  overload: { flag: Flag; cumulative_28d_count: number; baseline_daily_mean: number };
  underload: { flag: Flag; cumulative_7d_count: number; match_day_demand: number; match_days_observed: number };
  accel_coupling: { flag: Flag; recent_ratio: number; metric_name: string; healthy_range: string };
  sprint_coupling: { flag: Flag; recent_ratio: number; metric_name: string; healthy_range: string; requires_field?: string };
  concentration: { flag: Flag; peak_day_pct_of_28d: number; distinct_high_intensity_days: number };
  // Neuromuscular capacity dims — load × capacity = compounded risk picture.
  // Each shows last-test freshness so coach can spot stale data; flag falls
  // back to "unknown" (gray) when no test of that type has been run.
  nordbord?: { flag: Flag; freshness: string; score: number; last_test_at: string | null; metric_name: string; reference: string };
  forceframe?: { flag: Flag; freshness: string; score: number; last_test_at: string | null; metric_name: string; reference: string };
  cmj?: { flag: Flag; freshness: string; score: number; last_test_at: string | null; metric_name: string; reference: string };
  computed_at: string;
};

// Sharp Cut Load (Dos'Santos 2021 — proxy via ima_band3_decel_count)
// Fetched from v_sharp_cut_hip_er_risk view; surfaces as 6th McBurnie dim chip.
type CuttingLoad = {
  cuts_7d: number;
  cuts_28d: number;
  cuts_personal_z: number | null;
  cuts_flag: "green" | "yellow" | "red" | "insufficient";
};

// MPE Recovery (Osgnach 2023 — recovery time lengthening = early fatigue)
// Computed client-side from mpe_recovery_avg_s rolling 7d vs personal 28d.
type MpeRecovery = {
  recent_7d_avg_s: number | null;     // 7d avg of mpe_recovery_avg_s
  baseline_28d_avg_s: number | null;  // 28d avg of mpe_recovery_avg_s
  baseline_28d_sd_s: number | null;
  z_score: number | null;             // (recent - baseline) / sd. Positive = recovery time lengthening = fatigue
  flag: Flag;
};

// ASP-personal burst z-scoring (Osgnach 2023 ASP-spirit) — replaces fixed-threshold
// accel/decel band counting with per-player baseline-aware scoring. Read from
// v_asp_personal_burst view. Surfaces as a sub-line on the existing A:D Coupling tile.
type AspBurst = {
  accel_burst_personal_z: number | null;
  decel_burst_personal_z: number | null;
  ad_couple_personal_z: number | null;  // positive = braking-skewed
  baseline_days: number;
};

type Row = {
  player_id: string;
  full_name: string;
  status: McBurnieStatus | null;
  cutting?: CuttingLoad | null;
  mpe?: MpeRecovery | null;
  asp?: AspBurst | null;
};

export default function CoachDecelIntelligencePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  // Refresh-baselines / Re-sync-7d / Diagnose-B3 buttons removed from this
  // page (admin/dev concerns, not coach UX). Baselines run nightly via the
  // refresh_mcburnie_decel_baselines cron; Catapult re-sync moved to
  // /coach/catapult-upload; B3 diagnostic was a pure dev tool.

  React.useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError("Ekki innskráður"); return; }
      const { data: profile } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = profile?.team_id as string | undefined;
      if (!tid) { setError("Ekki tengdur við lið"); return; }

      const { data: roster } = await sb.from("players")
        .select("id, full_name").eq("team_id", tid).order("full_name");
      const players = (roster ?? []) as Array<{ id: string; full_name: string }>;
      if (players.length === 0) { setRows([]); return; }

      // Pull Sharp Cut Load (Dos'Santos 2021) for whole squad in one go
      // — view already aggregates 7d/28d per player.
      const { data: cuttingRows } = await sb
        .from("v_sharp_cut_hip_er_risk")
        .select("player_id, cuts_7d, cuts_28d, cuts_personal_z, cuts_flag")
        .eq("team_id", tid);
      const cuttingByPlayer = new Map<string, CuttingLoad>();
      for (const r of (cuttingRows ?? []) as Array<{
        player_id: string; cuts_7d: number; cuts_28d: number;
        cuts_personal_z: number | null; cuts_flag: CuttingLoad["cuts_flag"];
      }>) {
        cuttingByPlayer.set(r.player_id, {
          cuts_7d: Number(r.cuts_7d),
          cuts_28d: Number(r.cuts_28d),
          cuts_personal_z: r.cuts_personal_z != null ? Number(r.cuts_personal_z) : null,
          cuts_flag: r.cuts_flag,
        });
      }

      // Pull ASP-personal burst view (Osgnach 2023 ASP-spirit) for the whole
      // squad — view already aggregates 28d baseline + 7d recent per player
      // and z-scores both accel and decel bands. Used as a sub-line on the
      // existing A:D Coupling tile so coach sees personal-relative skew alongside
      // the raw ratio.
      const { data: aspRows } = await sb
        .from("v_asp_personal_burst")
        .select("player_id, accel_burst_personal_z, decel_burst_personal_z, ad_couple_personal_z, baseline_days")
        .eq("team_id", tid);
      const aspByPlayer = new Map<string, AspBurst>();
      for (const r of (aspRows ?? []) as Array<{
        player_id: string;
        accel_burst_personal_z: number | null;
        decel_burst_personal_z: number | null;
        ad_couple_personal_z:   number | null;
        baseline_days: number;
      }>) {
        aspByPlayer.set(r.player_id, {
          accel_burst_personal_z: r.accel_burst_personal_z != null ? Number(r.accel_burst_personal_z) : null,
          decel_burst_personal_z: r.decel_burst_personal_z != null ? Number(r.decel_burst_personal_z) : null,
          ad_couple_personal_z:   r.ad_couple_personal_z   != null ? Number(r.ad_couple_personal_z)   : null,
          baseline_days: Number(r.baseline_days),
        });
      }

      // Pull MPE recovery time history for whole squad — compute client-side
      // because we want both 7d and 28d windows from the same 28d slice.
      const since28 = new Date();
      since28.setDate(since28.getDate() - 28);
      const since28iso = since28.toISOString().slice(0, 10);
      const since7 = new Date();
      since7.setDate(since7.getDate() - 7);
      const since7iso = since7.toISOString().slice(0, 10);
      const { data: mpeRows } = await sb
        .from("player_external_load_daily")
        .select("player_id, date, mpe_recovery_avg_s")
        .gte("date", since28iso)
        .not("mpe_recovery_avg_s", "is", null);
      const mpeByPlayer = new Map<string, { all: number[]; recent: number[] }>();
      for (const r of (mpeRows ?? []) as Array<{ player_id: string; date: string; mpe_recovery_avg_s: number }>) {
        const v = Number(r.mpe_recovery_avg_s);
        if (!Number.isFinite(v) || v <= 0) continue;
        const bucket = mpeByPlayer.get(r.player_id) ?? { all: [], recent: [] };
        bucket.all.push(v);
        if (r.date >= since7iso) bucket.recent.push(v);
        mpeByPlayer.set(r.player_id, bucket);
      }
      function computeMpe(playerId: string): MpeRecovery | null {
        const b = mpeByPlayer.get(playerId);
        if (!b || b.all.length < 4) return null; // need at least 4 sessions for stability
        const baseAvg = b.all.reduce((a, x) => a + x, 0) / b.all.length;
        const variance = b.all.length > 1
          ? b.all.reduce((a, x) => a + (x - baseAvg) ** 2, 0) / (b.all.length - 1)
          : 0;
        const baseSd = Math.sqrt(variance);
        const recAvg = b.recent.length > 0
          ? b.recent.reduce((a, x) => a + x, 0) / b.recent.length
          : null;
        const z = baseSd > 0 && recAvg != null ? (recAvg - baseAvg) / baseSd : null;
        // Flag: positive z means recovery time lengthened = fatigue developing
        let flag: Flag = "unknown";
        if (z != null) {
          if      (z >= 1.5) flag = "red";
          else if (z >= 1.0) flag = "yellow";
          else               flag = "green";
        }
        return { recent_7d_avg_s: recAvg, baseline_28d_avg_s: baseAvg, baseline_28d_sd_s: baseSd, z_score: z, flag };
      }

      // Fetch McBurnie status for each player in parallel — and merge
      // the cutting + MPE rows we already pulled above.
      const results = await Promise.all(
        players.map(async (p) => {
          const { data, error: rpcErr } = await sb.rpc("get_mcburnie_decel_status", {
            p_player_id: p.id,
          });
          if (rpcErr) console.warn(`McBurnie status failed for ${p.full_name}:`, rpcErr);
          return {
            player_id: p.id,
            full_name: (p.full_name ?? "—").trim(),
            status: (data as McBurnieStatus | null) ?? null,
            cutting: cuttingByPlayer.get(p.id) ?? null,
            mpe: computeMpe(p.id),
            asp: aspByPlayer.get(p.id) ?? null,
          };
        }),
      );
      // Sort: red flags first, then yellow, then green, then no data
      const sorted = results.sort((a, b) => {
        const order = { red: 0, yellow: 1, green: 2, unknown: 3 };
        const a_o = order[a.status?.overall_flag ?? "unknown"];
        const b_o = order[b.status?.overall_flag ?? "unknown"];
        if (a_o !== b_o) return a_o - b_o;
        return a.full_name.localeCompare(b.full_name);
      });
      setRows(sorted);
    } catch (e: any) {
      setError(e?.message ?? "Villa");
    } finally {
      setLoading(false);
    }
  }

  // refreshBaselines / diagnoseDecelB3 / backfillLastWeek removed — see
  // state-block comment above. Re-sync action lives at /coach/catapult-upload.

  const counts = React.useMemo(() => {
    let red = 0, yellow = 0, green = 0, unknown = 0;
    for (const r of rows) {
      const f = r.status?.overall_flag ?? "unknown";
      if (f === "red") red++;
      else if (f === "yellow") yellow++;
      else if (f === "green") green++;
      else unknown++;
    }
    return { red, yellow, green, unknown };
  }, [rows]);

  // Which decel source is the team on? Aggregate across all players that
  // have a status. Three meaningful states: ima (IMU-based, McBurnie-aligned),
  // mixed (transition), b2_3 (combined-intensity fallback).
  const decelSource = React.useMemo(() => {
    const sources = new Set(
      rows.map((r) => r.status?.decel_source).filter((s) => !!s) as string[],
    );
    if (sources.size === 0) return "unknown";
    const hasIma = sources.has("ima_band3_decel_count");
    const hasB3 = sources.has("decel_b3_plus_tot_effs_gen2");
    const hasB2_3 = sources.has("decel_b2_3_tot_effs_gen2");
    // Any high-intensity coverage + any fallback coverage = mixed
    if ((hasIma || hasB3) && hasB2_3) return "mixed";
    if (hasIma) return "ima";
    if (hasB3) return "b3plus";
    return "b2_3";
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <LiteTierBanner
        feature="Decel Intelligence"
        reasonIs="McBurnie engine þarf B2-3 acceleration/deceleration efforts úr Catapult — þessi gögn eru ekki tiltæk á núverandi Catapult-pakkanum ykkar."
        reasonEn="The McBurnie engine needs B2-3 acceleration/deceleration efforts from Catapult — those aren't included in your current Catapult plan."
      />
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Decel Intelligence</h1>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              McBurnie 2022 · Load Intelligence v2
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Eccentric deceleration risk profile per player — implementation of the
            McBurnie, Harper, Jones &amp; Dos'Santos 2022 framework (Sports Medicine).
            5 dimensions: overload, underload, decel:accel coupling, decel:sprint
            coupling, exposure concentration. Neuromuscular capacity (Nordbord,
            ForceFrame, CMJ) lives on the VALD/CMJ dashboard tab.
          </p>
        </div>
        {/* Re-sync / Endur-reikna baselines / Greina Decel B3 buttons
            removed — admin/dev concerns. Re-sync now lives at
            /coach/catapult-upload, baselines run nightly via cron, B3
            diagnostic was a one-off setup tool. */}
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCard tone="red"     label="Red" n={counts.red} />
        <CountCard tone="yellow"  label="Yellow" n={counts.yellow} />
        <CountCard tone="green"   label="Green" n={counts.green} />
        <CountCard tone="gray"    label="Insufficient data" n={counts.unknown} />
      </div>

      {/* Backfill status banner + Decel-B3 diagnostic panel removed with
          the buttons that drove them. */}

      {/* Decel-source banner — tells the coach which Catapult field is feeding
          the McBurnie engine right now. b3+ = biomechanically aligned with the
          paper. b2_3 = combined fallback that inflates ratios; risk thresholds
          rarely trigger. The banner doubles as a setup nudge for OpenField. */}
      {decelSource === "b2_3" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="font-semibold">Using fallback decel source (Decel B2-3 combined)</div>
          <p className="mt-1">
            McBurnie's framework calls for high-intensity-only decels (band 3+, &gt;3 m/s²).
            Currently this team's data uses the combined b2-3 metric (&gt;2 m/s²), which
            includes moderate-intensity decels. Result: decel:sprint ratios are inflated
            (typical 5-15) and the 0.5/0.8 risk thresholds rarely trigger.
          </p>
          <p className="mt-1 italic">
            <strong>To switch to high-intensity-only:</strong> in Catapult OpenField →
            Settings → Reporting Parameters → add
            <em> "Deceleration B3 Efforts (Gen 2)"</em> to your Reporting_Parameters group,
            then re-run the next session sync. Once the column populates, this engine
            auto-upgrades on a per-player basis.
          </p>
        </div>
      )}
      {decelSource === "mixed" && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
          <strong>Decel source: mixed.</strong> Some players already have
          high-intensity-only data (b3+) populating; others are still on the
          combined fallback (b2-3) until their next sync arrives. Per-player
          status shown below — each row uses whichever source it has data for.
        </div>
      )}
      {decelSource === "b3plus" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <strong>Decel source: GPS Gen-2 high-intensity (b3+).</strong> Fully
          aligned with McBurnie 2022 — decel:sprint ratios should now compress to
          a clinically meaningful range (typically 0.5-3.0) where the risk
          thresholds actually trigger.
        </div>
      )}
      {decelSource === "ima" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <strong>Decel source: IMA Band 3 (IMU-based high-intensity).</strong>
          {" "}Fully aligned with McBurnie 2022 — decel events measured directly
          by the pod's accelerometer (works indoor and outdoor, no GPS dependency).
          Ratios should now sit in the clinically meaningful 0.5-3.0 range where
          the risk thresholds match the paper's intent.
        </div>
      )}

      {/* Player list */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading && <div className="py-8 text-center text-sm text-muted-foreground">Hleð…</div>}
        {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Engin GPS gögn fyrir liðið. Hladdu upp Catapult exports fyrst í Integrations Center.
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => <PlayerRow key={r.player_id} row={r} />)}
          </div>
        )}
      </div>

      {/* Methodology footer */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Methodology — McBurnie 2022 framework</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Overload:</strong> 28-day cumulative high-intensity decel count (band 2-3, &gt;2 m/s²)
            vs personal daily baseline. Red if &gt;1.5× expected total. (Eccentric overload risk.)
          </li>
          <li>
            <strong>Underload:</strong> 7-day cumulative count vs personal match-day demand baseline.
            Red if &lt;50% of match demand. (Underprepared for match decel exposure → injury risk per
            McBurnie; the body has lost adaptation.)
          </li>
          <li>
            <strong>Decel:Accel coupling (high-intensity counts):</strong> Eccentric decel events
            divided by concentric accel events from Catapult bands 2-3 (≥2 m/s²). Healthy range
            0.8–1.2. Red if &lt;0.7 (accelerating without proportional braking) or &gt;2.0
            (defensive scrambling pattern). Foundation balance metric.
          </li>
          <li>
            <strong>Decel:Sprint coupling (McBurnie's primary risk metric):</strong> Decel
            events divided by Catapult sprint event count (Vel B6+ Total # Efforts Gen 2,
            not distance proxy). Healthy ≥0.8 (every sprint followed by at least one
            high-intensity brake). Red if &lt;0.5 (sprinting without proportional braking).
            <strong> Decel input prefers Decel B3+ Total # Efforts (Gen 2)</strong> when
            populated — high-intensity-only events that match the eccentric demand of
            sprint braking. Falls back to Decel B2-3 (combined) for historical data, but
            note that the combined input inflates ratios (typical 5-15) so the McBurnie
            thresholds rarely trigger. The per-team banner above shows which source is
            currently in use.
          </li>
          <li>
            <strong>Exposure concentration:</strong> What % of 28-day cumulative volume happened in
            the single peak day. Red if &gt;30% (McBurnie's "tall-thin force-time" pattern; concentrated
            mechanical loading more dangerous than distributed).
          </li>
        </ul>
        <p className="mt-2 text-slate-600">
          <strong>Reference:</strong> McBurnie AJ, Harper DJ, Jones PA, Dos'Santos T. (2022).
          Deceleration training in team sports: another potential 'vaccine' for sports-related injury?
          <em> Sports Medicine</em>, 52(1), 1–12. doi:10.1007/s40279-021-01583-x
        </p>
      </div>

      <div className="text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">← Til baka á dashboard</Link>
      </div>
    </div>
  );
}

// ─── Player row ──────────────────────────────────────────────────────────

function PlayerRow({ row }: { row: Row }) {
  const [expanded, setExpanded] = React.useState(false);
  const s = row.status;
  const overall = s?.overall_flag ?? "unknown";

  const overallClass = {
    red: "border-red-300 bg-red-50",
    yellow: "border-amber-300 bg-amber-50",
    green: "border-emerald-200 bg-emerald-50",
    unknown: "border-slate-200 bg-slate-50",
  }[overall];

  return (
    <div className={`rounded-lg border ${overallClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-white/30"
      >
        <div>
          <div className="text-sm font-semibold text-slate-900">{row.full_name}</div>
          {s && (
            <div className="text-xs text-slate-700">{s.explanation}</div>
          )}
          {!s && (
            <div className="text-xs text-slate-500 italic">No GPS data available</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FlagBadge flag={s?.overload?.flag ?? "unknown"} label="Overload" />
          <FlagBadge flag={s?.underload?.flag ?? "unknown"} label="Underload" />
          <FlagBadge flag={s?.accel_coupling?.flag ?? "unknown"} label="A:D" />
          <FlagBadge flag={s?.sprint_coupling?.flag ?? "unknown"} label="D:Sprint" />
          <FlagBadge flag={s?.concentration?.flag ?? "unknown"} label="Concentration" />
          {/* Dos'Santos 2021 — Sharp Cut Load */}
          <FlagBadge
            flag={row.cutting?.cuts_flag === "insufficient" ? "unknown" : (row.cutting?.cuts_flag ?? "unknown")}
            label="Sharp Cuts"
          />
          {/* Osgnach 2023 — MPE Recovery Time */}
          <FlagBadge flag={row.mpe?.flag ?? "unknown"} label="MPE Recovery" />
          <span className="text-slate-400">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && s && (
        <div className="border-t border-slate-200/50 bg-white/50 p-4 space-y-3">
          {/* Plain-language explanation of the 6 decel metrics for coaches
              without S&C background. Pre-computed interpretation in TS so
              the LLM never invents its own reading of the numbers — see
              lib/micropulse/decelNarrative for the design rationale. */}
          <PlayerDecelSummaryCard playerId={row.player_id} />

          {/* Stride Intelligence — IMA Free Running 8-band stride mechanics +
              L/R CoD asymmetry. Mode-agnostic (works indoor + outdoor). Sits
              alongside McBurnie because both are stride-mechanical signals. */}
          <StrideIntelligenceCard playerId={row.player_id} />

          {/* Player Load ACWR — Gabbett 2016 7-day acute / 28-day chronic ratio
              over Catapult total_player_load. Indoor-friendly external load
              spike detector; complements internal-load (RPE) ACWR. */}
          <PlayerLoadAcwrCard playerId={row.player_id} />

          {/* Coach can manually assign a recovery protocol — VST Reset, MD+1
              bundle, etc. — to this player. Auto-trigger from match-load
              detection runs nightly; this is the manual override. */}
          <div className="flex justify-end">
            <CoachAssignProtocolButton playerId={row.player_id} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail
              title="Overload"
              flag={s.overload.flag}
              big={`${s.overload.cumulative_28d_count.toFixed(0)} decels`}
              caption={`28-day cumulative · baseline daily ≈ ${s.overload.baseline_daily_mean.toFixed(1)}`}
              hint="Red if cumulative > 1.5× expected total."
              info="Total high-intensity decelerations (band 2-3, >2 m/s²) over the last 28 days vs the player's personal daily baseline. Catches the player who has been quietly stacking eccentric load. RED when the 28-day total is more than 1.5× their expected total — eccentric tissue load is accumulating faster than recovery (McBurnie 2022)."
            />
            <Detail
              title="Underload"
              flag={s.underload.flag}
              big={`${s.underload.cumulative_7d_count.toFixed(0)} / ${s.underload.match_day_demand.toFixed(1)}`}
              caption={`7-day exposure / match-day demand · ${s.underload.match_days_observed} match days observed`}
              hint="Red if 7-day < 50% of match demand."
              info="The player's last 7 days of decel exposure compared with their typical match-day demand. Detraining signal — if a player isn't getting enough decel work in training, they're underprepared for what a match throws at them. RED when 7-day total drops below 50% of match demand. Per McBurnie 2022, peak quad activation reaches 161% of MVC during deceleration; under-prepared exposure leaves the quadriceps under-conditioned for that eccentric load, while reduced hamstring co-activation increases anterior tibial translation — primary risk is ACL, with quadriceps strain and patellar tendon overload as secondary risks."
            />
            <Detail
              title="Decel : Accel Coupling"
              flag={s.accel_coupling.flag}
              big={s.accel_coupling.recent_ratio.toFixed(2)}
              caption={
                row.asp?.ad_couple_personal_z != null
                  ? `${s.accel_coupling.metric_name} · healthy ${s.accel_coupling.healthy_range}\nASP personal z = ${row.asp.ad_couple_personal_z >= 0 ? "+" : ""}${row.asp.ad_couple_personal_z.toFixed(2)} (${row.asp.ad_couple_personal_z > 0 ? "braking-skewed" : "accel-skewed"} vs personal 28d)`
                  : `${s.accel_coupling.metric_name} · healthy ${s.accel_coupling.healthy_range}`
              }
              hint="Eccentric:concentric balance. Red if <0.7 or >2.0. ASP personal-z (Osgnach 2023) above 0 means more decel-skewed than the player's own normal pattern."
              info="Ratio of decelerations to accelerations. Healthy athletes brake roughly as often as they accelerate (0.8–1.2). RED if <0.7 (one-sided, accel-heavy — sprint volume outpacing braking control, raises hamstring strain risk on the sprint side and ACL risk when forced to brake suddenly without preparation). RED if >2.0 (one-sided, brake-heavy — chronic eccentric load on quad and patellar tendon, with cumulative ACL exposure from repeated high-impact braking). The ASP personal-z (Osgnach 2023) catches drift from the player's own pattern even when the absolute ratio still looks fine."
            />
            <Detail
              title="Decel : Sprint Coupling"
              flag={s.sprint_coupling.flag}
              big={s.sprint_coupling.recent_ratio > 0 ? s.sprint_coupling.recent_ratio.toFixed(2) : "—"}
              caption={
                s.sprint_coupling.recent_ratio > 0
                  ? `${s.sprint_coupling.metric_name} · healthy ${s.sprint_coupling.healthy_range}`
                  : `Awaiting Catapult Vel B6+ Total # Efforts (Gen 2) field. Will populate after next sync.`
              }
              hint="McBurnie's primary risk metric. Red if <0.5 (sprinting without proper braking)."
              info="McBurnie's primary risk metric. Ratio of decelerations to high-speed sprint efforts. A player who sprints without proportional braking volume is exposing the knee (ACL via under-conditioned hamstring co-activation), quadriceps (eccentric overload on the next braking event) and ankle to forces they're not conditioned for. The hamstring is at risk on the sprint side, not the braking side — heavy sprint with limited brake exposure is a dual mechanism. RED if <0.5 — sprint exposure outpacing braking control. Yellow ≥0.5 but below the player's healthy range."
            />
            <Detail
              title="Exposure Concentration"
              flag={s.concentration.flag}
              big={`${s.concentration.peak_day_pct_of_28d.toFixed(1)}%`}
              caption={`Peak day's share of 28-day total · ${s.concentration.distinct_high_intensity_days} active days`}
              hint="Red if peak-day > 30% of monthly volume."
              info="How much of the 28-day decel volume happened on the single peak day. Spread is good, concentration is risky. RED if more than 30% of monthly volume in one day — sudden spike rather than chronic accumulation, which is the classic injury-pattern signature. Look for this when the rest of the week was quiet."
            />
            {/* Dos'Santos 2021 — Sharp Cut Load (proxy via IMA Band 3 decel count) */}
            {row.cutting && (
              <Detail
                title="Sharp Cut Load"
                flag={row.cutting.cuts_flag === "insufficient" ? "unknown" : row.cutting.cuts_flag}
                big={`${row.cutting.cuts_7d} / ${row.cutting.cuts_28d}`}
                caption={
                  row.cutting.cuts_personal_z != null
                    ? `7d / 28d · personal z = ${row.cutting.cuts_personal_z >= 0 ? "+" : ""}${row.cutting.cuts_personal_z.toFixed(2)}`
                    : "7d / 28d total · awaiting baseline"
                }
                hint="Dos'Santos 2021. Proxy via IMA B3 decels. Red if z ≥ 1.5 vs personal 28d distribution. Sharp 70-90° cuts produce highest knee-joint load."
                info="Sharp 70-90° change-of-direction cuts produce the highest knee-joint load and are the dominant non-contact ACL injury mechanism (Dos'Santos 2021). MicroPulse uses IMA Band 3 deceleration count as a proxy — high IMA decels at high intensity correlate with cutting volume. Personal-z compares the last 7 days against the player's own 28-day distribution. RED if z ≥ 1.5 — meaningfully above their normal cutting load."
              />
            )}
            {/* Osgnach 2023 — MPE Recovery Time (recovery lengthening = early fatigue) */}
            {row.mpe && (
              <Detail
                title="MPE Recovery Time"
                flag={row.mpe.flag}
                big={
                  row.mpe.recent_7d_avg_s != null
                    ? `${row.mpe.recent_7d_avg_s.toFixed(0)}s`
                    : "—"
                }
                caption={
                  row.mpe.baseline_28d_avg_s != null
                    ? `7d avg vs 28d baseline ${row.mpe.baseline_28d_avg_s.toFixed(0)}s · z = ${row.mpe.z_score != null ? (row.mpe.z_score >= 0 ? "+" : "") + row.mpe.z_score.toFixed(2) : "—"}`
                    : "Awaiting baseline"
                }
                hint="Osgnach 2023. Inter-MPE recovery time lengthening (positive z) is sharper than HSR drop as a fatigue signal. Red if z ≥ 1.5."
                info="Average recovery time between Metabolic Power Equivalent (MPE) high-intensity efforts. When this lengthens it means the player needs more rest between bursts — an early-fatigue signal that's sharper than the classic HSR drop because it shows up before raw running output declines (Osgnach 2023). RED if z ≥ 1.5 — recovery is meaningfully longer than the player's own 28-day baseline."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ title, flag, big, caption, hint, info }: {
  title: string;
  flag: Flag;
  big: string;
  caption: string;
  hint: string;
  /** Optional longer explanation surfaced via a hoverable info icon next
   *  to the title. Coaches without S&C background want to know WHY a
   *  metric matters and WHAT the red threshold actually means. */
  info?: string;
}) {
  const dot = {
    red: "bg-red-500",
    yellow: "bg-amber-500",
    green: "bg-emerald-500",
    unknown: "bg-slate-400",
  }[flag];
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {title}
        </span>
        {info && (
          // Hover OR focus to reveal — keyboard-accessible. The tooltip is
          // anchored bottom-left of the icon so it doesn't get clipped by
          // the card edge on the right side of the grid.
          <span className="relative inline-flex group">
            <button
              type="button"
              aria-label={`More info about ${title}`}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              i
            </button>
            <span
              role="tooltip"
              className="invisible group-hover:visible group-focus-within:visible absolute left-0 top-5 z-30 w-72 rounded-md border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700 shadow-lg"
            >
              {info}
            </span>
          </span>
        )}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{big}</div>
      <div className="text-[11px] text-slate-600">{caption}</div>
      <div className="mt-1 text-[10px] italic text-slate-500">{hint}</div>
    </div>
  );
}

function FlagBadge({ flag, label }: { flag: Flag; label: string }) {
  const cls = {
    red: "bg-red-500 text-white",
    yellow: "bg-amber-500 text-white",
    green: "bg-emerald-500 text-white",
    unknown: "bg-slate-300 text-slate-700",
  }[flag];
  return (
    <span className={`hidden rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase sm:inline ${cls}`}>
      {label}
    </span>
  );
}

function CountCard({ tone, label, n }: { tone: "red" | "yellow" | "green" | "gray"; label: string; n: number }) {
  const palette = {
    red:    { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     num: "text-red-600" },
    yellow: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   num: "text-amber-600" },
    green:  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", num: "text-emerald-600" },
    gray:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   num: "text-slate-500" },
  }[tone];
  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} px-4 py-3`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${palette.text}`}>{label}</div>
      <div className={`text-2xl font-bold ${palette.num}`}>{n}</div>
    </div>
  );
}
