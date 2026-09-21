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

type LoadCategory = "aerobic" | "anaerobic" | "speed" | "muscular";
type LoadProfile = {
  byCategory: Record<LoadCategory, number>;
  total: number;
  dominant: LoadCategory;
  balance: { en: string; is: string };
};
type Resp = { show: boolean; date: string; drills: DrillLoadEntry[]; hasAnyData: boolean; loadProfile?: LoadProfile | null };

const CAT_COLOR: Record<LoadCategory, string> = { aerobic: "#1c7a4a", anaerobic: "#de9328", speed: "#a83e28", muscular: "#2740e6" };
const CAT_LABEL: Record<LoadCategory, { en: string; is: string }> = {
  aerobic: { en: "Aerobic", is: "Loftháð" },
  anaerobic: { en: "High-speed", is: "Háhraða" },
  speed: { en: "Speed", is: "Hraði" },
  muscular: { en: "Muscular", is: "Vöðva" },
};

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

      {data.loadProfile && data.loadProfile.total > 0 && (() => {
        const lp = data.loadProfile;
        const cats: LoadCategory[] = ["aerobic", "anaerobic", "speed", "muscular"];
        return (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {is ? "Álagsjafnvægi" : "Load balance"}
                <span className="ml-1.5 lowercase text-[10px] font-normal text-zinc-400">{is ? "orkukerfi" : "energy systems"}</span>
              </div>
              <div className="text-[11px] font-semibold" style={{ color: CAT_COLOR[lp.dominant] }}>
                {CAT_LABEL[lp.dominant][is ? "is" : "en"]}
              </div>
            </div>
            <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              {cats.map((c) => {
                const w = lp.total > 0 ? (lp.byCategory[c] / lp.total) * 100 : 0;
                return w > 0 ? <div key={c} style={{ width: `${w}%`, backgroundColor: CAT_COLOR[c] }} title={`${CAT_LABEL[c][is ? "is" : "en"]} ${Math.round(w)}%`} /> : null;
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {cats.map((c) => lp.byCategory[c] > 0 ? (
                <div key={c} className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CAT_COLOR[c] }} />
                  {CAT_LABEL[c][is ? "is" : "en"]} {Math.round((lp.byCategory[c] / lp.total) * 100)}%
                </div>
              ) : null)}
            </div>
            <div className="mt-2 text-[10px] leading-snug text-zinc-400">{lp.balance[is ? "is" : "en"]}</div>
          </div>
        );
      })()}

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
