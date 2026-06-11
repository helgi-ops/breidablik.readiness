"use client";

/**
 * PlayerRobustnessCard — the drills a coach assigned to make the player better
 * at handling THEIR own load (their dominant movement demands + any L/R
 * imbalance). Motivating, plain language; read-only. Renders nothing when no
 * drills are assigned.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Drill = { id: string; quality: string; name: { en: string; is: string }; cue: { en: string; is: string }; dose: string; evidence: string; reason: string | null };

export default function PlayerRobustnessCard({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [drills, setDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/player/robustness`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      const j = await res.json();
      setDrills(res.ok && Array.isArray(j.drills) ? j.drills : []);
    } catch { setDrills([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading || drills.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
        {is ? "Þínar prep-drillur" : "Your prep drills"}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {is ? "Valdar fyrir þig til að höndla þitt álag betur." : "Picked for you to handle your own load better."}
      </p>
      <div className="mt-3 space-y-2">
        {drills.map((d) => (
          <div key={d.id} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2">
            <div className="text-sm font-medium text-zinc-800">
              {is ? d.name.is : d.name.en}
              <span className="ml-2 text-[11px] font-normal text-zinc-400">{d.dose}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-zinc-600">{is ? d.cue.is : d.cue.en}</div>
            {d.reason && <div className="mt-1 text-[11px] text-emerald-700">{d.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
