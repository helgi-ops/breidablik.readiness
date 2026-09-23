"use client";

/**
 * Player-facing OFF-WEEK maintenance plan (read-only). Reads /api/player/off-week — the coach-sent
 * strength + running plan for a week off. Self-guided (RPE/time/distance), works offline once loaded.
 * Silent when the coach hasn't sent one. Descriptive — never the readiness colour/verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type Day = { dayIndex: number; type: string; title: Bi; blocks: Array<{ label: Bi; prescription: Bi }>; note: Bi };
type Plan = { days: Day[]; summary: Bi; caveat: Bi; why: Bi[] } | null;

const TAG: Record<string, string> = { strength: "bg-indigo-100 text-indigo-700", run: "bg-emerald-100 text-emerald-700", combined: "bg-violet-100 text-violet-700", rest: "bg-zinc-100 text-zinc-500" };

export default function PlayerOffWeek() {
  const [lang] = useLang();
  const is = lang === "IS";
  const t = (b: Bi) => (is ? b.is : b.en);
  const [plan, setPlan] = React.useState<Plan>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        if (!tok) { if (alive) setLoaded(true); return; }
        const res = await fetch("/api/player/off-week", { headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) { setPlan(res.ok ? (j.plan as Plan) : null); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  if (!loaded || !plan || !plan.days?.length) return null;

  return (
    <div className="rounded-2xl border border-[#7a5cc4]/25 bg-[#7a5cc4]/5 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#7a5cc4]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a5cc4]">{is ? "Frívika" : "Off-week"}</span>
        <h3 className="text-sm font-bold text-zinc-900">{is ? "Viðhalds-prógramm" : "Maintenance program"}</h3>
      </div>
      <p className="mt-1 text-[12px] text-zinc-600">{t(plan.summary)}</p>

      {plan.why.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {plan.why.map((w, i) => <li key={i} className="text-[11px] text-[#4a3a7a]">• {t(w)}</li>)}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        {plan.days.map((d) => (
          <div key={d.dayIndex} className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-zinc-900">{is ? "Dagur" : "Day"} {d.dayIndex + 1} — {t(d.title)}</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${TAG[d.type] ?? "bg-zinc-100 text-zinc-500"}`}>{d.type}</span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {d.blocks.map((b, i) => (
                <li key={i} className="flex gap-2 text-[12px]">
                  <span className="w-24 shrink-0 text-zinc-500">{t(b.label)}</span>
                  <span className="flex-1 text-zinc-800">{t(b.prescription)}</span>
                </li>
              ))}
            </ul>
            {d.note && <p className="mt-1 text-[11px] text-amber-700">{t(d.note)}</p>}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-zinc-400">{is ? "RPE = áreynsla 1–10 · MAS = hámarks loftháð hraði (úr þínu prófi)" : "RPE = effort 1–10 · MAS = maximal aerobic speed (from your test)"}</p>
      <p className="mt-1 text-[10px] text-zinc-400">{t(plan.caveat)}</p>
    </div>
  );
}
