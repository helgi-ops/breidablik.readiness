"use client";

/**
 * PlayerSummaryCard — AI-generated 3-4 sentence narrative per player.
 *
 * Reads from cache via GET /api/coach/player/:id/summary?window=7|14;
 * regenerates on demand via POST.
 *
 * English-only by design — Icelandic LLM output had spelling errors that
 * eroded coach trust. Coach UI elsewhere is bilingual; this single feature
 * is locked to English for output quality.
 *
 * Used in two places:
 *   - Today page → Decision Summary expanded view
 *   - Decel Intelligence → expanded player row
 *
 * Hides itself entirely when summary is unavailable so parent UI never breaks.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type SummaryResponse = {
  ok: boolean;
  cached?: boolean;
  summary?: string;
  generated_at?: string;
  error?: string;
};

export function PlayerSummaryCard({
  playerId,
  coachVerdict,
  className = "",
}: {
  playerId: string;
  /** The verdict the parent component is displaying — passed as ground truth
   *  to the LLM so the summary aligns with what the coach actually sees on
   *  screen rather than disagreeing with it. */
  coachVerdict?: {
    state: string;
    headline?: string;
    why_lines?: string[];
    action?: string;
  };
  className?: string;
}) {
  const [windowDays, setWindowDays] = React.useState<7 | 14>(7);
  const [data, setData] = React.useState<SummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [eliteRequired, setEliteRequired] = React.useState(false);

  const coachVerdictKey = coachVerdict ? JSON.stringify(coachVerdict) : "";

  const fetchSummary = React.useCallback(async (force: boolean = false) => {
    setError(null);
    if (force) setRegenerating(true);
    else setLoading(true);

    try {
      const sb = getSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setError("Not signed in"); return; }

      const usePost = force || !!coachVerdict;
      const res = await fetch(
        `/api/coach/player/${playerId}/summary?window=${windowDays}`,
        {
          method: usePost ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization:  `Bearer ${token}`,
          },
          body: usePost
            ? JSON.stringify({ window: windowDays, coach_verdict: coachVerdict ?? null })
            : undefined,
        },
      );
      if (res.status === 402) {
        // ELITE tier required — surface upgrade prompt instead of error.
        setEliteRequired(true);
        return;
      }
      const json = (await res.json()) as SummaryResponse;
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, windowDays, coachVerdictKey]);

  React.useEffect(() => {
    void fetchSummary(false);
  }, [fetchSummary]);

  // ELITE-required state — show upgrade prompt instead of summary.
  if (eliteRequired) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 ${className}`}>
        <div className="flex items-start gap-2">
          <span className="text-base">🔒</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              AI Summary — ELITE feature
            </div>
            <p className="mt-1 text-sm text-amber-900">
              AI-generated player summaries are part of the ELITE tier.
              <a href="/pricing" className="ml-1 font-semibold underline hover:text-amber-700">
                See plans
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Silent failure — if generation fails (e.g. missing API key, no data),
  // hide the card rather than show a broken state.
  if (error && !loading && !data) return null;

  return (
    <div className={`rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            AI summary
          </span>
          <span className="text-[10px] text-indigo-500">generated · English only</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Window toggle */}
          <div className="inline-flex rounded-md border border-indigo-200 bg-white text-[10px] overflow-hidden">
            {([7, 14] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowDays(w)}
                disabled={loading || regenerating}
                className={`px-2 py-0.5 transition-colors ${
                  windowDays === w
                    ? "bg-indigo-600 text-white font-semibold"
                    : "text-indigo-700 hover:bg-indigo-100"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
          {/* Regenerate */}
          <button
            type="button"
            onClick={() => void fetchSummary(true)}
            disabled={loading || regenerating}
            title="Regenerate"
            className="rounded p-1 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
          >
            <span className="text-xs">{regenerating ? "⏳" : "↻"}</span>
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="text-xs text-indigo-600 italic">Loading summary…</div>
      )}

      {data?.summary && (
        <p className="text-sm leading-relaxed text-slate-800">{data.summary}</p>
      )}

      {data && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-indigo-500">
          <span>Window: <strong>{windowDays}d</strong></span>
          {data.cached && (
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-indigo-700">
              cached
            </span>
          )}
          {data.generated_at && (
            <span>
              · {new Date(data.generated_at).toLocaleString("en-GB", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
