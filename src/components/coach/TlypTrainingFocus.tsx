"use client";

/**
 * TlypTrainingFocus — the "how to train them" section for Train like you Play.
 *
 * The board flags WHO is under-exposed and WHERE; this turns that into WHAT TO DO,
 * at two levels (per the coach's choice): a position-level training focus, plus
 * per-player exceptions for individuals who stand out within the group.
 *
 * Rules decide, not AI: the focus is the position's most widespread gaps, the
 * prescription is a fixed paper-cited lookup (lib/micropulse/trainingPrescriptions).
 * Plain language on the surface; the metric jargon + citation live in tooltips.
 */

import * as React from "react";
import { prescriptionFor, rankGroupFocus, worstGapFor, type FocusMember } from "@/lib/micropulse/trainingPrescriptions";

type Lang = "EN" | "IS";
type L = { EN: string; IS: string };

export type FocusGroup = {
  key: string;
  label: L | string;
  members: FocusMember[];
};

export default function TlypTrainingFocus({
  lang,
  groups,
  metricKeys,
  maxFocusPerGroup = 3,
}: {
  lang: Lang;
  groups: FocusGroup[];
  metricKeys: string[];
  maxFocusPerGroup?: number;
}) {
  const IS = lang === "IS";
  const tx = (t: L | string): string => (typeof t === "string" ? t : IS ? t.IS : t.EN);
  const q = (p: { quality: L }) => (IS ? p.quality.IS : p.quality.EN);
  const m = (p: { method: L }) => (IS ? p.method.IS : p.method.EN);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">
          {IS ? "Hvernig á að þjálfa þá" : "How to train them"}
        </h3>
        <span className="text-[11px] text-slate-400" title={IS ? "Reglur ákveða — ekki AI" : "Rules decide — not AI"}>
          {IS ? "út frá götunum hér að neðan" : "from the gaps below"}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-slate-500">
        {IS
          ? "Áhersla per leikstöðu, og einstaklingar sem skera sig úr. Hver tillaga vísar í rannsókn (sjáðu tooltip)."
          : "A focus per position, plus the individuals who stand out. Every suggestion cites its research (hover for the source)."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const focus = rankGroupFocus(g.members, metricKeys).slice(0, maxFocusPerGroup);
          const exceptions = g.members
            .filter((mem) => mem.modeGaps > 0)
            .sort((a, b) => b.modeGaps - a.modeGaps);

          return (
            <div key={g.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="text-[13px] font-semibold text-slate-800">{tx(g.label)}</div>

              {/* Position-level focus */}
              {focus.length === 0 ? (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                  {IS ? "Á réttri leið — þjálfar í takt við leik-kröfu" : "On track — training in line with match demand"}
                </div>
              ) : (
                <ul className="mt-2 space-y-2">
                  {focus.map((f) => {
                    const p = prescriptionFor(f.key);
                    if (!p) return null;
                    return (
                      <li key={f.key} className="text-[12px] leading-snug">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{q(p)}</span>
                          <span
                            className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                            title={IS ? `${f.underCount} af ${g.members.length} í stöðunni undir-þjálfaðir hér` : `${f.underCount} of ${g.members.length} in this position under-exposed here`}
                          >
                            {f.underCount}/{g.members.length}
                          </span>
                        </div>
                        <div className="text-slate-600">
                          {m(p)}{" "}
                          <span className="cursor-help text-slate-400 underline decoration-dotted" title={p.cite}>
                            ({p.cite.split(";")[0].trim()})
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Per-player exceptions */}
              {exceptions.length > 0 && (
                <div className="mt-2.5 border-t border-slate-200 pt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {IS ? "Einstaklingar að forgangsraða" : "Individuals to prioritise"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {exceptions.map((mem) => {
                      const worst = worstGapFor(mem, metricKeys);
                      const p = worst ? prescriptionFor(worst.key) : undefined;
                      const first = mem.name.split(" ")[0];
                      return (
                        <span
                          key={mem.name}
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                          title={
                            p && worst
                              ? (IS
                                  ? `${mem.name} · veikast í ${q(p)} (${worst.pct}% af leik-kröfu). ${m(p)} (${p.cite})`
                                  : `${mem.name} · weakest in ${q(p)} (${worst.pct}% of match demand). ${m(p)} (${p.cite})`)
                              : mem.name
                          }
                        >
                          {first}
                          {p && <span className="text-slate-400"> · {q(p)}</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
