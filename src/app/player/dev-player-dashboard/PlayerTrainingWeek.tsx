"use client";

/**
 * Player-facing MD-periodised training week (read-only view of the coach-saved
 * programme). Reads /api/player/training-programme. Each day shows its planned-load
 * colour, the plain "what today is", and the session's blocks. Silent when the coach
 * hasn't generated a week. Descriptive — never the readiness colour/verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type Block = { id: string; titleEN: string; titleIS: string };
type Session = { blocks?: Block[]; summaryEN?: string; summaryIS?: string } | null;
type Day = {
  date: string; mdTag: string; plannedBand: string; colour: "green" | "yellow" | "red" | "none";
  readinessAdjusted?: boolean; session: Session; emphasis?: Array<{ text: Bi }>; facts?: Bi[];
};
type Programme = { weekStart: string; days: Day[]; generatedAt?: string } | null;

const DOT: Record<string, string> = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-rose-500", none: "bg-zinc-300" };
const RING: Record<string, string> = { green: "border-emerald-200", yellow: "border-amber-200", red: "border-rose-200", none: "border-zinc-200" };

function weekday(dateIso: string, is: boolean): string {
  try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dateIso}T00:00:00`)); }
  catch { return dateIso; }
}

export default function PlayerTrainingWeek() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [prog, setProg] = React.useState<Programme>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        if (!tok) { if (alive) setLoaded(true); return; }
        const res = await fetch("/api/player/training-programme", { headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) { setProg(res.ok ? (j.programme as Programme) : null); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  if (!loaded) return null;
  const days = prog?.days ?? [];
  if (days.length === 0) return null; // no coach-generated week yet — stay silent

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{is ? "Æfingavikan þín" : "Your training week"}</h2>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{is ? "að leik" : "to match"}</span>
      </div>
      <p className="mt-1 text-[12px] text-zinc-500">
        {is ? "Álagið lækkar eftir því sem nær dregur leik. Litur = áætlað álag dagsins." : "Load eases as the match approaches. Colour = the day's planned load."}
      </p>

      <div className="mt-3 space-y-2">
        {days.map((d) => {
          const headline = d.facts?.[0] ? (is ? d.facts[0].is : d.facts[0].en) : null;
          const blocks = d.session?.blocks ?? [];
          return (
            <div key={d.date} className={`rounded-xl border-2 ${RING[d.colour] ?? RING.none} p-3`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[d.colour] ?? DOT.none}`} />
                <span className="text-sm font-semibold text-zinc-900">{d.mdTag}</span>
                <span className="text-[11px] text-zinc-400">{weekday(d.date, is)}</span>
                {d.readinessAdjusted && <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-800">{is ? "minnkað í dag" : "eased today"}</span>}
              </div>
              {headline && <p className="mt-1 text-[13px] text-zinc-700">{headline}</p>}
              {blocks.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {blocks.map((b) => <span key={b.id} className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">{is ? b.titleIS : b.titleEN}</span>)}
                </div>
              )}
              {(d.emphasis ?? []).map((e, i) => (
                <div key={i} className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">★ {is ? e.text.is : e.text.en}</div>
              ))}
              {blocks.length === 0 && !headline && (
                <p className="mt-1 text-[12px] text-zinc-400">{is ? "Engin styrktaræfing þennan dag." : "No strength session this day."}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
