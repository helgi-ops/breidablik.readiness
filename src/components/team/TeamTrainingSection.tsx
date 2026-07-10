"use client";

/**
 * Compact launcher for published team sessions, shown on the /team hub.
 * The full experience lives on its own pages (/player/sessions overview +
 * /player/sessions/[id] detail) — this card surfaces the next session and links
 * through. Reads /api/team/training-sessions?range=upcoming.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import {
  type PublishedSession,
  SessionCopy,
  dateLabel,
  sessionStats,
} from "@/components/team/sessionShared";

export default function TeamTrainingSection() {
  const [lang] = useLang();
  const t = SessionCopy[lang];
  const locale = lang === "IS" ? "is-IS" : "en-GB";

  const [sessions, setSessions] = useState<PublishedSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { setSessions([]); return; }
      const res = await fetch("/api/team/training-sessions?range=upcoming", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) setSessions(json.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const next = sessions[0] ?? null;
  const count = sessions.length;

  return (
    <Link
      href="/player/sessions"
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{t.heading}</h2>
          <p className="text-xs text-slate-500">{t.subtitle}</p>
        </div>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {count}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">{t.loading}</p>
      ) : !next ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-6 text-center text-sm text-slate-500">
          {t.empty}
        </p>
      ) : (() => {
        const { drillCount, duration, targetPl } = sessionStats(next);
        const dl = dateLabel(next.session_date, locale, t);
        const isToday = t.today === dl;
        return (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t.nextUp}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isToday ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                {dl}
              </span>
              {next.md_day && <span className="text-[10px] font-semibold text-slate-400">{next.md_day}</span>}
            </div>
            <div className="truncate text-sm font-semibold text-slate-900">{next.session_name || "–"}</div>
            <div className="text-[11px] text-slate-500">
              {drillCount} {t.drills.toLowerCase()}
              {duration != null ? ` · ${duration} ${t.min}` : ""}
              {targetPl != null ? ` · ${t.load} ${targetPl}` : ""}
            </div>
          </div>
        );
      })()}

      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
        {t.launcherOpen} <span aria-hidden>→</span>
      </div>
    </Link>
  );
}
