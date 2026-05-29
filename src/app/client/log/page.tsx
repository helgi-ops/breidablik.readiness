"use client";

/**
 * /client/log — session logging surface for PT clients.
 * Reuses the PtSessionLogForm component built for /player/log-session.
 */

export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import PtSessionLogForm from "@/components/player/PtSessionLogForm";

export default function ClientLogPage() {
  const [lang] = useLang();
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Skrá æfingu" : "Log session"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "Þyngd × endurt. × RPE per sett. Vistast sjálfkrafa á þjálfara."
            : "Weight × reps × RPE per set. Saved automatically to your trainer."}
        </div>
      </div>
      <PtSessionLogForm lang={lang === "EN" ? "EN" : "IS"} prefillFromPlan />
    </div>
  );
}
