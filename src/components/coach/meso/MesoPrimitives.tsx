"use client";

/**
 * The summary-card pieces shared by the two Meso tabs of the Periodization Hub: the card shell, a fact tile, the
 * "Reads → Flows to" chip, the week-by-week load bars and the meso-goal colours. Lifted verbatim from the
 * pre-season summary (PreseasonReadsFrom) so both tabs are one design. Presentation only.
 */

import * as React from "react";
import type { BlockGoalKey } from "@/lib/micropulse/periodization";
import { ARCHIVO } from "@/components/coach/meso/VariableTrack";

// Meso-cycle goal colours (design tokens: cobalt family + green; purple is reserved for return-to-training).
export const GOAL_BAR: Record<BlockGoalKey, string> = { accum: "#8fa0f0", transmute: "#2740e6", realize: "#1c7a4a", deload: "#8a919c" };
export const BASE_BAR = "#b7c1f5";
export const TAPER_BAR = "#8cc2a5";
export const GOAL_CHIP: Record<BlockGoalKey, string> = {
  accum: "border-[#c3cbf6] bg-[#eef0fd] text-[#1b2da8]",
  transmute: "border-[#aeb9f4] bg-[#e2e6fc] text-[#1b2da8]",
  realize: "border-[#b9dcc8] bg-[#e4f1ea] text-[#15603a]",
  deload: "border-slate-200 bg-slate-50 text-slate-700",
};

/** Card shells (the pre-season look): the summary card and the setup card. */
export const MESO_CARD = "overflow-hidden rounded-2xl border border-[#e3e0d8] bg-white";
export const MESO_SETUP_CARD = "flex flex-col gap-4 rounded-2xl border border-[#e3e0d8] bg-white px-5 pb-6 pt-5 sm:px-7";
export const MESO_INPUT = "h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px]";

/** The eyebrow, the verdict headline and its sub-line at the top of a summary card. */
export function MesoHeadline({ eyebrow, title, children }: { eyebrow: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2740e6]">{eyebrow}</span>
      <h2 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#14181c]" style={ARCHIVO}>{title}</h2>
      {children}
    </div>
  );
}

/** "Reads … → Flows to …" — where the page's numbers come from and where an edit goes. */
export function MesoFlowChip({ readsLabel, reads, flowsLabel, flows }: { readsLabel: string; reads: string; flowsLabel: string; flows: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f7f6f3] px-3 py-2 text-[12px] text-slate-600">
      <span>{readsLabel} <b className="font-semibold text-slate-700">{reads}</b></span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2740e6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
      <span>{flowsLabel} <b className="font-semibold text-[#2740e6]">{flows}</b></span>
    </div>
  );
}

/** The row of plain facts under the headline (2 columns on a phone, 4 from sm). */
export function MesoTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-px border-y border-[#ebe9e3] bg-[#ebe9e3] sm:grid-cols-4">{children}</div>;
}

/** One plain fact: label, big value, sub-line (amber when it needs the coach). */
export function MesoTile({ label, value, sub, warn = false }: { label: React.ReactNode; value: React.ReactNode; sub: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-white px-5 py-4 sm:px-7">
      <span className="text-[12px] text-slate-600">{label}</span>
      <span className="text-[24px] font-bold leading-tight tabular-nums text-[#14181c]" style={ARCHIVO}>{value}</span>
      <span className={`text-[12px] ${warn ? "font-semibold text-[#8a5a10]" : "text-slate-600"}`}>{sub}</span>
    </div>
  );
}

export type MesoBar = {
  key: string;
  /** Bar height relative to the tallest. */
  value: number;
  color: string;
  /** The number over the bar ("" = none). */
  label: string;
  title: string;
  /** Under the bar: the week number and a game dot (entered = filled, assumed = ring). */
  weekNo: number;
  game: "entered" | "assumed" | null;
  gameTitle: string;
};

/** Week-by-week load bars with the week numbers and game dots under them. `children` = a row under the
 *  weeks on the same grid (the pre-season block chips). */
export function MesoLoadBars({ bars, children }: { bars: MesoBar[]; children?: React.ReactNode }) {
  const n = bars.length;
  const maxV = Math.max(0.0001, ...bars.map((b) => b.value));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid h-[120px] items-end gap-1 pt-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {bars.map((b) => (
            <div key={b.key} className="flex h-full flex-col items-center justify-end gap-1" title={b.title}>
              <span className="text-[10px] font-semibold tabular-nums text-slate-700">{b.label}</span>
              <div className="w-full rounded-t-[4px] rounded-b-[2px]" style={{ height: `${Math.round(16 + (b.value / maxV) * 72)}px`, background: b.color }} />
            </div>
          ))}
        </div>
        <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {bars.map((b) => (
            <div key={b.key} className="flex h-[30px] flex-col items-center gap-[3px]">
              <span className="font-mono text-[10px] text-slate-500">{b.weekNo}</span>
              {b.game === "entered" ? <span title={b.gameTitle} className="h-2 w-2 rounded-full bg-[#de9328]" />
                : b.game === "assumed" ? <span title={b.gameTitle} className="h-2 w-2 rounded-full border-2 border-[#de9328]" /> : null}
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Legend swatch for the bars. */
export const BarSwatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />{label}</span>
);
export const GameDotLegend = ({ label, assumed = false }: { label: string; assumed?: boolean }) => (
  <span className="inline-flex items-center gap-1.5"><span className={assumed ? "h-2 w-2 rounded-full border-2 border-[#de9328]" : "h-2 w-2 rounded-full bg-[#de9328]"} />{label}</span>
);
