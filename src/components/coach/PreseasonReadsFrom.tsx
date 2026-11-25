"use client";

/**
 * Top of the hub's Pre-season tab: what the plan is and where it comes from. The pre-season is read straight
 * from the Macro cycle (its dates), the first league game and the friendlies the team has entered; a week with
 * no game follows the rules (a training week of the coach's sessions a week, or an assumed Saturday game from
 * the coach's "Weekend games from" date). No draft, no build step — the user's call 2026-11-25.
 *
 * Layered read: the verdict (rule-based) → what it reads from + what's missing → the detail below on the tab.
 */

import * as React from "react";
import type { PreseasonProposal } from "@/lib/micropulse/periodization/preseasonProposal";

type Bi = { en: string; is: string };
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

export default function PreseasonReadsFrom({ is, prop, opener, openerEstimated, onOpenMacro, addGame }: {
  is: boolean;
  prop: PreseasonProposal;
  /** The first league game (the season's opener) — null when none is entered. */
  opener: string | null;
  openerEstimated: boolean;
  onOpenMacro: () => void;
  /** Writes a fixture to match_schedule; the plan re-reads on success. */
  addGame: (date: string, kind: "friendly" | "competitive") => Promise<boolean>;
}) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const d = (iso: string) => (is ? `${Number(iso.slice(8, 10))}. ${MON_IS[Number(iso.slice(5, 7)) - 1]}` : `${Number(iso.slice(8, 10))} ${MON_EN[Number(iso.slice(5, 7)) - 1]}`);
  const [date, setDate] = React.useState("");
  const [kind, setKind] = React.useState<"friendly" | "competitive">("friendly");
  const [busy, setBusy] = React.useState(false);

  const friendlies = prop.engine.fixtures.filter((f) => f !== opener);
  const entered = new Set(prop.engine.fixtures);
  const assumed = prop.weeks.flatMap((w) => w.days).filter((x) => x.type === "match" && !entered.has(x.date) && x.date !== opener).length;
  const games = prop.weekendGames.from;
  const gamesBy = prop.weekendGames.by;
  const sess = prop.settings.sessionsPerWeek;

  const row = (label: Bi, value: React.ReactNode, missing = false) => (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="w-40 shrink-0 text-[12px] font-medium text-slate-500">{t(label)}</dt>
      <dd className={`min-w-0 text-[13px] ${missing ? "font-semibold text-[#8a5a10]" : "text-slate-800"}`}>{value}</dd>
    </div>
  );

  const submit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy(true);
    try { if (await addGame(date, kind)) setDate(""); } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[17px] font-bold leading-snug text-slate-900" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{t(prop.verdict)}</p>
      <dl className="mt-3 space-y-1.5">
        {row({ en: "Macro cycle", is: "Makró-lota" }, <>
          {t({ en: `Pre-season ${d(prop.window.start)} → ${d(prop.window.end)}, ${prop.window.weeks} weeks`, is: `Undirbúningur ${d(prop.window.start)} → ${d(prop.window.end)}, ${prop.window.weeks} vikur` })}
          {" · "}<button type="button" onClick={onOpenMacro} className="font-medium text-[#2740e6] hover:underline">{t({ en: "change in Macro cycle", is: "breyta í Makró-lotu" })}</button>
        </>)}
        {row({ en: "First league game", is: "Fyrsti deildarleikur" },
          !opener ? t({ en: "not entered — add it below", is: "ekki skráður — bættu honum við hér fyrir neðan" })
            : openerEstimated ? t({ en: `an estimate (${d(opener)}) — enter the real date below`, is: `áætlaður (${d(opener)}) — skráðu rétta dagsetningu hér fyrir neðan` })
              : d(opener),
          !opener || openerEstimated)}
        {row({ en: "Friendlies", is: "Æfingaleikir" }, friendlies.length ? friendlies.map(d).join(", ") : t({ en: "none entered — add them below", is: "engir skráðir — bættu þeim við hér fyrir neðan" }), !friendlies.length)}
        {row({ en: "Weeks without a game", is: "Vikur án leiks" }, games
          ? t({ en: `${sess} sessions a week until ${d(games)}${gamesBy === "first_friendly" ? " (the first friendly)" : ""}, then an assumed Saturday game every week with none entered (${assumed} weeks)`, is: `${sess} æfingar á viku til ${d(games)}${gamesBy === "first_friendly" ? " (fyrsti æfingaleikur)" : ""}, síðan áætlaður laugardagsleikur í hverri viku án skráðs leiks (${assumed} vikur)` })
          : gamesBy === "off"
            ? t({ en: `${sess} sessions a week, no assumed games (you chose no weekend games)`, is: `${sess} æfingar á viku, engir áætlaðir leikir (þú valdir enga helgarleiki)` })
            : t({ en: `${sess} sessions a week. Assumed Saturday games start at the first friendly you enter`, is: `${sess} æfingar á viku. Áætlaðir laugardagsleikir byrja á fyrsta æfingaleik sem þú skráir` }))}
      </dl>
      {prop.gaps.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-[#8a5a10]">{prop.gaps.map((g, i) => <li key={i}>⚠ {t(g)}</li>)}</ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-[12px] font-semibold text-slate-700">{t({ en: "Add a game", is: "Skrá leik" })}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t({ en: "Game date", is: "Dagsetning leiks" })} className="h-8 rounded-lg border border-slate-300 px-2 text-[13px]" />
        <select value={kind} onChange={(e) => setKind(e.target.value as "friendly" | "competitive")} aria-label={t({ en: "Game type", is: "Tegund leiks" })} className="h-8 rounded-lg border border-slate-300 px-2 text-[13px]">
          <option value="friendly">{t({ en: "Friendly", is: "Æfingaleikur" })}</option>
          <option value="competitive">{t({ en: "League game", is: "Deildarleikur" })}</option>
        </select>
        <button type="button" onClick={submit} disabled={!date || busy} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-slate-50 disabled:opacity-40">{busy ? "…" : t({ en: "+ Add", is: "+ Bæta við" })}</button>
        <span className="text-[11px] text-slate-400">{t({ en: "The plan re-reads at once.", is: "Planið uppfærist strax." })}</span>
      </div>
    </section>
  );
}
