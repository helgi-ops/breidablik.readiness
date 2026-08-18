"use client";

/**
 * D′ reserve total + what each sprint spends — the anaerobic-reserve read shared by the
 * Conditioning card and the player game report. Answers both halves of the question: how big is
 * his D′ tank (metres, + squad rank), and how many metres one sprint of a given intensity draws
 * — (sprint speed − CS) × duration — plus how many back-to-back max sprints the reserve affords.
 * Intensities anchor on the player's own top speed (MSS) when supplied. Pure presentational; all
 * maths in computeSprintCost. Descriptive — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import { computeSprintCost } from "@/lib/micropulse/load/criticalSpeed";

export default function DPrimeSprintCostBlock({
  csKmh,
  dPrimeM,
  dPrimePercentile,
  mssKmh,
}: {
  csKmh: number | null | undefined;
  dPrimeM: number | null | undefined;
  dPrimePercentile?: number | null;
  mssKmh?: number | null;
}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const sprintCost = computeSprintCost({ csKmh, dPrimeM, mssKmh: mssKmh ?? null });
  if (!sprintCost) return null;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[12px] font-semibold text-slate-600">{is ? "D′ forði — hvað sprettur kostar" : "D′ reserve — what a sprint costs"}</span>
        {dPrimePercentile != null ? (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{is ? "hópur" : "squad"} {dPrimePercentile}%</span>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] text-slate-800">
        {is ? "Heildarforði" : "Total reserve"} <b className="tabular-nums">{sprintCost.dPrimeM} m</b>
        <span className="text-slate-400"> {is ? "yfir critical speed" : "above critical speed"} ({sprintCost.csKmh} km/h)</span>
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-1 pr-3 font-medium">{is ? "Sprettur" : "Sprint"}</th>
              <th className="py-1 pr-3 font-medium">km/h</th>
              <th className="py-1 pr-3 font-medium">{is ? "yfir CS" : "above CS"}</th>
              <th className="py-1 pr-3 font-medium">{is ? `D′ per sprett (${sprintCost.refDurationSec}s)` : `D′ per sprint (${sprintCost.refDurationSec}s)`}</th>
              <th className="py-1 pr-2 text-right font-medium">{is ? "sprettir í tóman" : "sprints to empty"}</th>
            </tr>
          </thead>
          <tbody>
            {sprintCost.rows.map((row, i) => (
              <tr key={i} className={`border-t border-slate-100 ${i === sprintCost.rows.length - 1 ? "font-semibold text-[#2740e6]" : "text-slate-700"}`}>
                <td className="py-1 pr-3">{is ? row.label.is : row.label.en}</td>
                <td className="py-1 pr-3">{row.speedKmh}</td>
                <td className="py-1 pr-3 text-slate-500">+{row.aboveCsKmh}</td>
                <td className="py-1 pr-3">{Math.round(row.costM)} m</td>
                <td className="py-1 pr-2 text-right">~{Math.round(row.sprintsToEmpty)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-slate-500">{is ? sprintCost.verdict.is : sprintCost.verdict.en}</p>
      <ShowDetails label={{ EN: "What is this?", IS: "Hvað er þetta?" }}>
        <p className="text-[11px] leading-relaxed text-slate-500">{is ? sprintCost.caveat.is : sprintCost.caveat.en}</p>
        <p className="mt-1 text-[10px] text-slate-400">{sprintCost.citation}</p>
      </ShowDetails>
    </div>
  );
}
