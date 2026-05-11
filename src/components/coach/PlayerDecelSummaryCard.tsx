"use client";

/**
 * PlayerDecelSummaryCard — AI narrative explaining the 6 decel intelligence
 * metrics in coach speak. Lives only on the Decel Intel page (NOT in the
 * Decision Summary modal — that has its own overall summary).
 *
 * English-only. Cached 4h. Silent fallback when generation fails.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type DecelSummaryResponse = {
  ok: boolean;
  cached?: boolean;
  narrative?: string;
  generated_at?: string;
  /** True when the narrative was built from rules (deterministic) rather than
   *  by Claude — happens when Claude is unavailable or its output failed
   *  validation. The narrative is still accurate; just no LLM personality. */
  fallback?: boolean;
  error?: string;
};

export function PlayerDecelSummaryCard({
  playerId,
  className = "",
}: {
  playerId: string;
  className?: string;
}) {
  const [data, setData] = React.useState<DecelSummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [eliteRequired, setEliteRequired] = React.useState(false);

  const fetchNarrative = React.useCallback(async (force: boolean = false) => {
    setError(null);
    if (force) setRegenerating(true);
    else setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setError("Not signed in"); return; }
      const res = await fetch(
        `/api/coach/player/${playerId}/decel-summary`,
        {
          method: force ? "POST" : "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.status === 402) { setEliteRequired(true); return; }
      const json = (await res.json()) as DecelSummaryResponse;
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
  }, [playerId]);

  React.useEffect(() => { void fetchNarrative(false); }, [fetchNarrative]);

  // ELITE-required state — show upgrade prompt instead of narrative.
  if (eliteRequired) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 ${className}`}>
        <div className="flex items-start gap-2">
          <span className="text-base">🔒</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Plain-language decel read — ELITE feature
            </div>
            <p className="mt-1 text-sm text-amber-900">
              AI explanations of decel intelligence numbers are part of the ELITE tier. The chips
              and metrics below remain visible.
              <a href="/pricing" className="ml-1 font-semibold underline hover:text-amber-700">
                See plans
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Generation failed and we have no cached narrative to fall back on.
  // We previously hid the card silently, but that left coaches wondering
  // whether the system was broken or whether the player simply had no data.
  // Show a small honest placeholder with a Retry button instead.
  if (error && !loading && !data) {
    // Differentiate between "no data" (404 from API) and other failures
    // so the coach knows whether to wait for more sessions or to retry.
    const isNoData = /no decel data/i.test(error);
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs ${className}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold uppercase tracking-wide text-slate-500">
              🧠 Plain-language decel read
            </div>
            <p className="mt-1 text-slate-700">
              {isNoData
                ? "Not enough decel data yet — this player needs a few more Catapult sessions before the AI can summarise. The chips above still show the raw status."
                : "AI summary unavailable right now (generation failed). The chips above still show the raw status — try again in a moment."}
            </p>
          </div>
          {!isNoData && (
            <button
              type="button"
              onClick={() => void fetchNarrative(true)}
              disabled={regenerating}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-purple-400 hover:text-purple-700 disabled:opacity-50"
            >
              {regenerating ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-violet-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            🧠 Plain-language decel read
          </span>
          <span className="text-[10px] text-purple-500">AI · English only</span>
        </div>
        <button
          type="button"
          onClick={() => void fetchNarrative(true)}
          disabled={loading || regenerating}
          title="Regenerate"
          className="rounded p-1 text-purple-600 hover:bg-purple-100 disabled:opacity-40"
        >
          <span className="text-xs">{regenerating ? "⏳" : "↻"}</span>
        </button>
      </div>

      {loading && !data && (
        <div className="text-xs text-purple-600 italic">Reading the numbers…</div>
      )}

      {data?.narrative && (
        <p className="text-sm leading-relaxed text-slate-800">{data.narrative}</p>
      )}

      {data && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-purple-500">
          {data.cached && (
            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700">cached</span>
          )}
          {data.fallback && (
            <span
              title="Built from rules instead of AI — happens when Claude is unavailable or its output failed validation. Still accurate; just no LLM phrasing."
              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600"
            >
              rule-based
            </span>
          )}
          {data.generated_at && (
            <span>
              {new Date(data.generated_at).toLocaleString("en-GB", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
