"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ValdBenchmarkPanel from "@/components/coach/ValdBenchmarkPanel";
import { resolveBenchmarkPop, type PopKey } from "@/lib/micropulse/vald/benchmarks";
import { batteryMetricMean, BATTERY_CODES } from "@/lib/integrations/vald/battery";

// ─── Types ────────────────────────────────────────────────────────────────────

type ForceDeckResult = {
  id: string;
  test_timestamp: string;
  test_type: string;
  trial_number: number;
  raw_test_id: string;
  jump_height_cm: number | null;
  rsi_mod: number | null;
  eccentric_duration_ms: number | null;
  concentric_duration_ms: number | null;
  peak_power_w: number | null;
  relative_peak_power_w_kg: number | null;
  peak_force_n: number | null;
  concentric_impulse_n_s: number | null;
  asymmetry_percent: number | null;
  asymmetry_side: string | null;
  left_value: number | null;
  right_value: number | null;
};

type NordBordResult = {
  id: string;
  test_timestamp: string;
  test_type: string;
  left_peak_force_n: number | null;
  right_peak_force_n: number | null;
  left_avg_force_n: number | null;
  right_avg_force_n: number | null;
  asymmetry_percent: number | null;
  asymmetry_side: string | null;
};

type ForceFrameResult = {
  id: string;
  test_timestamp: string;
  test_type: string;
  body_region: string | null;
  movement_pattern: string | null;
  left_peak_force_n: number | null;
  right_peak_force_n: number | null;
  asymmetry_percent: number | null;
  asymmetry_side: string | null;
};

/** IMTP summary (trial-mean of the latest test) for the benchmark panel context. */
type ImtpSummary = {
  relPeakForceNkg: number | null;
  relForce200Nkg: number | null;
  force100N: number | null;
  force200N: number | null;
  rfd100: number | null;
  rfd200: number | null;
  asymmetryPct: number | null;
};

type ValdMetricRow = { raw_test_id: string; test_timestamp: string; metric_code: string; limb: string; value: number | null };

/** Trial-mean the latest IMTP test's force/RFD codes, mirroring buildRtpAssessment. */
function summarizeImtp(all: ValdMetricRow[]): ImtpSummary | null {
  if (!all.length) return null;
  const latestId = all[0].raw_test_id;
  const rows = all.filter((r) => r.raw_test_id === latestId);
  const leftN = batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Left");
  const rightN = batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Right");
  const asym = leftN != null && rightN != null && Math.max(leftN, rightN) > 0
    ? (Math.abs(leftN - rightN) / Math.max(leftN, rightN)) * 100 : null;
  const round = (v: number | null) => (v == null ? null : Math.round(v));
  const rel = batteryMetricMean(rows, BATTERY_CODES.imtpRelForcePeak, "Trial") ?? batteryMetricMean(rows, BATTERY_CODES.imtpRelForcePeak, "Both");
  const rel200 = batteryMetricMean(rows, BATTERY_CODES.imtpRelForce200, "Trial");
  return {
    relPeakForceNkg: rel == null ? null : Number(rel.toFixed(1)),
    relForce200Nkg: rel200 == null ? null : Number(rel200.toFixed(1)),
    force100N: round(batteryMetricMean(rows, BATTERY_CODES.imtpForce100, "Trial")),
    force200N: round(batteryMetricMean(rows, BATTERY_CODES.imtpForce200, "Trial")),
    rfd100: round(batteryMetricMean(rows, BATTERY_CODES.imtpRfd100, "Trial")),
    rfd200: round(batteryMetricMean(rows, BATTERY_CODES.imtpRfd200, "Trial")),
    asymmetryPct: asym == null ? null : Number(asym.toFixed(1)),
  };
}

/**
 * Asymmetry straight from the L/R peak forces (ground truth). Some legacy rows
 * carry a spurious stored asymmetry_percent (e.g. 0 when L≠R), so we recompute
 * from the peaks whenever both are present and only fall back to the stored value.
 */
