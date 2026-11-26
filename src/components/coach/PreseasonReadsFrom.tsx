"use client";

/**
 * Top of the hub's Pre-season tab: the pre-season at a glance. The pre-season is read straight from the Macro
 * cycle (its dates), the first league game and the friendlies the team has entered; a week with no game follows
 * the rules (a training week of the coach's sessions a week, or an assumed Saturday game from the coach's
 * "Weekend games from" date). No draft, no build step — the user's call 2026-11-25.
 *
 * Layered read (docs/explainability-first.md): the verdict (weeks to the opener, rule-based) → four plain facts
 * (sessions, load ramp, light week, friendlies) → the week-by-week picture (load bars by meso cycle, games) → the
 * detail below on the tab. Redesign 2026-11-26 (Claude Design canvas "Meso Pre-season — coach page redesign").
 * Presentation only: every number comes from the proposal (preseasonProposal); no new rule.
 */

import * as React from "react";
import type { PreseasonProposal } from "@/lib/micropulse/periodization/preseasonProposal";
import { BLOCK_GOAL_LABEL, type BlockGoalKey } from "@/lib/micropulse/periodization";
import { PRESEASON_TAPER_RESEARCH } from "@/lib/micropulse/periodization/preseasonWindow";

type Bi = { en: string; is: string };
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const fmtDate = (iso: string, is: boolean) => (is ? `${Number(iso.slice(8, 10))}. ${MON_IS[Number(iso.slice(5, 7)) - 1]}` : `${Number(iso.slice(8, 10))} ${MON_EN[Number(iso.slice(5, 7)) - 1]}`);
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Meso-cycle goal colours (design tokens: cobalt family + green; purple is reserved for return-to-training).
const GOAL_BAR: Record<BlockGoalKey, string> = { accum: "#8fa0f0", transmute: "#2740e6", realize: "#1c7a4a", deload: "#8a919c" };
const BASE_BAR = "#b7c1f5";
const TAPER_BAR = "#8cc2a5";
const GOAL_CHIP: Record<BlockGoalKey, string> = {
  accum: "border-[#c3cbf6] bg-[#eef0fd] text-[#1b2da8]",
  transmute: "border-[#aeb9f4] bg-[#e2e6fc] text-[#1b2da8]",
  realize: "border-[#b9dcc8] bg-[#e4f1ea] text-[#15603a]",
  deload: "border-slate-200 bg-slate-50 text-slate-700",
};

