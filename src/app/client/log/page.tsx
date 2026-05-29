"use client";

/**
 * /client/log — session logging surface for PT clients.
 * Two modes: a strength session (per-set weight/reps/RPE) and a sport/other
 * session (RPE × duration). Both feed the same total-load machinery.
 */

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import PtSessionLogForm from "@/components/player/PtSessionLogForm";
import PtSportSessionForm from "@/components/player/PtSportSessionForm";

type Mode = "strength" | "sport";

export default function ClientLogPage() {
  const [lang] = useLang();
  const [mode, setMode] = useState<Mode>("strength");
  const L = lang === "EN" ? "EN" : "IS";

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
