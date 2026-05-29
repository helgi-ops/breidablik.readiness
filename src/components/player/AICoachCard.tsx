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
    ? { title: "AI þjálfari", badge: "AI", based: "Byggt á", disclaimer: "Sjálfvirk AI-greining á þínum gögnum." }
    : { title: "AI Coach", badge: "AI", based: "Based on", disclaimer: "Automated AI read of your own data." };

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
    <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 bg-gradient-to-r from-zinc-900 to-neutral-800 px-4 py-2 text-white">
        <span className="text-sm">🤖</span>
        <span className="text-[13px] font-semibold">{t.title}</span>
        <span className="ml-auto rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold tracking-wide">{t.badge}</span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm text-slate-800">{insight}</p>
        {signals.length > 0 && (
          <p className="text-[10px] text-slate-500">{t.based}: {signals.join(" · ")}</p>
        )}
        <p className="text-[10px] text-slate-400 italic">{t.disclaimer}</p>
      </div>
    </div>
  );
}
