"use client";

/**
 * PlayerHistoricalSnapshotCard
 * ─────────────────────────────
 * Lets the coach pick any player + date and pulls every readiness / load /
 * RPE / ACWR / Whoop / VBT / GPS row we have for that day. Useful for
 * post-hoc injury investigations ("Was Aron actually flagged as high risk
 * on March 17th?").
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { formatLoadBandClass, formatLoadBandLabel, formatSessionTypeLabel } from "@/lib/session-rpe/formatters";

type PlayerOption = { id: string; full_name: string | null };

type RiskDriver = {
  key: string;
  label: string;
  value: string;
  severity: "RED" | "AMBER";
  explanation: string;
};

type RiskAnalysis = {
  overallSeverity: "LOW" | "ELEVATED" | "HIGH";
  summary: string;
  drivers: RiskDriver[];
  recommendations: string[];
};

type Snapshot = {
  ok: boolean;
  error?: string;
  date: string;
  player: { id: string; full_name: string | null; team_id: string | null; position: string | null };
  summary: {
    daily_rpe_load_total: number;
    avg_rpe: number | null;
    rpe_count: number;
    load_band: "VERY_LIGHT" | "LIGHT" | "MEDIUM" | "HIGH" | "VERY_HIGH" | null;
    acwr: number | null;
    acwr_band: "OPTIMAL" | "CAUTION" | "RISK" | null;
    acute_load_7d: number | null;
    chronic_load_28d: number | null;
    readiness_total_raw: number | null; // 5-25 raw sum
    readiness_total: number | null; // 0-100 normalised
    readiness_band: "GREEN" | "AMBER" | "RED" | null;
    risk_flags: string[];
    session_type_mix: Record<string, number>;
    has_readiness: boolean;
    has_external_load: boolean;
    has_vbt: boolean;
    has_whoop: boolean;
  };
  risk_analysis: RiskAnalysis;
  context: {
    week_plan: Record<string, unknown> | null;
    schedule_events: Array<Record<string, unknown>>;
  };
  rpe: {
    entries: Array<{
      id: string;
      session_type: string;
      session_name: string | null;
      duration_minutes: number;
      rpe: number;
      session_load: number;
      source: string | null;
      notes: string | null;
      submitted_at: string;
    }>;
    trail_28d: Array<{ session_date: string; session_load: number | null; rpe: number | null }>;
  };
  readiness: {
    total_score: number | null;
    fatigue_energy: number | null;
    sleep_quality: number | null;
    sleep_duration: number | null;
    stress_mood: number | null;
    muscle_soreness: number | null;
    sore_areas: unknown;
    notes: string | null;
  } | null;
  load_metrics: {
    day: { acwr: number | null; acute_load_7d: number | null; chronic_load_28d: number | null; daily_load: number | null } | null;
    trail_28d: Array<{ metric_date: string; acwr: number | null; daily_load: number | null }>;
  };
  daily_load: Record<string, unknown> | null;
  external_load: Array<Record<string, unknown>>;
  whoop: Array<Record<string, unknown>>;
  vbt: Array<Record<string, unknown>>;
  individual_training_log: Array<Record<string, unknown>>;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function acwrClass(band: Snapshot["summary"]["acwr_band"]) {
  if (band === "RISK") return "border-rose-200 bg-rose-50 text-rose-800";
  if (band === "CAUTION") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "OPTIMAL") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function readinessClass(band: Snapshot["summary"]["readiness_band"]) {
  if (band === "RED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (band === "AMBER") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "GREEN") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function PlayerHistoricalSnapshotCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadPdf = async () => {
    if (!data) return;
    setDownloadingPdf(true);
    try {
      const [{ pdf }, { PlayerSnapshotPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./PlayerSnapshotPdf"),
      ]);
      const blob = await pdf(<PlayerSnapshotPdfDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const safeName = (data.player.full_name ?? "player").replace(/[^\p{L}\p{N}_-]+/gu, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `player-snapshot-${safeName}-${data.date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Load the roster for the dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let q = supabase.from("players").select("id, full_name").not("user_id", "is", null).order("full_name");
        if (teamId) q = q.eq("team_id", teamId);
        const { data: roster, error: rosterErr } = await q;
        if (cancelled) return;
        if (rosterErr) {
          setError(rosterErr.message);
          return;
        }
        setPlayers((roster ?? []) as PlayerOption[]);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load players.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, teamId]);

  const fetchSnapshot = async () => {
    if (!selectedPlayerId) {
      setError("Veldu leikmann.");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams({ playerId: selectedPlayerId, date: dateKey });
      const res = await fetch(`/api/coach/player-snapshot?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as Snapshot;
      if (!res.ok || !json?.ok) throw new Error((json as { error?: string })?.error ?? "Failed to load snapshot.");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load snapshot.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Player lookup</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Leikmannafyrirspurn — söguleg gögn</div>
          <div className="mt-1 text-xs text-slate-500">
            Veldu leikmann og dagsetningu til að sjá öll álag / wellness / ACWR / risk gögn fyrir þann dag.
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-700">Leikmaður</span>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="mt-1 h-9 min-w-[200px] rounded-md border border-slate-300 px-2 text-sm"
          >
            <option value="">— veldu —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? "(Nafnlaus)"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-slate-700">Dagsetning</span>
          <input
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            className="mt-1 h-9 rounded-md border border-slate-300 px-2 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={() => void fetchSnapshot()}
          disabled={loading || !selectedPlayerId}
          className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Sæki..." : "Sækja gögn"}
        </button>
      </div>

      {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{error}</div> : null}

      {data ? (
        <div className="mt-4 space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {data.player.full_name ?? "—"} <span className="text-xs font-normal text-slate-500">· {data.player.position ?? "—"}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Dagsetning: <span className="font-semibold">{data.date}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.risk_analysis.overallSeverity === "HIGH" ? (
                <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-[11px] font-bold uppercase text-rose-800">
                  ⚠ Há áhætta
                </span>
              ) : data.risk_analysis.overallSeverity === "ELEVATED" ? (
                <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-800">
                  ⚠ Aukin aðgát
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-800">
                  ✓ Lág áhætta
                </span>
              )}
              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={downloadingPdf}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {downloadingPdf ? "Bý til PDF…" : "Sækja PDF"}
              </button>
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className={`rounded-lg border p-2 ${acwrClass(data.summary.acwr_band)}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-70">ACWR</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums leading-none">
                {data.summary.acwr != null ? Number(data.summary.acwr).toFixed(2) : "—"}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold">{data.summary.acwr_band ?? "N/A"}</div>
            </div>
            <div className={`rounded-lg border p-2 ${readinessClass(data.summary.readiness_band)}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-70">Readiness</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums leading-none">
                {data.summary.readiness_total != null ? `${data.summary.readiness_total}%` : "—"}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold">
                {data.summary.readiness_band ?? "No entry"}
                {data.summary.readiness_total_raw != null ? (
                  <span className="ml-1 font-normal opacity-70">({data.summary.readiness_total_raw}/25)</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Daily load (sRPE)</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums leading-none">
                {data.summary.daily_rpe_load_total || "—"}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold">
                {data.summary.load_band ? (
                  <span className={`inline-flex rounded-full border px-1.5 py-0.5 ${formatLoadBandClass(data.summary.load_band)}`}>
                    {formatLoadBandLabel(data.summary.load_band)}
                  </span>
                ) : (
                  <span className="text-slate-500">No RPE</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg RPE ({data.summary.rpe_count})</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums leading-none">
                {data.summary.avg_rpe ?? "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                Acute 7d: {data.summary.acute_load_7d ?? "—"} · Chronic 28d: {data.summary.chronic_load_28d ?? "—"}
              </div>
            </div>
          </div>

          {/* Detailed risk analysis */}
          {data.risk_analysis.drivers.length > 0 ? (
            <div
              className={`rounded-lg border p-3 ${
                data.risk_analysis.overallSeverity === "HIGH"
                  ? "border-rose-300 bg-rose-50/70"
                  : "border-amber-300 bg-amber-50/60"
              }`}
            >
              <div
                className={`text-[11px] font-bold uppercase tracking-wide ${
                  data.risk_analysis.overallSeverity === "HIGH" ? "text-rose-800" : "text-amber-800"
                }`}
              >
                Áhættugreining
              </div>
              <div className="mt-1 text-xs text-slate-800">{data.risk_analysis.summary}</div>

              {/* Drivers */}
              <div className="mt-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Áhættuþættir ({data.risk_analysis.drivers.length})
                </div>
                {data.risk_analysis.drivers.map((d) => (
                  <div
                    key={d.key}
                    className={`rounded-md border px-2.5 py-2 ${
                      d.severity === "RED"
                        ? "border-rose-200 bg-white"
                        : "border-amber-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-900">
                        <span className="mr-1">{d.severity === "RED" ? "🟥" : "🟨"}</span>
                        {d.label}
                      </div>
                      <div className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-700">
                        {d.value}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-slate-700">{d.explanation}</div>
                  </div>
                ))}
              </div>

              {/* Recommendations */}
              {data.risk_analysis.recommendations.length > 0 ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Tillögur að aðgerðum
                  </div>
                  <ul className="mt-1 space-y-1 text-[11px] leading-snug text-slate-700">
                    {data.risk_analysis.recommendations.map((rec, i) => (
                      <li key={i}>→ {rec}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* RPE entries */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Session RPE entries</div>
            {data.rpe.entries.length === 0 ? (
              <div className="mt-1 text-xs text-slate-500">Engar RPE færslur fyrir þennan dag.</div>
            ) : (
              <div className="mt-2 space-y-1">
                {data.rpe.entries.map((e) => (
                  <div key={e.id} className="flex items-start justify-between rounded border px-2 py-1.5 text-xs">
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-slate-800">
                        {formatSessionTypeLabel(e.session_type)}
                        {e.session_name ? <span className="ml-1 text-slate-500">· {e.session_name}</span> : null}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {e.duration_minutes} mín · RPE {e.rpe} · Load {e.session_load} ·{" "}
                        {new Date(e.submitted_at).toLocaleString("is-IS", { dateStyle: "short", timeStyle: "short" })}
                        {e.source ? ` · src: ${e.source}` : ""}
                      </div>
                      {e.notes ? <div className="mt-0.5 text-[11px] italic text-slate-600">“{e.notes}”</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Wellness block */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Readiness / wellness</div>
            {data.readiness ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <WellnessCell
                  label="Total (raw 5–25)"
                  value={data.readiness.total_score}
                />
                <WellnessCell label="Sleep quality" value={data.readiness.sleep_quality} suffix="/5" />
                <WellnessCell
                  label="Sleep duration"
                  value={data.readiness.sleep_duration}
                  suffix={
                    data.readiness.sleep_duration != null
                      ? `/5 (${
                          ({ 1: "<5", 2: "5–6", 3: "6–7", 4: "7–8", 5: "8+" } as Record<number, string>)[
                            Number(data.readiness.sleep_duration)
                          ] ?? ""
                        } klst)`
                      : ""
                  }
                />
                <WellnessCell label="Fatigue / energy" value={data.readiness.fatigue_energy} suffix="/5" />
                <WellnessCell label="Stress / mood" value={data.readiness.stress_mood} suffix="/5" />
                <WellnessCell label="Muscle soreness" value={data.readiness.muscle_soreness} suffix="/5" />
                {data.readiness.notes ? (
                  <div className="col-span-full rounded bg-slate-50 p-1.5 text-[11px] italic text-slate-700">
                    Athugasemd: “{data.readiness.notes}”
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-500">Engin readiness færsla fyrir þennan dag.</div>
            )}
          </div>

          {/* GPS / External load */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">GPS / external load (Catapult)</div>
            {data.external_load.length === 0 ? (
              <div className="mt-1 text-xs text-slate-500">Engin GPS / FMP gögn fyrir þennan dag.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {data.external_load.map((row, i) => (
                  <ExternalLoadRowBlock key={i} row={row} />
                ))}
              </div>
            )}
          </div>

          {/* Whoop */}
          {data.whoop.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Whoop / monitoring</div>
              <div className="mt-2 space-y-1 text-xs">
                {data.whoop.map((w, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <WellnessCell label="Recovery" value={(w.recovery_score as number | null) ?? null} suffix="%" />
                    <WellnessCell label="HRV" value={(w.hrv as number | null) ?? null} />
                    <WellnessCell label="Resting HR" value={(w.resting_hr as number | null) ?? null} />
                    <WellnessCell label="Sleep perf" value={(w.sleep_performance as number | null) ?? null} suffix="%" />
                    <WellnessCell label="Strain" value={(w.workout_strain as number | null) ?? null} />
                    <WellnessCell label="Avg HR" value={(w.average_hr as number | null) ?? null} />
                    <WellnessCell label="Max HR" value={(w.max_hr as number | null) ?? null} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* VBT */}
          {data.vbt.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">GymAware VBT sessions</div>
              <div className="mt-2 text-xs text-slate-600">{data.vbt.length} session{data.vbt.length === 1 ? "" : "s"} skráðar</div>
            </div>
          ) : null}

          {/* Context */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Samhengi / week setup</div>
            <div className="mt-1 text-xs text-slate-600">
              {data.context.week_plan ? (
                <div>
                  Week plan day type:{" "}
                  <span className="font-semibold text-slate-800">
                    {String((data.context.week_plan as { day_type?: string }).day_type ?? "—")}
                  </span>
                </div>
              ) : (
                <div>Engin week_plan færsla.</div>
              )}
              {data.context.schedule_events.length > 0 ? (
                <div className="mt-1">
                  {data.context.schedule_events.length} schedule event{data.context.schedule_events.length === 1 ? "" : "s"} skráð.
                </div>
              ) : null}
            </div>
          </div>

          {/* Raw JSON toggle */}
          <details
            className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
            open={showRaw}
            onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Raw JSON (fyrir dýpri skoðun)
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-tight text-slate-700">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function WellnessCell({ label, value, suffix }: { label: string; value: number | null | undefined; suffix?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
        {value == null || value === undefined ? "—" : `${value}${suffix ?? ""}`}
      </div>
    </div>
  );
}

function ExternalLoadRowBlock({ row }: { row: Record<string, unknown> }) {
  const num = (k: string) => {
    const v = row[k];
    return v == null || v === undefined ? null : Number(v);
  };
  const source = (row.source as string | null) ?? "—";
  return (
    <div className="rounded border border-slate-200 p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Source: {source}</div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <WellnessCell label="Total dist (m)" value={num("total_distance")} />
        <WellnessCell label="Player load" value={num("total_player_load")} />
        <WellnessCell label="HSR (vb5+vb6)" value={num("high_speed_distance")} />
        <WellnessCell label="Sprint (vb6) m" value={num("velocity_band6_total_distance")} />
        <WellnessCell label="Accels" value={num("tot_as")} />
        <WellnessCell label="Decels" value={num("tot_ds")} />
        <WellnessCell label="Accel B2-3" value={num("accel_b2_3_tot_effs_gen2")} />
        <WellnessCell label="Decel B2-3" value={num("decel_b2_3_tot_effs_gen2")} />
        <WellnessCell label="IMA total" value={num("ima_total")} />
        <WellnessCell label="Impacts" value={num("impacts")} />
        <WellnessCell label="PL / min" value={num("player_load_per_minute")} />
      </div>
    </div>
  );
}
