"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { formatWeekSetupDayLabel } from "@/lib/session-rpe/formatters";

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
  /** Session type resolved against the Week setup (e.g. match day → match). */
  effective_session_type: string;
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

type WeekSetupDay = {
  day_type: string;
  focus: string | null;
};

type SummaryResponse = {
  ok: boolean;
  error?: string;
  dateKey: string;
  teamId: string | null;
  weekSetupDay: WeekSetupDay | null;
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

export default function SessionRpeMonitoringCard({ teamId, date }: { teamId?: string | null; date?: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";

  const [dateKey, setDateKey] = useState(todayISO());
  // When the tab supplies a shared date, follow it (and hide our own picker).
  useEffect(() => { if (date && date !== dateKey) setDateKey(date); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reminderState, setReminderState] = useState<"idle" | "sending" | "sent" | "error">("idle");
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

  const weekSetupDay = data?.weekSetupDay ?? null;
  const weekDayLabel = weekSetupDay ? formatWeekSetupDayLabel(weekSetupDay.day_type) : null;
  const isMatchDay = String(weekSetupDay?.day_type ?? "").trim().toUpperCase() === "GAME";

  // ── Redesign helpers ──────────────────────────────────────────────────────
  // Session load → three display bands (Light / Moderate / Hard) for the header
  // distribution bar and the per-row left stripe.
  const bandColor = (b: string | null | undefined): string => {
    const u = String(b ?? "").toUpperCase();
    if (u === "HIGH" || u === "VERY_HIGH") return "#cb8420"; // Hard
    if (u === "MODERATE") return "#60a5fa";                  // Moderate
    return "#7dd3fc";                                        // Light
  };
  const bandCounts = (() => {
    let light = 0, mod = 0, hard = 0;
    for (const e of data?.entries ?? []) {
      const u = String(e.load_band ?? "").toUpperCase();
      if (u === "HIGH" || u === "VERY_HIGH") hard += 1;
      else if (u === "MODERATE") mod += 1;
      else light += 1;
    }
    return { light, mod, hard, total: (data?.entries?.length ?? 0) || 1 };
  })();
  // Submitted rows, heaviest first — the coach reads the biggest loads first.
  const sortedEntries = [...(data?.entries ?? [])].sort((a, b) => (b.session_load ?? 0) - (a.session_load ?? 0));

  const sendReminder = async () => {
    if (!teamId || reminderState === "sending") return;
    setReminderState("sending");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/notifications/manual-rpe-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ teamId, date: dateKey }),
      });
      setReminderState(res.ok ? "sent" : "error");
    } catch { setReminderState("error"); }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#292824]">Session RPE</div>
          <div className="mt-0.5 text-xs text-[#a9a69c]">
            {loading
              ? "—"
              : `${submittedCount} ${IS ? "skil" : "in"} · ${IS ? "meðal-RPE" : "avg RPE"} ${data?.summary.avgRpe ?? "—"} · ${IS ? "heildarálag" : "total load"} ${(data?.summary.totalDailyLoad ?? 0).toLocaleString("is-IS")}`}
          </div>
          {!loading && weekDayLabel ? (
            <div
              className={`mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                isMatchDay
                  ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
              title="Day type from Week setup"
            >
              <span className="opacity-70">Week setup:</span>
              <span>{weekDayLabel}</span>
              {weekSetupDay?.focus ? <span className="opacity-70">· {weekSetupDay.focus}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="flex h-2 w-[120px] shrink-0 overflow-hidden rounded-full" title={IS ? "Létt / miðlungs / hart álag" : "Light / moderate / hard load"}>
          {[{ n: bandCounts.light, c: "#7dd3fc" }, { n: bandCounts.mod, c: "#60a5fa" }, { n: bandCounts.hard, c: "#cb8420" }].map((b, i) => (
            <div key={i} style={{ width: `${(b.n / bandCounts.total) * 100}%`, background: b.c }} />
          ))}
        </div>

        {!date && (
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
        )}
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <>
          {/* Missing — a tinted strip with a one-click reminder + name chips. */}
          {data?.missingPlayers?.length ? (
            <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(251,247,233,0.4)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: "#8a5718" }}>
                  {data.missingPlayers.length} {IS ? "hafa ekki skilað" : "haven't submitted"}
                </span>
                <button type="button" onClick={sendReminder} disabled={reminderState === "sending" || reminderState === "sent"}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[11px] font-semibold disabled:opacity-60"
                  style={{ borderColor: "#eddfb4", color: "#8a5718" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
                  {reminderState === "sent" ? (IS ? "Sent ✓" : "Sent ✓")
                    : reminderState === "sending" ? (IS ? "Sendi…" : "Sending…")
                    : reminderState === "error" ? (IS ? "Villa" : "Error")
                    : (IS ? "Senda áminningu á alla" : "Remind everyone")}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.missingPlayers.map((p) => (
                  <span key={p.player_id} className="rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: "#eddfb4", color: "#6e6c64" }}>
                    {p.player_name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Submitted — a band-striped table, heaviest first; click a row to edit. */}
          <div className="mt-3">
            {!sortedEntries.length ? (
              <div className="flex min-h-[100px] items-center justify-center rounded-lg border border-dashed border-[#ddd9cf] px-2 text-center text-xs text-[#908d83]">
                {IS ? "Engar RPE-skráningar fyrir þennan dag." : "No Session RPE submissions for this date."}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_90px_44px_70px] gap-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#a9a69c" }}>
                  <span>{IS ? "Leikmaður" : "Player"}</span>
                  <span>{IS ? "Æfing" : "Session"}</span>
                  <span className="text-right">RPE</span>
                  <span className="text-right">{IS ? "Álag" : "Load"}</span>
                </div>
                <div className="max-h-[250px] overflow-y-auto">
                  {sortedEntries.map((row) => (
                    <button key={row.id} type="button" onClick={() => openEdit(row)}
                      title={IS ? "Smelltu til að breyta" : "Click to edit"}
                      className="grid w-full grid-cols-[1fr_90px_44px_70px] items-center gap-2 border-b border-[#f0eee7] px-2 py-1.5 text-left text-xs transition-colors hover:bg-[#faf9f5]"
                      style={{ borderLeft: `3px solid ${bandColor(row.load_band)}` }}>
                      <span className="truncate font-medium text-[#292824]">
                        {row.player_name}
                        {row.effective_session_type !== row.session_type ? <span className="ml-1 text-[10px]" style={{ color: "#4338ca" }}>({IS ? "vika" : "week"})</span> : null}
                      </span>
                      <span className="truncate text-[11px] text-[#908d83]">
                        {row.duration_minutes} {IS ? "mín" : "min"} · {new Date(row.submitted_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-right tabular-nums text-[#5a584f]">{row.rpe}</span>
                      <span className="text-right font-semibold tabular-nums text-[#292824]">{row.session_load}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 text-[10px] text-[#908d83]">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#7dd3fc" }} />{IS ? "Létt" : "Light"}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#60a5fa" }} />{IS ? "Miðlungs" : "Moderate"}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#cb8420" }} />{IS ? "Hart" : "Hard"}</span>
                  <span className="ml-auto italic">{IS ? "Smelltu á röð til að breyta" : "Click a row to edit"}</span>
                </div>
              </>
            )}
          </div>
        </>
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
