"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { formatLoadBandClass, formatSessionTypeLabel } from "@/lib/session-rpe/formatters";

type SessionRpeSummary = {
  totalExpectedPlayers: number;
  totalSubmissions: number;
  missingSubmissions: number;
  avgRpe: number | null;
  totalDailyLoad: number;
  yesterdayTotalDailyLoad: number;
};

type SessionRpeEntry = {
  id: string;
  player_id: string;
  player_name: string;
  session_type: string;
  duration_minutes: number;
  rpe: number;
  session_load: number;
  submitted_at: string;
  load_band: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
};

type SessionRpeDailyTotal = {
  player_id: string;
  player_name: string;
  total_sessions: number;
  daily_load_total: number;
  avg_rpe: number | null;
  total_duration_minutes: number;
  latest_submission_at: string | null;
  load_band: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
};

type MissingPlayer = {
  player_id: string;
  player_name: string;
  status: "MISSING";
};

type SummaryResponse = {
  ok: boolean;
  error?: string;
  dateKey: string;
  teamId: string | null;
  summary: SessionRpeSummary;
  entries: SessionRpeEntry[];
  dailyTotals: SessionRpeDailyTotal[];
  missingPlayers: MissingPlayer[];
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateMinusDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function SessionRpeMonitoringCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SummaryResponse | null>(null);

  const loadSummary = async (targetDate = dateKey) => {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams({ date: targetDate });
      if (teamId) qs.set("teamId", teamId);

      const res = await fetch(`/api/coach/session-rpe/summary?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = (await res.json().catch(() => ({}))) as SummaryResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load Session RPE summary.");

      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load Session RPE summary.";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Session RPE</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Session RPE Monitoring</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const d = todayISO();
              setDateKey(d);
              void loadSummary(d);
            }}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              const d = dateMinusDays(todayISO(), 1);
              setDateKey(d);
              void loadSummary(d);
            }}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
          >
            Yesterday
          </button>
          <input
            type="date"
            value={dateKey}
            onChange={(e) => {
              const d = e.target.value;
              setDateKey(d);
              if (/^\d{4}-\d{2}-\d{2}$/.test(d)) void loadSummary(d);
            }}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void loadSummary(dateKey)}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total submissions</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.totalSubmissions ?? 0}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Missing submissions</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary.missingSubmissions ?? 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg RPE</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.avgRpe ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total daily load</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.totalDailyLoad ?? 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Yesterday total load</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.yesterdayTotalDailyLoad ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-700">Submitted players</div>
            {!data?.entries?.length ? (
              <div className="mt-2 text-xs text-slate-500">No Session RPE submissions for this date.</div>
            ) : (
              <div className="mt-2 max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-2">Player</th>
                      <th className="py-1 pr-2">Type</th>
                      <th className="py-1 pr-2">Dur</th>
                      <th className="py-1 pr-2">RPE</th>
                      <th className="py-1 pr-2">Load</th>
                      <th className="py-1">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((row) => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="py-1 pr-2 font-medium text-slate-800">{row.player_name}</td>
                        <td className="py-1 pr-2 text-slate-700">{formatSessionTypeLabel(row.session_type)}</td>
                        <td className="py-1 pr-2 tabular-nums text-slate-700">{row.duration_minutes}</td>
                        <td className="py-1 pr-2 tabular-nums text-slate-700">{row.rpe}</td>
                        <td className="py-1 pr-2">
                          <span className="tabular-nums font-semibold text-slate-800">{row.session_load}</span>
                          <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${formatLoadBandClass(row.load_band)}`}>
                            {row.load_band}
                          </span>
                        </td>
                        <td className="py-1 text-slate-600">
                          {new Date(row.submitted_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-700">Daily totals by player</div>
            {!data?.dailyTotals?.length ? (
              <div className="mt-2 text-xs text-slate-500">No daily totals available.</div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {data.dailyTotals.map((row) => (
                  <div key={row.player_id} className="flex items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5 text-xs">
                    <div>
                      <div className="font-medium text-slate-800">{row.player_name}</div>
                      <div className="text-slate-500">{row.total_sessions} sessions · {row.total_duration_minutes} min · avg RPE {row.avg_rpe ?? "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-slate-900">{row.daily_load_total}</div>
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${formatLoadBandClass(row.load_band)}`}>
                        {row.load_band}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 text-xs font-semibold text-slate-700">Missing players</div>
            {!data?.missingPlayers?.length ? (
              <div className="mt-1 text-xs text-slate-500">No missing submissions for this date.</div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.missingPlayers.map((p) => (
                  <span key={p.player_id} className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {p.player_name} · MISSING
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
