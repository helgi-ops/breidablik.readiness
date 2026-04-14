"use client";

/**
 * Player-facing view of published training sessions for the authenticated user's team.
 *
 * Reads from /api/team/training-sessions?range=upcoming. Shows a list of published
 * sessions; clicking one expands an inline panel with focus points and the drill list
 * (with diagrams pulled from drill_library).
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Drill = {
  drill_id: string | null;
  drill_name: string;
  sets: number;
  category: string | null;
  diagram_url: string | null;
  description: string | null;
};

type PublishedSession = {
  id: string;
  session_name: string;
  md_day: string | null;
  target_pl: number | null;
  items: Drill[];
  totals: {
    duration_min?: number;
    distance_m?: number;
    player_load?: number;
  } | null;
  session_date: string | null;
  focus_points: string[] | null;
  published_at: string;
  updated_at: string;
};

const COPY = {
  IS: {
    heading: "Æfingar liðsins",
    subtitle: "Birtar æfingar frá þjálfara",
    loading: "Hleð…",
    empty: "Engar birtar æfingar núna.",
    today: "Í dag",
    tomorrow: "Á morgun",
    noDate: "Án dagsetningar",
    focus: "Áherslur",
    drills: "Drillur",
    duration: "Lengd",
    distance: "Vegalengd",
    load: "PL",
    min: "mín",
    sets: "set",
  },
  EN: {
    heading: "Team training",
    subtitle: "Published by your coach",
    loading: "Loading…",
    empty: "No published sessions right now.",
    today: "Today",
    tomorrow: "Tomorrow",
    noDate: "No date",
    focus: "Focus",
    drills: "Drills",
    duration: "Duration",
    distance: "Distance",
    load: "PL",
    min: "min",
    sets: "sets",
  },
} as const;

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dateLabel(iso: string | null, locale: string, copy: (typeof COPY)[keyof typeof COPY]): string {
  if (!iso) return copy.noDate;
  const t = todayStr();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  const tmr = `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}`;
  if (iso === t) return copy.today;
  if (iso === tmr) return copy.tomorrow;
  return new Date(iso + "T00:00:00").toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function TeamTrainingSection() {
  const [lang] = useLang();
  const t = COPY[lang];
  const locale = lang === "IS" ? "is-IS" : "en-GB";

  const [sessions, setSessions] = useState<PublishedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) {
        setSessions([]);
        return;
      }
      const res = await fetch("/api/team/training-sessions?range=upcoming", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) setSessions(json.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{t.heading}</h2>
        <p className="mt-3 text-sm text-slate-500">{t.loading}</p>
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t.heading}</h2>
            <p className="text-xs text-slate-500">{t.subtitle}</p>
          </div>
        </div>
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
          {t.empty}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t.heading}</h2>
          <p className="text-xs text-slate-500">{t.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {sessions.map((s) => {
          const isOpen = expandedId === s.id;
          const drillCount = s.items?.length ?? 0;
          return (
            <article
              key={s.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:shadow-sm"
            >
              <button
                onClick={() => setExpandedId(isOpen ? null : s.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      {dateLabel(s.session_date, locale, t)}
                    </span>
                    {s.md_day && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {s.md_day}
                      </span>
                    )}
                    <h3 className="truncate text-sm font-semibold text-slate-900">
                      {s.session_name || "–"}
                    </h3>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {drillCount} {t.drills.toLowerCase()}
                    {s.totals?.duration_min ? ` · ${Math.round(s.totals.duration_min)} ${t.min}` : ""}
                    {s.target_pl ? ` · ${t.load} ${Math.round(s.target_pl)}` : ""}
                  </div>
                  {s.focus_points && s.focus_points.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.focus_points.slice(0, isOpen ? 8 : 3).map((f, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <svg
                  className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 space-y-4">
                  {s.focus_points && s.focus_points.length > 0 && (
                    <div>
                      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {t.focus}
                      </h4>
                      <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                        {s.focus_points.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {t.drills}
                    </h4>
                    <ol className="space-y-3">
                      {s.items.map((d, idx) => (
                        <li key={idx} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex items-baseline gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-slate-900">{d.drill_name}</div>
                              <div className="text-[11px] text-slate-500">
                                {d.sets > 1 ? `${d.sets} ${t.sets}` : ""}
                                {d.category ? ` · ${d.category}` : ""}
                              </div>
                            </div>
                          </div>
                          {d.diagram_url && (
                            <div className="mt-2 flex justify-center">
                              <div className="max-w-sm overflow-hidden rounded-md border border-slate-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={d.diagram_url} alt={`Diagram: ${d.drill_name}`} className="w-full" />
                              </div>
                            </div>
                          )}
                          {d.description && (
                            <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                              {d.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
