"use client";

import * as React from "react";
import Link from "next/link";
import { SPORT_PROFILES, FEATURE_MATRIX, type SportId } from "@/lib/micropulse/sportProfiles";

type Lang = "IS" | "EN";

function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function CellValue({ val, lang }: { val: boolean | string; lang: Lang }) {
  if (val === true) return <span className="text-emerald-600 font-semibold">&#10003;</span>;
  if (val === false) return <span className="text-zinc-300">&#8212;</span>;
  return <span className="text-xs text-amber-600 font-medium">{val}</span>;
}

export default function SportsPage() {
  const [lang, setLang] = React.useState<Lang>("IS");
  const sports: SportId[] = ["football", "basketball"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/home" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-emerald-500" />
            <span className="font-semibold tracking-tight text-zinc-900">MicroPulse</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/blog" className="text-sm text-zinc-500 hover:text-zinc-700 transition">
              {lang === "IS" ? "Greinar" : "Articles"}
            </Link>
            <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                onClick={() => setLang("IS")}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  lang === "IS" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
                )}
              >
                IS
              </button>
              <button
                onClick={() => setLang("EN")}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  lang === "EN" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
                )}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Title */}
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">
          {lang === "IS" ? "MicroPulse eftir ithrottum" : "MicroPulse by Sport"}
        </h1>
        <p className="text-base text-zinc-500 mb-10">
          {lang === "IS"
            ? "Hvada eiginleikar og maelikvardar eiga vid hverja ithrott."
            : "Which features and metrics apply to each sport."}
        </p>

        {/* ── Sport cards ── */}
        <div className="grid gap-6 sm:grid-cols-2 mb-14">
          {sports.map((sid) => {
            const p = SPORT_PROFILES[sid];
            const envBadge = p.environment === "indoor"
              ? { label: lang === "IS" ? "Innanhuss" : "Indoor", color: "bg-blue-50 text-blue-700 border-blue-200" }
              : { label: lang === "IS" ? "Utanhuss" : "Outdoor", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
            return (
              <div key={sid} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {lang === "IS" ? p.nameIS : p.nameEN}
                  </h2>
                  <span className={cx("text-[10px] font-semibold rounded-full border px-2 py-0.5", envBadge.color)}>
                    {envBadge.label}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 mb-4">
                  {lang === "IS" ? p.notesIS : p.notesEN}
                </p>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                  {lang === "IS" ? "Adag maelikvardar" : "Primary metrics"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.primaryMetrics.map((m) => (
                    <span key={m.key} className="rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                      {m.shortLabel}
                    </span>
                  ))}
                </div>

                <div className="mt-4 text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                  {lang === "IS" ? "Algeng meidslasvedi" : "Common injury areas"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.commonInjuryTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600">
                      {tag.replace(/_/g, " ").toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Feature comparison table ── */}
        <h2 className="text-xl font-bold text-zinc-900 mb-4">
          {lang === "IS" ? "Eiginleikasamburd" : "Feature Comparison"}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="text-left px-4 py-3 font-semibold text-zinc-700">
                  {lang === "IS" ? "Eiginleiki" : "Feature"}
                </th>
                {sports.map((sid) => (
                  <th key={sid} className="text-center px-4 py-3 font-semibold text-zinc-700">
                    {lang === "IS" ? SPORT_PROFILES[sid].nameIS : SPORT_PROFILES[sid].nameEN}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_MATRIX.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {lang === "IS" ? row.featureIS : row.feature}
                  </td>
                  <td className="text-center px-4 py-2.5"><CellValue val={row.football} lang={lang} /></td>
                  <td className="text-center px-4 py-2.5"><CellValue val={row.basketball} lang={lang} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-center">
          <Link href="/blog/innanhuss-ithrottir-micropulse" className="text-sm text-emerald-600 hover:underline">
            {lang === "IS" ? "Lestu meira um innanhussidr\u00f3ttir i MicroPulse \u2192" : "Read more about indoor sports in MicroPulse \u2192"}
          </Link>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-5xl px-6 flex items-center justify-between text-xs text-zinc-400">
          <span>&copy; {new Date().getFullYear()} MicroPulse</span>
          <Link href="/home" className="hover:text-zinc-600 transition">
            {lang === "IS" ? "Forsida" : "Homepage"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
