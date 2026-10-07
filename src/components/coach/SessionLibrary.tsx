"use client";

/**
 * Saved sessions (Coaching Library → Drills → Sessions).
 *
 * Sessions grouped by MD day (MD-4 Mechanical → MD+1 Recovery), each group a compact table:
 * DATE · SESSION (name + stimulus-dot drill chips) · PLANNED (PL · min) · DELIVERED (synced
 * per-drill actuals, % of plan) · STATUS (Published / Draft). A row expands to the planned-vs-
 * delivered per-drill bars, focus points (editable), the energy-system balance read, and actions
 * (Open in builder · Duplicate · PDF · Publish/Unpublish · Delete).
 *
 * Reuses the drill library (for stimulus colour + per-drill planned PL + PDF/open-in-builder
 * reconstruction) and the saved-sessions API. Descriptive — never the readiness colour. EN/IS.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { DrillActual } from "@/lib/micropulse/drillActuals";
import { profileFromDrillLoadRow, mergeLoadFactors, DEFAULT_LOAD_FACTORS, type LoadFactors } from "@/lib/micropulse/load/drillLoadProfile";
import { classifyDrillStimulus, stimulusColorClasses, type StimulusType } from "@/lib/drill-stimulus";
import type { Drill } from "./CoachDrillLibrary";
import { downloadSessionPdf, type SessionPdfData } from "./SessionPdf";

const SL_COPY = {
  IS: {
    title: "Vistaðar æfingar", loading: "Hleð…", empty: "Engar vistaðar æfingar ennþá.",
    sessions: "æfingar", session1: "æfing",
    all: "Allar", published: "Birtar", drafts: "Drög",
    build: "+ Ný æfing",
    colDate: "Dagsetning", colSession: "Æfing", colPlanned: "Planað", colDelivered: "Raun", colStatus: "Staða",
    typical: "dæmigert", notTrained: "ekki æft enn", ofPlan: "af plani", asPlanned: "eins og planað",
    drillsMatched: "drillur pöruðust",
    draft: "Drög", pub: "Birt",
    perDrill: "Planað vs raun per drillu", syncedNote: "samstillt frá Catapult periods (meðaltal per leikmann)",
    plannedLegend: "Planað", deliveredLegend: "Raun (meðaltal per leikmann)",
    focus: "Áherslur", focusPlaceholder: "t.d. Switch play, 3. hlaup", dateLabel: "Dagsetning",
    openBuilder: "Opna í builder", duplicate: "Afrita", pdf: "PDF", publish: "Birta", unpublish: "Afturkalla", del: "Eyða", save: "Vista",
    copySuffix: " (afrit)", deleteConfirm: "Eyða þessari æfingu?",
    stim: { mechanical: "Vélrænt", locomotive: "Hlaup", mixed: "Blandað", technical: "Tæknilegt", speed: "Hraði", activation: "Virkjun", recovery: "Endurheimt", match: "Leikur" },
    err: "Villa",
    balTitle: "Álagsjafnvægi — planað vs raun", balHighSpeed: "Háhraða", balMuscular: "Vöðva–liða", balMatch: "eins og planað", balDiverge: "vék frá plani", balOfPlan: "af plani", balNoBaseline: "plan of lágt til að bera saman", balLowPlan: "plan of lágt", balPlanned: "Planað", balDelivered: "Raun",
    balNote: "Aðeins háhraða/vélræn kerfi leysast úr daglegu GPS. Mohr-viðmið — lýsandi, aldrei viðbragðsliturinn.",
  },
  EN: {
    title: "Saved sessions", loading: "Loading…", empty: "No saved sessions yet.",
    sessions: "sessions", session1: "session",
    all: "All", published: "Published", drafts: "Drafts",
    build: "+ Build session",
    colDate: "Date", colSession: "Session", colPlanned: "Planned", colDelivered: "Delivered", colStatus: "Status",
    typical: "typical", notTrained: "not trained yet", ofPlan: "of plan", asPlanned: "as planned",
    drillsMatched: "drills matched",
    draft: "Draft", pub: "Published",
    perDrill: "Planned vs delivered per drill", syncedNote: "synced from Catapult periods (mean per player)",
    plannedLegend: "Planned", deliveredLegend: "Delivered (mean per player)",
    focus: "Focus points", focusPlaceholder: "e.g. Switch play, 3rd-man runs", dateLabel: "Date",
    openBuilder: "Open in builder", duplicate: "Duplicate", pdf: "PDF", publish: "Publish", unpublish: "Unpublish", del: "Delete", save: "Save",
    copySuffix: " (copy)", deleteConfirm: "Delete this session?",
    stim: { mechanical: "Mechanical", locomotive: "Locomotive", mixed: "Mixed", technical: "Technical", speed: "Speed", activation: "Activation", recovery: "Recovery", match: "Match" },
    err: "Error",
    balTitle: "Load balance — planned vs delivered", balHighSpeed: "High-speed", balMuscular: "Muscular–joint", balMatch: "as planned", balDiverge: "diverged", balOfPlan: "of plan", balNoBaseline: "plan too low to compare", balLowPlan: "plan too low", balPlanned: "Planned", balDelivered: "Delivered",
    balNote: "Only the high-speed / mechanical systems resolve from daily GPS. Mohr heuristic — descriptive, never the readiness colour.",
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
    duration_min?: number; distance_m?: number; player_load?: number; hir_total?: number;
    vel_b5?: number; vel_b6?: number; accel_b23?: number; decel_b23?: number; accel_total?: number; decel_total?: number;
  } | null;
  created_by: string; created_at: string; updated_at: string;
  published_at: string | null; published_by: string | null;
  session_date: string | null; focus_points: string[] | null;
  recipient_player_ids?: string[] | null;
  groups?: Array<{ id: string; name: string; player_ids: string[] }> | null;
};

type Filter = "all" | "published" | "drafts";

// MD day → ordering + stimulus key for the group header.
const MD_ORDER: Array<{ key: string; stim: keyof typeof SL_COPY.EN.stim }> = [
  { key: "MD-5", stim: "mechanical" }, { key: "MD-4", stim: "mechanical" }, { key: "MD-3", stim: "locomotive" },
  { key: "MD-2", stim: "speed" }, { key: "MD-1", stim: "activation" }, { key: "MD", stim: "match" },
  { key: "MD+1", stim: "recovery" }, { key: "MD+2", stim: "recovery" },
];
const MD_RANK = new Map(MD_ORDER.map((m, i) => [m.key, i]));
const MD_STIM = new Map(MD_ORDER.map((m) => [m.key, m.stim]));

function n(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(Number(v))) return "–";
  return Number(v).toFixed(digits);
}
const numMetric = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function getAuthToken(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data?.session?.access_token ?? null;
}

function drillStimulus(d: Drill | undefined): StimulusType | null {
  if (!d) return null;
  return classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23)?.type ?? null;
}

export default function SessionLibrary({ teamId, onBuildSession }: { teamId: string; onBuildSession?: () => void }) {
  const [lang] = useLang();
  const t = SL_COPY[lang];
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [drillMap, setDrillMap] = useState<Map<string, Drill>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string>("");
  const [editingFocus, setEditingFocus] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadFactors, setLoadFactors] = useState<LoadFactors>(DEFAULT_LOAD_FACTORS);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true); setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Missing auth");
      const [sRes, dRes] = await Promise.all([
        fetch(`/api/coach/saved-sessions?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/coach/drill-library?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const sJson = await sRes.json();
      if (!sRes.ok || !sJson.ok) throw new Error(sJson.error || t.err);
      setSessions(sJson.sessions ?? []);
      const dJson = await dRes.json().catch(() => ({ drills: [] }));
      const m = new Map<string, Drill>();
      for (const d of (dJson.drills ?? []) as Drill[]) m.set(String(d.id), d);
      setDrillMap(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, t.err]);

  useEffect(() => { refresh(); }, [refresh]);

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

  // ── Derived numbers per session ──────────────────────────────────────────
  const plannedPL = useCallback((s: SavedSession): number => {
    if (s.totals?.player_load != null && s.totals.player_load > 0) return s.totals.player_load;
    return (s.items ?? []).reduce((sum, it) => sum + numMetric(drillMap.get(it.drill_id)?.player_load) * it.sets, 0);
  }, [drillMap]);
  const deliveredPL = (s: SavedSession): number | null => {
    const withActual = (s.items ?? []).filter((it) => it.actual);
    if (withActual.length === 0) return null;
    return withActual.reduce((sum, it) => sum + numMetric(it.actual?.player_load), 0);
  };

  // ── Filter + group by MD day ─────────────────────────────────────────────
  const filtered = useMemo(() => sessions.filter((s) =>
    filter === "all" ? true : filter === "published" ? !!s.published_at : !s.published_at,
  ), [sessions, filter]);

  const groups = useMemo(() => {
    const byMd = new Map<string, SavedSession[]>();
    for (const s of filtered) {
      const key = s.md_day || "—";
      (byMd.get(key) ?? byMd.set(key, []).get(key)!).push(s);
    }
    const keys = [...byMd.keys()].sort((a, b) => (MD_RANK.get(a) ?? 99) - (MD_RANK.get(b) ?? 99) || a.localeCompare(b));
    return keys.map((key) => {
      const rows = byMd.get(key)!.sort((a, b) => (b.session_date ?? b.created_at).localeCompare(a.session_date ?? a.created_at));
      const planneds = rows.map(plannedPL).filter((v) => v > 0);
      const lo = planneds.length ? Math.round(Math.min(...planneds)) : null;
      const hi = planneds.length ? Math.round(Math.max(...planneds)) : null;
      const stim = MD_STIM.get(key);
      return { key, rows, lo, hi, stim: stim ? t.stim[stim] : null };
    });
  }, [filtered, plannedPL, t.stim]);

  function openRow(s: SavedSession) {
    if (expandedId === s.id) { setExpandedId(null); return; }
    setExpandedId(s.id);
    setEditingDate(s.session_date ?? "");
    setEditingFocus((s.focus_points ?? []).join("\n"));
  }

  async function patchSession(id: string, patch: Record<string, unknown>) {
    const token = await getAuthToken();
    if (!token) throw new Error("Missing auth");
    const res = await fetch(`/api/coach/saved-sessions/${id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || t.err);
    return json.session as SavedSession;
  }

  async function handleSaveMeta(s: SavedSession, alsoPublish?: boolean) {
    setBusyId(s.id);
    try {
      const focus = editingFocus.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
      const patch: Record<string, unknown> = { session_date: editingDate || null, focus_points: focus };
      if (alsoPublish != null) patch.publish = alsoPublish;
      const updated = await patchSession(s.id, patch);
      setSessions((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    } catch (e) {
      alert(t.err + ": " + (e instanceof Error ? e.message : String(e)));
    } finally { setBusyId(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.deleteConfirm)) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`/api/coach/saved-sessions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.err);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert(t.err + ": " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDuplicate(s: SavedSession) {
    setBusyId(s.id);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Missing auth");
      const res = await fetch("/api/coach/saved-sessions", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId, session_name: (s.session_name || "") + t.copySuffix, md_day: s.md_day,
          target_pl: s.target_pl, items: (s.items ?? []).map((i) => ({ drill_id: i.drill_id, drill_name: i.drill_name, sets: i.sets })),
          totals: s.totals,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.err);
      await refresh();
    } catch (e) {
      alert(t.err + ": " + (e instanceof Error ? e.message : String(e)));
    } finally { setBusyId(null); }
  }

  function handleOpenInBuilder(s: SavedSession) {
    // Hydrate the builder's localStorage draft, then switch to the Build session tab (it reads the
    // key fresh on mount). Drills missing from the library are dropped.
    try {
      const items = (s.items ?? [])
        .map((i) => { const drill = drillMap.get(i.drill_id); return drill ? { uid: `${i.drill_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, drill, sets: i.sets } : null; })
        .filter(Boolean);
      localStorage.setItem(`session-builder:${teamId}`, JSON.stringify({
        sessionName: s.session_name || "", mdDay: s.md_day || "", mdFocus: "",
        targetPL: s.target_pl != null ? String(s.target_pl) : "", items,
      }));
    } catch { /* ignore */ }
    onBuildSession?.();
  }

  async function handlePdf(s: SavedSession) {
    setBusyId(s.id);
    try {
      const items = (s.items ?? [])
        .map((i) => { const drill = drillMap.get(i.drill_id); return drill ? { drill, sets: i.sets } : null; })
        .filter((x): x is { drill: Drill; sets: number } => x != null);
      const tot = s.totals ?? {};
      const data: SessionPdfData = {
        sessionName: s.session_name || "", mdDay: s.md_day || "",
        date: s.session_date ?? new Date(s.created_at).toISOString().slice(0, 10),
        items,
        totals: {
          duration_min: numMetric(tot.duration_min), distance_m: numMetric(tot.distance_m), player_load: numMetric(tot.player_load),
          vel_b5: numMetric(tot.vel_b5), vel_b6: numMetric(tot.vel_b6), accel_b23: numMetric(tot.accel_b23),
          decel_b23: numMetric(tot.decel_b23), accel_total: numMetric(tot.accel_total), decel_total: numMetric(tot.decel_total),
        },
        avgPlPerMin: numMetric(tot.duration_min) > 0 ? numMetric(tot.player_load) / numMetric(tot.duration_min) : null,
        planningMetrics: [],
      };
      const safeName = (s.session_name || "session").replace(/[^\p{L}\p{N}\-_ ]/gu, "").replace(/\s+/g, "_");
      await downloadSessionPdf(data, `${data.date}_${s.md_day || "session"}_${safeName}.pdf`);
    } catch (e) {
      alert(t.err + ": " + (e instanceof Error ? e.message : String(e)));
    } finally { setBusyId(null); }
  }

  if (loading) return <div className="py-8 text-center text-sm text-slate-500">{t.loading}</div>;
  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>;

  const fmtDate = (s: SavedSession) => {
    const iso = s.session_date ? s.session_date + "T00:00:00" : s.created_at;
    return new Date(iso).toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      {/* Header: count + filter + build */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{t.title}</h2>
          <span className="text-sm text-slate-400">{sessions.length} {sessions.length === 1 ? t.session1 : t.sessions}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px] font-medium">
            {(["all", "published", "drafts"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {f === "all" ? t.all : f === "published" ? t.published : t.drafts}
              </button>
            ))}
          </div>
          {onBuildSession && (
            <button onClick={onBuildSession} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white hover:brightness-95">
              {t.build}
            </button>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">{t.empty}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900">{g.key}</span>
              {g.stim && <span className="text-sm font-medium text-slate-600">{g.stim}</span>}
              <span className="text-xs text-slate-400">
                {g.rows.length} {g.rows.length === 1 ? t.session1 : t.sessions}
                {g.lo != null && g.hi != null && <> · {t.typical} {g.lo === g.hi ? g.lo : `${g.lo}–${g.hi}`} PL</>}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {/* column header */}
              <div className="grid grid-cols-[108px_1fr_120px_150px_110px_28px] items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <span>{t.colDate}</span><span>{t.colSession}</span><span className="text-right">{t.colPlanned}</span>
                <span>{t.colDelivered}</span><span>{t.colStatus}</span><span />
              </div>
              {g.rows.map((s) => {
                const planned = plannedPL(s);
                const delivered = deliveredPL(s);
                const pct = delivered != null && planned > 0 ? Math.round((delivered / planned) * 100) : null;
                const matched = (s.items ?? []).filter((it) => it.actual).length;
                const totalDrills = (s.items ?? []).length;
                const open = expandedId === s.id;
                return (
                  <div key={s.id} className="border-b border-slate-100 last:border-b-0">
                    <button onClick={() => openRow(s)} className="grid w-full grid-cols-[108px_1fr_120px_150px_110px_28px] items-center gap-2 px-4 py-3 text-left hover:bg-slate-50/60">
                      <span className="text-[12px] text-slate-600">{fmtDate(s)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-slate-900">{s.session_name || t.session1}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {(s.items ?? []).slice(0, 6).map((it, i) => {
                            const stim = drillStimulus(drillMap.get(it.drill_id));
                            const dot = stim ? stimulusColorClasses(stim).dot : "bg-slate-300";
                            return (
                              <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">
                                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                                {it.sets > 1 && <span className="font-semibold text-slate-800">{it.sets}×</span>}{it.drill_name}
                              </span>
                            );
                          })}
                        </span>
                      </span>
                      <span className="text-right text-[13px]"><b className="text-slate-900">{n(planned)}</b><span className="ml-1 text-[11px] text-slate-400">PL · {n(s.totals?.duration_min)} {lang === "IS" ? "mín" : "min"}</span></span>
                      <span className="text-[13px]">
                        {delivered == null ? (
                          <span className="text-[12px] text-slate-400">{t.notTrained}</span>
                        ) : (
                          <>
                            <b className="text-slate-900">{n(delivered)}</b>{" "}
                            <span className="text-[11px] font-semibold text-[#1c7a4a]">{pct}% {t.ofPlan}</span>
                            <span className="block text-[10px] text-slate-400">{matched < totalDrills ? `${matched}/${totalDrills} ${t.drillsMatched}` : t.asPlanned}</span>
                          </>
                        )}
                      </span>
                      <span>
                        {s.published_at ? (
                          <span className="inline-flex flex-col items-start gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1c7a4a]"><span className="h-1.5 w-1.5 rounded-full bg-[#1c7a4a]" />{t.pub}</span>
                            <span className="text-[10px] text-slate-400">
                              {Array.isArray(s.groups) && s.groups.length > 0
                                ? `${s.groups.length} ${lang === "IS" ? "lið" : "teams"} · ${s.recipient_player_ids?.length ?? 0} ${lang === "IS" ? "leikmenn" : "players"}`
                                : Array.isArray(s.recipient_player_ids) && s.recipient_player_ids.length > 0
                                  ? `${s.recipient_player_ids.length} ${lang === "IS" ? "leikmenn" : "players"}`
                                  : lang === "IS" ? "Allt liðið" : "Whole team"}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#de9328]"><span className="h-1.5 w-1.5 rounded-full bg-[#de9328]" />{t.draft}</span>
                        )}
                      </span>
                      <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                    </button>

                    {open && (
                      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                          {/* Planned vs delivered per drill */}
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.perDrill}</span>
                              {s.actuals_synced_at && <span className="text-[10px] text-slate-400">{t.syncedNote}</span>}
                            </div>
                            <PerDrillBars session={s} drillMap={drillMap} lang={lang} />
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                              <span className="inline-flex items-center gap-1"><span className="h-1 w-4 rounded bg-slate-300" />{t.plannedLegend}</span>
                              <span className="inline-flex items-center gap-1"><span className="h-1 w-4 rounded bg-[#2740e6]" />{t.deliveredLegend}</span>
                            </div>
                          </div>

                          {/* Focus points (editable) */}
                          <div>
                            <label className="block text-[11px]">
                              <span className="mb-1 block font-semibold text-slate-600">{t.dateLabel}</span>
                              <input type="date" value={editingDate} onChange={(e) => setEditingDate(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
                            </label>
                            <label className="mt-2 block text-[11px]">
                              <span className="mb-1 block font-semibold text-slate-600">{t.focus}</span>
                              <textarea value={editingFocus} onChange={(e) => setEditingFocus(e.target.value)} placeholder={t.focusPlaceholder} rows={3} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
                            </label>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <ActBtn onClick={() => handleOpenInBuilder(s)}>{t.openBuilder}</ActBtn>
                          <ActBtn onClick={() => handleDuplicate(s)} disabled={busyId === s.id}>{t.duplicate}</ActBtn>
                          <ActBtn onClick={() => handlePdf(s)} disabled={busyId === s.id}>{t.pdf}</ActBtn>
                          <ActBtn onClick={() => handleSaveMeta(s)} disabled={busyId === s.id}>{t.save}</ActBtn>
                          {s.published_at ? (
                            <button onClick={() => handleSaveMeta(s, false)} disabled={busyId === s.id} className="rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40">{t.unpublish}</button>
                          ) : (
                            <button onClick={() => handleSaveMeta(s, true)} disabled={busyId === s.id} className="rounded-md bg-[#1c7a4a] px-3 py-1.5 text-[12px] font-semibold text-white hover:brightness-110 disabled:opacity-40">{t.publish}</button>
                          )}
                          <button onClick={() => handleDelete(s.id)} className="ml-auto rounded-md px-2 py-1.5 text-[12px] text-red-500 hover:bg-red-50 hover:text-red-700">{t.del}</button>
                        </div>

                        {/* Energy-system balance (kept below — extra read, descriptive) */}
                        {(s.items ?? []).some((it) => it.actual) && <LoadBalanceComparison session={s} lang={lang} factors={loadFactors} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ActBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40">
      {children}
    </button>
  );
}

/** Stimulus → bar hex (inline style; dynamic Tailwind classes aren't generated). */
const STIM_HEX: Record<StimulusType, string> = {
  mechanical: "#f43f5e", locomotive: "#0ea5e9", mixed: "#a855f7", technical: "#10b981",
};

/** Per-drill planned (grey) vs delivered (stimulus-coloured) bars, scaled within the session. */
function PerDrillBars({ session, drillMap, lang }: { session: SavedSession; drillMap: Map<string, Drill>; lang: "IS" | "EN" }) {
  const rows = (session.items ?? []).map((it) => {
    const drill = drillMap.get(it.drill_id);
    const planned = numMetric(drill?.player_load) * it.sets;
    const delivered = it.actual ? numMetric(it.actual.player_load) : null;
    const stim = drillStimulus(drill);
    return { name: it.drill_name, sets: it.sets, planned, delivered, stim, matchedBy: it.actual?.matched_by ?? null };
  });
  const max = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.delivered ?? 0)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="text-[11px]">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-slate-700">{r.sets > 1 && <b>{r.sets}× </b>}{r.name}</span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {Math.round(r.planned)} → {r.delivered == null ? "–" : Math.round(r.delivered)}
              {r.matchedBy && <span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-semibold ${r.matchedBy === "name" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{r.matchedBy === "name" ? (lang === "IS" ? "nafn" : "name") : (lang === "IS" ? "röð" : "order")}</span>}
            </span>
          </div>
          <div className="h-1 w-full rounded bg-slate-200"><div className="h-full rounded bg-slate-300" style={{ width: `${(r.planned / max) * 100}%` }} /></div>
          <div className="mt-0.5 h-1.5 w-full rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${((r.delivered ?? 0) / max) * 100}%`, backgroundColor: r.delivered == null ? "transparent" : (r.stim ? STIM_HEX[r.stim] : "#2740e6") }} /></div>
        </div>
      ))}
    </div>
  );
}

const BAL_COLOR: Record<"anaerobic" | "muscular", string> = { anaerobic: "#de9328", muscular: "#2740e6" };

function LoadBalanceComparison({ session, lang, factors }: { session: SavedSession; lang: "IS" | "EN"; factors: LoadFactors }) {
  const t = SL_COPY[lang];
  const cmp = useMemo(() => {
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
      const a = it.actual; if (!a) continue; anyActual = true;
      del.vel_b5 += numMetric(a.vel_b5); del.vel_b6 += numMetric(a.vel_b6);
      del.accel_b23 += numMetric(a.accel_b23); del.decel_b23 += numMetric(a.decel_b23);
      del.accel_total += numMetric(a.accel_total); del.decel_total += numMetric(a.decel_total);
      del.distance_m += numMetric(a.distance_m); del.duration_min += numMetric(a.duration_min);
    }
    if (!anyActual) return null;
    const delivered = profileFromDrillLoadRow({ ...del, hir_total: null, max_velocity: null }, null, factors);
    if (planned.total <= 0 || delivered.total <= 0) return null;
    const MIN_PLAN_AU = 20;
    const cats: Array<"anaerobic" | "muscular"> = ["anaerobic", "muscular"];
    const rows = cats.map((c) => {
      const p = planned.byCategory[c]; const d = delivered.byCategory[c];
      const pct = p >= MIN_PLAN_AU ? Math.round((d / p) * 100) : null;
      const band = pct == null ? "na" : pct < 80 ? "under" : pct > 120 ? "over" : "on";
      return { cat: c, planned: p, delivered: d, pct, band };
    }).filter((r) => r.planned > 0 || r.delivered > 0);
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
    : cmp.anyComparable ? { text: t.balMatch, cls: "bg-emerald-100 text-emerald-700" } : { text: t.balNoBaseline, cls: "bg-slate-100 text-slate-500" };

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
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
