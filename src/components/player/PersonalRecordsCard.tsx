"use client";

/**
 * PersonalRecordsCard — auto-detected PBs from logged sets. Recent PBs first
 * (celebrated), then the all-time best e1RM per exercise.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

type Records = {
  records: Array<{ exercise: string; best_e1rm: number; best_e1rm_date: string; best_weight: number }>;
  recent_prs: Array<{ exercise: string; e1rm: number; date: string; delta_kg: number }>;
};

export default function PersonalRecordsCard({ lang = "IS", clientId }: { lang?: Lang; clientId?: string }) {
  const [r, setR] = useState<Records | null>(null);
  const [loaded, setLoaded] = useState(false);

  const t = lang === "IS"
    ? { title: "Persónuleg met", recent: "Nýleg met", best: "Bestu met (e1RM)", none: "Engin met enn — skráðu æfingar til að byrja.", kg: "kg" }
    : { title: "Personal records", recent: "Recent PBs", best: "Best lifts (e1RM)", none: "No records yet — log sessions to start.", kg: "kg" };

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const url = clientId ? `/api/trainer/client/${clientId}/personal-records` : `/api/client/personal-records`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) setR({ records: json.records ?? [], recent_prs: json.recent_prs ?? [] });
    } catch { /* soft */ } finally { setLoaded(true); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !r) return null;

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
      <h3 className="text-base font-semibold text-slate-900">🏆 {t.title}</h3>

      {r.recent_prs.length === 0 && r.records.length === 0 ? (
        <div className="text-sm text-slate-500">{t.none}</div>
      ) : (
        <>
          {r.recent_prs.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700">{t.recent}</div>
              {r.recent_prs.slice(0, 5).map((p) => (
                <div key={`${p.exercise}-${p.date}`} className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-1.5 text-sm">
                  <span className="capitalize text-slate-800 truncate">{p.exercise}</span>
                  <span className="text-emerald-800 font-semibold tabular-nums shrink-0">
                    {p.e1rm} {t.kg} <span className="text-emerald-600 font-normal">+{p.delta_kg}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {r.records.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.best}</div>
              {r.records.slice(0, 8).map((rec) => (
                <div key={rec.exercise} className="flex items-center justify-between text-sm border-b border-slate-100 pb-1 last:border-0">
                  <span className="capitalize text-slate-700 truncate">{rec.exercise}</span>
                  <span className="text-slate-900 font-medium tabular-nums shrink-0">{rec.best_e1rm} {t.kg}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
