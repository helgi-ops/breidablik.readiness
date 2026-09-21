"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { DrillActual } from "@/lib/micropulse/drillActuals";
import { profileFromDrillLoadRow, mergeLoadFactors, DEFAULT_LOAD_FACTORS, type LoadFactors } from "@/lib/micropulse/load/drillLoadProfile";

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
    balTitle: "Álagsjafnvægi — planað vs raun",
    balPlanned: "Planað",
    balDelivered: "Raun",
    balHighSpeed: "Háhraða",
    balMuscular: "Vöðva–liða",
    balMatch: "eins og planað",
    balDiverge: "vék frá plani",
    balOfPlan: "af plani",
    balNoBaseline: "plan of lágt til að bera saman",
    balLowPlan: "plan of lágt",
    balNote: "Aðeins háhraða/vélræn kerfi leysast úr daglegu GPS (loftháð þarf púls, hraði þarf hámarkshraða per leikmann). Mohr-viðmið — lýsandi, aldrei viðbragðsliturinn.",
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
    balTitle: "Load balance — planned vs delivered",
    balPlanned: "Planned",
    balDelivered: "Delivered",
    balHighSpeed: "High-speed",
    balMuscular: "Muscular–joint",
    balMatch: "as planned",
    balDiverge: "diverged",
    balOfPlan: "of plan",
    balNoBaseline: "plan too low to compare",
    balLowPlan: "plan too low",
    balNote: "Only the high-speed / mechanical systems resolve from daily GPS (aerobic needs HR, speed needs each player's max sprint speed). Mohr heuristic — descriptive, never the readiness colour.",
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
    hir_total?: number;
    vel_b5?: number;
    vel_b6?: number;
    accel_b23?: number;
    decel_b23?: number;
    accel_total?: number;
    decel_total?: number;
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

