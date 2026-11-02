"use client";

/**
 * ClientCorrectiveCard — the PT client's corrective / prehab session.
 *
 * Collapsed by default: below the strength session on training days, above the
 * next-session preview on rest days (then it's the day's only work). The
 * exercises are trainer-confirmed; the list is AI-assembled from the client's
 * injury history, so it is labelled "AI" and each item carries its citation (or
 * an "AI-tillaga" flag for a gap-fill the trainer vetted). Screening / training
 * support — not a diagnosis.
 */

import { useState } from "react";
import Link from "next/link";
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
  done_today?: boolean;
  week_done?: number;
  week_planned?: number;
};

export default function ClientCorrectiveCard({ data, lang, primary = false }: { data: CorrectiveData; lang: "EN" | "IS"; primary?: boolean }) {
  const isIS = lang === "IS";
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const pick = (en?: string | null, is?: string | null) => (isIS ? is || en : en || is) ?? "";
  if (!data.items.length) return null;

  if (data.done_today) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <div>
          <div className="text-sm font-semibold text-emerald-700">{isIS ? "Leiðréttingaræfingum lokið" : "Corrective done"}</div>
          {!!data.week_planned && (
            <div className="text-[13px] text-slate-500">
              {isIS ? `${data.week_done} af ${data.week_planned} dögum í vikunni` : `${data.week_done} of ${data.week_planned} days this week`}
            </div>
          )}
        </div>
        <Link href="/client/corrective" className="flex min-h-11 items-center text-sm font-medium text-primary">{isIS ? "Gera aftur" : "Redo"}</Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-slate-900">
          {isIS ? "Leiðréttingaræfingar" : "Corrective"}
          {data.duration_min ? ` · ~${data.duration_min} ${isIS ? "mín" : "min"}` : ""}
        </h2>
        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">AI</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">
        {data.items.slice(0, 3).map((it) => pick(it.name, it.nameIs)).join(", ")}
        {data.items.length > 3 ? ` +${data.items.length - 3} ${isIS ? "fleiri" : "more"}` : ""}
      </p>
      <div className="mt-2 text-xs text-slate-500">
        {isIS ? "Úr meiðslasögu þinni, staðfest af þjálfara" : "From your injury history, confirmed by your trainer"}
      </div>
      <Link
        href="/client/corrective"
        className={`mt-2 flex min-h-11 items-center justify-center rounded-[10px] text-sm font-semibold ${primary ? "bg-primary text-primary-foreground" : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"}`}
      >
        {isIS ? "Byrja leiðréttingaræfingar" : "Start corrective"}
      </Link>
      <button
        type="button"
        aria-expanded={showList}
        onClick={() => setShowList((v) => !v)}
        className="mt-1 min-h-9 w-full text-[13px] font-medium text-primary"
      >
        {showList ? (isIS ? "Fela æfingar" : "Hide exercises") : (isIS ? "Sýna æfingar" : "Show exercises")}
      </button>

      {showList && (
      <>
      <ul className="mt-2.5 space-y-2">
        {data.items.map((it, i) => {
          const name = pick(it.name, it.nameIs);
          const dose = pick(it.dose, it.doseIs);
          const cue = pick(it.cue, it.cueIs);
          return (
            <li key={`${name}-${i}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{name}</div>
                  {dose && <div className="text-xs text-slate-600">{dose}</div>}
                  {cue && <div className="mt-0.5 text-[11px] text-slate-500">{cue}</div>}
                </div>
                {it.manual ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-slate-200 text-slate-700" title={isIS ? "Bætt við af þjálfara" : "Added by your trainer"}>
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
        className="mt-2 text-[11px] font-medium text-primary hover:underline"
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
      </>
      )}
    </section>
  );
}