export default function PreseasonReadsFrom({ is, prop, opener, openerEstimated, onOpenMacro, baseBlocks = 1 }: {
  is: boolean;
  prop: PreseasonProposal;
  /** The first league game (the season's opener) — null when none is entered. */
  opener: string | null;
  openerEstimated: boolean;
  onOpenMacro: () => void;
  /** How many of the earliest meso cycles are the flexible base (prop.engine.meso.base.length). */
  baseBlocks?: number;
  /** Kept for callers: adding a game now lives in the setup card (<AddGame>). */
  addGame?: (date: string, kind: "friendly" | "competitive") => Promise<boolean>;
}) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const d = (iso: string) => fmtDate(iso, is);

  const weeks = prop.weeks;
  const n = weeks.length;
  const friendlies = prop.engine.fixtures.filter((f) => f !== opener);
  const sess = prop.settings.sessionsPerWeek;
  const taper = prop.settings.taperPct;
  const games = prop.weekendGames.from;
  const gamesBy = prop.weekendGames.by;

  // The load ramp in × a match (fallback: the week's own share of the heaviest week, when no match unit).
  const mult = weeks.map((w) => w.target.multipleOfMatch);
  const hasMult = mult.every((m) => m != null);
  const val = (i: number) => (hasMult ? (mult[i] as number) : (weeks[i].target.weeklyLoadTarget ?? weeks[i].target.sRpeAuTarget ?? 0));
  const maxV = Math.max(0.0001, ...weeks.map((_, i) => val(i)));
  const lightIdx = weeks.findIndex((w) => w.target.taper);
  const peakIdx = weeks.reduce((best, _, i) => (i !== lightIdx && val(i) > val(best) ? i : best), 0);
  const fx = (x: number) => { const s = (Math.round(x * 100) / 100).toString(); return is ? s.replace(".", ",") : s; };

  const yr = (iso: string) => iso.slice(2, 4);
  const startY = prop.window.start.slice(0, 4), endY = prop.window.end.slice(0, 4);
  const seasonLabel = startY === endY ? startY : `${startY}–${yr(prop.window.end)}`;

  const blockOf = (weekStart: string) => prop.blocks.findIndex((b) => b.start <= weekStart && weekStart < b.end);
  const openerWeek = opener ? weeks.findIndex((w) => w.weekStart <= opener && opener < addDays(w.weekStart, 7)) : -1;

  const tile = (label: Bi, value: React.ReactNode, sub: React.ReactNode, warn = false) => (
    <div className="flex min-w-0 flex-col gap-1 bg-white px-5 py-4 sm:px-7">
      <span className="text-[12px] text-slate-600">{t(label)}</span>
      <span className="text-[24px] font-bold leading-tight tabular-nums text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{value}</span>
      <span className={`text-[12px] ${warn ? "font-semibold text-[#8a5a10]" : "text-slate-600"}`}>{sub}</span>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e3e0d8] bg-white">
      {/* Verdict + provenance */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-5 pt-6 sm:px-7">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2740e6]">{t({ en: `Pre-season ${seasonLabel}`, is: `Undirbúningur ${seasonLabel}` })}</span>
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>
            {opener ? t({ en: `${n} weeks to the opener`, is: `${n} vikur í fyrsta leik` }) : t({ en: `${n}-week pre-season`, is: `${n} vikna undirbúningur` })}
          </h2>
          <p className="text-[14px] text-slate-600">
            {d(prop.window.start)} → {d(prop.window.end)} ·{" "}
            {!opener
              ? <span className="font-semibold text-[#8a5a10]">{t({ en: "first league game not entered", is: "fyrsti deildarleikur ekki skráður" })}</span>
              : openerEstimated
                ? <span className="font-semibold text-[#8a5a10]">{t({ en: `first league game estimated (${d(opener)})`, is: `fyrsti deildarleikur áætlaður (${d(opener)})` })}</span>
                : t({ en: `first league game ${d(opener)}`, is: `fyrsti deildarleikur ${d(opener)}` })}
            {" · "}<button type="button" onClick={onOpenMacro} className="font-medium text-[#2740e6] hover:underline">{t({ en: "change in Macro", is: "breyta í Makró" })}</button>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f7f6f3] px-3 py-2 text-[12px] text-slate-600">
          <span>{t({ en: "Reads", is: "Les" })} <b className="font-semibold text-slate-700">{t({ en: "Macro · fixtures · Demands", is: "Makró · leiki · Kröfur" })}</b></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2740e6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          <span>{t({ en: "Flows to", is: "Flæðir í" })} <b className="font-semibold text-[#2740e6]">{t({ en: "Week Setup · PDF", is: "Vikuuppsetningu · PDF" })}</b></span>
        </div>
      </div>

      {/* Four plain facts */}
      <div className="grid grid-cols-2 gap-px border-y border-[#ebe9e3] bg-[#ebe9e3] sm:grid-cols-4">
        {tile({ en: "Sessions / week", is: "Æfingar / viku" }, sess,
          games ? t({ en: `+ assumed Sat. game from ${d(games)}`, is: `+ áætlaður lau.-leikur frá ${d(games)}` })
            : gamesBy === "off" ? t({ en: "no assumed weekend games", is: "engir áætlaðir helgarleikir" })
              : t({ en: "games from the first friendly", is: "leikir frá fyrsta æfingaleik" }))}
        {tile({ en: hasMult ? "Load ramp (× a match)" : "Load ramp", is: hasMult ? "Álagsrampur (× leikur)" : "Álagsrampur" },
          hasMult ? <>{fx(val(0))}× <span className="font-medium text-slate-500">→</span> {fx(val(peakIdx))}×</> : "—",
          t({ en: `week 1 → peak in week ${peakIdx + 1}`, is: `vika 1 → toppur í viku ${peakIdx + 1}` }))}
        {tile({ en: "Light last week", is: "Létt lokavika" }, lightIdx >= 0 && taper > 0 ? `−${taper}%` : t({ en: "none", is: "engin" }),
          t({ en: `research ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}%`, is: `rannsóknir ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}%` }))}
        {tile({ en: "Friendlies", is: "Æfingaleikir" }, friendlies.length,
          friendlies.length ? friendlies.map(d).join(" · ") : t({ en: "none entered — add below", is: "engir skráðir — bættu við hér fyrir neðan" }), !friendlies.length)}
      </div>

      {/* Week by week: load bars coloured by meso cycle, games under the weeks, the cycles below */}
      <div className="flex flex-col gap-2.5 px-5 pb-6 pt-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[14px] font-semibold text-[#14181c]">{t({ en: "Weekly load & meso cycles", is: "Vikuálag & mesó-lotur" })}</h3>
          <div className="flex flex-wrap gap-3.5 text-[12px] text-slate-600">
            {(["accum", "transmute", "realize"] as const).filter((g) => prop.blocks.some((b) => b.goalKey === g)).map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: GOAL_BAR[g] }} />{t(BLOCK_GOAL_LABEL[g])}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#de9328]" />{t({ en: "Game", is: "Leikur" })}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-[#de9328]" />{t({ en: "Assumed game", is: "Áætlaður leikur" })}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid h-[120px] items-end gap-1 pt-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {weeks.map((w, i) => {
                const bi = blockOf(w.weekStart);
                const color = w.target.taper ? TAPER_BAR : bi >= 0 && bi < baseBlocks ? BASE_BAR : GOAL_BAR[w.goalKey] ?? GOAL_BAR.accum;
                const label = hasMult && (i === 0 || i === peakIdx || i === lightIdx) ? `${fx(val(i))}×` : "";
                return (
                  <div key={w.weekStart} className="flex h-full flex-col items-center justify-end gap-1" title={`${t({ en: "Week", is: "Vika" })} ${i + 1} · ${d(w.weekStart)}${hasMult ? ` · ${fx(val(i))}×` : ""}`}>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-700">{label}</span>
                    <div className="w-full rounded-t-[4px] rounded-b-[2px]" style={{ height: `${Math.round(16 + (val(i) / maxV) * 72)}px`, background: color }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {weeks.map((w, i) => {
                const entered = w.friendlies.length > 0 || i === openerWeek;
                const gameTitle = i === openerWeek && opener ? `${t({ en: "Opener", is: "Fyrsti leikur" })} · ${d(opener)}` : w.friendlies.length ? `${t({ en: "Friendly", is: "Æfingaleikur" })} · ${w.friendlies.map(d).join(", ")}` : w.assumedGame ? `${t({ en: "Assumed game", is: "Áætlaður leikur" })} · ${d(w.assumedGame.date)}` : "";
                return (
                  <div key={w.weekStart} className="flex h-[30px] flex-col items-center gap-[3px]">
                    <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
                    {entered ? <span title={gameTitle} className="h-2 w-2 rounded-full bg-[#de9328]" />
                      : w.assumedGame ? <span title={gameTitle} className="h-2 w-2 rounded-full border-2 border-[#de9328]" /> : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {prop.blocks.map((b, bi) => {
                const isBase = bi < baseBlocks;
                const last = bi === prop.blocks.length - 1;
                return (
                  <div key={b.start} className={`flex min-w-0 flex-col gap-0.5 rounded-[10px] border px-3 py-2.5 ${isBase ? "border-dashed border-[#9aa8f2] bg-[#eef0fd] text-[#1b2da8]" : GOAL_CHIP[b.goalKey]}`} style={{ gridColumn: `span ${Math.max(1, b.weeks)}` }}>
                    <span className="truncate text-[13px] font-semibold">{t({ en: "Block", is: "Lota" })} {b.index + 1}{isBase ? t({ en: " · base", is: " · grunnur" }) : last && opener ? t({ en: " → opener", is: " → fyrsti leikur" }) : ""}</span>
                    <span className="truncate text-[12px] text-slate-600">{d(b.start)}–{d(addDays(b.end, -1))} · {b.weeks} {t({ en: "wk", is: "v" })}</span>
                    <span className="truncate text-[11px] text-slate-600">{t(BLOCK_GOAL_LABEL[b.goalKey])}{isBase ? t({ en: " · flexes", is: " · sveigjanleg" }) : last && lightIdx >= 0 && taper > 0 ? t({ en: " · light last week", is: " · létt lokavika" }) : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {prop.gaps.length > 0 && (
          <ul className="space-y-0.5 text-[12px] font-medium text-[#8a5a10]">{prop.gaps.map((g, i) => <li key={i}>⚠ {t(g)}</li>)}</ul>
        )}
      </div>
    </section>
  );
}

/** Add a game (friendly or league) from the setup card. Writes through the hub's fixture write; the plan re-reads. */
export function AddGame({ is, addGame, inputId = "ps-addgame" }: { is: boolean; addGame: (date: string, kind: "friendly" | "competitive") => Promise<boolean>; inputId?: string }) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const [date, setDate] = React.useState("");
  const [kind, setKind] = React.useState<"friendly" | "competitive">("friendly");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy(true);
    try { if (await addGame(date, kind)) setDate(""); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[12px] font-medium text-slate-700">{t({ en: "Add a game", is: "Skrá leik" })}</label>
      <div className="flex gap-1.5">
        <input id={inputId} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-[#d6d3cc] bg-white px-2.5 text-[14px]" />
        <button type="button" onClick={submit} disabled={!date || busy} className="h-11 rounded-lg border border-[#2740e6] bg-white px-3.5 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-40">{busy ? "…" : t({ en: "Add", is: "Bæta við" })}</button>
      </div>
      <select value={kind} onChange={(e) => setKind(e.target.value as "friendly" | "competitive")} aria-label={t({ en: "Game type", is: "Tegund leiks" })} className="w-fit rounded border-0 bg-transparent p-0 text-[11px] text-slate-600">
        <option value="friendly">{t({ en: "Friendly", is: "Æfingaleikur" })}</option>
        <option value="competitive">{t({ en: "League game", is: "Deildarleikur" })}</option>
      </select>
    </div>
  );
}
