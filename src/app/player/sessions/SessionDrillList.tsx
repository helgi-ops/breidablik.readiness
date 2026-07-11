"use client";

/**
 * The published session's drill list with the PLAYER'S OWN per-drill actual load
 * (layered read: plain "your load" headline + Engine/Driver behind a per-drill
 * toggle). Self-fetches `/api/player/session-drills` and self-hides the load
 * where absent — so it renders on both the session detail page and inline on the
 * Today card from ONE source (they can never drift). `compact` drops the diagram
 * + description (used on the Today card, where space is tight and the point is
 * the load, not the coaching detail — the full page still shows everything).
 */
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { type PublishedSession, SessionCopy } from "@/components/team/sessionShared";

type DrillItem = PublishedSession["items"][number];

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

export default function SessionDrillList({
  sessionId,
  items,
  lang,
  compact = false,
}: {
  sessionId: string;
  items: DrillItem[];
  lang: "IS" | "EN";
  compact?: boolean;
}) {
  const t = SessionCopy[lang];
  const is = lang === "IS";
  const locale = is ? "is-IS" : "en-GB";
  const [drillLoad, setDrillLoad] = useState<DrillLoadResp | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const fmt = (v: number | null | undefined) => (v == null ? "–" : Math.round(v).toLocaleString(locale));
  // Defensive: never assume the caller handed us a populated array — a missing
  // `items` must render an empty list, never throw (this renders inside the
  // portal-injected Today card, where a throw would blank the whole page).
  const list = Array.isArray(items) ? items : [];
  const maxSets = Math.max(1, ...list.map((d) => d.sets || 1));

  useEffect(() => {
    // The player's own per-drill load (self-hides when absent). Best-effort —
    // never throws into the host; the cancelled guard avoids a post-unmount set.
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const token = (await supabase.auth.getSession()).data?.session?.access_token;
        if (!token || cancelled) return;
        const res = await fetch(`/api/player/session-drills?sessionId=${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } });
        const json = res.ok ? ((await res.json()) as DrillLoadResp) : null;
        if (!cancelled) setDrillLoad(json?.show ? json : null);
      } catch { /* optional — never break the host */ }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <ol className="space-y-3">
      {list.map((d, idx) => (
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

          {!compact && d.diagram_url && (
            <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.diagram_url} alt={d.drill_name} className="w-full" />
            </div>
          )}
          {!compact && d.description && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700">
              {d.description}
            </p>
          )}

          {/* Your own load for this drill (layered: plain headline + Engine/Driver
              behind a toggle). Renders nothing when this session has no per-drill
              data for the player. */}
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
  );
}
