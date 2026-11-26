"use client";

/**
 * The week-by-week pieces shared by the two Meso tabs of the Periodization Hub: the day-type colours, the
 * section header, the collapsed week row with its seven day chips, and the open card's shell and header. Lifted
 * from the pre-season week cards (page.tsx) so both tabs are one design. Presentation only.
 */

import * as React from "react";
import { ARCHIVO } from "@/components/coach/meso/VariableTrack";

type Bi = { en: string; is: string };

export const DAY_TYPE_COLOR: Record<string, string> = { mechanical: "#A83E28", locomotive: "#15603A", mixed: "#1B2DA8", activation: "#475569", topup: "#0E5E6E", match: "#7A4A06", rest: "#64748B" };
export const DAY_TYPE_TINT: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#E2F0F2", match: "#FBEFDD", rest: "#F8FAFC" };
const DAY_TYPE_NAME: Record<string, Bi> = {
  mechanical: { en: "Mechanical", is: "Mekanískt" }, locomotive: { en: "Locomotive", is: "Hlaup" }, mixed: { en: "Mixed", is: "Blandað" },
  activation: { en: "Activation", is: "Virkjun" }, topup: { en: "Top-up", is: "Áfylling" }, match: { en: "Match", is: "Leikur" }, rest: { en: "Off", is: "Frí" },
};
export const dayTypeName = (t: string, is: boolean): string => { const n = DAY_TYPE_NAME[t]; return n ? (is ? n.is : n.en) : ""; };
export const DOWS: Bi[] = [{ en: "Mon", is: "Mán" }, { en: "Tue", is: "Þri" }, { en: "Wed", is: "Mið" }, { en: "Thu", is: "Fim" }, { en: "Fri", is: "Fös" }, { en: "Sat", is: "Lau" }, { en: "Sun", is: "Sun" }];

/** "Week by week" + intro on the left; the day-type legend and Expand / Collapse all on the right. */
export function MesoWeeksHeader({ is, intro, anyClosed, onToggleAll }: { is: boolean; intro: string; anyClosed: boolean; onToggleAll: () => void }) {
  const legend = ["mechanical", "locomotive", "mixed", "activation", "topup", "match"] as const;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[22px] font-bold tracking-[-0.01em] text-[#14181c]" style={ARCHIVO}>{is ? "Vika fyrir viku" : "Week by week"}</h2>
        <p className="text-[13px] text-slate-600">{intro}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
        {legend.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: k === "match" ? "#de9328" : DAY_TYPE_COLOR[k] }} />{k === "match" ? (is ? "Leikur" : "Game") : dayTypeName(k, is)}</span>)}
        <button type="button" onClick={onToggleAll} className="h-9 rounded-lg border border-[#d9d5cc] bg-white px-3 text-[13px] font-medium text-[#14181c] hover:bg-slate-50">{anyClosed ? (is ? "Opna allar" : "Expand all") : (is ? "Loka öllum" : "Collapse all")}</button>
      </div>
    </div>
  );
}

export type DayChip = { type: string; title: string };

/** Seven small day chips (letter + colour; off = blank). */
export function MesoDayChips({ days, is }: { days: DayChip[]; is: boolean }) {
  return (
    <span className="hidden grid-cols-7 gap-1 md:grid">
      {days.map((d, di) => {
        const off = d.type === "rest"; const isM = d.type === "match";
        return <span key={di} title={d.title} className="flex h-[22px] items-center justify-center rounded-[5px] font-mono text-[10px] font-semibold" style={off ? { background: "#f4f2ec", color: "#8a919c" } : { background: isM ? "#de9328" : DAY_TYPE_COLOR[d.type] ?? "#64748B", color: "#fff" }}>{off ? "" : dayTypeName(d.type, is).slice(0, 1)}</span>;
      })}
    </span>
  );
}

const Chevron = ({ up = false, size = 18, className }: { up?: boolean; size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#4f5661" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={up ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
);

/** A closed week: Week N + date | × a match + sub | day chips | badge | chevron. One button opens it. */
export function MesoWeekCollapsed({ is, weekNo, dateLine, load, loadSub, days, badge, onOpen }: {
  is: boolean; weekNo: number; dateLine: React.ReactNode; load: number | null; loadSub: React.ReactNode; days: DayChip[]; badge: React.ReactNode; onOpen: () => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#e3e0d8] bg-white">
      <button type="button" onClick={onOpen} aria-expanded={false} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-[#faf9f6] md:grid-cols-[120px_170px_minmax(200px,1fr)_auto_20px]">
        <span className="flex flex-col"><span className="text-[16px] font-bold text-[#14181c]" style={ARCHIVO}>{is ? "Vika" : "Week"} {weekNo}</span><span className="text-[12px] text-slate-600">{dateLine}</span></span>
        <span className="flex flex-col">
          {load != null && <span className="text-[15px] font-bold tabular-nums text-[#14181c]" style={ARCHIVO}>{load}× <span className="font-sans text-[12px] font-medium text-slate-600">{is ? "leikur" : "a match"}</span></span>}
          <span className="text-[12px] text-slate-600">{loadSub}</span>
        </span>
        <MesoDayChips days={days} is={is} />
        <span className="justify-self-end">{badge}</span>
        <Chevron className="hidden md:block" />
      </button>
    </section>
  );
}

/** An open week's card and its header row (Week N ▲ · date · × a match · extras … right-hand link). */
export function MesoWeekOpen({ is, weekNo, onClose, date, load, extras, right, children }: {
  is: boolean; weekNo: number; onClose: () => void; date: React.ReactNode; load: number | null; extras?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#e3e0d8] bg-white px-5 pb-4 pt-4">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <button type="button" onClick={onClose} aria-expanded={true} className="inline-flex items-center gap-1.5 text-[20px] font-bold text-[#14181c]" style={ARCHIVO}>{is ? "Vika" : "Week"} {weekNo}<Chevron up size={16} /></button>
        {date}
        {load != null && <span className="text-[16px] font-bold tabular-nums text-[#14181c]" style={ARCHIVO}>{load}× <span className="font-sans text-[12px] font-medium text-slate-600">{is ? "leikur" : "a match"}</span></span>}
        {extras}
        {right}
      </div>
      {children}
    </section>
  );
}

/** A divider pill before a group of weeks (the pre-season meso cycle; the in-season block). */
export function MesoBlockDivider({ pill, pillClass, goal, dates }: { pill: string; pillClass: string; goal?: string | null; dates: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-1 pt-3">
      <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${pillClass}`}>{pill}</span>
      {goal && <span className="text-[13px] font-semibold text-[#14181c]">{goal}</span>}
      <span className="text-[13px] text-slate-600">{dates}</span>
      <span className="h-px min-w-[40px] flex-1 bg-[#e3e0d8]" />
    </div>
  );
}
