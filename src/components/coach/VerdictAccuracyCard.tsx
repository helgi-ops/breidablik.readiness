"use client";

// ─────────────────────────────────────────────────────────────────────────────
// VerdictAccuracyCard
// ─────────────────────────────────────────────────────────────────────────────
//
// Calibration widget — proves to the coach that the system's verdicts
// are actually predictive. Reads /api/team/calibration which aggregates
// the last 30 days of verdicts and computes per-color accuracy stats:
//
//   GREEN safety  = (no escalation, no injury within 7d) / scoreable
//   YELLOW spec.  = (persisted, escalated, OR injured) / scoreable
//   RED precision = (persisted, escalated, OR injured) / scoreable
//
// Hidden when sample size is too small (< 30 scoreable verdicts) — we
// don't show noisy percentages that could be misleading.
//
// Placement: under the Daily Briefing on the coach Today tab. Compact
// 1-row card so it doesn't dominate the morning view.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";

type StateStats = {
  state: "GREEN" | "YELLOW" | "RED";
  total: number;
  persistentNextDay: number;
  escalatedNextDay: number;
  recoveredNextDay: number;
  unknownCount: number;
  injuredWithin7d: number;
  accuracyPct: number | null;
  interpretationEN: string;
  interpretationIS: string;
};

type CalibrationResponse = {
  date: string;
  periodDays: number;
  perState: {
    GREEN: StateStats;
    YELLOW: StateStats;
    RED: StateStats;
  };
  totalScoreableVerdicts: number;
  sampleSizeAdequate: boolean;
  headline?: { tone: "good" | "caution" | "building"; en: string; is: string };
};

// Copy lookup — keeps strings together for translation review
const COPY = {
  IS: {
    title: "Nákvæmni úrskurða",
    subtitle: "Síðustu 30 dagar — hversu vel kerfið spáir fyrir um líkamlegt ástand",
    insufficient: "Þarf fleiri gögn til að mæla nákvæmni (lágmark 30 metanleg úrskurðir)",
    error: "Gat ekki sótt nákvæmnistölur",
    loading: "Sæki...",
    state: { GREEN: "Grænn", YELLOW: "Gulur", RED: "Rauður" },
    accuracyLabel: "nákvæmni",
    detailsToggle: "Sjá nánar",
    detailsHide: "Fela",
    methodologyTitle: "Hvernig er þetta reiknað",
    methodologyBody:
      "Hver úrskurður borinn saman við ástand næsta dags og meiðsli innan 7 daga. Grænn = öruggt (engin escalation/meiðsli). Gulur/Rauður = áhyggjur staðfestar (hélt áfram, versnaði, eða leiddi til meiðsla).",
  },
  EN: {
    title: "Verdict accuracy",
    subtitle: "Last 30 days — how well the system predicts physical state",
    insufficient: "Need more data to measure accuracy (minimum 30 scoreable verdicts)",
    error: "Could not load accuracy stats",
    loading: "Loading...",
    state: { GREEN: "Green", YELLOW: "Yellow", RED: "Red" },
    accuracyLabel: "accuracy",
    detailsToggle: "Show details",
    detailsHide: "Hide",
    methodologyTitle: "How this is computed",
    methodologyBody:
      "Each verdict compared with next-day state and 7-day forward injuries. Green = safe (no escalation/injury). Yellow/Red = concern validated (persisted, escalated, or led to injury).",
  },
} as const;

const STATE_CHIP_CLS: Record<"GREEN" | "YELLOW" | "RED", string> = {
  GREEN: "border-emerald-300 bg-emerald-50 text-emerald-800",
  YELLOW: "border-amber-300 bg-amber-50 text-amber-800",
  RED: "border-red-300 bg-red-50 text-red-800",
};

const ACCURACY_TONE_CLS = (pct: number | null): string => {
  if (pct == null) return "text-slate-400";
  if (pct >= 80) return "text-emerald-700";
  if (pct >= 60) return "text-amber-700";
  return "text-red-700";
};

export default function VerdictAccuracyCard({ lang }: { lang: "IS" | "EN" }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const t = COPY[lang];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        if (authErr) throw new Error(authErr.message);
        const token = authData?.session?.access_token;
        if (!token) {
          if (alive) {
            setData(null);
            setLoading(false);
          }
          return;
        }
        const res = await fetch("/api/team/calibration", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as CalibrationResponse | { error?: string };
        if (!alive) return;
        if (!res.ok) {
          setError(("error" in json && json.error) || t.error);
          setData(null);
        } else {
          setData(json as CalibrationResponse);
        }
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : t.error);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [supabase, t.error]);

  if (loading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-3 text-xs text-slate-500">{t.loading}</CardContent>
      </Card>
    );
  }

  if (error || !data) {
    // Quietly hide on error — calibration is supplementary info, not
    // critical to the morning workflow. Logged in dev console for debug.
    if (error) console.warn("VerdictAccuracyCard:", error);
    return null;
  }

  // Sample size guard — don't show noisy numbers under threshold
  if (!data.sampleSizeAdequate) {
    return (
      <Card className="border-slate-200 bg-slate-50/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-700">{t.title}</div>
              <div className="text-xs text-slate-500">{t.subtitle}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3 text-xs text-slate-500">
          {t.insufficient}
        </CardContent>
      </Card>
    );
  }

  const states: Array<"GREEN" | "YELLOW" | "RED"> = ["GREEN", "YELLOW", "RED"];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">{t.title}</div>
            <div className="text-xs text-slate-500">{t.subtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            aria-expanded={showDetails}
          >
            {showDetails ? t.detailsHide : t.detailsToggle}
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {/* Plain-language verdict — the coach reads this first; the tiles
            below are the drill-down. Explainability-first: the system says
            where it is right and where it may be mis-tuned for THIS squad,
            and points at the question rather than silently changing itself. */}
        {data.headline ? (
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium leading-snug ${
              data.headline.tone === "good"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : data.headline.tone === "caution"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {lang === "IS" ? data.headline.is : data.headline.en}
          </div>
        ) : null}

        {/* Compact 3-column accuracy strip */}
        <div className="grid grid-cols-3 gap-2">
          {states.map((state) => {
            const stats = data.perState[state];
            const pct = stats.accuracyPct;
            return (
              <div
                key={state}
                className="flex flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${STATE_CHIP_CLS[state]}`}
                  >
                    {t.state[state]}
                  </span>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    n={stats.total - stats.unknownCount}
                  </span>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${ACCURACY_TONE_CLS(pct)}`}>
                  {pct == null ? "—" : `${pct}%`}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  {t.accuracyLabel}
                </div>
              </div>
            );
          })}
        </div>

        {/* Expandable per-color interpretation lines */}
        {showDetails ? (
          <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {states.map((state) => {
              const stats = data.perState[state];
              const text = lang === "IS" ? stats.interpretationIS : stats.interpretationEN;
              return (
                <div key={`${state}-line`} className="flex items-start gap-1.5">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold tabular-nums ${STATE_CHIP_CLS[state]}`}
                  >
                    {t.state[state]}
                  </span>
                  <span>{text}</span>
                </div>
              );
            })}
            <div className="mt-2 border-t border-slate-200 pt-2 text-[10px] italic text-slate-500">
              <span className="font-semibold not-italic">{t.methodologyTitle}:</span> {t.methodologyBody}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
