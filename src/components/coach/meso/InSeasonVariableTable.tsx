"use client";

/**
 * In-season: the block's standard week, every variable as × a match beside the research range. The mirror of the
 * pre-season "Load per variable" table (PreseasonWeek1Table), read-only: the in-season block holds the standard
 * week (or ramps by Step/wk), so there is no week 1 to set. Per-variable editing is a later, separate decision.
 *
 * Layered read: the verdict (the standard week in × a match) → two plain facts (what one match is; that the week
 * cards below show the calendar's own sum) → the table → the week-by-week table and sources behind a toggle.
 * Numbers come from blockVolumeView (the same functions the tab always used). Presentation only.
 */

import * as React from "react";
import { KPI_GROUPS, kpiGroup, kpiWhat, plainKpiName } from "@/lib/micropulse/periodization/kpiPlainNames";
import type { BlockVolumeView, VariableRow } from "@/lib/micropulse/periodization/inSeasonMesoView";
import { WEEKLY_LOAD_LABELS } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import {
  ARCHIVO, BandOrNone, LegendFilled, LegendLight, LegendOpen, LegendRange, VARIABLE_COLS, VariableGroupHeader, VariableScaleTicks, VariableTrack, trackScaleMax,
} from "@/components/coach/meso/VariableTrack";

type Bi = { en: string; is: string };

/** In-season only: the long-run stride count (IMA) sits with running volume. Not in the shared map, so the
 *  pre-season table stays as it was. */
const IN_SEASON_GROUP_EXTRA = { imaStrideHi: "run" as const };

