"use client";

/**
 * The per-variable table pieces shared by the two Meso tabs of the Periodization Hub: the column grid, the track
 * (research range shaded, the weeks as marks on one shared × a match scale), the scale ticks, the group header
 * and the within / above / below chip. Lifted verbatim from the pre-season table (PreseasonWeek1Table) so both
 * tabs are one design. Presentation only.
 */

import * as React from "react";
import { tmRefBand } from "@/lib/micropulse/periodization/matchReference";

export const ARCHIVO: React.CSSProperties = { fontFamily: "var(--font-archivo, inherit)" };

/** Variable | value | track | vs research — one grid for the header, the master row and every row. */
export const VARIABLE_COLS = "grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(180px,1.3fr)_190px_minmax(220px,2fr)_150px] md:gap-5";

/** The scale every track shares: 0× → the largest number on the page (at least 4×), so rows compare. */
export function trackScaleMax(xs: Array<number | null | undefined>): number {
  return Math.max(4, Math.ceil(Math.max(...xs.map((x) => x ?? 0))));
}

/** One variable on the shared scale: research range (green band), `open` → `filled` as a bar, `light` as a
 *  diamond. Pre-season: open = week 1, filled = peak. In-season: filled = the standard week (open = week 1 when
 *  the weeks ramp). With `onSet` the filled dot is a slider: drag it (or arrow keys) to set the value; a drag
 *  only previews while it moves and sets once, on release. */
