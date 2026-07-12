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
import DrillLoadRow, { type DrillLoadEntry } from "@/components/player/DrillLoadRow";

type DrillItem = PublishedSession["items"][number];

type DrillLoadResp = { show: boolean; drills: DrillLoadEntry[]; hasAnyData: boolean };

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
  const [drillLoad, setDrillLoad] = useState<DrillLoadResp | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
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
              behind a toggle — shared DrillLoadRow). Renders nothing when this
              session has no per-drill data for the player. */}
          {(() => {
            const dl = drillLoad?.drills[idx];
            if (!dl?.matched) return null;
            return (
              <div className="mt-3">
                <DrillLoadRow entry={dl} lang={lang} open={expanded.has(idx)} onToggle={() => toggle(idx)} />
              </div>
            );
          })()}
        </li>
      ))}
    </ol>
  );
}
