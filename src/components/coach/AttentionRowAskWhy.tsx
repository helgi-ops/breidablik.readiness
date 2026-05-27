"use client";

/**
 * AttentionRowAskWhy — inline "Ask why" button on a Daily Briefing
 * attention row that surfaces an AI explanation of today's verdict for a
 * specific player.
 *
 * Calls the existing curated Q&A endpoint with question_id = "why_flagged",
 * which is scoped to today's verdict signals (wellness, recent load,
 * decel status, injuries, verdict history) and runs through the same
 * anti-hallucination pipeline as the other 8 questions.
 *
 * Why this exists despite PlayerAskCard already existing:
 *   - PlayerAskCard lives on the player detail page and offers all 9
 *     questions in a dropdown. That's lean-forward exploration.
 *   - AttentionRowAskWhy is lean-back: the coach is reading the Daily
 *     Briefing, sees a flagged player, and wants to know WHY in one
 *     click. No dropdown, no navigation, no jargon.
 *
 * Aligns with explainability-first principle #5: AI explains, rules
 * decide. The verdict is rule-driven; this button only generates the
 * narrative around it, with every claim tied back to a named signal.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type AnswerResponse = {
  ok: boolean;
  question_id?: string;
  answer?: string;
  answered_at?: string;
  error?: string;
};

export function AttentionRowAskWhy({
  playerId,
  lang,
}: {
  playerId: string;
  lang: "IS" | "EN";
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [answer, setAnswer] = React.useState<AnswerResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [eliteRequired, setEliteRequired] = React.useState(false);

  // Fetch once on first expand. Cached for the lifetime of the card.
  React.useEffect(() => {
    if (!expanded || answer || loading || error || eliteRequired) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          if (!cancelled) setError(lang === "IS" ? "Ekki innskráð(ur)" : "Not signed in");
          return;
        }
        const res = await fetch(`/api/coach/player/${playerId}/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ question_id: "why_flagged" }),
        });
        if (cancelled) return;
        if (res.status === 402) { setEliteRequired(true); return; }
        const json = (await res.json()) as AnswerResponse;
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setAnswer(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, playerId, answer, loading, error, eliteRequired, lang]);

  const buttonLabel = expanded
    ? (lang === "IS" ? "Loka skýringu" : "Hide explanation")
    : (lang === "IS" ? "Spyrja AI" : "Ask AI");

  // No top margin here — parent row-actions wrapper controls vertical
  // spacing now that we render alongside the "Show full trace" button.
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        aria-expanded={expanded}
      >
        <span aria-hidden>✨</span>
        {buttonLabel}
      </button>

      {expanded ? (
        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          {/* AI label — always shown so the coach knows this is AI synthesis,
              not a deterministic system output (explainability principle 5). */}
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-violet-700">
            <span>
              ✨ {lang === "IS" ? "AI skýring" : "AI explanation"}
              <span className="ml-1.5 font-normal opacity-70">
                · {lang === "IS" ? "byggt á gögnum hans í dag" : "from his data today"}
              </span>
            </span>
            {answer?.answered_at ? (
              <span className="font-normal opacity-60">
                {new Date(answer.answered_at).toLocaleTimeString(lang === "IS" ? "is-IS" : "en-GB", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs italic text-violet-600">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-violet-400" />
              {lang === "IS" ? "Greini gögn…" : "Reading his data…"}
            </div>
          ) : null}

          {eliteRequired ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <span className="font-semibold">🔒 ELITE — </span>
              {lang === "IS"
                ? "AI skýringar eru hluti af ELITE pakka."
                : "AI explanations are part of the ELITE tier."}
              <a href="/pricing" className="ml-1 font-semibold underline hover:text-amber-700">
                {lang === "IS" ? "Sjá pakka" : "See plans"}
              </a>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {lang === "IS" ? "Tókst ekki að ná í skýringu: " : "Couldn't get explanation: "}{error}
            </div>
          ) : null}

          {answer?.answer ? (
            <p className="text-sm leading-relaxed text-slate-800">{answer.answer}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
