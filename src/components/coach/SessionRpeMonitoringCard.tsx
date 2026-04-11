"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { formatLoadBandClass, formatLoadBandLabel, formatSessionTypeLabel } from "@/lib/session-rpe/formatters";

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
  load_band: "VERY_LIGHT" | "LIGHT" | "MEDIUM" | "HIGH" | "VERY_HIGH";
};

type SessionRpeDailyTotal = {
  player_id: string;
  player_name: string;
  total_sessions: number;
  daily_load_total: number;
  avg_rpe: number | null;
  total_duration_minutes: number;
  latest_submission_at: string | null;
  load_band: "VERY_LIGHT" | "LIGHT" | "MEDIUM" | "HIGH" | "VERY_HIGH";
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

  // Edit-entry modal state
  const [editing, setEditing] = useState<SessionRpeEntry | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSessionType, setEditSessionType] = useState("team_training");
  const [editDuration, setEditDuration] = useState<number>(90);
  const [editRpe, setEditRpe] = useState<number>(5);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const openEdit = (entry: SessionRpeEntry) => {
    setEditing(entry);
    // Entries shown in the list are always filtered by the current dateKey, so use it as default.
    setEditDate(dateKey);
    setEditSessionType(entry.session_type || "team_training");
    setEditDuration(Number(entry.duration_minutes ?? 90));
    setEditRpe(Number(entry.rpe ?? 5));
    setEditError("");
  };

  const closeEdit = () => {
    if (savingEdit || deletingEdit) return;
    setEditing(null);
    setEditError("");
  };

  const deleteEntry = async () => {
    if (!editing) return;
    const ok = typeof window !== "undefined"
      ? window.confirm(`Eyða RPE færslu fyrir ${editing.player_name}? Þetta er ekki hægt að taka til baka.`)
      : true;
    if (!ok) return;

    setDeletingEdit(true);
    setEditError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch(`/api/coach/session-rpe/entries/${editing.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to delete entry.");

      setEditing(null);
      void loadSummary(dateKey);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete entry.";
      setEditError(msg);
    } finally {
      setDeletingEdit(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch(`/api/coach/session-rpe/entries/${editing.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_date: editDate,
          session_type: editSessionType,
          duration_minutes: editDuration,
          rpe: editRpe,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to save changes.");

      setEditing(null);
      // Re-fetch current view so moved entries disappear / updated entries reflect.
      void loadSummary(dateKey);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save changes.";
      setEditError(msg);
    } finally {
      setSavingEdit(false);
    }
  };

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
                            {formatLoadBandLabel(row.load_band)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="mt-1 inline-flex h-6 items-center rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                          title="Breyta dagsetningu / session type"
                        >
                          Breyta
                        </button>
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

      {editing ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Breyta RPE færslu</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{editing.player_name}</div>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Loka"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-700">Dagsetning æfingar / leiks</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  Notaðu dagsetningu leiksins ef leikmaður gaf einkunn eftir miðnætti.
                </span>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-700">Tegund tímabils</span>
                <select
                  value={editSessionType}
                  onChange={(e) => setEditSessionType(e.target.value)}
                  className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="match">Leikur (match)</option>
                  <option value="team_training">Liðsæfing (team training)</option>
                  <option value="gym">Styrktaræfing (gym)</option>
                  <option value="recovery">Endurheimt (recovery)</option>
                  <option value="individual">Einstaklingsæfing (individual)</option>
                  <option value="other">Annað</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-700">Tími (mín)</span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-700">RPE (1–10)</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editRpe}
                    onChange={(e) => setEditRpe(Number(e.target.value))}
                    className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-2 text-sm tabular-nums"
                  />
                </label>
              </div>

              <div className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                Nýtt session load: <span className="font-semibold tabular-nums text-slate-900">{Math.max(0, Math.round(editDuration * editRpe))}</span>
              </div>

              {editError ? <div className="text-xs text-rose-700">{editError}</div> : null}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void deleteEntry()}
                  disabled={savingEdit || deletingEdit}
                  className="inline-flex h-9 items-center rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  {deletingEdit ? "Eyði..." : "Eyða færslu"}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    disabled={savingEdit || deletingEdit}
                    className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
                  >
                    Hætta við
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={savingEdit || deletingEdit}
                    className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {savingEdit ? "Vista..." : "Vista breytingar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
