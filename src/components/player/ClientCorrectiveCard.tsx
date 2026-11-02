"use client";

/**
 * ClientCorrectiveCard — the PT client's corrective / prehab "morning" session.
 *
 * Shown above the strength session on the days the trainer scheduled it. The
 * exercises are trainer-confirmed; the list is AI-assembled from the client's
 * injury history, so it is labelled "AI" and each item carries its citation (or
 * an "AI-tillaga" flag for a gap-fill the trainer vetted). Screening / training
 * support — not a diagnosis.
 */

import { useState } from "react";
import ExerciseInfo from "@/components/exercise/ExerciseInfo";

type Item = {
  name: string;
  nameIs?: string | null;
  cue?: string | null;
  cueIs?: string | null;
  dose?: string | null;
  doseIs?: string | null;
  target?: string | null;
  targetIs?: string | null;
  citation?: string | null;
  videoUrl?: string | null;
  aiSuggested?: boolean;
  manual?: boolean;
};

export type CorrectiveData = {
  title: string;
  duration_min: number | null;
  items: Item[];
};

export default function ClientCorrectiveCard({ data, lang }: { data: CorrectiveData; lang: "EN" | "IS" }) {
  const isIS = lang === "IS";
  const [open, setOpen] = useState(false);
  const pick = (en?: string | null, is?: string | null) => (isIS ? is || en : en || is) ?? "";
  if (!data.items.length) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide font-semibold text-violet-800">
          {isIS ? "Leiðréttingar · fyrri partur dags" : "Corrective · first part of the day"}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          AI
        </span>
      </div>
      <div className="mt-0.5 text-sm text-violet-900">
        {data.items.length} {isIS ? "æfingar" : "exercises"}
        {data.duration_min ? ` · ~${data.duration_min} ${isIS ? "mín" : "min"}` : ""}
      </div>

      <ul className="mt-2.5 space-y-2">
        {data.items.map((it, i) => {
          const name = pick(it.name, it.nameIs);
          const dose = pick(it.dose, it.doseIs);
          const cue = pick(it.cue, it.cueIs);
          return (
            <li key={`${name}-${i}`} className="rounded-lg border border-violet-100 bg-white px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{name}</div>
                  {dose && <div className="text-xs text-slate-600">{dose}</div>}
                  {cue && <div className="mt-0.5 text-[11px] text-slate-500">{cue}</div>}
                </div>
                {it.manual ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-violet-100 text-violet-700" title={isIS ? "Bætt við af þjálfara" : "Added by your trainer"}>
                    {isIS ? "þjálfari" : "trainer"}
                  </span>
                ) : it.aiSuggested ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800" title={isIS ? "AI-tillaga — yfirfarin af þjálfara" : "AI suggestion — vetted by your trainer"}>
                    {isIS ? "AI-tillaga" : "AI suggestion"}
                  </span>
                ) : it.citation ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium bg-slate-100 text-slate-500" title={it.citation}>
                    {isIS ? "heimild" : "cited"}
                  </span>
                ) : null}
              </div>
              {(it.videoUrl || cue) && (
                <ExerciseInfo name={name} description={it.cue ?? undefined} descriptionIs={it.cueIs ?? undefined} videoUrl={it.videoUrl ?? undefined} />
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-[11px] font-medium text-violet-700 hover:underline"
      >
        {open ? (isIS ? "Fela skýringu" : "Hide note") : (isIS ? "Af hverju þessar æfingar?" : "Why these exercises?")}
      </button>
      {open && (
        <p className="mt-1 text-[11px] text-slate-500">
          {isIS
            ? "Listinn er settur saman af gervigreind út frá meiðslasögunni þinni og staðfestur af þjálfaranum þínum. Þjálfunar-/skimunarstuðningur — ekki greining. Verkur eða rauð flögg → hafðu samband við þjálfara/klíníker."
            : "This list is assembled by AI from your injury history and confirmed by your trainer. Training / screening support — not a diagnosis. Pain or red flags → contact your trainer/clinician."}
        </p>
      )}
    </div>
  );
}
