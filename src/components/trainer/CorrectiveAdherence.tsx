"use client";

/** One plain line for the trainer: how often the client did corrective, and any pain. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Adherence = {
  weekDone: number;
  weekPlanned: number;
  lastPain: "none" | "little" | "yes" | null;
  lastDate: string | null;
} | null;

export default function CorrectiveAdherence({ clientId, lang }: { clientId: string; lang: "IS" | "EN" }) {
  const [a, setA] = useState<Adherence>(null);
  const IS = lang === "IS";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/trainer/client/${clientId}/corrective`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const json = await res.json();
        if (alive && json.ok) setA((json.adherence ?? null) as Adherence);
      } catch { /* optional */ }
    })();
    return () => { alive = false; };
  }, [clientId]);

  if (!a || a.weekPlanned === 0) return null;
  const painText = a.lastPain === "yes"
    ? (IS ? `Verkur skráður ${a.lastDate}` : `Pain reported ${a.lastDate}`)
    : a.lastPain === "little"
      ? (IS ? `Smá verkur ${a.lastDate}` : `A little pain ${a.lastDate}`)
      : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
      {IS ? `${a.weekDone} af ${a.weekPlanned} dögum í vikunni` : `${a.weekDone} of ${a.weekPlanned} days this week`}
      {painText && <span className={a.lastPain === "yes" ? "font-medium text-red-700" : "text-amber-800"}> · {painText}</span>}
    </div>
  );
}
