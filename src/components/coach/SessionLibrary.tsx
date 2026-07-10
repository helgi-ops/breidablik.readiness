"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { DrillActual } from "@/lib/micropulse/drillActuals";

const SL_COPY = {
  IS: {
    title: "Vistaðar æfingar",
    loading: "Hleð…",
    empty: "Engar vistaðar æfingar ennþá.",
    deleteConfirm: "Eyða þessari æfingu?",
    deleted: "Eytt",
    errorFetch: "Villa við að sækja æfingar",
    errorDelete: "Villa við að eyða",
    by: "eftir",
    drills: "drillur",
    drill: "drilla",
    noName: "Ónefnd æfing",
    draft: "Drög",
    published: "Birt",
    publish: "Birta fyrir leikmenn",
    unpublish: "Afturkalla",
    publishedOn: "Birt",
    dateLabel: "Dagsetning",
    focusLabel: "Áherslur (1–8)",
    focusPlaceholder: "t.d. Switch, Þverhlaup, 3. hlaup",
    save: "Vista",
    errorPublish: "Villa við að birta",
    errorUpdate: "Villa við að uppfæra",
  },
  EN: {
    title: "Saved sessions",
    loading: "Loading…",
    empty: "No saved sessions yet.",
    deleteConfirm: "Delete this session?",
    deleted: "Deleted",
    errorFetch: "Error fetching sessions",
    errorDelete: "Error deleting",
    by: "by",
    drills: "drills",
    drill: "drill",
    noName: "Untitled session",
    draft: "Draft",
    published: "Published",
    publish: "Publish to players",
    unpublish: "Unpublish",
    publishedOn: "Published",
    dateLabel: "Date",
    focusLabel: "Focus points (1–8)",
    focusPlaceholder: "e.g. Switch play, 3rd-man runs",
    save: "Save",
    errorPublish: "Error publishing",
    errorUpdate: "Error updating",
  },
} as const;

type SavedSession = {
  id: string;
  session_name: string;
  md_day: string;
  target_pl: number | null;
  items: Array<{ drill_id: string; drill_name: string; sets: number; actual?: DrillActual | null }>;
  actuals_synced_at?: string | null;
  totals: {
    duration_min?: number;
    distance_m?: number;
    player_load?: number;
    vel_b5?: number;
    vel_b6?: number;
    accel_b23?: number;
    decel_b23?: number;
  } | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  published_by: string | null;
  session_date: string | null;
  focus_points: string[] | null;
};

