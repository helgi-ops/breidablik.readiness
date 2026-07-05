"use client";

/**
 * ProgressionSummaryCard — the motivating "Your progression" snapshot at the top
 * of the client Progression page. Ties together the data that's already on the
 * page (PBs, volume, e1RM) into one encouraging glance: this week's streak,
 * weekly tonnage + trend, the newest PB, and the last set logged.
 *
 * People keep going when they can see progress — so this leads with wins.
 * Deterministic, no AI. Source: /api/client/progression-summary.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Resp = {
  streak: { logged: number; planned: number | null; week_start: string };
  last_set: { exercise: string; weight_kg: number; reps: number; rpe: number | null; session_date: string } | null;
  recent_pr: { exercise: string; e1rm: number; date: string; prev_best: number; delta_kg: number } | null;
  volume: { this_week: number; last_week: number; delta_pct: number | null };
};

const COPY = {
  IS: {
    title: "Þín framþróun", sub: "Vikan þín í hnotskurn",
    week: "þessa viku", sessions: "æfingar", volume: "Rúmmál vikunnar", tonnage: "kg lyft",
    newPb: "Nýtt PB!", last: "Síðast", noData: "Skráðu fyrstu æfinguna til að sjá framþróun þína hér.",
    keepGoing: "Haltu áfram — þú átt eina eftir í viku!", done: "Vikan kláruð! 🎉",
  },
  EN: {
    title: "Your progression", sub: "Your week at a glance",
    week: "this week", sessions: "sessions", volume: "This week's volume", tonnage: "kg lifted",
    newPb: "New PB!", last: "Last", noData: "Log your first session to see your progress here.",
    keepGoing: "Keep going — one more to hit your week!", done: "Week complete! 🎉",
  },
};

function Ring({ logged, planned }: { logged: number; planned: number | null }) {
  const pct = planned && planned > 0 ? Math.min(1, logged / planned) : (logged > 0 ? 1 : 0);
  const r = 26, c = 2 * Math.PI * r;
  const full = planned != null && logged >= planned;
  const stroke = full ? "#2b8a54" : logged > 0 ? "#6366f1" : "#d5cfbe";
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#eef2f7" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 32 32)" />
      <text x="32" y="30" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 15, fontWeight: 700 }}>
        {logged}{planned != null ? `/${planned}` : ""}
      </text>
      <text x="32" y="43" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 7, fontWeight: 600, textTransform: "uppercase" }}>
        {full ? "✓" : ""}
      </text>
    </svg>
  );
}

export default function ProgressionSummaryCard({ lang = "IS" }: { lang?: "IS" | "EN" }) {
  const t = COPY[lang];
  const [d, setD] = useState<Resp | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/client/progression-summary`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json();
        if (res.ok) setD(j as Resp);
      } catch { /* soft-fail */ }
      finally { setLoaded(true); }
    })();
  }, []);

  if (!loaded || !d) return null;

  const { streak, volume, recent_pr, last_set } = d;
  const hasAny = streak.logged > 0 || volume.this_week > 0 || last_set != null;
  const delta = volume.delta_pct;
  const streakMsg = streak.planned != null
    ? (streak.logged >= streak.planned ? t.done : streak.planned - streak.logged === 1 ? t.keepGoing : null)
    : null;

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-indigo-50/60 to-white shadow-sm p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">{t.title}</h2>
        <span className="text-[11px] text-slate-500">{t.sub}</span>
      </div>

      {!hasAny ? (
        <p className="text-sm text-slate-500">{t.noData}</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {/* Streak ring */}
            <Ring logged={streak.logged} planned={streak.planned} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">
                {streak.logged} {t.sessions} {t.week}
              </div>
              {streakMsg && <div className="text-[12px] text-indigo-700">{streakMsg}</div>}
              {/* Weekly volume */}
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.volume}:</span>
                <span className="font-semibold text-slate-900 tabular-nums">{Math.round(volume.this_week).toLocaleString()} {t.tonnage}</span>
                {delta != null && delta !== 0 && (
                  <span className={`tabular-nums ${delta > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                    {delta > 0 ? "↑" : "↓"}{Math.abs(Math.round(delta))}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Recent PB celebration */}
          {recent_pr && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2">
              <span className="text-lg">🎉</span>
              <div className="text-[12px] text-amber-900">
                <span className="font-semibold">{t.newPb}</span>{" "}
                {recent_pr.exercise} — <span className="font-semibold tabular-nums">{recent_pr.e1rm} kg</span>
                {recent_pr.delta_kg > 0 && <span className="text-amber-700"> (+{recent_pr.delta_kg} kg)</span>}
              </div>
            </div>
          )}

          {/* Last set line */}
          {last_set && (
            <div className="text-[12px] text-slate-600">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.last}:</span>{" "}
              <span className="font-medium text-slate-800">{last_set.exercise}</span>{" "}
              <span className="tabular-nums">{last_set.weight_kg} kg × {last_set.reps}</span>
              {last_set.rpe != null && <span className="text-slate-500"> @RPE{last_set.rpe}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
