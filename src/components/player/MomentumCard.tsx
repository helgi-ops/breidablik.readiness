"use client";

/**
 * MomentumCard — Training Momentum. One consistency score (0-100) + a level the
 * athlete wants to keep up, with the counts behind it. The retention hook.
 * Optional clientId switches to the trainer-scoped endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Momentum = {
  score: number; level: "high" | "building" | "low";
  checkins: number; workouts: number; sport_sessions: number; streak: number; window_days: number;
};

const COPY = {
  IS: {
    title: "Training Momentum", windowLbl: (n: number) => `Síðustu ${n} dagar`,
    level: { high: "🔥 Hátt", building: "📈 Að byggjast", low: "🌱 Að byrja" },
    checkins: "Check-in", workouts: "Æfingar", sport: "Íþrótt", streak: "🔥 Streak",
    consistency: "Samkvæmni",
  },
  EN: {
    title: "Training Momentum", windowLbl: (n: number) => `Last ${n} days`,
    level: { high: "🔥 High", building: "📈 Building", low: "🌱 Getting started" },
    checkins: "Check-ins", workouts: "Workouts", sport: "Sport", streak: "🔥 Streak",
    consistency: "Consistency",
  },
} as const;

const LEVEL_COLOR: Record<string, string> = {
  high: "#10b981", building: "#f59e0b", low: "#94a3b8",
};

export default function MomentumCard({ lang = "IS", clientId }: { lang?: Lang; clientId?: string }) {
  const t = COPY[lang];
  const [m, setM] = useState<Momentum | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const url = clientId ? `/api/trainer/client/${clientId}/momentum` : `/api/client/momentum`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) setM(json.momentum as Momentum);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !m) return null;

  const color = LEVEL_COLOR[m.level];
  const R = 30, C = 2 * Math.PI * R;
  const dash = (Math.max(0, Math.min(100, m.score)) / 100) * C;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-zinc-900 to-neutral-800 p-4 text-white">
      <div className="flex items-center gap-4">
        {/* Score ring */}
        <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90">
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
          <circle cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`} />
          <text x="40" y="40" transform="rotate(90 40 40)" textAnchor="middle" dominantBaseline="central"
            fontSize="20" fontWeight="700" fill="white">{m.score}</text>
        </svg>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t.title}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold" style={{ color }}>
              {t.level[m.level]}
            </span>
          </div>
          <div className="text-[11px] text-white/60">{t.consistency} · {t.windowLbl(m.window_days)}</div>

          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
            {[
              { lbl: t.checkins, v: m.checkins },
              { lbl: t.workouts, v: m.workouts },
              { lbl: t.sport, v: m.sport_sessions },
              { lbl: t.streak, v: m.streak },
            ].map((x) => (
              <div key={x.lbl} className="rounded-lg bg-white/5 px-1 py-1.5">
                <div className="text-base font-bold tabular-nums leading-none">{x.v}</div>
                <div className="mt-0.5 text-[9px] text-white/60 leading-tight">{x.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
