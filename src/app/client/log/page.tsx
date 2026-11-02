"use client";

/**
 * /client/log — session logging surface for PT clients.
 * Two modes: a strength session (per-set weight/reps/RPE) and a sport/other
 * session (RPE × duration). Both feed the same total-load machinery.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import PtSessionLogForm from "@/components/player/PtSessionLogForm";
import PtSportSessionForm from "@/components/player/PtSportSessionForm";
import SessionRunner from "@/components/client/SessionRunner";
import type { PlanRow } from "@/lib/client/sessionRunner";

type Mode = "strength" | "sport";
type Plan = { name: string; rows: PlanRow[] };

export default function ClientLogPage() {
  const [lang] = useLang();
  const [mode, setMode] = useState<Mode>("strength");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [checked, setChecked] = useState(false);
  const [manual, setManual] = useState(false);
  const L = lang === "EN" ? "EN" : "IS";

  // A session planned today opens the guided runner; otherwise the free form.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/client/today", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const json = await res.json();
        const ex = json?.explosive as { rest_day?: boolean; is_match_day?: boolean; phase_name?: string; blocks?: Array<{ name: string; rows: PlanRow[] }> } | null;
        const rows = (ex?.blocks ?? []).flatMap((b) => b.rows ?? []);
        if (alive && ex && !ex.rest_day && !ex.is_match_day && rows.length > 0) {
          setPlan({ name: ex.blocks?.[0]?.name ?? ex.phase_name ?? "", rows });
        }
      } catch { /* the free form still works */ }
      if (alive) setChecked(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!checked) return <div className="text-sm text-slate-500">{L === "IS" ? "Hleð…" : "Loading…"}</div>;
  if (plan && !manual) {
    return <SessionRunner lang={L} planRows={plan.rows} sessionName={plan.name} onManual={() => setManual(true)} />;
  }

  const copy = L === "IS"
    ? { title: "Skrá æfingu", strength: "Styrktaræfing", sport: "Íþrótt / annað" }
    : { title: "Log session", strength: "Strength", sport: "Sport / other" };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">{copy.title}</div>
      </div>

      <div className="inline-flex rounded-xl border bg-white p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("strength")}
          className={`rounded-lg px-3 py-1.5 font-medium ${mode === "strength" ? "bg-neutral-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
        >
          {copy.strength}
        </button>
        <button
          type="button"
          onClick={() => setMode("sport")}
          className={`rounded-lg px-3 py-1.5 font-medium ${mode === "sport" ? "bg-neutral-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
        >
          {copy.sport}
        </button>
      </div>

      {mode === "strength"
        ? <PtSessionLogForm lang={L} prefillFromPlan />
        : <PtSportSessionForm lang={L} />}
    </div>
  );
}
