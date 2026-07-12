"use client";

/**
 * Dashboard card: the player's OWN load broken down by drill for the date the
 * GPS pager is on. Self-fetches `/api/player/drill-load?date=` (reads
 * player_drill_load by session_date), self-hides when the day has no per-drill
 * data. Shows EVERY period the player did that day — including ones whose name
 * never matched a planned drill — each with the shared layered load read
 * (`DrillLoadRow`). Follows the same date as the rest of the Dashboard's GPS
 * monitoring, so paging back through days shows each day's drill composition.
 */
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import DrillLoadRow, { type DrillLoadEntry } from "./DrillLoadRow";

type Resp = { show: boolean; date: string; drills: DrillLoadEntry[]; hasAnyData: boolean };

export default function PlayerDrillLoadCard({ date, lang }: { date: string; lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  useEffect(() => {
    // Best-effort, self-hiding — never throw into the dashboard. The cancelled
    // guard avoids a post-unmount set and keeps the effect lint-clean.
    let cancelled = false;
    setExpanded(new Set());
    (async () => {
      try {
        const sb = getSupabaseClient();
        const token = (await sb.auth.getSession()).data?.session?.access_token;
        if (!token || cancelled) return;
        const res = await fetch(`/api/player/drill-load?date=${encodeURIComponent(date)}`, { headers: { Authorization: `Bearer ${token}` } });
        const json = res.ok ? ((await res.json()) as Resp) : null;
        if (!cancelled) setData(json?.show ? json : null);
      } catch { if (!cancelled) setData(null); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [date]);

  if (loading) return null;
  if (!data || !data.drills.length) return null;

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {is ? "Álag per drilla" : "Load per drill"}
      </div>
      <ol className="mt-3 space-y-2.5">
        {data.drills.map((d, idx) => (
          <li key={idx}>
            <div className="text-[13px] font-semibold text-zinc-800">{d.drill_name}</div>
            <div className="mt-1.5">
              <DrillLoadRow entry={d} lang={lang} open={expanded.has(idx)} onToggle={() => toggle(idx)} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
