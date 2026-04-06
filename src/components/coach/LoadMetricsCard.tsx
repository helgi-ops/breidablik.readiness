"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { acwrBandBadgeClass } from "@/lib/player-load-metrics/formatters";
import type { AcwrBand, LoadTrend } from "@/lib/player-load-metrics/types";

type Row = {
  player_id: string;
  player_name: string;
  daily_load: number;
  acute_load_7d: number | null;
  chronic_load_28d: number | null;
  acwr: number | null;
  acwr_band: AcwrBand;
  load_trend: LoadTrend;
};

type ResponsePayload = {
  ok: boolean;
  error?: string;
  summary?: {
    avgAcuteLoad: number | null;
    avgChronicLoad: number | null;
    avgAcwr: number | null;
    acwrCautionCount: number;
    acwrRiskCount: number;
  };
  rows?: Row[];
  missingPlayers?: Array<{ player_id: string; player_name: string; status: "NO_SUBMISSION" }>;
  rosterCount?: number;
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function LoadMetricsCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ResponsePayload | null>(null);

  const load = async (targetDate = dateKey) => {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams({ date: targetDate });
      if (teamId) qs.set("teamId", teamId);
      const res = await fetch(`/api/coach/player-load/metrics?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as ResponsePayload;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load load metrics.");
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load load metrics.";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const rows = data?.rows ?? [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Session RPE</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Load Metrics</div>
          <div className="mt-1 text-xs text-slate-500">
            Acute = 7-day avg, Chronic = 28-day avg, ACWR = Acute / Chronic. Context metric only.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateKey}
            onChange={(e) => {
              const next = e.target.value;
              setDateKey(next);
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) void load(next);
            }}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void load(dateKey)}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg Acute Load</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.avgAcuteLoad ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg Chronic Load</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.avgChronicLoad ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-blue-700">Avg ACWR</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-blue-800">{loading ? "—" : data?.summary?.avgAcwr ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">ACWR caution</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary?.acwrCautionCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-rose-700">ACWR risk</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-rose-800">{loading ? "—" : data?.summary?.acwrRiskCount ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">Player load metrics</div>
          {rows.length === 0 ? (
            <div className="mt-2 text-xs text-slate-500">No metrics for selected date.</div>
          ) : (
            <div className="mt-2 max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Player</th>
                    <th className="py-1 pr-2">Daily</th>
                    <th className="py-1 pr-2">Acute</th>
                    <th className="py-1 pr-2">Chronic</th>
                    <th className="py-1 pr-2">ACWR</th>
                    <th className="py-1">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.player_id} className="border-t align-top">
                      <td className="py-1 pr-2 font-medium text-slate-800">{row.player_name}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{row.daily_load}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{row.acute_load_7d ?? "—"}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{row.chronic_load_28d ?? "—"}</td>
                      <td className="py-1 pr-2">
                        <span className="tabular-nums font-semibold text-slate-800">{row.acwr ?? "—"}</span>
                        <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${acwrBandBadgeClass(row.acwr_band)}`}>
                          {row.acwr_band}
                        </span>
                      </td>
                      <td className="py-1 text-slate-600">{row.load_trend ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
