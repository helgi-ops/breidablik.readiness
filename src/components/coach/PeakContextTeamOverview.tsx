"use client";

/**
 * Team overview — every player with a peak window this match, side by side, as Ju 2022
 * composition bars. Ju's whole point is that peak periods are POSITION-specific; this shows
 * the squad in one read so a coach can compare what each starter's hardest minutes are made of.
 *
 * Each row is one player: a 100%-stacked bar of his tactical actions in the selected peak
 * window (1/3/5-min), coloured with Ju's Fig. 2 palette (shared with PeakContextBars). Rows
 * grouped by position. Composition (share), not metres — peak-window HSR is gated (see
 * PeakContextBars for the axis note). Descriptive; never the readiness colour. EN/IS.
 */

import * as React from "react";
import { ACTION_COLOR, STACK_ORDER } from "@/components/coach/PeakContextBars";
import { phaseOf, contextWord } from "@/components/coach/PeakStoryCards";

type Bi = { en: string; is: string };
type ActionShare = { action: string; label: Bi; count: number; share: number; offBall: boolean };
type WindowRead = { windowMin: number; actions: ActionShare[]; teamLabels?: Record<string, number> };
type PlayerRead = { playerId: string; name: string; position?: string | null; started?: boolean; windows: WindowRead[] };

const PHASE_STYLE = {
  defending: { dot: "#a83e28", en: "defending", is: "að verjast" },
  attacking: { dot: "#1c7a4a", en: "attacking", is: "í sókn" },
  open: { dot: "#94a3b8", en: "open play", is: "opinn leikur" },
} as const;

// Coarse position grouping so the squad reads back-to-front like Ju's position figures.
function posGroup(pos: string | null | undefined): { key: number; en: string; is: string } {
  const p = (pos ?? "").toUpperCase();
  if (/GK|KEEP|MARK/.test(p)) return { key: 0, en: "Goalkeeper", is: "Markmaður" };
  if (/CB|LB|RB|WB|DEF|BAK|VÖR|VOR/.test(p)) return { key: 1, en: "Defenders", is: "Varnarmenn" };
  if (/DM|CM|AM|MID|MIÐ|MID/.test(p)) return { key: 2, en: "Midfielders", is: "Miðjumenn" };
  if (/LW|RW|CF|ST|FW|WING|FRAM|SÓKN|SOKN/.test(p)) return { key: 3, en: "Forwards", is: "Sóknarmenn" };
  return { key: 4, en: "Other", is: "Annað" };
}

