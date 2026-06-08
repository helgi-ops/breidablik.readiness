"use client";

/**
 * ClientNudges — lightweight in-app nudges at the top of the athlete's Today
 * screen (no push infra). Two contextual prompts:
 *
 *   1. Session today  — "You have a session today" + a Log shortcut, shown only
 *      when there's a session scheduled and nothing logged yet today.
 *   2. Weekly recap   — at the start of a new week, a one-line summary of last
 *      week (sessions · tonnage · PBs). Dismissible per week (localStorage).
 *
 * The daily check-in nudge already lives on the Today page; this complements it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Summary = {
  last_week: { week_start: string; sessions: number; tonnage: number; prs: number };
};

const COPY = {
  IS: {
    sessionTitle: "Þú átt æfingu í dag", sessionSub: "Smelltu til að skrá hana", log: "Skrá",
    recapTitle: "Vikan í síðustu viku", sessions: "æfingar", lifted: "kg lyft", pbs: "PB", dismiss: "Loka",
    nice: "Flott vika! Höldum áfram.", quiet: "Ný vika, nýtt tækifæri 💪",
  },
  EN: {
    sessionTitle: "You have a session today", sessionSub: "Tap to log it", log: "Log",
    recapTitle: "Last week", sessions: "sessions", lifted: "kg lifted", pbs: "PB", dismiss: "Dismiss",
    nice: "Strong week — keep it rolling.", quiet: "New week, fresh start 💪",
  },
};

export default function ClientNudges({
  hasSessionToday, sessionLoggedToday, lang = "IS",
}: { hasSessionToday: boolean; sessionLoggedToday: boolean; lang?: "IS" | "EN" }) {
  const t = COPY[lang];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recapDismissed, setRecapDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/client/progression-summary`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json();
        if (res.ok) {
          setSummary(j as Summary);
          const wk = (j as Summary).last_week?.week_start;
          if (wk && typeof window !== "undefined" && window.localStorage.getItem(`mp:weeknudge:${wk}`)) {
            setRecapDismissed(true);
          }
        }
      } catch { /* soft-fail */ }
    })();
  }, []);

  const dismissRecap = () => {
    const wk = summary?.last_week?.week_start;
    if (wk && typeof window !== "undefined") window.localStorage.setItem(`mp:weeknudge:${wk}`, "1");
    setRecapDismissed(true);
  };

  // Weekly recap shows only early in the week (Mon–Wed), if last week had work.
  const dow = (new Date().getUTCDay() + 6) % 7; // 0 = Monday
  const lw = summary?.last_week;
  const showRecap = !recapDismissed && !!lw && lw.sessions > 0 && dow <= 2;
  const showSession = hasSessionToday && !sessionLoggedToday;

  if (!showRecap && !showSession) return null;

  return (
    <div className="space-y-2">
      {showSession && (
        <Link
          href="/client/log"
          className="block rounded-xl border border-indigo-300 bg-indigo-50 p-3.5 transition-colors hover:bg-indigo-100"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700">{t.sessionTitle}</div>
              <div className="mt-0.5 text-sm text-indigo-900">🏋️ {t.sessionSub}</div>
            </div>
            <span className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white">{t.log} →</span>
          </div>
        </Link>
      )}

      {showRecap && lw && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{t.recapTitle}</div>
              <div className="mt-0.5 text-sm text-slate-800">
                <span className="font-semibold tabular-nums">{lw.sessions}</span> {t.sessions}
                {lw.tonnage > 0 && <> · <span className="font-semibold tabular-nums">{lw.tonnage.toLocaleString()}</span> {t.lifted}</>}
                {lw.prs > 0 && <> · <span className="font-semibold text-amber-700">{lw.prs} {t.pbs} 🎉</span></>}
              </div>
              <div className="mt-0.5 text-[12px] text-slate-500">{lw.sessions >= 2 ? t.nice : t.quiet}</div>
            </div>
            <button type="button" onClick={dismissRecap} className="shrink-0 text-[11px] text-slate-400 hover:text-slate-600">{t.dismiss}</button>
          </div>
        </div>
      )}
    </div>
  );
}
