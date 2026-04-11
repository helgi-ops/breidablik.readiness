"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type MechanicalLoadBand = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "EXTREME";
type ResidualMechanicalLoadBand = "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";
type MechanicalLoadConfidence = "high" | "medium" | "low";

type ResponseRow = {
  player_id: string;
  player_name: string;
  date: string;
  mli: number | null;
  mli_band: MechanicalLoadBand | null;
  residual_mli: number | null;
  residual_band: ResidualMechanicalLoadBand | null;
  dss: number | null;
  ass: number | null;
  css: number | null;
  gds: number | null;
  confidence: MechanicalLoadConfidence;
  confidence_reason: string;
  flags: string[];
};

type ResponsePayload = {
  ok: boolean;
  error?: string;
  summary?: {
    avgMli: number | null;
    highCount: number;
    extremeCount: number;
    residualElevatedCount: number;
  };
  rows?: ResponseRow[];
  missingPlayers?: Array<{ player_id: string; player_name: string; status: "NO_CATAPULT_DATA" }>;
  rosterCount?: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function bandClass(band: MechanicalLoadBand | null) {
  if (band === "EXTREME") return "border-red-200 bg-red-50 text-red-800";
  if (band === "VERY_HIGH") return "border-orange-200 bg-orange-50 text-orange-800";
  if (band === "HIGH") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "MODERATE") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function residualClass(band: ResidualMechanicalLoadBand | null) {
  if (band === "HIGH") return "border-red-200 bg-red-50 text-red-800";
  if (band === "CAUTION") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "ELEVATED") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function confidenceClass(confidence: MechanicalLoadConfidence) {
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function MechanicalLoadIndexCard({ teamId }: { teamId?: string | null }) {
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
      const res = await fetch(`/api/coach/player-load/mli?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as ResponsePayload;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load MLI.");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load MLI.");
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
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Catapult Derived</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Mechanical Load Index (MLI)</div>
          <div className="mt-1 text-xs text-slate-500">
            Derived mechanical stress score from acceleration, deceleration and density inputs.
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

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg MLI</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.avgMli ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Very high / extreme</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary?.highCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-rose-700">Extreme days</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-rose-800">{loading ? "—" : data?.summary?.extremeCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-blue-700">Residual elevated</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-blue-800">{loading ? "—" : data?.summary?.residualElevatedCount ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">Player mechanical load</div>
          {rows.length === 0 ? (
            <div className="mt-2 text-xs text-slate-500">No Catapult mechanical load data for selected date.</div>
          ) : (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Player</th>
                    <th className="py-1 pr-2">MLI</th>
                    <th className="py-1 pr-2">Residual</th>
                    <th className="py-1 pr-2">Sub-scores</th>
                    <th className="py-1 pr-2">Flags</th>
                    <th className="py-1">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={`${row.player_id}-${row.date}-${idx}`} className="border-t align-top">
                      <td className="py-1 pr-2 font-medium text-slate-800">{row.player_name}</td>
                      <td className="py-1 pr-2">
                        <span className="tabular-nums font-semibold text-slate-800">{row.mli ?? "—"}</span>
                        <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${bandClass(row.mli_band)}`}>
                          {row.mli_band?.replace("_", " ") ?? "—"}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <span className="tabular-nums font-semibold text-slate-800">{row.residual_mli ?? "—"}</span>
                        <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${residualClass(row.residual_band)}`}>
                          {row.residual_band ?? "—"}
                        </span>
                      </td>
                      <td className="py-1 pr-2 text-slate-600">
                        DSS {row.dss ?? "—"} · ASS {row.ass ?? "—"} · CSS {row.css ?? "—"} · GDS {row.gds ?? "—"}
                      </td>
                      <td className="py-1 pr-2 text-slate-600">{row.flags.length ? row.flags.join(" • ") : "—"}</td>
                      <td className="py-1">
                        <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${confidenceClass(row.confidence)}`}>
                          {row.confidence}
                        </span>
                      </td>
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

