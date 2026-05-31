"use client";

/**
 * CoachBreakBanner — surfaces the team's break / return-to-training state at the
 * top of the coach Today dashboard, so a declared break is obvious there (not
 * just on Week setup). During a break: reminders paused, no penalty. After:
 * the ease-in ramp guidance.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Break = { id: string; start_date: string; end_date: string; label: string | null };
type ReturnPhase = { in_return: boolean; day: number; total_days: number; ease_pct: number; label: string | null };

export default function CoachBreakBanner({ teamId, lang }: { teamId: string | null; lang: Lang }) {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [ret, setRet] = useState<ReturnPhase | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/coach/team/breaks?team_id=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok) { setBreaks(json.breaks as Break[]); setRet((json.returnPhase as ReturnPhase) ?? null); }
    } catch { /* soft */ } finally { setLoaded(true); }
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded) return null;
  // The on-break state is owned by the Today Command Center (one coherent
  // verdict). This banner handles the return-to-training ramp afterwards.
  void breaks;

  if (ret?.in_return) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
        <div className="text-sm font-semibold text-amber-900">
          ↩︎ {lang === "EN" ? "Returning from break — ease in" : "Endurkoma úr fríi — mildaðu álagið"}
        </div>
        <div className="mt-0.5 text-xs text-amber-800">
          {lang === "EN"
            ? `Day ${ret.day} of ${ret.total_days} back. ACWR is low after a break and the first sessions are the injury window — keep today around ${ret.ease_pct}% of normal load, then ramp up.`
            : `Dagur ${ret.day} af ${ret.total_days} til baka. ACWR er lágt eftir frí og fyrstu æfingarnar eru meiðsla-glugginn — haltu deginum í dag um ${ret.ease_pct}% af venjulegu álagi og rampaðu svo upp.`}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {Array.from({ length: ret.total_days }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < ret.day ? "bg-amber-500" : "bg-amber-200"}`} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