export default function PeakContextTeamOverview({ players, hasStarterData = false, is }: { players: PlayerRead[]; hasStarterData?: boolean; is: boolean }) {
  const windowsAvail = React.useMemo(() => {
    const s = new Set<number>();
    for (const p of players) for (const w of p.windows) if (w.actions.some((a) => a.count > 0)) s.add(w.windowMin);
    return [...s].sort((a, b) => a - b);
  }, [players]);

  const [win, setWin] = React.useState<number | null>(null);
  const [startersOnly, setStartersOnly] = React.useState(false); // opt-in; only offered when a lineup was recorded
  const [showBars, setShowBars] = React.useState(false);         // default = clean phase read; bars behind a toggle
  React.useEffect(() => {
    if (windowsAvail.length && (win == null || !windowsAvail.includes(win))) setWin(windowsAvail[windowsAvail.length - 1]); // default longest window
  }, [windowsAvail, win]);

  if (windowsAvail.length === 0 || win == null) return null;

  // Build one composition row per player for the selected window.
  type Row = { id: string; name: string; group: ReturnType<typeof posGroup>; total: number; counts: Record<string, number>; labels: Record<string, Bi>; offBall: Record<string, boolean>; phase: "defending" | "attacking" | "open"; context: string | null };
  const applyStarters = startersOnly && hasStarterData;
  const rows: Row[] = [];
  for (const p of players) {
    if (applyStarters && !p.started) continue;
    // Prefer the window (at the selected length) that carries team-events labels — that's the one
    // we can read a phase from; else the first at that length.
    const atWin = p.windows.filter((x) => x.windowMin === win);
    const w = atWin.find((x) => x.teamLabels && Object.keys(x.teamLabels).length > 0) ?? atWin[0];
    if (!w) continue;
    const counts: Record<string, number> = {};
    const labels: Record<string, Bi> = {};
    const offBall: Record<string, boolean> = {};
    let total = 0;
    for (const a of w.actions) { if (a.count <= 0) continue; counts[a.action] = (counts[a.action] ?? 0) + a.count; labels[a.action] = a.label; offBall[a.action] = a.offBall; total += a.count; }
    if (total <= 0) continue;
    const tl = w.teamLabels ?? {};
    rows.push({ id: p.playerId, name: p.name, group: posGroup(p.position), total, counts, labels, offBall, phase: phaseOf(tl), context: contextWord(tl, is) });
  }
  // rows only empties under the starters filter (windowsAvail guarantees ≥1 otherwise) → keep the
  // panel + toggle rendered with a note rather than vanishing with no way back.
  rows.sort((a, b) => a.group.key - b.group.key || b.total - a.total);

  const present = STACK_ORDER.filter((act) => rows.some((r) => (r.counts[act] ?? 0) > 0));
  const labelFor = (act: string): Bi => { for (const r of rows) if (r.labels[act]) return r.labels[act]; return { en: act, is: act }; };
  const isOff = (act: string) => rows.some((r) => r.offBall[act]);

  let lastGroup = -1;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{is ? "Liðsyfirlit — úr hverju peak-gluggarnir eru gerðir" : "Squad — what the peak windows are made of"}</span>
        {hasStarterData && (
          <button onClick={() => setStartersOnly((s) => !s)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${startersOnly ? "bg-[#2740e6] text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
            title={is ? "Sýna aðeins byrjunarliðið (úr skráðum leikmínútum)" : "Show only the starting XI (from recorded match minutes)"}>
            {is ? "Aðeins byrjunarlið" : "Starters only"}
          </button>
        )}
        <button onClick={() => setShowBars((s) => !s)}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${showBars ? "bg-[#2740e6] text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
          title={is ? "Sýna taktíska samsetningu (súlur)" : "Show the tactical composition (bars)"}>
          {is ? "Samsetning" : "Composition"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{is ? "gluggi" : "window"}</span>
          {windowsAvail.map((m) => (
            <button key={m} onClick={() => setWin(m)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${win === m ? "bg-[#2740e6] text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              {m}{is ? " mín" : "-min"}
            </button>
          ))}
        </div>
      </div>

      {/* Composition legend — only when the bars are shown */}
      {showBars && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
          {present.map((act) => {
            const lbl = labelFor(act);
            return (
              <span key={act} className="inline-flex items-center gap-1" title={isOff(act) ? (is ? "off-ball — u.þ.b. úr atburðum" : "off-ball — approx from events") : undefined}>
                <span className="h-2 w-2 rounded-sm" style={{ background: ACTION_COLOR[act] ?? "#999" }} />
                {is ? lbl.is : lbl.en}{isOff(act) ? " ≈" : ""}
              </span>
            );
          })}
        </div>
      )}

      {applyStarters && (
        <p className="mt-2 text-[10px] text-slate-500">{is ? "Sýni aðeins byrjunarliðið (skráðar leikmínútur)." : "Showing the starting XI only (from recorded match minutes)."}</p>
      )}
      {rows.length === 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">{is ? "Enginn skráður byrjunarliðsmaður er með peak-glugga + pössuð Wyscout-nöfn í þessum glugga. Slökktu á „Aðeins byrjunarlið\" til að sjá alla." : "No recorded starter has both a peak window and a matched Wyscout name in this window. Turn off “Starters only” to see everyone."}</p>
      )}

      {/* Default = a clean phase read per player (defending/attacking in his peak window),
          grouped by position. The tactical composition bar is behind the "Composition" toggle. */}
      <div className="mt-2 space-y-1">
        {rows.map((r) => {
          const showHeader = r.group.key !== lastGroup;
          lastGroup = r.group.key;
          const ps = PHASE_STYLE[r.phase];
          const dom = STACK_ORDER.filter((a) => (r.counts[a] ?? 0) > 0).sort((a, b) => (r.counts[b] ?? 0) - (r.counts[a] ?? 0))[0];
          const domPct = dom ? Math.round(((r.counts[dom] ?? 0) / r.total) * 100) : 0;
          return (
            <div key={r.id}>
              {showHeader && <div className="mt-2 mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{is ? r.group.is : r.group.en}</div>}
              <div className="flex items-center gap-2 py-0.5">
                <span className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={r.name}>{r.name}</span>
                {showBars ? (
                  <>
                    <div className="flex h-4 flex-1 overflow-hidden rounded" title={`${r.total} ${is ? "aðgerðir" : "actions"}`}>
                      {STACK_ORDER.filter((a) => (r.counts[a] ?? 0) > 0).map((act) => {
                        const pct = ((r.counts[act] ?? 0) / r.total) * 100;
                        const lbl = labelFor(act);
                        return <span key={act} style={{ width: `${pct}%`, background: ACTION_COLOR[act] ?? "#999", opacity: isOff(act) ? 0.82 : 1 }} title={`${is ? lbl.is : lbl.en}: ${r.counts[act]} (${Math.round(pct)}%)`} />;
                      })}
                    </div>
                    <span className="w-28 shrink-0 text-right text-[10px] text-slate-500">{dom ? `${is ? labelFor(dom).is : labelFor(dom).en} ${domPct}%` : ""}</span>
                  </>
                ) : (
                  <span className="inline-flex flex-1 items-center gap-1.5 text-[12px] text-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ps.dot }} />
                    <span className="font-medium" style={{ color: ps.dot }}>{is ? ps.is : ps.en}</span>
                    {r.context && <span className="text-slate-500">· {r.context}</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        {showBars
          ? (is
            ? "Hver súla = hlutfallsleg samsetning taktískra aðgerða leikmanns í valda glugganum. Raðað aftast→fremst. ≈ = off-ball. Lýsandi — aldrei readiness-liturinn."
            : "Each bar = the share composition of a player's tactical actions in the selected window. Ordered back→front. ≈ = off-ball. Descriptive — never the readiness colour.")
          : (is
            ? "Fasi hvers leikmanns í hörðasta glugga hans (úr Wyscout lið-atburðum). Rautt = að verjast, grænt = í sókn. Ýttu á „Samsetning“ fyrir taktísku sundurliðunina. Lýsandi — aldrei readiness-liturinn."
            : "Each player's phase in his hardest window (from the Wyscout team events). Red = defending, green = attacking. Hit “Composition” for the tactical breakdown. Descriptive — never the readiness colour.")}
      </p>
    </div>
  );
}