const numMetric = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

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

  // The team's Mohr load factors (persisted override, or defaults) — keep planned vs
  // delivered on the same factor set the builder used. Best-effort; defaults until fetched.
  const [loadFactors, setLoadFactors] = useState<LoadFactors>(DEFAULT_LOAD_FACTORS);
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const res = await fetch(`/api/coach/load-factors?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !json.ok) return;
        setLoadFactors(mergeLoadFactors(json.factors));
      } catch { /* defaults stand */ }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

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
            {/* Planned-vs-delivered energy-system balance (Mohr) — the verdict read
                above the per-drill actuals. Descriptive; never the readiness colour. */}
            {(s.items ?? []).some((it) => it.actual) && (
              <LoadBalanceComparison session={s} lang={lang} factors={loadFactors} />
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

const BAL_COLOR: Record<"anaerobic" | "muscular", string> = { anaerobic: "#de9328", muscular: "#2740e6" };

/**
 * Planned-vs-delivered energy-system balance (Mohr multiplying-factor model).
 *
 * Planned = the session's drill_library band means × sets; delivered = the synced
 * per-drill actuals — both mapped through the tested profileFromDrillLoadRow adapter
 * and rolled up. Only the high-speed and mechanical systems resolve from daily-summary
 * GPS (aerobic needs per-drill HR, speed-effort counts need each player's MSS), so the
 * comparison is those two + an honest caveat. Descriptive; never the readiness colour.
 */
function LoadBalanceComparison({
  session,
  lang,
  factors,
}: {
  session: SavedSession;
  lang: "IS" | "EN";
  factors: LoadFactors;
}) {
  const t = SL_COPY[lang];
  const cmp = useMemo(() => {
    // PLANNED = the session's frozen build-time totals (Σ drill estimates × sets, in the
    // same units as the actuals). This is the coach's committed plan — NOT the current
    // drill_library, which self-recalibrates toward delivered and would read ~100%.
    // DELIVERED = Σ the synced per-drill actuals. Each side → one aggregate profile row.
    const tot = session.totals;
    if (!tot) return null;
    const planned = profileFromDrillLoadRow({
      duration_min: numMetric(tot.duration_min), distance_m: numMetric(tot.distance_m), hir_total: numMetric(tot.hir_total),
      vel_b5: numMetric(tot.vel_b5), vel_b6: numMetric(tot.vel_b6), max_velocity: null,
      accel_b23: numMetric(tot.accel_b23), decel_b23: numMetric(tot.decel_b23),
      accel_total: numMetric(tot.accel_total), decel_total: numMetric(tot.decel_total),
    }, null, factors);
    const del = { vel_b5: 0, vel_b6: 0, accel_b23: 0, decel_b23: 0, accel_total: 0, decel_total: 0, distance_m: 0, duration_min: 0 };
    let anyActual = false;
    for (const it of session.items ?? []) {
      const a = it.actual;
      if (!a) continue;
      anyActual = true;
      del.vel_b5 += numMetric(a.vel_b5); del.vel_b6 += numMetric(a.vel_b6);
      del.accel_b23 += numMetric(a.accel_b23); del.decel_b23 += numMetric(a.decel_b23);
      del.accel_total += numMetric(a.accel_total); del.decel_total += numMetric(a.decel_total);
      del.distance_m += numMetric(a.distance_m); del.duration_min += numMetric(a.duration_min);
    }
    if (!anyActual) return null;
    const delivered = profileFromDrillLoadRow({ ...del, hir_total: null, max_velocity: null }, null, factors);
    if (planned.total <= 0 || delivered.total <= 0) return null;
    // Compare each GPS-resolvable system's DELIVERED vs PLANNED in absolute AU (a
    // ratio) — cross-category shares are meaningless because the Mohr factors put
    // muscular counts on a different scale to running distance. aerobic / speed are
    // structurally 0 here (no HR / no per-player MSS), so they aren't compared.
    // A category only gets a % when its PLANNED baseline is above a floor — a
    // near-zero plan estimate (e.g. a session built on an immature drill library)
    // would otherwise blow the ratio up to a meaningless 2000%. Below the floor we
    // show the delivered AU with no ratio ("plan too low to compare").
    const MIN_PLAN_AU = 20;
    const cats: Array<"anaerobic" | "muscular"> = ["anaerobic", "muscular"];
    const rows = cats
      .map((c) => {
        const p = planned.byCategory[c];
        const del = delivered.byCategory[c];
        const pct = p >= MIN_PLAN_AU ? Math.round((del / p) * 100) : null;
        const band = pct == null ? "na" : pct < 80 ? "under" : pct > 120 ? "over" : "on";
        return { cat: c, planned: p, delivered: del, pct, band };
      })
      .filter((r) => r.planned > 0 || r.delivered > 0);
    if (!rows.length) return null;
    const off = rows.filter((r) => r.band === "under" || r.band === "over");
    const worst = off.slice().sort((a, b) => Math.abs((b.pct ?? 100) - 100) - Math.abs((a.pct ?? 100) - 100))[0] ?? null;
    const anyComparable = rows.some((r) => r.pct != null);
    return { rows, worst, anyComparable };
  }, [session, factors]);

  if (!cmp) return null;
  const label = (c: "anaerobic" | "muscular") => (c === "anaerobic" ? t.balHighSpeed : t.balMuscular);
  const bandColor = (b: string) => (b === "on" ? "text-emerald-700" : b === "under" ? "text-orange-700" : b === "over" ? "text-red-700" : "text-slate-400");
  const fmtPct = (pct: number) => (pct > 250 ? ">250%" : `${pct}%`);
  const verdict = cmp.worst
    ? { text: `${label(cmp.worst.cat)} ${t.balDiverge} (${fmtPct(cmp.worst.pct as number)} ${t.balOfPlan})`, cls: "bg-amber-100 text-amber-700" }
    : cmp.anyComparable
      ? { text: t.balMatch, cls: "bg-emerald-100 text-emerald-700" }
      : { text: t.balNoBaseline, cls: "bg-slate-100 text-slate-500" };

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.balTitle}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${verdict.cls}`}>{verdict.text}</span>
      </div>
      <div className="space-y-2">
        {cmp.rows.map((r) => (
          <div key={r.cat} className="text-[11px]">
            <div className="mb-0.5 flex items-center justify-between text-slate-600">
              <span>{label(r.cat)}</span>
              <span className="tabular-nums">
                <span className={`font-semibold ${bandColor(r.band)}`}>{r.pct != null ? `${fmtPct(r.pct)} ${t.balOfPlan}` : t.balLowPlan}</span>
                <span className="ml-2 text-slate-400">{t.balPlanned} {Math.round(r.planned)} · {t.balDelivered} {Math.round(r.delivered)} AU</span>
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded bg-slate-200">
              {/* delivered as a % of plan; the mid line marks 100% (on plan), full width = 200% */}
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" aria-hidden />
              <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.min(100, ((r.pct ?? 0) / 200) * 100)}%`, backgroundColor: BAL_COLOR[r.cat], opacity: r.pct == null ? 0 : 1 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] leading-snug text-slate-400">{t.balNote}</div>
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