function n(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(Number(v))) return "–";
  return Number(v).toFixed(digits);
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function SessionLibrary({ teamId }: { teamId: string }) {
  const [lang] = useLang();
  const t = SL_COPY[lang];
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Missing auth");
      const res = await fetch(`/api/coach/saved-sessions?team_id=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errorFetch);
      setSessions(json.sessions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, t.errorFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string>("");
  const [editingFocus, setEditingFocus] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function openPublishPanel(s: SavedSession) {
    if (expandedId === s.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(s.id);
    setEditingDate(s.session_date ?? "");
    setEditingFocus((s.focus_points ?? []).join("\n"));
  }

  async function patchSession(id: string, patch: Record<string, unknown>) {
    const token = await getAuthToken();
    if (!token) throw new Error("Missing auth");
    const res = await fetch(`/api/coach/saved-sessions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || t.errorUpdate);
    return json.session as SavedSession;
  }

  async function handleSaveMeta(s: SavedSession) {
    setBusyId(s.id);
    try {
      const focus = editingFocus
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8);
      const updated = await patchSession(s.id, {
        session_date: editingDate || null,
        focus_points: focus,
      });
      setSessions((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    } catch (e) {
      alert(t.errorUpdate + ": " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(s: SavedSession, publish: boolean) {
    setBusyId(s.id);
    try {
      // If publishing and there's pending date/focus edits in the panel for this session, save them first.
      const focus = editingFocus
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8);
      const patch: Record<string, unknown> = { publish };
      if (expandedId === s.id) {
        patch.session_date = editingDate || null;
        patch.focus_points = focus;
      }
      const updated = await patchSession(s.id, patch);
      setSessions((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    } catch (e) {
      alert(t.errorPublish + ": " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.deleteConfirm)) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`/api/coach/saved-sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errorDelete);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert(t.errorDelete + ": " + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">{t.loading}</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
        {t.empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const drillCount = s.items?.length ?? 0;
        const totals = s.totals;
        const dateStr = new Date(s.created_at).toLocaleDateString("is-IS", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        return (
          <div
            key={s.id}
            className="rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-900">
                    {s.session_name || t.noName}
                  </h3>
                  {s.md_day && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {s.md_day}
                    </span>
                  )}
                  {s.published_at ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t.published}
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {t.draft}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {s.session_date ? new Date(s.session_date + "T00:00:00").toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : dateStr}
                  {" · "}{drillCount} {drillCount === 1 ? t.drill : t.drills}
                  {s.focus_points && s.focus_points.length > 0 && (
                    <span className="ml-1 text-slate-400">· {s.focus_points.length} {lang === "IS" ? "áherslur" : "focus"}</span>
                  )}
                </div>
                {/* Drill names list */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(s.items ?? []).map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200"
                    >
                      {item.sets > 1 && (
                        <span className="mr-0.5 font-semibold text-slate-800">{item.sets}×</span>
                      )}
                      {item.drill_name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openPublishPanel(s)}
                  disabled={busyId === s.id}
                  className={`rounded px-2 py-1 text-xs font-semibold transition ${
                    s.published_at
                      ? "text-emerald-700 hover:bg-emerald-50"
                      : "text-blue-700 hover:bg-blue-50"
                  } disabled:opacity-40`}
                  title={s.published_at ? t.published : t.publish}
                >
                  {s.published_at ? t.published : t.publish}
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                  title={t.deleteConfirm}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>

            {expandedId === s.id && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-[11px]">
                    <span className="mb-1 block font-semibold text-slate-600">{t.dateLabel}</span>
                    <input
                      type="date"
                      value={editingDate}
                      onChange={(e) => setEditingDate(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block text-[11px]">
                    <span className="mb-1 block font-semibold text-slate-600">{t.focusLabel}</span>
                    <textarea
                      value={editingFocus}
                      onChange={(e) => setEditingFocus(e.target.value)}
                      placeholder={t.focusPlaceholder}
                      rows={4}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500">
                    {s.published_at && (
                      <>
                        {t.publishedOn}:{" "}
                        {new Date(s.published_at).toLocaleString(lang === "IS" ? "is-IS" : "en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveMeta(s)}
                      disabled={busyId === s.id}
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-40"
                    >
                      {t.save}
                    </button>
                    {s.published_at ? (
                      <button
                        onClick={() => handlePublish(s, false)}
                        disabled={busyId === s.id}
                        className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
                      >
                        {t.unpublish}
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(s, true)}
                        disabled={busyId === s.id}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
                      >
                        {t.publish}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Totals strip */}
            {totals && (
              <div className="grid grid-cols-4 gap-px border-t border-slate-100 bg-slate-100 text-center sm:grid-cols-7">
                <MiniStat label="PL" value={n(totals.player_load)} />
                <MiniStat label="Dur" value={n(totals.duration_min)} suffix={lang === "IS" ? "mín" : "min"} />
                <MiniStat label="Dist" value={n(totals.distance_m)} suffix="m" />
                <MiniStat label="V5" value={n(totals.vel_b5)} />
                <MiniStat label="V6" value={n(totals.vel_b6)} className="hidden sm:block" />
                <MiniStat label="Acc" value={n(totals.accel_b23)} className="hidden sm:block" />
                <MiniStat label="Dec" value={n(totals.decel_b23)} className="hidden sm:block" />
              </div>
            )}
            {/* Actual load per drill — from OpenField periods matched to the
                built drills. Mean-per-player; labelled with coverage + how it
                matched (name vs order) so the coach can trust it. */}
            {(s.items ?? []).some((it) => it.actual) && (
              <div className="border-t border-slate-100 bg-white px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {lang === "IS" ? "Raun álag per drillu" : "Actual load per drill"}
                  </span>
                  {s.actuals_synced_at && (
                    <span className="text-[10px] text-slate-400">
                      {lang === "IS" ? "samstillt " : "synced "}
                      {new Date(s.actuals_synced_at).toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB")}
                      {" · "}{lang === "IS" ? "frá Catapult periods (meðaltal per leikmann)" : "from Catapult periods (mean per player)"}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {(s.items ?? []).map((it, idx) => {
                    const a = it.actual;
                    return (
                      <div key={idx} className="flex items-center gap-2 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-slate-700">{it.drill_name}</span>
                        {a ? (
                          <>
                            <span className="tabular-nums text-slate-800"><b>{n(a.player_load)}</b> PL</span>
                            <span className="tabular-nums text-slate-500">{n(a.distance_m)} m</span>
                            <span className="text-slate-400">{a.n_players} {lang === "IS" ? "leikm." : "players"}</span>
                            <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${a.matched_by === "name" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                              {a.matched_by === "name" ? (lang === "IS" ? "nafn" : "name") : (lang === "IS" ? "röð" : "order")}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-300">{lang === "IS" ? "engin period-pörun" : "no period match"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={`bg-white px-2 py-1.5 ${className}`}>
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xs font-bold tabular-nums text-slate-800">
        {value}
        {suffix && <span className="ml-0.5 text-[9px] font-normal text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}
