"use client";

/**
 * AICoachCard — Daily AI Coach for the PT athlete (parity with the team-side
 * AI). Labelled clearly as AI, cites the real signals it was given, lazy-loaded
 * so it never blocks the Today render. Hides itself if there's nothing to say
 * or the model is unavailable (the hero's deterministic note still covers it).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

export default function AICoachCard({ lang = "IS" }: { lang?: Lang }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [signals, setSignals] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const t = lang === "IS"
    ? { title: "Dagleg innsýn", badge: "AI", based: "Byggt á", disclaimer: "Sjálfvirk AI-greining á þínum gögnum." }
    : { title: "Daily insight", badge: "AI", based: "Based on", disclaimer: "Automated AI read of your own data." };

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/client/ai-coach?lang=${lang}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok && json.insight) { setInsight(json.insight); setSignals(json.signals ?? []); }
    } catch { /* soft — card stays hidden */ } finally { setLoaded(true); }
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !insight) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{t.title}</span>
        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{t.badge}</span>
      </div>
      <p className="mt-1 text-sm text-slate-800">{insight}</p>
      {signals.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">{t.based}: {signals.join(" · ")}</p>
      )}
      <p className="mt-1 text-xs text-slate-500">{t.disclaimer}</p>
    </div>
  );
}
