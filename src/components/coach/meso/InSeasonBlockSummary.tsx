"use client";

/**
 * Top of the hub's In-season tab: the block at a glance — the mirror of the pre-season summary
 * (PreseasonReadsFrom). Layered read: the verdict (which block, how long, its goal) → four plain facts (sessions,
 * the week's load, the light week, games) → the block's weeks as load bars, with the season strip to pick another
 * block → what needs the coach (amber). Layout only: the page computes every value from its existing reads.
 */

import * as React from "react";
import { MESO_CARD, MesoFlowChip, MesoHeadline, MesoLoadBars, MesoTile, MesoTileGrid, type MesoBar } from "@/components/coach/meso/MesoPrimitives";

export type InSeasonTile = { label: string; value: React.ReactNode; sub: React.ReactNode; warn?: boolean };

export default function InSeasonBlockSummary({ eyebrow, title, subLine, actions, flow, tiles, barsTitle, legend, bars, barsNote, strip, warnings, status }: {
  eyebrow: string;
  title: React.ReactNode;
  /** Dates, pills and the "change in Macro" link under the headline. */
  subLine: React.ReactNode;
  /** Prev / next / current / export / save. */
  actions: React.ReactNode;
  flow: { readsLabel: string; reads: string; flowsLabel: string; flows: string };
  tiles: InSeasonTile[];
  barsTitle: string;
  legend: React.ReactNode;
  bars: MesoBar[];
  /** One plain line under the bars (what a bar is). */
  barsNote?: React.ReactNode;
  /** The whole season's blocks on one date axis (click to pick a block). */
  strip?: React.ReactNode;
  warnings: React.ReactNode[];
  /** Save / export status lines under the actions. */
  status?: React.ReactNode;
}) {
  return (
    <section className={MESO_CARD}>
      {/* Verdict + navigation */}
      <div className="flex flex-col gap-3 px-5 pb-5 pt-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <MesoHeadline eyebrow={eyebrow} title={title}>{subLine}</MesoHeadline>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
        {status}
        <div className="flex"><MesoFlowChip {...flow} /></div>
      </div>

      {/* Four plain facts */}
      {tiles.length > 0 && (
        <MesoTileGrid>
          {tiles.map((x, i) => <MesoTile key={i} label={x.label} value={x.value} sub={x.sub} warn={x.warn} />)}
        </MesoTileGrid>
      )}

      {/* The block week by week, then the season to pick another block */}
      <div className="flex flex-col gap-2.5 px-5 pb-6 pt-5 sm:px-7">
        {bars.length > 0 && (<>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-[#14181c]">{barsTitle}</h3>
            <div className="flex flex-wrap gap-3.5 text-[12px] text-slate-600">{legend}</div>
          </div>
          <MesoLoadBars bars={bars} />
          {barsNote && <p className="text-[12px] text-slate-600">{barsNote}</p>}
        </>)}
        {strip}
        {warnings.length > 0 && (
          <ul className="space-y-1 text-[12px] font-medium text-[#8a5a10]">{warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
        )}
      </div>
    </section>
  );
}