function deriveAsym(
  left: number | null,
  right: number | null,
  storedPct: number | null,
  storedSide: string | null,
): { pct: number | null; side: string | null } {
  if (left != null && right != null && Math.max(left, right) > 0) {
    const pct = (Math.abs(left - right) / Math.max(left, right)) * 100;
    return { pct, side: left <= right ? "left" : "right" };
  }
  return { pct: storedPct, side: storedSide };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null, decimals = 1, unit = ""): string {
  if (v == null) return "–";
  return `${v.toFixed(decimals)}${unit}`;
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString("is-IS", { day: "numeric", month: "short", year: "numeric" });
}

function asymmetryColor(pct: number | null): string {
  if (pct == null) return "#a9a493";
  const abs = Math.abs(pct);
  if (abs >= 15) return "#a83e28";
  if (abs >= 10) return "#cb8420";
  return "#1c7a4a";
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</div>
      <div className="text-xl font-bold text-zinc-900 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function AsymmetryBar({ pct, side }: { pct: number | null; side: string | null }) {
  if (pct == null) return <span className="text-zinc-400 text-sm">–</span>;
  const abs = Math.abs(pct);
  const color = asymmetryColor(pct);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-20 rounded-full bg-zinc-200">
        <div
          className="absolute left-1/2 top-0 h-2 rounded-full"
          style={{
            width: `${Math.min(abs, 50)}%`,
            marginLeft: side === "LEFT" || (pct ?? 0) < 0 ? `-${Math.min(abs, 50)}%` : "0",
            background: color,
          }}
        />
        <div className="absolute left-1/2 top-0 h-2 w-px bg-zinc-400" />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>
        {abs.toFixed(1)}% {side ?? ""}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DevPlayerVALDTab() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [forceDeckResults, setForceDeckResults] = useState<ForceDeckResult[]>([]);
  const [nordBordResults, setNordBordResults] = useState<NordBordResult[]>([]);
  const [forceFrameResults, setForceFrameResults] = useState<ForceFrameResult[]>([]);
  const [imtp, setImtp] = useState<ImtpSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pop, setPop] = useState<PopKey>("male_football");
  const [activeSection, setActiveSection] = useState<"forcedecks" | "nordbord" | "forceframe">("forcedecks");

  useEffect(() => {
    async function loadPlayer() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("player_id")
        .eq("id", userId)
        .maybeSingle();

      const mappedPlayerId =
        ((profile as { player_id?: string | null } | null)?.player_id ?? null);
      if (mappedPlayerId) {
        setPlayerId(mappedPlayerId);
        return;
      }

      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (player) setPlayerId(String((player as { id?: string | null } | null)?.id ?? ""));
    }
    loadPlayer();
  }, []);

  useEffect(() => {
    if (!playerId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function loadData() {
    if (!playerId) return;
    setLoading(true);
    const [fdRes, nbRes, ffRes, imtpRes] = await Promise.all([
      supabase
        .from("vald_forcedecks_results")
        .select("id, test_timestamp, test_type, trial_number, raw_test_id, jump_height_cm, rsi_mod, eccentric_duration_ms, concentric_duration_ms, peak_power_w, relative_peak_power_w_kg, peak_force_n, concentric_impulse_n_s, asymmetry_percent, asymmetry_side, left_value, right_value")
        .eq("microplayer_id", playerId)
        .eq("is_valid", true)
        .order("test_timestamp", { ascending: false })
        .order("trial_number", { ascending: true })
        .limit(60),
      supabase
        .from("vald_nordbord_results")
        .select("id, test_timestamp, test_type, left_peak_force_n, right_peak_force_n, left_avg_force_n, right_avg_force_n, asymmetry_percent, asymmetry_side")
        .eq("microplayer_id", playerId)
        .eq("is_valid", true)
        .order("test_timestamp", { ascending: false })
        .limit(20),
      supabase
        .from("vald_forceframe_results")
        .select("id, test_timestamp, test_type, body_region, movement_pattern, left_peak_force_n, right_peak_force_n, asymmetry_percent, asymmetry_side")
        .eq("microplayer_id", playerId)
        .eq("is_valid", true)
        .order("test_timestamp", { ascending: false })
        .limit(20),
      // IMTP (long-form metrics) — latest test, for the benchmark panel context.
      supabase
        .from("vald_test_metrics")
        .select("raw_test_id, test_timestamp, metric_code, limb, value")
        .eq("microplayer_id", playerId)
        .eq("test_type", "IMTP")
        .order("test_timestamp", { ascending: false })
        .limit(800),
    ]);
    setForceDeckResults((fdRes.data ?? []) as ForceDeckResult[]);
    setNordBordResults((nbRes.data ?? []) as NordBordResult[]);
    setForceFrameResults((ffRes.data ?? []) as ForceFrameResult[]);
    setImtp(summarizeImtp((imtpRes.data ?? []) as ValdMetricRow[]));

    // Benchmark population (sex + sport) from the player's team, for the reference bands.
    const { data: prow } = await supabase.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (prow as { team_id?: string | null } | null)?.team_id ?? null;
    if (teamId) {
      const { data: trow } = await supabase.from("teams").select("gender, sport").eq("id", teamId).maybeSingle();
      const tr = trow as { gender?: string | null; sport?: string | null } | null;
      setPop(resolveBenchmarkPop(tr?.gender, tr?.sport));
    }

    setLoading(false);
  }

  // Best jump from the most recent test session (highest jump_height_cm among trials with the same raw_test_id)
  const latestRawTestId = forceDeckResults[0]?.raw_test_id ?? null;
  const latestSessionTrials = latestRawTestId
    ? forceDeckResults.filter((r) => r.raw_test_id === latestRawTestId)
    : [];
  const latestFD = latestSessionTrials.length > 0
    ? latestSessionTrials.reduce((best, r) =>
        (r.jump_height_cm ?? 0) > (best.jump_height_cm ?? 0) ? r : best
      , latestSessionTrials[0])
    : forceDeckResults[0] ?? null;
  const latestNB = nordBordResults[0] ?? null;
  const latestNBAsym = deriveAsym(latestNB?.left_peak_force_n ?? null, latestNB?.right_peak_force_n ?? null, latestNB?.asymmetry_percent ?? null, latestNB?.asymmetry_side ?? null);
  // ForceFrame grouped by test type (Hip AD/AB, Ankle…) — newest-first within
  // each group, so each movement shows its own latest + history.
  const ffGroups = (() => {
    const m = new Map<string, ForceFrameResult[]>();
    for (const r of forceFrameResults) {
      const key = r.test_type || "ForceFrame";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].map(([testType, tests]) => ({ testType, region: tests[0]?.body_region ?? null, tests }));
  })();

  // Benchmark inputs — trial-mean of the latest CMJ session + latest limb tests.
  const fdMean = (f: (r: ForceDeckResult) => number | null): number | null => {
    const xs = latestSessionTrials.map(f).filter((v): v is number => v != null && Number.isFinite(v));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const nbMeanN = latestNB && latestNB.left_peak_force_n != null && latestNB.right_peak_force_n != null
    ? (latestNB.left_peak_force_n + latestNB.right_peak_force_n) / 2 : null;
  const groinFF = forceFrameResults.find((r) => /ad.?ab|adduct|groin|hip/i.test(`${r.test_type} ${r.body_region ?? ""}`));
  const groinAsymPct = groinFF ? deriveAsym(groinFF.left_peak_force_n, groinFF.right_peak_force_n, groinFF.asymmetry_percent, groinFF.asymmetry_side).pct : null;

  // Group ForceDecks results by session (raw_test_id) for history display
  type FDSession = { date: string; testType: string; trials: ForceDeckResult[]; bestJump: number | null };
  const fdSessions: FDSession[] = [];
  const seenSessions = new Map<string, FDSession>();
  for (const r of forceDeckResults) {
    let session = seenSessions.get(r.raw_test_id);
    if (!session) {
      session = { date: r.test_timestamp, testType: r.test_type, trials: [], bestJump: null };
      seenSessions.set(r.raw_test_id, session);
      fdSessions.push(session);
    }
    session.trials.push(r);
    if (r.jump_height_cm != null && (session.bestJump == null || r.jump_height_cm > session.bestJump)) {
      session.bestJump = r.jump_height_cm;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
        Hleð VALD gögnum…
      </div>
    );
  }

  const hasNoData = forceDeckResults.length === 0 && nordBordResults.length === 0 && forceFrameResults.length === 0 && imtp == null;

  if (hasNoData) {
    return (
      <div className="py-8">
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-8 py-12 text-center">
          <div className="text-3xl mb-3">🏋️</div>
          <div className="text-base font-semibold text-zinc-700 mb-1">Engin VALD gögn fundust</div>
          <div className="text-sm text-zinc-500 max-w-sm mx-auto">
            Þegar þjálfari hefur tengt VALD við liðið og þú hefur farið í próf, birtast niðurstöðurnar hér.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4">

      {/* How you compare vs your population reference + how to improve. */}
      <ValdBenchmarkPanel
        pop={pop}
        cmjJumpHeightCm={fdMean((r) => r.jump_height_cm)}
        cmjRsiMod={fdMean((r) => r.rsi_mod)}
        cmjRelPeakPowerWkg={fdMean((r) => r.relative_peak_power_w_kg)}
        cmjAsymPct={fdMean((r) => r.asymmetry_percent)}
        imtpRelForceNkg={imtp?.relPeakForceNkg}
        imtpRelForce200Nkg={imtp?.relForce200Nkg}
        imtpForce100N={imtp?.force100N}
        imtpForce200N={imtp?.force200N}
        imtpRfd0100Ns={imtp?.rfd100}
        imtpRfd0200Ns={imtp?.rfd200}
        imtpAsymPct={imtp?.asymmetryPct}
        nordbordMeanN={nbMeanN}
        groinAsymPct={groinAsymPct}
      />

      {/* Section toggle */}
      <div className="flex gap-2">
        {forceDeckResults.length > 0 && (
          <button
            onClick={() => setActiveSection("forcedecks")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeSection === "forcedecks"
                ? "text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
            style={activeSection === "forcedecks" ? { background: "#005a2b" } : {}}
          >
            ForceDecks (CMJ)
          </button>
        )}
        {nordBordResults.length > 0 && (
          <button
            onClick={() => setActiveSection("nordbord")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeSection === "nordbord"
                ? "text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
            style={activeSection === "nordbord" ? { background: "#005a2b" } : {}}
          >
            NordBord (Hamstrings)
          </button>
        )}
        {forceFrameResults.length > 0 && (
          <button
            onClick={() => setActiveSection("forceframe")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeSection === "forceframe"
                ? "text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
            style={activeSection === "forceframe" ? { background: "#005a2b" } : {}}
          >
            ForceFrame (Nári)
          </button>
        )}
      </div>

      {/* ── ForceDecks ── */}
      {activeSection === "forcedecks" && forceDeckResults.length > 0 && (
        <div className="space-y-4">
          {/* Latest result hero */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Síðasta próf</div>
                <div className="text-base font-semibold text-zinc-900 mt-0.5">
                  {latestFD?.test_type ?? "CMJ"} · {latestFD ? fmtDate(latestFD.test_timestamp) : "–"}
                </div>
              </div>
              <div
                className="rounded-xl px-3 py-1.5 text-sm font-bold"
                style={{ background: "#eaf3ec", color: "#16653d" }}
              >
                {fmt(latestFD?.jump_height_cm, 1, " cm")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Stökkhæð" value={fmt(latestFD?.jump_height_cm, 1, " cm")} />
              <MetricCard label="Peak Power" value={fmt(latestFD?.peak_power_w, 0, " W")} sub={latestFD?.relative_peak_power_w_kg != null ? `${latestFD.relative_peak_power_w_kg.toFixed(1)} W/kg` : undefined} />
              <MetricCard label="RSI-mod" value={fmt(latestFD?.rsi_mod, 2)} sub="Reactive Strength" />
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Asymmetry</div>
                <AsymmetryBar pct={latestFD?.asymmetry_percent ?? null} side={latestFD?.asymmetry_side ?? null} />
              </div>
            </div>
          </div>

          {/* History — grouped by test session */}
          {fdSessions.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">Saga</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-zinc-400 border-b">
                    <tr>
                      <th className="pb-2 text-left">Dagsetning</th>
                      <th className="pb-2 text-center">Hopp</th>
                      <th className="pb-2 text-right">Stökk (cm)</th>
                      <th className="pb-2 text-right">RSI-mod</th>
                      <th className="pb-2 text-right">Peak Power (W)</th>
                      <th className="pb-2 text-right">Asymm (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fdSessions.map((session, si) => (
                      session.trials.map((r, ti) => {
                        const isBest = session.trials.length > 1 && r.jump_height_cm != null && r.jump_height_cm === session.bestJump;
                        return (
                          <tr
                            key={r.id}
                            className={`hover:bg-zinc-50/60 ${ti === session.trials.length - 1 && si < fdSessions.length - 1 ? "border-b border-zinc-200" : ti > 0 ? "border-t border-zinc-50" : ""}`}
                          >
                            <td className="py-2 text-zinc-500 text-xs">
                              {ti === 0 ? fmtDate(r.test_timestamp) : ""}
                            </td>
                            <td className="py-2 text-center">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${isBest ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                                {r.trial_number}
                              </span>
                            </td>
                            <td className={`py-2 text-right tabular-nums ${isBest ? "font-bold text-emerald-700" : "font-semibold"}`}>
                              {fmt(r.jump_height_cm, 1)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{fmt(r.rsi_mod, 2)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{fmt(r.peak_power_w, 0)}</td>
                            <td className="py-2 text-right">
                              {r.asymmetry_percent != null ? (
                                <span className="font-semibold text-xs" style={{ color: asymmetryColor(r.asymmetry_percent) }}>
                                  {Math.abs(r.asymmetry_percent).toFixed(1)}% {r.asymmetry_side ?? ""}
                                </span>
                              ) : <span className="text-zinc-400">–</span>}
                            </td>
                          </tr>
                        );
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NordBord ── */}
      {activeSection === "nordbord" && nordBordResults.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Síðasta próf</div>
                <div className="text-base font-semibold text-zinc-900 mt-0.5">
                  {latestNB?.test_type ?? "NordBord"} · {latestNB ? fmtDate(latestNB.test_timestamp) : "–"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="Left Peak Force" value={fmt(latestNB?.left_peak_force_n, 0, " N")} />
              <MetricCard label="Right Peak Force" value={fmt(latestNB?.right_peak_force_n, 0, " N")} />
              <MetricCard label="Left Avg Force" value={fmt(latestNB?.left_avg_force_n, 0, " N")} />
              <MetricCard label="Right Avg Force" value={fmt(latestNB?.right_avg_force_n, 0, " N")} />
              <div className="col-span-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Asymmetry</div>
                <AsymmetryBar pct={latestNBAsym.pct} side={latestNBAsym.side} />
                <div className="mt-1 text-[10px] text-zinc-400">
                  {(latestNBAsym.pct ?? 0) < 10 ? "Góð jafnvægi" :
                   (latestNBAsym.pct ?? 0) < 15 ? "Lítil ójafnvægi — fylgjast með" :
                   "Marktæk ójafnvægi — athuga"}
                </div>
              </div>
            </div>
          </div>

          {/* History */}
          {nordBordResults.length > 1 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">Saga</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-zinc-400 border-b">
                    <tr>
                      <th className="pb-2 text-left">Dagsetning</th>
                      <th className="pb-2 text-right">L Peak (N)</th>
                      <th className="pb-2 text-right">R Peak (N)</th>
                      <th className="pb-2 text-right">L Avg (N)</th>
                      <th className="pb-2 text-right">R Avg (N)</th>
                      <th className="pb-2 text-right">Asymm (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {nordBordResults.map((r) => {
                      const a = deriveAsym(r.left_peak_force_n, r.right_peak_force_n, r.asymmetry_percent, r.asymmetry_side);
                      return (
                      <tr key={r.id} className="hover:bg-zinc-50/60">
                        <td className="py-2 text-zinc-500 text-xs">{fmtDate(r.test_timestamp)}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{fmt(r.left_peak_force_n, 0)}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{fmt(r.right_peak_force_n, 0)}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-600">{fmt(r.left_avg_force_n, 0)}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-600">{fmt(r.right_avg_force_n, 0)}</td>
                        <td className="py-2 text-right">
                          {a.pct != null ? (
                            <span className="font-semibold text-xs" style={{ color: asymmetryColor(a.pct) }}>
                              {Math.abs(a.pct).toFixed(1)}%
                            </span>
                          ) : <span className="text-zinc-400">–</span>}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ForceFrame (groin / adductor) — one card per test type ── */}
      {activeSection === "forceframe" && forceFrameResults.length > 0 && (
        <div className="space-y-4">
          {ffGroups.map((g) => {
            const latest = g.tests[0];
            const latestAsym = deriveAsym(latest.left_peak_force_n, latest.right_peak_force_n, latest.asymmetry_percent, latest.asymmetry_side);
            return (
              <div key={g.testType} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{g.testType}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {g.region ? `${g.region} · ` : ""}Síðasta próf {fmtDate(latest.test_timestamp)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Vinstri (Peak)" value={fmt(latest.left_peak_force_n, 0, " N")} />
                  <MetricCard label="Hægri (Peak)" value={fmt(latest.right_peak_force_n, 0, " N")} />
                  <div className="col-span-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Asymmetry</div>
                    <AsymmetryBar pct={latestAsym.pct} side={latestAsym.side} />
                    <div className="mt-1 text-[10px] text-zinc-400">
                      {(latestAsym.pct ?? 0) < 10 ? "Góð jafnvægi" :
                       (latestAsym.pct ?? 0) < 15 ? "Lítil ójafnvægi — fylgjast með" :
                       "Marktæk ójafnvægi — athuga"}
                    </div>
                  </div>
                </div>

                {/* History for this test type */}
                {g.tests.length > 1 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Saga</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-[10px] uppercase tracking-wide text-zinc-400 border-b">
                          <tr>
                            <th className="pb-2 text-left">Dagsetning</th>
                            <th className="pb-2 text-left">Próf</th>
                            <th className="pb-2 text-right">V (N)</th>
                            <th className="pb-2 text-right">H (N)</th>
                            <th className="pb-2 text-right">Asymm (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {g.tests.map((r, i) => {
                            const a = deriveAsym(r.left_peak_force_n, r.right_peak_force_n, r.asymmetry_percent, r.asymmetry_side);
                            return (
                              <tr key={r.id} className={`hover:bg-zinc-50/60 ${i === 0 ? "bg-emerald-50/40" : ""}`}>
                                <td className="py-2 text-zinc-500 text-xs">{fmtDate(r.test_timestamp)}{i === 0 ? " · nýjast" : ""}</td>
                                <td className="py-2 text-zinc-600 text-xs">{r.movement_pattern ?? r.test_type}</td>
                                <td className="py-2 text-right tabular-nums font-semibold">{fmt(r.left_peak_force_n, 0)}</td>
                                <td className="py-2 text-right tabular-nums font-semibold">{fmt(r.right_peak_force_n, 0)}</td>
                                <td className="py-2 text-right">
                                  {a.pct != null ? (
                                    <span className="font-semibold text-xs" style={{ color: asymmetryColor(a.pct) }}>
                                      {Math.abs(a.pct).toFixed(1)}%
                                    </span>
                                  ) : <span className="text-zinc-400">–</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