export function VariableTrack({ scaleMax, refRange, open, filled, light, ariaLabel, onSet, setOn = "filled", step = 0.05, min = 0.05, fmt = (x: number) => `${x}×`, setLabel }: {
  scaleMax: number;
  refRange: [number, number] | null;
  open: number | null;
  filled: number | null;
  light: number | null;
  ariaLabel: string;
  /** Makes a dot draggable; called once with the new value (snapped to `step`, within min…scaleMax). */
  onSet?: (x: number) => void;
  /** Which dot is the value `onSet` sets: the filled one (default) or the open one (in-season ramp: week 1 =
   *  the standard week, the peak follows by the same ratio while dragging). */
  setOn?: "filled" | "open";
  step?: number;
  min?: number;
  fmt?: (x: number) => string;
  /** The slider's accessible name (e.g. "Running distance — standard week"). */
  setLabel?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<number | null>(null);
  const base = setOn === "open" ? open : filled; // the value the slider sets
  const ratio = drag != null && base ? drag / base : 1;
  const shownOpen = open == null ? null : setOn === "open" ? (drag ?? open) : open;
  const shownFilled = filled == null ? null : setOn === "filled" ? (drag ?? filled) : Math.round(filled * ratio * 100) / 100;
  const handle = setOn === "open" ? shownOpen : shownFilled;
  const pos = (x: number) => `${Math.max(0, Math.min(100, (x / scaleMax) * 100))}%`;
  const lo = Math.min(shownOpen ?? 0, shownFilled ?? 0), hi = Math.max(shownOpen ?? 0, shownFilled ?? 0);
  const snap = (x: number) => Math.round(Math.max(min, Math.min(scaleMax, Math.round(x / step) * step)) * 100) / 100;
  // Relative to where the drag started, so a click without a move changes nothing.
  const start = React.useRef<{ x: number; v: number } | null>(null);
  const valAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!start.current || !r || r.width <= 0) return base ?? min;
    return snap(start.current.v + ((clientX - start.current.x) / r.width) * scaleMax);
  };
  const done = () => {
    if (drag != null && onSet && (base == null || Math.abs(drag - base) >= step / 2)) onSet(drag);
    setDrag(null); start.current = null;
  };
  const editable = !!onSet && base != null;
  const dot = (kind: "open" | "filled") => kind === "open"
    ? <span className="block h-3.5 w-3.5 rounded-full border-[3px] border-[#2740e6] bg-white" />
    : <span className={`block rounded-full bg-[#2740e6] ring-2 ring-white transition-[width,height] ${drag != null ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"}`} />;
  const staticDot = (x: number, kind: "open" | "filled") => (
    <div className="absolute top-[13px] -translate-x-1/2" style={{ left: pos(x) }}>{dot(kind)}</div>
  );
  return (
    <div ref={trackRef} className="relative h-10" role={editable ? "group" : "img"} aria-label={ariaLabel}>
      <div className="absolute inset-x-0 top-[17px] h-1.5 rounded-full bg-[#ece9e2]" />
      {refRange && <div className="absolute top-2 h-6 rounded-md bg-[#1c7a4a]/[0.14]" style={{ left: pos(refRange[0]), width: `calc(${pos(refRange[1])} - ${pos(refRange[0])})` }} />}
      {shownOpen != null && shownFilled != null && <div className="absolute top-[17px] h-1.5 rounded-full bg-[#2740e6]/35" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />}
      {light != null && <div className="absolute top-[30px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#8a919c]" style={{ left: pos(drag != null && base ? Math.round(light * ratio * 100) / 100 : light) }} />}
      {shownOpen != null && !(editable && setOn === "open") && staticDot(shownOpen, "open")}
      {shownFilled != null && !(editable && setOn === "filled") && staticDot(shownFilled, "filled")}
      {editable && handle != null && (
        <>
          {drag != null && <span className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-1 rounded bg-[#14181c] px-1 py-px text-[10px] font-semibold leading-none tabular-nums text-white" style={{ left: pos(handle) }}>{fmt(handle)}</span>}
          <div
            role="slider" tabIndex={0} aria-label={setLabel ?? ariaLabel}
            aria-valuemin={min} aria-valuemax={scaleMax} aria-valuenow={handle} aria-valuetext={fmt(handle)}
            className={`absolute top-[6px] z-10 flex h-7 w-7 -translate-x-1/2 touch-none select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2740e6]/40 ${drag != null ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ left: pos(handle) }}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, v: handle }; setDrag(handle); }}
            onPointerMove={(e) => { if (drag != null) setDrag(valAt(e.clientX)); }}
            onPointerUp={done}
            onPointerCancel={() => { setDrag(null); start.current = null; }}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
              if (!d || !onSet || base == null) return;
              e.preventDefault();
              onSet(snap(base + d));
            }}
          >
            {dot(setOn)}
          </div>
        </>
      )}
    </div>
  );
}

/** The 0× … N× ticks under the legend, aligned with the track column. */
export function VariableScaleTicks({ scaleMax }: { scaleMax: number }) {
  const ticks = Array.from({ length: scaleMax + 1 }, (_, i) => i);
  return (
    <div className={`${VARIABLE_COLS} mt-1 font-mono text-[10px] text-slate-500`}>
      <span /><span />
      <div className="flex justify-between">{ticks.map((i) => <span key={i}>{i}×</span>)}</div>
      <span />
    </div>
  );
}

/** Legend marks for the track column. */
export const LegendRange = ({ label }: { label: string }) => <span className="inline-flex items-center gap-1.5"><span className="h-2 w-[18px] rounded-[3px] bg-[#1c7a4a]/[0.18]" />{label}</span>;
export const LegendOpen = ({ label }: { label: string }) => <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-[#2740e6] bg-white" />{label}</span>;
export const LegendFilled = ({ label }: { label: string }) => <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2740e6]" />{label}</span>;
export const LegendLight = ({ label }: { label: string }) => <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-[#8a919c]" />{label}</span>;

/** A group's header: "RUNNING VOLUME  the aerobic base". */
export function VariableGroupHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5 border-b border-[#ece9e2] pb-1.5 pt-3.5">
      <span className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#14181c]" style={ARCHIVO}>{title}</span>
      {sub && <span className="text-[12px] text-slate-600">{sub}</span>}
    </div>
  );
}

/** Where a weekly ×match lands against the research training:match range — always a word, never a colour alone.
 *  Shared by both Meso tabs. */
export function TmBandChip({ x, refRange, is, className = "ml-1" }: { x: number | null | undefined; refRange: [number, number] | null | undefined; is: boolean; className?: string }) {
  const k = tmRefBand(x, refRange);
  if (k == null) return null;
  const txt = k === "in" ? (is ? "innan" : "within") : k === "above" ? (is ? "yfir" : "above") : (is ? "undir" : "below");
  const cls = k === "in" ? "bg-[#1c7a4a]/12 text-[#15603a]" : k === "above" ? "bg-[#de9328]/16 text-[#7a4a06]" : "bg-[#eeece6] text-slate-600";
  return <span className={`${className} rounded px-1.5 py-px text-[10px] font-semibold ${cls}`}>{txt}</span>;
}

/** The chip, or "no reference" when the variable has no research range. */
export function BandOrNone({ x, refRange, is }: { x: number | null; refRange: [number, number] | null; is: boolean }) {
  if (x == null) return null;
  if (refRange == null) return <span className="text-[10px] text-slate-500">{is ? "engin viðmið" : "no reference"}</span>;
  return <TmBandChip x={x} refRange={refRange} is={is} className="" />;
}
