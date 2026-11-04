"use client";

/**
 * ClientWeekOverview — this week (Mon–Sun) at a glance for a PT client.
 *
 * A compact 7-day strip showing each day's session name (or rest / match), with
 * today highlighted, so the client sees the whole week — not just today. Moving a
 * session between days is done with the existing ClientMoveSessionControl on the
 * Today surface; this is the read view that answers "what's on the other days?".
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DayKind = "session" | "rest" | "match" | "moved_away";
type WeekDay = { date: string; iso: number; label: string; kind: DayKind; isToday: boolean };

const WD = [
  { iso: 1, is: "Mán", en: "Mon" }, { iso: 2, is: "Þri", en: "Tue" },
  { iso: 3, is: "Mið", en: "Wed" }, { iso: 4, is: "Fim", en: "Thu" },
  { iso: 5, is: "Fös", en: "Fri" }, { iso: 6, is: "Lau", en: "Sat" },
  { iso: 7, is: "Sun", en: "Sun" },
];

export default function ClientWeekOverview({ lang }: { lang: "EN" | "IS" }) {
  const isIS = lang === "IS";
  const [days, setDays] = useState<WeekDay[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!alive || !session?.access_token) return;
        const res = await fetch("/api/client/week", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json().catch(() => ({}));
        if (alive && res.ok && Array.isArray(j.week)) setDays(j.week as WeekDay[]);
      } catch { /* silent — the Today card still works */ }
    })();
    return () => { alive = false; };
  }, []);

  // Nothing to show until loaded, or when the week has no sessions at all.
  if (!days || !days.some((d) => d.kind === "session" || d.kind === "match")) return null;

  const dayLabel = (iso: number) => (isIS ? WD[iso - 1]?.is : WD[iso - 1]?.en) ?? "";
  const bodyFor = (d: WeekDay) => {
    if (d.kind === "match") return isIS ? "Leikur" : "Match";
    if (d.kind === "session") return d.label || (isIS ? "Æfing" : "Session");
    if (d.kind === "moved_away") return isIS ? "Fært" : "Moved";
    return isIS ? "Hvíld" : "Rest";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
        {isIS ? "Vikan þín" : "Your week"}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const active = d.kind === "session" || d.kind === "match";
          return (
            <div
              key={d.date}
              className={`rounded-lg border px-1 py-1.5 text-center ${
                d.isToday
                  ? "border-[#2740e6] bg-[#eef0ff]"
                  : active
                    ? "border-slate-200 bg-slate-50"
                    : "border-slate-100 bg-white"
              }`}
            >
              <div className={`text-[10px] font-semibold ${d.isToday ? "text-[#2740e6]" : "text-slate-500"}`}>
                {dayLabel(d.iso)}
              </div>
              <div className="mt-1 flex justify-center">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    d.kind === "match" ? "bg-emerald-500" : d.kind === "session" ? "bg-[#2740e6]" : d.kind === "moved_away" ? "bg-amber-400" : "bg-slate-200"
                  }`}
                />
              </div>
              <div className={`mt-1 truncate text-[9px] leading-tight ${active ? "text-slate-600" : "text-slate-300"}`} title={bodyFor(d)}>
                {bodyFor(d)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">
        {isIS ? "Færðu æfingu milli daga með „Færa á annan dag“ hér fyrir neðan." : "Move a session between days with “Move to another day” below."}
      </div>
    </div>
  );
}
