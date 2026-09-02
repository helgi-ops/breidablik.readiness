"use client";

/**
 * Ju 2022 Fig. 2 style stacked bars for a player's peak windows — "what his peak minutes were
 * made of", tactically. One bar per peak window (1/3/5-min), stacked by Ju tactical action,
 * coloured with the paper's own Fig. 2 palette (see docs/product/contextualised-peak-periods-page.html).
 *
 * HONEST AXIS: Ju's y-axis is high-intensity-running METRES per action. We do NOT have that —
 * the Catapult MII peak-window feed carries Distance + Player Load only, never HSR, and no
 * per-action metre attribution. So the bar height here is the count of TACTICAL ACTIONS in the
 * window (from time-aligned Wyscout events), not metres. Off-ball Recovery Run / Covering were
 * tracking-coded by Ju and are only partially recoverable from events — flagged "≈". Descriptive
 * context; never the readiness colour. Hand-rolled SVG (repo convention — no chart lib).
 */

import * as React from "react";

type Bi = { en: string; is: string };
type ActionShare = { action: string; label: Bi; count: number; share: number; offBall: boolean };
type WindowRead = { windowMin: number; metric: string; value: number | null; actions: ActionShare[]; secondHalf?: boolean };

// Ju et al. 2022 Fig. 2 colours, keyed by our TacticalAction. Exported so the team
// overview draws from the SAME palette + stack order (one source).
export const ACTION_COLOR: Record<string, string> = {
  covering: "#2740e6",        // cobalt (Ju: Covering)
  recovery_run: "#141414",    // near-black (Ju: Recovery Run)
  support_play: "#f4d03f",    // yellow (Ju: Support Play)
  move_to_receive: "#12b886", // green (Ju: Move to Receive/Exploit Space)
  run_with_ball: "#7a5cc4",   // purple (Ju: Run with Ball)
  run_in_behind: "#e8890c",   // orange (Ju: Run in Behind/Penetrate)
  other: "#8a8f97",           // grey (Ju: Other)
};
// Stack bottom→top: off-ball transition base (Ju's dominant floor) → in-possession → Other on top.
export const STACK_ORDER = ["covering", "recovery_run", "support_play", "move_to_receive", "run_with_ball", "run_in_behind", "other"];

export default function PeakContextBars({ windows, is }: { windows: WindowRead[]; is: boolean }) {
  const wins = [...windows].sort((a, b) => a.windowMin - b.windowMin);
  const totals = wins.map((w) => w.actions.reduce((s, a) => s + a.count, 0));
  const maxTotal = Math.max(0, ...totals);
  if (maxTotal <= 0) return null; // no on-ball actions aligned — the text caveat carries the gap

  const countOf = (w: WindowRead, act: string) => w.actions.find((a) => a.action === act)?.count ?? 0;
  const present = STACK_ORDER.filter((act) => wins.some((w) => countOf(w, act) > 0));
  const labelFor = (act: string): Bi => {
    for (const w of wins) { const f = w.actions.find((a) => a.action === act); if (f) return f.label; }
    return { en: act, is: act };
  };
  const isOffBall = (act: string) => wins.some((w) => w.actions.find((a) => a.action === act)?.offBall);

  const leftPad = 30, topPad = 10, botPad = 30, slot = 78, barW = 44;
  const H = 180, plotH = H - topPad - botPad, y0 = H - botPad;
  const W = leftPad + wins.length * slot + 8;
  const yPx = (c: number) => (c / maxTotal) * plotH;
  const ticks = [0, Math.round(maxTotal / 2), maxTotal].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px]" role="img"
        aria-label={is ? "Taktísk samsetning peak-glugga" : "Tactical make-up of the peak windows"}>
        {/* y ticks + gridlines */}
        {ticks.map((tk) => {
          const y = y0 - yPx(tk);
          return (
            <g key={tk}>
              <line x1={leftPad} y1={y} x2={W - 6} y2={y} stroke="#ece7db" strokeWidth="1" />
              <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#8a8f97">{tk}</text>
            </g>
          );
        })}
        {/* bars */}
        {wins.map((w, i) => {
          const x = leftPad + i * slot + (slot - barW) / 2;
          let cum = 0;
          return (
            <g key={i}>
              {STACK_ORDER.map((act) => {
                const c = countOf(w, act);
                if (c <= 0) return null;
                const h = yPx(c);
                const y = y0 - cum - h;
                cum += h;
                const lbl = labelFor(act);
                return (
                  <rect key={act} x={x} y={y} width={barW} height={h} fill={ACTION_COLOR[act] ?? "#999"}
                    opacity={isOffBall(act) ? 0.82 : 1}>
                    <title>{`${is ? lbl.is : lbl.en}: ${c}`}</title>
                  </rect>
                );
              })}
              <text x={x + barW / 2} y={H - botPad + 12} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3a3f45">
                {w.windowMin}{is ? " mín" : "-min"}
              </text>
              {w.value != null && (
                <text x={x + barW / 2} y={H - botPad + 23} textAnchor="middle" fontSize="7.5" fill="#8a8f97">
                  {Math.round(w.value)}{w.metric === "distance" ? " m/mín" : "/mín"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* legend — only categories present, off-ball flagged ≈ */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
        {present.map((act) => {
          const lbl = labelFor(act);
          return (
            <span key={act} className="inline-flex items-center gap-1" title={isOffBall(act) ? (is ? "off-ball — u.þ.b. úr atburðum" : "off-ball — approx from events") : undefined}>
              <span className="h-2 w-2 rounded-sm" style={{ background: ACTION_COLOR[act] ?? "#999" }} />
              {is ? lbl.is : lbl.en}{isOffBall(act) ? " ≈" : ""}
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        {is
          ? "Súluhæð = fjöldi taktískra aðgerða í glugganum (tíma-samstilltir Wyscout atburðir), ekki háhraða-metrar — peak-gluggi Catapult ber vegalengd/Player Load, ekki HSR. ≈ = off-ball (endurheimt/skjólun), aðeins að hluta úr atburðum (Ju kóðaði með tracking)."
          : "Bar height = number of tactical actions in the window (time-aligned Wyscout events), not high-speed metres — the Catapult peak window carries distance / Player Load, not HSR. ≈ = off-ball (recovery/covering), only partially recoverable from events (Ju coded it with tracking)."}
      </p>
    </div>
  );
}
