"use client";

/**
 * WeeklyStoryCard
 *
 * Friday-afternoon AI synthesis card. Coach clicks "Generate weekly
 * story" once a week → Claude writes one paragraph (~80–120 words)
 * narrating the squad's 7 days: load shape, who improved / declined,
 * one thing to carry into next week.
 *
 * Lives on the coach dashboard alongside OverrideHistoryCard. Lazy
 * fetch — no cost incurred until the coach opts in. Last result is
 * shown with a timestamp; "Regenerate" re-runs.
 *
 * Aligns with explainability-first principle #5 (AI explains, rules
 * decide). The deterministic engine produced the per-day verdicts +
 * load deltas; this endpoint just narrates them. Output is always
 * labelled as AI synthesis, and the underlying facts can be inspected
 * via the "Show facts used" expand.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";

type WeekFacts = {
  week_start_iso: string;
  week_end_iso: string;
  days: Array<{ date: string; full: number; modified: number; recovery: number; day_type: string | null }>;
  declining_players: string[];
  improving_players: string[];
  injured_players: string[];
  acwr_team: number | null;
  load_delta_pct: number | null;
  match_days_in_week: number;
  override_count_7d: number;
  override_directions: { tougher: number; lighter: number; lateral: number };
};

type StoryResponse = {
  ok: boolean;
  weekly_story?: string;
  generated_at?: string;
  week_start?: string;
  week_end?: string;
  facts_used?: WeekFacts;
  error?: string;
};

const COPY = {
  IS: {
    title: "Saga vikunnar",
    subtitle: "AI-skrifuð yfirsýn yfir síðustu 7 daga",
    cta: "Mynda söguna",
    regenerate: "↻ Endurnýja",
    loading: "Skrifa söguna…",
    elite: "Saga vikunnar er ELITE eiginleiki.",
    eliteCta: "Sjá pakka",
    showFacts: "Sjá gögnin sem voru notuð",
    hideFacts: "Fela gögnin",
    error: "Tókst ekki að mynda söguna",
    poweredBy: "Skrifað af Claude Haiku — byggt á alvöru gögnum vikunnar",
    factsHeader: "Gögn vikunnar",
  },
  EN: {
    title: "The week's story",
    subtitle: "AI overview of the last 7 days",
    cta: "Generate the story",
    regenerate: "↻ Regenerate",
    loading: "Writing the story…",
    elite: "The week's story is an ELITE feature.",
    eliteCta: "See plans",
    showFacts: "Show facts used",
    hideFacts: "Hide facts",
    error: "Couldn't generate the story",
    poweredBy: "Written by Claude Haiku — based on the week's real data",
    factsHeader: "Week facts",
  },
} as const;

export default function WeeklyStoryCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [story, setStory] = React.useState<StoryResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [eliteRequired, setEliteRequired] = React.useState(false);
  const [showFacts, setShowFacts] = React.useState(false);

  const t = COPY[lang];

  async function generate() {
    setLoading(true);
    setError(null);
    setEliteRequired(false);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Not signed in"); return; }
      const res = await fetch("/api/coach/weekly-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: "{}",
      });
      if (res.status === 402) { setEliteRequired(true); return; }
      const json = (await res.json()) as StoryResponse;
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setStory(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-white to-violet-50/40 shadow-sm">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-violet-600">
              ✨ {t.title}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{t.subtitle}</div>
          </div>
          {story?.weekly_story ? (
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="text-[11px] font-medium text-violet-600 hover:text-violet-800 disabled:opacity-50"
            >
              {loading ? t.loading : t.regenerate}
            </button>
          ) : null}
        </div>

        {/* Initial CTA — shown only when there's no story yet, no error,
            not loading, not elite-required. */}
        {!story?.weekly_story && !loading && !error && !eliteRequired ? (
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <span aria-hidden>✨</span>
            {t.cta}
          </button>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-xs italic text-violet-600">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-violet-400" />
            {t.loading}
          </div>
        ) : null}

        {eliteRequired ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <span className="font-semibold">🔒 ELITE — </span>
            {t.elite}
            <a href="/pricing" className="ml-1 font-semibold underline hover:text-amber-700">
              {t.eliteCta}
            </a>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {t.error}: {error}
          </div>
        ) : null}

        {story?.weekly_story ? (
          <>
            <div className="rounded-xl border border-violet-200 bg-white/70 p-4">
              <p className="text-sm leading-relaxed text-slate-800">
                {story.weekly_story}
              </p>
              {story.generated_at ? (
                <div className="mt-3 flex items-center justify-between text-[10px] text-violet-500">
                  <span>{t.poweredBy}</span>
                  <span className="opacity-70">
                    {new Date(story.generated_at).toLocaleString(lang === "IS" ? "is-IS" : "en-GB", {
                      day: "2-digit", month: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Show-facts toggle — explainability principle #1 in concrete
                form. Coach can verify the AI didn't make anything up by
                seeing the raw facts that fed the prompt. */}
            {story.facts_used ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowFacts((v) => !v)}
                  className="text-[11px] font-medium text-violet-600 hover:text-violet-800"
                  aria-expanded={showFacts}
                >
                  {showFacts ? t.hideFacts : t.showFacts}
                </button>
                {showFacts ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                      {t.factsHeader}
                    </div>
                    <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[10px] leading-relaxed font-mono">
                      {JSON.stringify(story.facts_used, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
