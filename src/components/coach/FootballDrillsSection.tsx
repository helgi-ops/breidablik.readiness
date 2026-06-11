"use client";

/**
 * FootballDrillsSection — inside the per-player Movement profile, individualised
 * ON-PITCH drill suggestions: drills from the club library whose measured
 * per-player demand profile fills the player's gaps or rehearses his dominant
 * demands. The football sibling of RobustnessDrillsSection. Read-only planning
 * aid; the coach runs the session.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Drill = {
  id: string; name: string; category: string | null; format: string | null;
  players: number | null; duration_min: number | null; pitch: string | null;
  qualityValue: number; unit: string; playerLoadPerMin: number | null;
};
type Rec = { kind: "gap" | "strength"; quality: string; label: { en: string; is: string }; why: { en: string; is: string }; drills: Drill[] };
type Resp = { ok: boolean; recommendations: Rec[]; confident: boolean; trainingDays: number; error?: string };

const IS = (l?: string) => (l ?? "").toUpperCase() === "IS";

export default function FootballDrillsSection({ playerId, lang }: { playerId: string; lang?: string }) {
  const is = IS(lang);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/player/${playerId}/football-drills`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      const j = (await res.json()) as Resp;
      setData(res.ok ? j : null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [playerId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!data || data.recommendations.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 p-3 text-[12px] text-slate-500">
        {is ? "Engar fótboltadrillur með kröfusniði passa enn." : "No demand-profiled football drills match yet."}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-800">{is ? "Einstaklingsmiðaðar fótboltadrillur" : "Individualised football drills"}</span>
        <span className="text-[11px] text-slate-500">{is ? "réttur stimúlus á vellinum" : "right stimulus on the pitch"}</span>
      </div>
      <p className="mb-2 text-[11px] text-slate-400">
        {is
          ? "Drillur úr safninu valdar eftir mældu kröfusniði þeirra — fylla göt eða æfa ríkjandi kröfur hans."
          : "Drills from the library picked by their measured demand profile — to fill gaps or rehearse his dominant demands."}
      </p>

      {data.recommendations.map((rec, i) => (
        <div key={i} className="mb-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${rec.kind === "gap" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>
              {rec.kind === "gap" ? (is ? "Gat" : "Gap") : (is ? "Ríkjandi" : "Strength")} · {is ? rec.label.is : rec.label.en}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-600">{is ? rec.why.is : rec.why.en}</p>
          <div className="mt-1.5 space-y-1">
            {rec.drills.map((d) => (
              <div key={d.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-slate-800">{d.name}</span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-sky-700">
                    {d.qualityValue.toLocaleString("en-US")} {d.unit === "m" ? "m" : (is ? "átök" : "efforts")}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {[
                    d.category,
                    d.format,
                    d.players ? `${d.players} ${is ? "leikm." : "players"}` : null,
                    d.pitch,
                    d.duration_min ? `${d.duration_min} ${is ? "mín" : "min"}` : null,
                    d.playerLoadPerMin ? `PL/${is ? "mín" : "min"} ${d.playerLoadPerMin}` : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="mt-1 text-[10px] text-slate-400">
        {is ? "Talan = mæld krafa per leikmann í drillunni (háhraða-metrar eða átök)." : "The number = measured per-player demand the drill delivers (high-speed metres or efforts)."}
      </p>
    </div>
  );
}
