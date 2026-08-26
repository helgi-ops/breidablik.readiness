"use client";

/**
 * "How do I get this file out of StatsBomb IQ?" — a tiny collapsible with the exact
 * click-path to export a given StatsBomb IQ CSV, so a coach never has to guess where the
 * download lives. Descriptive help only; no data, no side effects. Bilingual EN/IS.
 *
 * `kind` picks which export's steps to show. Add more kinds here as we learn the paths.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";

type Lang = "EN" | "IS";
export type ExportKind = "teamMatchStats";

const GUIDES: Record<ExportKind, { EN: { title: string; steps: string[]; note?: string }; IS: { title: string; steps: string[]; note?: string } }> = {
  teamMatchStats: {
    EN: {
      title: "How do I get this file from StatsBomb?",
      steps: [
        "In StatsBomb IQ, open Teams.",
        "Switch to the New Experience (the toggle at the top).",
        "Open Match Stats.",
        "Choose the match — e.g. your last match.",
        "Download / export the CSV.",
        "Upload it in the box above.",
      ],
      note: "This is the detailed, one-row-per-match “Match Stats” export — it carries the team-only numbers (long balls, aggressive actions, clear/counter shots, set-piece xG) the per-player file can’t.",
    },
    IS: {
      title: "Hvernig næ ég í þessa skrá úr StatsBomb?",
      steps: [
        "Farðu í Teams í StatsBomb IQ.",
        "Skiptu yfir í New experience (rofinn efst).",
        "Opnaðu Match Stats.",
        "Veldu leikinn — t.d. síðasta leik.",
        "Sæktu / hladdu niður CSV-skránni.",
        "Hladdu henni upp í reitnum að ofan.",
      ],
      note: "Þetta er ítarlega „Match Stats“ skráin (ein röð per leik) — hún ber liðs-tölurnar (long balls, aggressive actions, clear/counter shots, set-piece xG) sem leikmanna-skráin nær ekki.",
    },
  },
};

export default function StatsbombExportHowTo({ kind = "teamMatchStats" }: { kind?: ExportKind }) {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const g = GUIDES[kind][lang];
  return (
    <details className="group mt-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11.5px] font-semibold text-slate-600">
        <span className="transition-transform group-open:rotate-90">▸</span>{g.title}
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-slate-600 marker:font-semibold marker:text-[#2740e6]">
        {g.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {g.note ? <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{g.note}</p> : null}
    </details>
  );
}
