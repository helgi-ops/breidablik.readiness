"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { loadBandBadgeClass, loadBandLabel } from "@/lib/player-load/formatters";
import type { DailyLoadSummaryResponse } from "@/lib/player-load/types";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";

type DailyInternalLoadResponse = {
  ok: boolean;
  error?: string;
} & Partial<DailyLoadSummaryResponse> & {
    rosterCount?: number;
  };

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function DailyInternalLoadCard({ teamId, date }: { teamId?: string | null; date?: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [dateKey, setDateKey] = useState(todayISO());
  // Follow the tab's shared date when supplied (and hide our own picker).
  useEffect(() => { if (date && date !== dateKey) setDateKey(date); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DailyInternalLoadResponse | null>(null);

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

      const res = await fetch(`/api/coach/player-load/daily?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as DailyInternalLoadResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load daily internal load.");
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load daily internal load.";
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

  // Answer-first: one plain sentence a coach reads in ~5 seconds — who trained
  // hard today (HIGH/VERY_HIGH band), or "all in range". The tiles/table below
  // are the drill-down.
  const [lang] = useLang();
  const IS = lang === "IS";
  const hardRows = rows.filter((r) => r.load_band === "HIGH" || r.load_band === "VERY_HIGH");
  const nWithLoad = data?.summary?.playersWithLoad ?? rows.length;
  const hardNames = hardRows.map((r) => r.player_name);
  const hardShown = hardNames.slice(0, 3).join(", ") + (hardNames.length > 3 ? ` +${hardNames.length - 3}` : "");
  const verdict = loading
    ? ""
    : error
    ? ""
    : rows.length === 0
    ? IS
      ? "Ekkert innra álag skráð fyrir þennan dag enn."
      : "No internal load logged for this day yet."
    : hardRows.length > 0
    ? IS
      ? `${hardRows.length} með þunga æfingu í dag: ${hardShown}. Aðrir í lagi.`
      : `${hardRows.length} logged a hard session today: ${hardShown}. The rest are in range.`
    : IS
    ? `Innra álag í lagi hjá liðinu í dag — ${nWithLoad} skráðu.`
    : `Internal load is in range across the squad today — ${nWithLoad} logged.`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Session RPE</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Daily Internal Load</div>
        </div>
        {!date && (
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
        )}
      </div>

      {verdict ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          {verdict}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Players with load</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.playersWithLoad ?? 0}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-blue-700">Team total load</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-blue-800">{loading ? "—" : data?.summary?.teamTotalLoad ?? 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg load</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.teamAvgLoad ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg RPE</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.avgRpe ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Highest load</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary?.highestLoad ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error && rows.length > 0 ? (
        <ShowDetails label={{ EN: "Show per-player breakdown", IS: "Sýna sundurliðun per leikmann" }}>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Player</th>
                    <th className="py-1 pr-2">Sessions</th>
                    <th className="py-1 pr-2">Duration</th>
                    <th className="py-1 pr-2">Avg RPE</th>
                    <th className="py-1 pr-2">Load</th>
                    <th className="py-1">Latest</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.player_id}-${row.load_date}`} className="border-t align-top">
                      <td className="py-1 pr-2 font-medium text-slate-800">{row.player_name}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{row.total_sessions}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{row.total_duration_minutes}m</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{row.avg_rpe ?? "—"}</td>
                      <td className="py-1 pr-2">
                        <span className="tabular-nums font-semibold text-slate-800">{row.total_load}</span>
                        <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${loadBandBadgeClass(row.load_band)}`}>
                          {loadBandLabel(row.load_band)}
                        </span>
                      </td>
                      <td className="py-1 text-slate-600">
                        {row.latest_submission_at
                          ? new Date(row.latest_submission_at).toLocaleTimeString("is-IS", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </ShowDetails>
      ) : null}
    </div>
  );
}
