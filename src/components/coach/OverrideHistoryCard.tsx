"use client";

/**
 * OverrideHistoryCard
 *
 * Small dashboard panel that surfaces the coach's own override history
 * over the last 7 / 30 days. Powered by /api/coach/override-log which
 * reads from the decision_override_log audit table (populated by a
 * trigger on stage4_decisions whenever a coach saves a verdict that
 * differs from the engine's).
 *
 * Aligns with explainability-first principle #6 — overrides become an
 * audited dialogue, not a black hole. The coach can see their own
 * disagreement pattern; sport scientists can read the same data to
 * find where the engine is systematically wrong.
 *
 * Silent on empty: if there are zero overrides in the last 30 days the
 * card renders nothing. No need to crowd the dashboard with empty state
 * when the coach hasn't done any overrides yet.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";

type OverrideRow = {
  id: string;
  playerName: string;
  decisionDate: string;
  systemDecision: string;
  coachDecision: string;
  overrideDirection: "tougher" | "lighter" | "lateral";
  coachNote: string | null;
  createdAt: string;
};

type Payload = {
  ok: boolean;
  countLast7d: number;
  countLast30d: number;
  byDirection: { tougher: number; lighter: number; lateral: number };
  recent: OverrideRow[];
};

const COPY = {
  IS: {
    title: "Yfirferðir þínar",
    subtitle: (n: number) => `${n} breyting${n === 1 ? "" : "ar"} síðustu 7 daga`,
    seeAll: "Sjá allar 30 daga",
    directions: {
      tougher: "Þyngri",
      lighter: "Léttari",
      lateral: "Hliðrun",
    },
    directionsHint: {
      tougher: "Þú gafst þyngra plan en kerfið mældi með",
      lighter: "Þú gafst léttara plan en kerfið mældi með",
      lateral: "Þú breyttir tegund, ekki þyngd (t.d. MODIFIED → RECOVERY)",
    },
    recent: "Síðustu breytingar",
    arrow: "→",
    noNote: "Engin ástæða skráð",
    footer: "Yfirferðir hjálpa kerfinu að læra af þínu mati.",
  },
  EN: {
    title: "Your overrides",
    subtitle: (n: number) => `${n} change${n === 1 ? "" : "s"} in the last 7 days`,
    seeAll: "Last 30 days",
    directions: {
      tougher: "Tougher",
      lighter: "Lighter",
      lateral: "Lateral",
    },
    directionsHint: {
      tougher: "You ran a tougher plan than the engine recommended",
      lighter: "You ran a lighter plan than the engine recommended",
      lateral: "You changed type, not load level (e.g. MODIFIED → RECOVERY)",
    },
    recent: "Most recent changes",
    arrow: "→",
    noNote: "No reason logged",
    footer: "Overrides help the system learn from your judgement.",
  },
} as const;

function formatDate(iso: string, lang: "IS" | "EN"): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

export default function OverrideHistoryCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          if (!cancelled) { setError("Not signed in"); setLoading(false); }
          return;
        }
        const res = await fetch("/api/coach/override-log", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        const json = (await res.json()) as Payload;
        if (!res.ok) { setError("Fetch failed"); setLoading(false); return; }
        setData(json);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Silent on empty / loading / error — no point showing this card when
  // the coach has never overridden, hasn't loaded yet, or RLS denied.
  if (loading || error || !data) return null;
  if (data.countLast30d === 0) return null;

  const t = COPY[lang];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-slate-400">
              {t.title}
            </div>
            <div className="mt-0.5 text-base font-semibold text-slate-900">
              {t.subtitle(data.countLast7d)}
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
            {t.seeAll}: <span className="text-slate-700 tabular-nums">{data.countLast30d}</span>
          </div>
        </div>

        {/* Direction breakdown — three small tiles. Tougher (you trained
            harder than engine said) coloured amber; lighter (you eased
            off) coloured emerald; lateral neutral. */}
        <div className="grid grid-cols-3 gap-2">
          {(["tougher", "lighter", "lateral"] as const).map((dir) => {
            const count = data.byDirection[dir];
            const tone =
              dir === "tougher" ? "border-amber-200 bg-amber-50 text-amber-800"
                : dir === "lighter" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-700";
            return (
              <div
                key={dir}
                className={`rounded-lg border px-2.5 py-1.5 ${tone}`}
                title={t.directionsHint[dir]}
              >
                <div className="text-[9px] uppercase tracking-wide opacity-75 font-semibold">
                  {t.directions[dir]}
                </div>
                <div className="text-base font-semibold tabular-nums">{count}</div>
              </div>
            );
          })}
        </div>

        {/* Recent override list — up to 5 entries with player name, the
            change ("FULL → MODIFIED"), date, and the coach's note if any. */}
        {data.recent.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
              {t.recent}
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {data.recent.map((o) => {
                const dirTone =
                  o.overrideDirection === "tougher" ? "text-amber-700"
                    : o.overrideDirection === "lighter" ? "text-emerald-700"
                    : "text-slate-500";
                return (
                  <li key={o.id} className="px-3 py-2 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-800 truncate">{o.playerName}</span>
                      <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                        {formatDate(o.decisionDate, lang)}
                      </span>
                    </div>
                    <div className={`mt-0.5 font-medium tabular-nums ${dirTone}`}>
                      {o.systemDecision} {t.arrow} {o.coachDecision}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 italic">
                      {o.coachNote ?? t.noNote}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <p className="text-[10px] leading-snug text-slate-400">
          {t.footer}
        </p>
      </CardContent>
    </Card>
  );
}
