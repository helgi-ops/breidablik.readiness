"use client";

/**
 * CalibrationVerdictNote
 *
 * Decision-moment calibration context, shown BESIDE the readiness verdict — never
 * as the verdict (CLAUDE.md: the colour is the sacred canonical source; this is a
 * distinct labelled signal next to it). Reads /api/coach/calibration-notes, which
 * only returns a note when a colour is over-sensitive for THIS squad (most verdicts
 * of that colour recovered next day, on a usable sample) AND present today.
 *
 * Rule-derived, not AI: it cites the 30-day next-day recovery rate. It changes no
 * colour and recommends no downgrade — it hands the coach context for their call.
 *
 * Silent when there are no flagged colours today.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Note = {
  color: string;
  playersToday: number;
  recoveredPct: number;
  sampleN: number;
  en: string;
  is: string;
};

export default function CalibrationVerdictNote({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [notes, setNotes] = React.useState<Note[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/coach/calibration-notes", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as { notes?: Note[] };
        if (!cancelled) setNotes(json.notes ?? []);
      } catch {
        /* supplementary context — fail silent */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!notes || notes.length === 0) return null;

  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <div
          key={n.color}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900"
        >
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700/80">
            {lang === "IS" ? "Kvörðunar-samhengi" : "Calibration context"}
            <span className="font-normal text-amber-600/70">
              {lang === "IS" ? " · breytir ekki litnum" : " · does not change the colour"}
            </span>
          </div>
          {lang === "IS" ? n.is : n.en}
        </div>
      ))}
    </div>
  );
}
