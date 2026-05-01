"use client";

/**
 * PlayerAskCard — interactive Q&A dropdown for a single player.
 *
 * Coach picks one of 8 curated questions; system fetches the relevant data
 * subset for that question, calls Claude with a focused prompt, returns a
 * 2-3 sentence English answer.
 *
 * English-only by design — Icelandic LLM output had spelling errors that
 * eroded coach trust. Coach UI elsewhere is bilingual; this single feature
 * is locked to English for output quality.
 *
 * Different from PlayerSummaryCard: that's lean-back (read in the morning).
 * This is lean-forward (specific question, specific answer).
 *
 * Hides itself silently when generation fails so parent UI never breaks.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { COACH_QUESTIONS } from "@/lib/coach-qa/questions";

type AnswerResponse = {
  ok: boolean;
  question_id?: string;
  answer?: string;
  answered_at?: string;
  error?: string;
};

export function PlayerAskCard({
  playerId,
  className = "",
}: {
  playerId: string;
  className?: string;
}) {
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [answer, setAnswer] = React.useState<AnswerResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [eliteRequired, setEliteRequired] = React.useState(false);

  async function handleAsk(questionId: string) {
    if (!questionId) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Not signed in"); return; }
      const res = await fetch(`/api/coach/player/${playerId}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question_id: questionId }),
      });
      if (res.status === 402) { setEliteRequired(true); return; }
      const json = (await res.json()) as AnswerResponse;
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      setAnswer(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedId(id);
    if (id) void handleAsk(id);
  }

  function handleReset() {
    setSelectedId("");
    setAnswer(null);
    setError(null);
  }

  const selectedQ = COACH_QUESTIONS.find((q) => q.id === selectedId);

  // ELITE-required state — show upgrade prompt instead of dropdown.
  if (eliteRequired) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 ${className}`}>
        <div className="flex items-start gap-2">
          <span className="text-base">🔒</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Ask the system — ELITE feature
            </div>
            <p className="mt-1 text-sm text-amber-900">
              AI Q&amp;A is part of the ELITE tier.
              <a href="/pricing" className="ml-1 font-semibold underline hover:text-amber-700">
                See plans
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            💬 Ask the system
          </span>
          <span className="text-[10px] text-violet-500">AI-powered · English only</span>
        </div>
        {(answer || error) && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded px-2 py-0.5 text-[10px] text-violet-600 hover:bg-violet-100"
          >
            Reset
          </button>
        )}
      </div>

      <select
        value={selectedId}
        onChange={handleChange}
        disabled={loading}
        className="w-full rounded-md border border-violet-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
      >
        <option value="">— pick a question —</option>
        {COACH_QUESTIONS.map((q) => (
          <option key={q.id} value={q.id}>{q.label}</option>
        ))}
      </select>

      {selectedQ && !loading && !answer && !error && (
        <p className="mt-1.5 text-[10px] italic text-violet-500">{selectedQ.hint}</p>
      )}

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-violet-600 italic">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-violet-400" />
          Thinking…
        </div>
      )}

      {answer?.answer && (
        <div className="mt-3 rounded-md border border-violet-200 bg-white/80 p-3">
          <p className="text-sm leading-relaxed text-slate-800">{answer.answer}</p>
          {answer.answered_at && (
            <p className="mt-2 text-[10px] text-violet-400">
              {new Date(answer.answered_at).toLocaleString("en-GB", {
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          Couldn&apos;t answer: {error}
        </div>
      )}
    </div>
  );
}
