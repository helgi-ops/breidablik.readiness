"use client";

/**
 * ClientVacationBanner — PT client's view during a declared vacation and on the
 * way back. On vacation: "enjoy your break, nothing to log". On return: a gentle
 * ease-in. Hidden otherwise. Hits /api/client/break-status.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Break = { start_date: string; end_date: string; label: string | null };
type ReturnPhase = { in_return: boolean; day: number; total_days: number; ease_pct: number };

export default function ClientVacationBanner({ lang = "IS" }: { lang?: Lang }) {
  const [onBreak, setOnBreak] = useState(false);
  const [brk, setBrk] = useState<Break | null>(null);
  const [ret, setRet] = useState<ReturnPhase | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/client/break-status`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) { setOnBreak(!!json.on_break); setBrk(json.break ?? null); setRet((json.returnPhase as ReturnPhase) ?? null); }
    } catch { /* soft */ } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!loaded) return null;

  if (onBreak) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-500 px-4 py-3 text-white">
        <div className="text-sm font-semibold">🌴 {lang === "IS" ? "Frí" : "On vacation"}{brk?.label ? ` — ${brk.label}` : ""}</div>
        <div className="mt-0.5 text-xs text-white/90">
          {lang === "IS"
            ? "Njóttu frísins — ekkert að skrá, ekkert check-in. Hvíld er hluti af þjálfuninni."
            : "Enjoy the break — nothing to log, no check-in. Recovery is part of the work."}
        </div>
      </div>
    );
  }

  if (ret?.in_return) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="text-sm font-semibold text-amber-900">
          ↩︎ {lang === "IS" ? "Fyrstu dagar til baka" : "First days back"}
        </div>
        <div className="mt-0.5 text-xs text-amber-800">
          {lang === "IS"
            ? `Dagur ${ret.day} af ${ret.total_days} eftir frí — tökum því rólega og byggjum álagið upp aftur.`
            : `Day ${ret.day} of ${ret.total_days} back — take it steady and build the load back up.`}
        </div>
      </div>
    );
  }

  return null;
}
