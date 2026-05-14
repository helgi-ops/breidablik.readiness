"use client";

/**
 * PtClientSummaryCard
 *
 * AI client summary for the PT dashboard. Rendered inside the expanded
 * client detail row. Three windows (7d / 14d / 30d) — the user picks one;
 * the API caches each window independently.
 *
 * Behaviours:
 *   - Auto-fetches on mount for the default window (14d).
 *   - "Endurnýja" button calls GET ?refresh=1 to force a regen.
 *   - Empty-state ("not enough data yet") rendered when API returns
 *     output: null and a reason — surfaces the cached not-enough-data
 *     message so we never bill a 2nd Claude call for the same window.
 *
 * Mirrors the design of /components/coach/PlayerSummaryCard but with the
 * PT-shaped API at /api/trainer/client/[id]/summary.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type SummaryWindow = 7 | 14 | 30;

type Response = {
  ok: true;
  output: { digest: string; summary: string } | null;
  readinessN?: number;
  cached?: boolean;
  generatedAt?: string;
  reason?: string;
  message?: string;
  lang?: Lang;
  windowDays?: SummaryWindow;
};

const COPY = {
  IS: {
    title: "Hvernig gengur hjá",
    windowLabel: "Tímabil",
    refresh: "Endurnýja",
    refreshing: "Endurnýja…",
    loading: "Hleð samantekt…",
    cachedAt: "Síðast uppfært",
    sampleN: "check-ins í gögnum",
    error: "Ekki tókst að sækja samantekt.",
    days: { 7: "7 dagar", 14: "14 dagar", 30: "30 dagar" } as Record<SummaryWindow, string>,
  },
  EN: {
    title: "How it's going for",
    windowLabel: "Window",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    loading: "Loading summary…",
    cachedAt: "Last updated",
    sampleN: "check-ins in window",
    error: "Could not load summary.",
    days: { 7: "7 days", 14: "14 days", 30: "30 days" } as Record<SummaryWindow, string>,
  },
} as const;

interface Props {
  clientId: string;
  clientName: string;
  lang: Lang;
  /** Initial window to fetch. Defaults to 14d. */
  initialWindow?: SummaryWindow;
}

export default function PtClientSummaryCard({ clientId, clientName, lang, initialWindow = 14 }: Props) {
  const t = COPY[lang];
  const [windowDays, setWindowDays] = useState<SummaryWindow>(initialWindow);
  const [resp, setResp] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchSummary = useCallback(async (w: SummaryWindow, refresh = false) => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const url = `/api/trainer/client/${encodeURIComponent(clientId)}/summary?window=${w}&lang=${lang}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = (await res.json()) as Response | { error?: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        throw new Error("error" in json ? json.error ?? t.error : t.error);
      }
      setResp(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [clientId, lang, t.error]);

  useEffect(() => { void fetchSummary(windowDays, false); }, [fetchSummary, windowDays]);

  const generatedAtLabel = (() => {
    if (!resp?.generatedAt) return null;
    try {
      const d = new Date(resp.generatedAt);
      return d.toLocaleString(lang === "IS" ? "is-IS" : "en-GB", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      });
    } catch { return null; }
  })();

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            ✨ {t.title}
          </div>
          <div className="text-base font-semibold text-slate-900 truncate">{clientName}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Window picker */}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-medium">
            {([7, 14, 30] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowDays(w)}
                className={`px-2.5 py-1 transition-colors ${
                  windowDays === w
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.days[w]}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            type="button"
            onClick={() => fetchSummary(windowDays, true)}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? t.refreshing : `↻ ${t.refresh}`}
          </button>
        </div>
      </div>

      {loading && !resp ? (
        <div className="text-sm text-slate-500">{t.loading}</div>
      ) : err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      ) : resp?.output ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">TL;DR</div>
            <div className="text-sm font-medium text-slate-900 mt-0.5">{resp.output.digest}</div>
          </div>
          <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">{resp.output.summary}</p>
          <div className="text-[11px] text-slate-500 pt-1 flex flex-wrap gap-x-3 gap-y-1">
            {typeof resp.readinessN === "number" && (
              <span>{resp.readinessN} {t.sampleN}</span>
            )}
            {generatedAtLabel && <span>{t.cachedAt}: {generatedAtLabel}</span>}
            {resp.cached && <span className="text-amber-600">cached</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {resp?.message ?? (lang === "IS" ? "Engin samantekt í boði." : "No summary available.")}
        </div>
      )}
    </div>
  );
}
