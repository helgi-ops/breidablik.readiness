"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PtClientGuard from "@/components/auth/PtClientGuard";
import {
  type PublishedSession,
  SessionCopy,
  dateLabel,
  sessionStats,
} from "@/components/team/sessionShared";

/** The player's own per-drill actual load, index-aligned to session.items. */
type DrillLoadEntry = {
  drill_name: string;
  matched: boolean;
  engine: { distance_m: number | null; hir_total: number | null; sprint_m: number | null; player_load: number | null } | null;
  driver: { cod: number | null; high_ima: number | null } | null;
  duration_min: number | null;
};
type DrillLoadResp = { show: boolean; drills: DrillLoadEntry[]; hasAnyData: boolean };

function MiniStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5 text-center">
      <div className="text-sm font-bold tabular-nums text-zinc-900">{value}<span className="ml-0.5 text-[9px] font-medium text-zinc-400">{unit}</span></div>
      <div className="mt-0.5 truncate text-[9px] text-zinc-500">{label}</div>
    </div>
  );
}

export default function PlayerSessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [lang] = useLang();
  const t = SessionCopy[lang];
  const is = lang === "IS";
  const locale = lang === "IS" ? "is-IS" : "en-GB";

  const [session, setSession] = useState<PublishedSession | null>(null);
  const [drillLoad, setDrillLoad] = useState<DrillLoadResp | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toggle = (i: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const fmt = (v: number | null | undefined) => (v == null ? "–" : Math.round(v).toLocaleString(locale));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) {
        router.replace(`/login?next=/player/sessions/${id}`);
        return;
      }
      const [res, dlRes] = await Promise.all([
        fetch(`/api/team/training-sessions?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } }),
        // The player's own per-drill load (self-hides when absent). Best-effort.
        fetch(`/api/player/session-drills?sessionId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const json = await res.json();
      if (json.ok) setSession((json.sessions ?? [])[0] ?? null);
      else setError(json.error ?? "error");
      try {
        const dlJson = dlRes && dlRes.ok ? ((await dlRes.json()) as DrillLoadResp) : null;
        setDrillLoad(dlJson?.show ? dlJson : null);
      } catch { /* optional — never break the page */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  const stats = session ? sessionStats(session) : null;
  const maxSets = session ? Math.max(1, ...session.items.map((d) => d.sets || 1)) : 1;

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[var(--surface,#f4f2ec)] px-4 pb-16">
      <PtClientGuard />

      <div
        className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-[var(--surface,#f4f2ec)]/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <Link
          href="/player/sessions"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
        >
          <span aria-hidden className="text-base leading-none">←</span> {t.heading}
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-400">{t.loading}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">{error}</div>
      ) : !session || !stats ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-16 text-center text-sm text-zinc-500">
          {t.empty}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.today === dateLabel(session.session_date, locale, t) ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                {dateLabel(session.session_date, locale, t)}
              </span>
              {session.md_day && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{session.md_day}</span>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-zinc-900">{session.session_name || "–"}</h1>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <Stat label={t.drills} value={String(stats.drillCount)} />
              <Stat label={t.duration} value={stats.duration != null ? `${stats.duration}${t.minShort}` : "–"} />
              <Stat label={t.distance} value={stats.distance != null ? `${stats.distance}m` : "–"} />
              <Stat label={t.target + " " + t.load} value={stats.targetPl != null ? String(stats.targetPl) : "–"} />
            </div>
          </header>

          {/* Focus points */}
          {session.focus_points && session.focus_points.length > 0 && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t.focus}</h2>
              <ul className="space-y-1.5">
                {session.focus_points.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Drills as blocks */}
          <section>
            <h2 className="mb-2 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t.drills}</h2>
            <ol className="space-y-3">
              {session.items.map((d, idx) => (
                <li key={idx} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-display text-sm font-bold text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-900">{d.drill_name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        {d.category && <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600">{d.category}</span>}
                        <span>{d.sets > 1 ? `${d.sets} ${t.sets}` : `1 ${t.block}`}</span>
                      </div>
                      {/* Sets as a proportional block bar */}
                      <div className="mt-2 flex gap-1">
                        {Array.from({ length: Math.max(1, d.sets || 1) }).map((_, i) => (
                          <span
                            key={i}
                            className="h-1.5 flex-1 rounded-full bg-[var(--primary,#2740e6)]"
                            style={{ opacity: 0.35 + 0.65 * ((i + 1) / maxSets) }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {d.diagram_url && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.diagram_url} alt={d.drill_name} className="w-full" />
                    </div>
                  )}
                  {d.description && (
                    <p className="mt-3 whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700">
                      {d.description}
                    </p>
                  )}

                  {/* Your own load for this drill (layered: plain headline +
                      Engine/Driver behind a toggle). Renders nothing when this
                      session has no per-drill data for the player. */}
                  {(() => {
                    const dl = drillLoad?.drills[idx];
                    if (!dl?.matched) return null;
                    const open = expanded.has(idx);
                    return (
                      <div className="mt-3 rounded-lg border border-[#d9ece2] bg-[#f4faf6] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 text-[13px] text-zinc-700">
                            <span className="mr-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#1c7a4a]">{is ? "Þitt álag" : "Your load"}</span>
                            {dl.engine?.distance_m != null && <span className="font-bold tabular-nums text-zinc-900">{fmt(dl.engine.distance_m)} m</span>}
                            {dl.engine?.hir_total != null && <span className="text-zinc-500"> · {fmt(dl.engine.hir_total)} m {is ? "hraðahlaup" : "hard running"}</span>}
                          </div>
                          <button type="button" onClick={() => toggle(idx)} className="shrink-0 text-[11px] font-semibold text-[#2740e6]">
                            {open ? (is ? "Fela" : "Hide") : (is ? "Nánar" : "Details")}
                          </button>
                        </div>
                        {open && (
                          <div className="mt-2.5 space-y-2.5">
                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#1c7a4a]">{is ? "Vél — hlaup" : "Engine — running"}</div>
                              <div className="mt-1 grid grid-cols-4 gap-1.5">
                                <MiniStat label={is ? "Vegalengd" : "Distance"} value={fmt(dl.engine?.distance_m)} unit="m" />
                                <MiniStat label={is ? "Hraðahlaup" : "High-speed"} value={fmt(dl.engine?.hir_total)} unit="m" />
                                <MiniStat label={is ? "Sprettur" : "Sprint"} value={fmt(dl.engine?.sprint_m)} unit="m" />
                                <MiniStat label={is ? "Álag" : "Load"} value={fmt(dl.engine?.player_load)} unit="" />
                              </div>
                            </div>
                            {dl.driver && (
                              <div>
                                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#2740e6]">{is ? "Drifkraftur — IMA" : "Driver — IMA"}</div>
                                <div className="mt-1 grid grid-cols-4 gap-1.5">
                                  <MiniStat label={is ? "Stefnubr." : "Change of dir."} value={fmt(dl.driver.cod)} unit="" />
                                  <MiniStat label={is ? "Hátt IMA" : "High-IMA"} value={fmt(dl.driver.high_ima)} unit="" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2 py-2 text-center">
      <div className="font-display text-lg font-bold leading-none text-zinc-900">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-zinc-400">{label}</div>
    </div>
  );
}
