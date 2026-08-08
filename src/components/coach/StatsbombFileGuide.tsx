"use client";

/**
 * "Which StatsBomb file goes where" — a tiny, collapsible reference so coaches never
 * confuse the several StatsBomb IQ exports (each is a different file feeding a
 * different surface). Descriptive help only; no data, no side effects.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";

type Lang = "EN" | "IS";

const T = {
  EN: {
    title: "Which StatsBomb file goes where?",
    intro: "StatsBomb IQ gives several separate exports — each is a different file and feeds a different part. Upload each once per season (re-upload only to refresh).",
    cols: ["Export", "Where to upload", "What it powers"],
    rows: [
      ["Team Stats (season + League Average row)", "This tab → “Upload own-team profile”", "Article report — verdict, strengths / weaknesses, table vs league"],
      ["Match Stats (one row per match)", "Season Match Analysis → import panel (StatsBomb tab)", "Per-match view — xG / OBV per game, home vs away, model comparison"],
      ["Squad (one row per player)", "Player Statistics page", "Key contributors (top output / creator / defender)"],
    ],
    note: "Wyscout has no League Average row, so the Article report is StatsBomb-only. The per-match view works from either provider.",
  },
  IS: {
    title: "Hvaða StatsBomb-skrá fer hvert?",
    intro: "StatsBomb IQ gefur nokkrar aðskildar útflutnings-skrár — hver er ólík skrá og knýr sinn hluta. Hladdu hverri upp einu sinni á tímabil (endurhladdu bara til að fá ferskari tölur).",
    cols: ["Útflutningur", "Hvar á að hlaða upp", "Hvað hann knýr"],
    rows: [
      ["Team Stats (season + League Average röð)", "Þessi tab → „Upload own-team profile“", "Ítarleg skýrsla — dómur, styrkleikar / veikleikar, tafla vs deild"],
      ["Match Stats (ein röð per leik)", "Heilt tímabil → import-reitur (StatsBomb tab)", "Per-leik sýn — xG / OBV per leik, heima vs úti, líkana-samanburður"],
      ["Squad (ein röð per leikmann)", "Player Statistics síða", "Lykilmenn (mest afköst / skapari / vörn)"],
    ],
    note: "Wyscout hefur enga League Average röð, svo Ítarlega skýrslan er StatsBomb-only. Per-leik sýnin virkar úr hvorri veitu sem er.",
  },
} as const;

export default function StatsbombFileGuide() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-slate-800">
        <span className="transition-transform group-open:rotate-90">▸</span>{t.title}
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{t.intro}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-400">
              {t.cols.map((c) => <th key={c} className="py-1 pr-3 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r[0]} className="border-t border-slate-200 align-top">
                <td className="py-1.5 pr-3 font-semibold text-slate-700">{r[0]}</td>
                <td className="py-1.5 pr-3 text-slate-600">{r[1]}</td>
                <td className="py-1.5 text-slate-600">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t.note}</p>
    </details>
  );
}
