"use client";

/**
 * Peak-context STORY view — the clean read (matches docs/product/fusion-oli-valur-visual.html):
 * a match-clock timeline + two featured cards, his hardest single minute (peak Player Load) and
 * his hardest sustained run (peak 5-min distance), each with a plain headline, HIS ACTIONS vs the
 * TEAM PHASE in that window, and the headline number. Distilled from the full window set so a coach
 * gets the story at a glance; the raw per-window detail stays behind a toggle in the parent.
 * Descriptive tactical context — never the readiness colour. EN/IS.
 */

import * as React from "react";

type Bi = { en: string; is: string };
type ActionShare = { action: string; label: Bi; count: number; offBall: boolean };
export type StoryWindow = {
  windowMin: number; metric: string; value: number | null; startSec?: number | null; endSec?: number | null;
  secondHalf?: boolean; actions: ActionShare[]; teamLabels: Record<string, number>;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Defending vs attacking from the team-events labels in the window (counts, not one label). */
function phaseOf(teamLabels: Record<string, number>): "defending" | "attacking" | "open" {
  const e = Object.entries(teamLabels);
  const sum = (re: RegExp) => e.filter(([l]) => re.test(l.toLowerCase())).reduce((s, [, n]) => s + n, 0);
  const d = sum(/defend|conceded/), a = sum(/attack|possession|build/);
  return d > a ? "defending" : a > d ? "attacking" : "open";
}
/** The set-piece / event context word for the headline, from the team labels. */
function contextWord(teamLabels: Record<string, number>, is: boolean): string | null {
  const has = (re: RegExp) => Object.keys(teamLabels).some((l) => re.test(l.toLowerCase()));
  if (has(/corner/)) return is ? "horn" : "a corner";
  if (has(/cross/)) return is ? "fyrirgjafir" : "crosses";
  if (has(/free.?kick|set.?piece/)) return is ? "fastan leikþátt" : "a set-piece";
  if (has(/shot|goal scoring/)) return is ? "færi" : "a chance";
  return null;
}
function topLabels(m: Record<string, number>, n = 4): Array<{ k: string; v: number }> {
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));
}

function StoryCard({ w, kind, is }: { w: StoryWindow; kind: "minute" | "run"; is: boolean }) {
  const phase = phaseOf(w.teamLabels);
  const attacking = phase === "attacking";
  const accent = attacking ? "#1c7a4a" : phase === "defending" ? "#a83e28" : "#6b7078";
  const ctx = contextWord(w.teamLabels, is);
  const nounEn = kind === "minute" ? "most intense minute" : "hardest 5-minute run";
  const nounIs = kind === "minute" ? "ákafasta mínúta" : "hörðasta 5-mín hlaup";
  const phEn = phase === "defending" ? "defensive" : phase === "attacking" ? "his own attack" : "open play";
  const phIs = phase === "defending" ? "varnarleg" : phase === "attacking" ? "hans eigin sókn" : "opinn leikur";
  const headline: Bi = {
    en: `His ${nounEn} was ${phEn}${ctx ? ` — ${phase === "defending" ? "defending " : ""}${ctx}` : ""}.`,
    is: `${nounIs} hans var ${phIs}${ctx ? ` — ${phase === "defending" ? "að verjast " : ""}${ctx}` : ""}.`,
  };
  const num = w.value == null ? "–"
    : w.metric === "distance" ? `${Math.round(w.value)} m`
      : w.metric === "player_load" ? w.value.toFixed(1)
        : String(Math.round(w.value));
  const numLabel: Bi = w.metric === "distance" ? { en: `distance in ${w.windowMin} min`, is: `vegalengd á ${w.windowMin} mín` }
    : w.metric === "player_load" ? { en: "Player Load / min", is: "Player Load / mín" }
      : { en: "per window", is: "yfir gluggann" };
  const headerEn = kind === "minute" ? "Hardest single minute" : "Hardest 5-minute run";
  const headerIs = kind === "minute" ? "Ákafasta mínútan" : "Hörðasta 5-mín hlaupið";
  const metricTag = w.metric === "player_load" ? "Player Load" : w.metric === "distance" ? (is ? "Vegalengd" : "Distance") : w.metric;
  const hisActions = w.actions.filter((a) => a.count > 0).slice(0, 4);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" style={{ borderLeft: `4px solid ${accent}` }}>
      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" style={{ background: accent }}>
        {(is ? headerIs : headerEn)} · {metricTag}
      </span>
      {w.startSec != null && (
        <div className="mt-2 text-lg font-bold text-slate-900">{mmss(w.startSec)}{w.endSec != null && kind === "run" ? `–${mmss(w.endSec)}` : ""} <span className="text-[11px] font-normal text-slate-400">{is ? "frá kickoff" : "from kickoff"}{w.secondHalf ? (is ? " · u.þ.b." : " · approx") : ""}</span></div>
      )}
      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{is ? `Peak ${w.windowMin}-mín ${metricTag} gluggi` : `Peak ${w.windowMin}-minute ${metricTag} window`}</p>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{is ? headline.is : headline.en}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Hans aðgerðir" : "His actions"}</div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-slate-700">
            {hisActions.length ? hisActions.map((a) => <li key={a.action}>• {is ? a.label.is : a.label.en}{a.count > 1 ? ` ×${a.count}` : ""}</li>)
              : <li className="text-slate-400">{is ? "engar á boltanum (off-ball)" : "none on the ball (off-ball)"}</li>}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Liðið (sami gluggi)" : "Team phase (same window)"}</div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-slate-700">
            {topLabels(w.teamLabels).length ? topLabels(w.teamLabels).map((l) => <li key={l.k}>• {l.k}{l.v > 1 ? ` ×${l.v}` : ""}</li>)
              : <li className="text-slate-400">—</li>}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3 border-t border-dashed border-slate-200 pt-2">
        <div>
          <div className="text-xl font-bold text-slate-900 tabular-nums">{num}</div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{is ? numLabel.is : numLabel.en}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-sm font-semibold" style={{ color: accent }}>{phase === "defending" ? (is ? "að verjast" : "defending") : phase === "attacking" ? (is ? "í sókn" : "attacking") : (is ? "opinn leikur" : "open play")}</div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{is ? "liðs-samhengi" : "team context"}</div>
        </div>
      </div>
    </div>
  );
}