export default function InSeasonVariableTable({ is, view, oneMatchNote, hold, numWeeks, playerName }: {
  is: boolean;
  view: BlockVolumeView;
  /** What "one match" is — the team's typical full match, or the player's own. */
  oneMatchNote: Bi;
  /** A competitive block holds the standard week. */
  hold: boolean;
  numWeeks: number;
  playerName: string | null;
}) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const [why, setWhy] = React.useState(false);
  const fx = (n: number) => (is ? String(n).replace(".", ",") : String(n));
  const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))); // as the tab always showed

  const rows = view.rows;
  const ramps = view.weeksDiffer;
  const peakNo = view.peakIdx + 1, lightNo = view.lightIdx + 1;
  const hasLight = view.lightIdx >= 0;
  const lightWord = view.weeks[view.lightIdx]?.isLight ? t({ en: "Light", is: "Létt" }) : t({ en: "Deload", is: "Niðurtr." });

  // The track: the standard week as the filled mark; when the block ramps, week 1 (open) → peak (filled).
  const open = (r: VariableRow) => (ramps ? r.week : null);
  const filled = (r: VariableRow) => (ramps ? r.peak : r.week);
  const scaleMax = trackScaleMax(rows.flatMap((r) => [r.week, r.peak, r.light, r.ref?.[1]]));
  const aria = (r: VariableRow, name: string) => `${name}: ${t({ en: "standard week", is: "staðalvika" })} ${fx(r.week)}×${r.peak != null ? `, ${t({ en: "peak", is: "toppur" })} ${fx(r.peak)}×` : ""}${r.light != null ? `, ${lightWord.toLowerCase()} ${fx(r.light)}×` : ""}${r.ref ? `; ${t({ en: "research", is: "rannsóknir" })} ${fx(r.ref[0])}–${fx(r.ref[1])}×` : ""}`;

  const used = new Set<string>();
  const master = rows.find((r) => r.key === "totalPlayerLoad") ?? null;
  const kpiRows = rows.filter((r) => r.key !== "totalPlayerLoad").map((r) => ({ ...r, name: plainKpiName(r.key, r.label, is, used) }));

  const value = (r: VariableRow, big = false) => (
    <div className="flex flex-col gap-0.5">
      <span className={`font-bold tabular-nums text-[#14181c] ${big ? "text-[20px]" : "text-[17px]"}`} style={ARCHIVO}>{fx(r.week)}×</span>
      <span className="text-[11px] text-slate-600">{fmtK(r.weekRaw)}{r.unit} · {t({ en: "one match", is: "einn leikur" })} {fmtK(r.matchValue)}{r.unit}</span>
    </div>
  );
  const nums = (r: VariableRow) => (
    <div className="flex flex-col gap-1 text-[12px] text-slate-600">
      {ramps && r.peak != null
        ? <span>{t({ en: "Peak", is: "Toppur" })} <b className="text-[14px] tabular-nums text-[#14181c]" style={ARCHIVO}>{fx(r.peak)}×</b> <BandOrNone x={r.peak} refRange={r.ref} is={is} /></span>
        : <span>{t({ en: "Week", is: "Vikan" })} <BandOrNone x={r.week} refRange={r.ref} is={is} /></span>}
      {r.light != null && <span>{lightWord} <b className="text-[14px] tabular-nums text-[#14181c]" style={ARCHIVO}>{fx(r.light)}×</b> <BandOrNone x={r.light} refRange={r.ref} is={is} /></span>}
      {r.ref && <span className="text-[11px] text-slate-500">{t({ en: "research", is: "rannsóknir" })} {fx(r.ref[0])}–{fx(r.ref[1])}×</span>}
    </div>
  );

  const weeksLine = ramps
    ? t({ en: "The weeks in this block differ (a ramp, a light week or a deload): week by week is under “Show details”.", is: "Vikurnar í lotunni eru ólíkar (stígandi, létt vika eða niðurtröppun): vika fyrir viku er undir „Sýna nánar“." })
    : t({ en: `All ${numWeeks} weeks of the block are the same${hold ? " (a competitive block holds the standard week)" : ""}.`, is: `Allar ${numWeeks} vikur lotunnar eru eins${hold ? " (keppnislota heldur staðalvikunni)" : ""}.` });

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-[#e3e0d8] bg-white">
      {/* Verdict + the two plain facts */}
      <div className="flex flex-col gap-1.5 border-b border-[#ece9e2] px-5 pb-5 pt-5 sm:px-6">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2740e6]">{t({ en: "Load per variable", is: "Álag á hverja breytu" })}{playerName ? ` · ${playerName}` : ""}</span>
        <h3 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#14181c]" style={ARCHIVO}>
          {t({ en: `The standard week ≈ ${fx(view.weekMultiple)}× a match`, is: `Staðalvikan ≈ ${fx(view.weekMultiple)}× leikur` })}
          <span className="ml-2 font-sans text-[14px] font-medium text-slate-600">{t({ en: `+ the match itself = ${fx(view.totalWithMatch)}×`, is: `+ leikurinn sjálfur = ${fx(view.totalWithMatch)}×` })}</span>
        </h3>
        <ul className="max-w-[760px] space-y-0.5 text-[13px] leading-relaxed text-slate-600">
          <li>{t(oneMatchNote)}</li>
          <li>{t({ en: "The week cards below show what the calendar's days add up to, so a week there can sit a little off this standard week.", is: "Vikuspjöldin hér að neðan sýna hvað dagar dagatalsins leggja saman, svo vika þar getur vikið aðeins frá þessari staðalviku." })}</li>
          <li>{weeksLine}</li>
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-4 text-[13px] font-medium text-[#8a5a10] sm:px-6">{t({ en: "No GPS match unit yet — sRPE load is shown elsewhere.", is: "Ekkert leikvið (GPS) enn — sýni sRPE-álag annars staðar." })}</p>
      ) : (<>
        {/* Master: the whole week in one number */}
        {master && (
          <div className={`${VARIABLE_COLS} border-b border-[#ece9e2] bg-[#f8f7f3] px-5 py-5 sm:px-6`}>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[16px] font-bold text-[#14181c]" style={ARCHIVO}>{t({ en: "Overall load", is: "Heildarálag" })}</span>
              <span className="text-[12px] leading-snug text-slate-600">{t({ en: "The whole week in one number (PlayerLoad).", is: "Öll vikan í einni tölu (PlayerLoad)." })}</span>
            </div>
            {value(master, true)}
            <VariableTrack scaleMax={scaleMax} refRange={master.ref} open={open(master)} filled={filled(master)} light={master.light} ariaLabel={aria(master, t({ en: "Overall load", is: "Heildarálag" }))} />
            {nums(master)}
          </div>
        )}

        {/* Legend + the shared scale */}
        <div className="hidden px-5 pt-3.5 sm:px-6 md:block">
          <div className={`${VARIABLE_COLS} items-end text-[11px] text-slate-600`}>
            <span>{t({ en: "Variable", is: "Breyta" })}</span>
            <span>{t({ en: "The standard week", is: "Staðalvikan" })}</span>
            <div className="flex flex-wrap items-center gap-3">
              <LegendRange label={t({ en: "Research range", is: "Rannsóknabil" })} />
              {ramps ? <><LegendOpen label={t({ en: "Week 1", is: "Vika 1" })} /><LegendFilled label={t({ en: `Peak · wk ${peakNo}`, is: `Toppur · v ${peakNo}` })} /></>
                : <LegendFilled label={t({ en: "Standard week", is: "Staðalvika" })} />}
              {hasLight && <LegendLight label={`${lightWord} · ${t({ en: `wk ${lightNo}`, is: `v ${lightNo}` })}`} />}
            </div>
            <span>{t({ en: "vs research", is: "miðað við rannsóknir" })}</span>
          </div>
          <VariableScaleTicks scaleMax={scaleMax} />
        </div>

        {/* Groups */}
        {KPI_GROUPS.map((g) => {
          const gr = kpiRows.filter((r) => kpiGroup(r.key, IN_SEASON_GROUP_EXTRA) === g.key);
          if (!gr.length) return null;
          return (
            <div key={g.key} className="px-5 pt-2 sm:px-6">
              <VariableGroupHeader title={t(g.title)} sub={g.inSub.en ? t(g.inSub) : ""} />
              {gr.map((r) => (
                <div key={r.key} className={`${VARIABLE_COLS} border-b border-[#f1efe9] py-3 last:border-b-0`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[14px] font-semibold text-[#14181c]" title={t(r.label)}>{r.name}</span>
                    {kpiWhat(r.key) && <span className="text-[12px] leading-snug text-slate-600">{t(kpiWhat(r.key)!)}</span>}
                  </div>
                  {value(r)}
                  <VariableTrack scaleMax={scaleMax} refRange={r.ref} open={open(r)} filled={filled(r)} light={r.light} ariaLabel={aria(r, r.name)} />
                  {nums(r)}
                </div>
              ))}
            </div>
          );
        })}
      </>)}

      {/* The plain why stays visible; the week-by-week table and the sources sit behind the toggle. */}
      <div className="mt-3 border-t border-[#ece9e2] bg-[#f8f7f3] px-5 pb-5 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul className="max-w-[760px] space-y-0.5 text-[12px] leading-relaxed text-slate-600">
            <li><b className="font-semibold text-slate-700">{t({ en: "× a match", is: "× leikur" })}</b> — {t({ en: "the week's total divided by one match in the same variable. 2× = twice what one match gives.", is: "vikan samanlagt deilt með einum leik í sömu breytu. 2× = tvöfalt það sem einn leikur gefur." })}</li>
            <li><b className="font-semibold text-slate-700">{t({ en: "Research", is: "Rannsóknir" })}</b> — {t({ en: "training:match in a normal in-season training week (training:match, PMC6747517). The mark says whether the number is within, above or below the range.", is: "æfing:leikur í venjulegri æfingaviku á keppnistímabili (training:match, PMC6747517). Merkið segir hvort talan er innan, yfir eða undir bilinu." })}</li>
          </ul>
          <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">
            {why ? t({ en: "Hide details & sources", is: "Fela nánar & heimildir" }) : t({ en: "Show details & sources", is: "Sýna nánar & heimildir" })}
          </button>
        </div>
        {why && (
          <div className="mt-3 space-y-3 text-[11.5px] text-slate-600">
            {ramps && rows.length > 0 && (() => {
              const headKeys = rows.slice(0, 2).map((r) => r.key); // the two headline variables (PlayerLoad, distance)
              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[12.5px]">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-medium">{t({ en: "Week", is: "Vika" })}</th>
                      <th className="px-2 py-1 text-right font-medium">× {t({ en: "a match", is: "leikur" })}</th>
                      {headKeys.map((k) => <th key={k} className="px-2 py-1 text-right font-medium">{t(WEEKLY_LOAD_LABELS[k])}</th>)}
                    </tr></thead>
                    <tbody>
                      {view.weeks.map((w, i) => (
                        <tr key={w.weekIndex} className="border-t border-[#ece9e2]">
                          <td className="py-1.5 pr-2 text-slate-700">{t({ en: "Wk", is: "Vika" })} {w.weekIndex}{w.isDeload ? <span className="ml-1 rounded bg-[#de9328]/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-[#8a5a10]">{w.isLight ? t({ en: "light", is: "létt" }) : t({ en: "deload", is: "niður" })}</span> : null}</td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-[#14181c]">{fx(w.multiple)}×</td>
                          {headKeys.map((k) => { const raw = view.weekKpiRaw(k, i); return <td key={k} className="px-2 py-1.5 text-right tabular-nums text-slate-600">{raw == null ? "–" : <><span className="font-semibold text-slate-800">{fx(view.weekKpi(k, i))}×</span> <span className="text-slate-500">{fmtK(raw)}{WEEKLY_LOAD_LABELS[k].unit}</span></>}</td>; })}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[#d9d5cc] font-semibold">
                        <td className="py-1.5 pr-2">{t({ en: "Block total", is: "Lotan alls" })}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[#14181c]">{fx(view.blockTotal)}×</td>
                        {headKeys.map((k) => {
                          const totMult = Math.round(view.weeks.reduce((s2, _, i) => s2 + view.weekKpi(k, i), 0) * 100) / 100;
                          const tot = view.weeks.reduce((s2, _, i) => s2 + (view.weekKpiRaw(k, i) ?? 0), 0);
                          return <td key={k} className="px-2 py-1.5 text-right tabular-nums text-slate-700"><span className="font-semibold text-[#14181c]">{fx(totMult)}×</span> <span className="text-slate-500">{fmtK(tot)}{WEEKLY_LOAD_LABELS[k].unit}</span></td>;
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
            <p>{t({ en: "Each variable has its own weekly multiple: high-speed running and sprints add up to a lower multiple than distance, because training days hold a smaller share of the match in high-speed running than in distance (Stevens 2017). The week undulates around the match, MD-4 heaviest (Martín-García 2018; the MD-day shares are MicroPulse's). Descriptive plan — never the readiness colour.", is: "Hver breyta hefur sitt eigið vikumargfeldi: háhraði og sprettir safnast í lægra margfeldi en vegalengd, því æfingadagar ná minna hlutfalli af leik í háhraða en í vegalengd (Stevens 2017). Vikan bylgjast um leikinn, MD-4 þyngst (Martín-García 2018; hlutföll MD-daga eru val MicroPulse). Lýsandi áætlun — aldrei readiness-liturinn." })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
