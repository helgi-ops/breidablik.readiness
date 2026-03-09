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

  const submittedCount = data?.summary.totalSubmissions ?? 0;
  const totalPlayers = data?.summary.totalExpectedPlayers ?? 0;
  const missingCount = data?.summary.missingSubmissions ?? 0;
  const compliancePercent = totalPlayers > 0 ? Math.round((submittedCount / totalPlayers) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Session RPE</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Session RPE Monitoring</div>
          <div className="mt-1 text-xs text-slate-500">
            {loading
              ? "—"
              : `${submittedCount} / ${totalPlayers} submitted · ${missingCount} missing · Compliance ${compliancePercent}%`}
          </div>
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

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total submissions</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{loading ? "—" : submittedCount}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Missing submissions</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums leading-none text-amber-800">{loading ? "—" : missingCount}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg RPE</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{loading ? "—" : data?.summary.avgRpe ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total daily load</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{loading ? "—" : data?.summary.totalDailyLoad ?? 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Yesterday total load</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{loading ? "—" : data?.summary.yesterdayTotalDailyLoad ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-2.5 grid items-stretch gap-2.5 xl:grid-cols-2">
          <div className="h-full rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-700">Submitted players</div>
              <div className="text-[11px] text-slate-500 tabular-nums">{data?.entries?.length ?? 0} entries</div>
            </div>

            <div className="mt-2 max-h-[220px] overflow-y-auto pr-1">
              {!data?.entries?.length ? (
                <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 text-center text-xs text-slate-500">
                  No Session RPE submissions for this date.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {data.entries.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium text-slate-800">{row.player_name}</div>
                        <div className="truncate text-[11px] text-slate-500">
                          {formatSessionTypeLabel(row.session_type)} · {row.duration_minutes} min ·{" "}
                          {new Date(row.submitted_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-slate-600">RPE {row.rpe}</div>
                        <div className="mt-0.5 inline-flex items-center gap-1">
                          <span className="font-semibold tabular-nums text-slate-900">{row.session_load}</span>
                          <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${formatLoadBandClass(row.load_band)}`}>
                            {row.load_band}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="h-full rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-700">Missing players</div>
              <div className="text-[11px] text-slate-500 tabular-nums">{data?.missingPlayers?.length ?? 0} missing</div>
            </div>

            <div className="mt-2 max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
              {!data?.missingPlayers?.length ? (
                <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 text-center text-xs text-slate-500">
                  No missing submissions for this date.
                </div>
              ) : (
                data.missingPlayers.map((p) => (
                  <div key={p.player_id} className="flex items-center justify-between rounded-md border border-amber-200/70 bg-amber-50/30 px-2 py-1.5 text-xs">
                    <span className="truncate pr-2 font-medium text-slate-800">{p.player_name}</span>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      MISSING
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