export default function PeakStoryCards({ windows, is }: { windows: StoryWindow[]; is: boolean }) {
  // Feature the two most coach-legible windows: hardest single minute (prefer Player Load) and
  // hardest sustained run (prefer distance). Fall back to whatever 1-/5-min window exists.
  const pick = (mins: number[], metricPref: string) => {
    const inRange = windows.filter((w) => mins.includes(w.windowMin) && w.value != null);
    return inRange.find((w) => w.metric === metricPref) ?? inRange.sort((a, b) => a.windowMin - b.windowMin)[0] ?? null;
  };
  const minute = pick([1], "player_load");
  const run = pick([5, 3], "distance");
  const featured = [minute, run].filter((w): w is StoryWindow => !!w && (w.actions.length > 0 || Object.keys(w.teamLabels).length > 0));
  if (featured.length === 0) return null;

  // Timeline markers (play-clock minute of each featured window) on a 0–90 axis.
  const withClock = featured.filter((w) => w.startSec != null);
  const maxMin = Math.max(90, ...withClock.map((w) => Math.ceil((w.startSec! + (w.endSec != null ? w.endSec - w.startSec! : 60)) / 60)));

  return (
    <div>
      {withClock.length > 0 && (
        <div className="mb-3">
          <div className="relative h-9 rounded-lg bg-slate-100">
            {[0, 45].map((m) => <div key={m} className="absolute top-0 h-full border-l border-slate-300" style={{ left: `${(m / maxMin) * 100}%` }} />)}
            {withClock.map((w, i) => {
              const startM = w.startSec! / 60;
              const isRun = w.windowMin >= 3;
              const defend = phaseOf(w.teamLabels) === "defending";
              return (
                <span key={i} className="absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[9px] font-semibold text-white"
                  style={{ left: `${Math.min(88, (startM / maxMin) * 100)}%`, background: defend ? "#a83e28" : "#1c7a4a" }}>
                  {mmss(w.startSec!)} {isRun ? (is ? "hörðustu 5" : "hardest 5") : (is ? "ákaf. mín" : "hardest min")}
                </span>
              );
            })}
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] uppercase tracking-wide text-slate-400"><span>{"0'"}</span><span>{"45'"}</span><span>{maxMin > 90 ? "90'+" : "90'"}</span></div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {minute && featured.includes(minute) && <StoryCard w={minute} kind="minute" is={is} />}
        {run && featured.includes(run) && <StoryCard w={run} kind="run" is={is} />}
      </div>
    </div>
  );
}
