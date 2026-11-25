"use client";

/**
 * The Macro tab's setup cards — Macro is the ONE place a season is set up (frame → games → breaks), and Meso +
 * Micro only read it. Three cards + a gate:
 *  - `MacroSetupChecklist`: verdict + the three steps (frame saved · first league game · breaks).
 *  - `MacroFixturesCard`: the season's entered games (list, add, remove) — writes go through the hub's single
 *    fixture path (`writeFixture` → match_schedule).
 *  - `MacroBreaksCard`: every declared break (list, remove) + a free-form "add a break" (any dates, any sport).
 *  - `MacroSetupGate`: the "set up Macro first" empty state the Meso + Micro tabs show when there is no season.
 * Descriptive planning only — never a readiness colour.
 */

import * as React from "react";

export type MacroFixture = { date: string; opponent: string | null; competition: string | null; isFriendly: boolean };
export type MacroBreak = { id: string; start_date: string; end_date: string; label: string | null };

const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
const h2 = "text-[15px] font-bold text-slate-900";
const input = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]";

function shortDate(iso: string, is: boolean): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
function weekday(iso: string, is: boolean): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString(is ? "is-IS" : "en-GB", { weekday: "short", timeZone: "UTC" });
}

/** The first league (non-friendly) game in a list, or null. */
export function firstLeagueGame(list: MacroFixture[]): MacroFixture | null {
  return [...list].filter((f) => !f.isFriendly).sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
}

// ─── Checklist ────────────────────────────────────────────────────────────────────────────────────────────

export function MacroSetupChecklist({ is, frameSaved, frameDirty, leagueGame, estimatedOpener, friendlies, breaks }: {
  is: boolean;
  /** Pre-season start + season end are saved on the season. */
  frameSaved: boolean;
  /** The frame has edits that are not saved yet. */
  frameDirty: boolean;
  leagueGame: string | null;
  estimatedOpener: string | null;
  /** Friendlies before the first league game. */
  friendlies: number;
  breaks: number;
}) {
  const steps: Array<{ done: boolean; optional?: boolean; title: string; detail: string }> = [
    {
      done: frameSaved && !frameDirty,
      title: is ? "Tímabilsrammi" : "Season frame",
      detail: frameDirty ? (is ? "óvistaðar breytingar" : "unsaved changes") : frameSaved ? (is ? "vistað" : "saved") : (is ? "settu upphaf undirbúnings og tímabilslok" : "set the pre-season start and season end"),
    },
    {
      done: !!leagueGame,
      title: is ? "Leikir" : "Games",
      detail: [
        leagueGame ? `${is ? "fyrsti deildarleikur" : "first league game"} ${shortDate(leagueGame, is)}`
          : estimatedOpener ? `${is ? "fyrsti deildarleikur áætlaður" : "first league game estimated"} ${shortDate(estimatedOpener, is)}`
            : (is ? "enginn deildarleikur" : "no league game"),
        is ? `${friendlies} æfingaleik${friendlies === 1 ? "ur" : "ir"}` : `${friendlies} friendl${friendlies === 1 ? "y" : "ies"}`,
      ].join(" · "),
    },
    {
      done: breaks > 0, optional: true,
      title: is ? "Frí" : "Breaks",
      detail: breaks > 0 ? (is ? `${breaks} skráð` : `${breaks} entered`) : (is ? "valfrjálst" : "optional"),
    },
  ];
  const ready = steps[0].done && steps[1].done;
  const next = steps.find((s) => !s.done && !s.optional);
  const verdict = ready
    ? (is ? "Tímabilið er sett upp. Mesó og Míkró lesa það héðan." : "The season is set up. Meso and Micro read it from here.")
    : next === steps[0] && frameDirty
      ? (is ? "Vistaðu rammann svo Mesó og Míkró lesi hann." : "Save the frame so Meso and Micro read it.")
      : (is ? `Næsta skref: ${next?.title.toLowerCase()}.` : `Next step: ${next?.title.toLowerCase()}.`);
  return (
    <section className={card}>
      <p className="text-[15px] font-bold text-slate-900">{verdict}</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${s.done ? "border-[#1c7a4a]/30 bg-[#1c7a4a]/5" : s.optional ? "border-slate-200 bg-slate-50" : "border-[#de9328]/40 bg-[#de9328]/5"}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? "bg-[#1c7a4a] text-white" : "border border-slate-300 bg-white text-slate-500"}`}>{s.done ? "✓" : i + 1}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-slate-800">{s.title}</span>
              <span className="block text-[12px] text-slate-600">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] text-slate-500">{is
        ? "Ef leikjaplanið er ekki komið gerir Mesó: Undirbúningur ráð fyrir laugardagsleikjum frá þeim degi sem þú velur þar."
        : "If the fixture list isn't out yet, Meso: Pre-season assumes Saturday games from the day you pick there."}</p>
    </section>
  );
}

// ─── Games ────────────────────────────────────────────────────────────────────────────────────────────────

export function MacroFixturesCard({ is, seasonYear, fixtures, upcoming, nextSeasonYear, todayIso, onAdd, onRemove, onOpenYear, importSlot }: {
  is: boolean;
  seasonYear: number;
  fixtures: MacroFixture[];
  /** The next season's games already entered (shown as a pointer, not editable here). */
  upcoming: MacroFixture[];
  nextSeasonYear: number | null;
  todayIso: string;
  onAdd: (date: string, kind: "friendly" | "league", opponent: string) => Promise<boolean>;
  onRemove: (date: string) => Promise<boolean>;
  onOpenYear?: (year: number) => void;
  /** e.g. the KKÍ link import, rendered under the add form. */
  importSlot?: React.ReactNode;
}) {
  const [date, setDate] = React.useState("");
  const [kind, setKind] = React.useState<"friendly" | "league">("friendly");
  const [opponent, setOpponent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  const sorted = [...fixtures].sort((a, b) => (a.date < b.date ? -1 : 1));
  const league = firstLeagueGame(sorted);
  const friendlies = sorted.filter((f) => f.isFriendly && (!league || f.date < league.date)).length;
  const leagueCount = sorted.filter((f) => !f.isFriendly).length;
  // Upcoming games first: a long league list collapses to the next 8 (played ones stay behind "show all").
  const upcomingFirst = sorted.filter((f) => f.date >= todayIso);
  const shown = showAll ? sorted : (upcomingFirst.length ? upcomingFirst : sorted).slice(0, 8);
  const hidden = sorted.length - shown.length;

  const verdict = league
    ? (is ? `Undirbúningur endar við fyrsta deildarleikinn ${shortDate(league.date, is)}.` : `Pre-season ends at the first league game, ${shortDate(league.date, is)}.`)
    : (is ? "Enginn deildarleikur skráður: settu fyrsta deildarleikinn svo undirbúningurinn fái endadag." : "No league game entered: add the first league game so the pre-season has an end date.");

  async function add() {
    if (!date) return;
    setBusy(true);
    const ok = await onAdd(date, kind, opponent.trim());
    setBusy(false);
    if (ok) { setDate(""); setOpponent(""); }
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className={h2}>{is ? `Leikir ${seasonYear}` : `Games ${seasonYear}`}</h2>
        <span className="text-[12px] text-slate-500">{is ? "einn staður fyrir leikjaskrána — Mesó og Míkró lesa hana" : "one place for the fixture list — Meso and Micro read it"}</span>
      </div>
      <p className="mt-1.5 text-[13px] font-semibold text-slate-800">{verdict}</p>
      <p className="mt-0.5 text-[12px] text-slate-600">{is
        ? `${leagueCount} deildar-/keppnisleik${leagueCount === 1 ? "ur" : "ir"} · ${friendlies} æfingaleik${friendlies === 1 ? "ur" : "ir"} í undirbúningi. Æfingaleikir enda ekki undirbúninginn.`
        : `${leagueCount} league/cup game${leagueCount === 1 ? "" : "s"} · ${friendlies} friendl${friendlies === 1 ? "y" : "ies"} in pre-season. Friendlies don't end the pre-season.`}</p>

      {sorted.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {shown.map((f) => (
            <li key={f.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
              <span className="w-24 text-[13px] font-semibold tabular-nums text-slate-800">{weekday(f.date, is)} {shortDate(f.date, is)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.isFriendly ? "bg-slate-100 text-slate-600" : "bg-[#2740e6]/10 text-[#2740e6]"}`}>{f.isFriendly ? (is ? "Æfingaleikur" : "Friendly") : (is ? "Deild/keppni" : "League/cup")}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">{f.opponent && f.opponent !== "Friendly" && f.opponent !== "TBD" ? f.opponent : ""}{league && f.date === league.date ? <b className="ml-1 text-[12px] text-[#2740e6]">{is ? "· fyrsti deildarleikur" : "· first league game"}</b> : null}</span>
              <button type="button" onClick={() => void onRemove(f.date)} title={is ? "Eyða leik" : "Remove game"} aria-label={is ? "Eyða leik" : "Remove game"} className="rounded px-1.5 text-[13px] text-slate-400 hover:bg-[#a83e28]/10 hover:text-[#a83e28]">✕</button>
            </li>
          ))}
        </ul>
      )}
      {(hidden > 0 || showAll) && sorted.length > 8 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-[12px] font-semibold text-[#2740e6] hover:underline">
          {showAll ? (is ? "Sýna færri" : "Show fewer") : (is ? `Sýna alla ${sorted.length} leiki` : `Show all ${sorted.length} games`)}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Dagur" : "Date"}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Tegund" : "Type"}
          <select value={kind} onChange={(e) => setKind(e.target.value as "friendly" | "league")} className={input}>
            <option value="friendly">{is ? "Æfingaleikur" : "Friendly"}</option>
            <option value="league">{is ? "Deildar-/keppnisleikur" : "League/cup game"}</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Mótherji (valfrjálst)" : "Opponent (optional)"}
          <input type="text" value={opponent} onChange={(e) => setOpponent(e.target.value)} className={`${input} min-w-[8rem]`} />
        </label>
        <button type="button" onClick={() => void add()} disabled={!date || busy} className="h-9 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{is ? "+ Bæta við leik" : "+ Add game"}</button>
      </div>
      {importSlot && <div className="mt-3">{importSlot}</div>}

      {upcoming.length > 0 && nextSeasonYear && nextSeasonYear !== seasonYear && (
        <p className="mt-3 text-[12px] text-slate-600">
          {is ? `${upcoming.length} leikir þegar skráðir fyrir ${nextSeasonYear}.` : `${upcoming.length} games already entered for ${nextSeasonYear}.`}{" "}
          {onOpenYear && <button type="button" onClick={() => onOpenYear(nextSeasonYear)} className="font-semibold text-[#2740e6] hover:underline">{is ? `Opna ${nextSeasonYear} →` : `Open ${nextSeasonYear} →`}</button>}
        </p>
      )}
    </section>
  );
}

// ─── Breaks ───────────────────────────────────────────────────────────────────────────────────────────────

export function MacroBreaksCard({ is, breaks, onAdd, onRemove, hasWindows }: {
  is: boolean;
  breaks: MacroBreak[];
  onAdd: (start: string, end: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** The international-window shortcut card is shown further down. */
  hasWindows: boolean;
}) {
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const invalid = !start || !end || end < start;
  const sorted = [...breaks].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const days = (b: MacroBreak) => Math.round((Date.parse(`${b.end_date}T00:00:00Z`) - Date.parse(`${b.start_date}T00:00:00Z`)) / 86_400_000) + 1;

  async function add() {
    if (invalid) return;
    setBusy(true);
    await onAdd(start, end, label.trim() || (is ? "Frí" : "Break"));
    setBusy(false);
    setStart(""); setEnd(""); setLabel("");
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className={h2}>{is ? "Frí" : "Breaks"}</h2>
        <span className="text-[12px] text-slate-500">{is ? "valfrjálst — frídagar verða frí í Mesó og Míkró" : "optional — break days become days off in Meso and Micro"}</span>
      </div>
      {sorted.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {sorted.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="text-[13px] font-semibold tabular-nums text-slate-800">{shortDate(b.start_date, is)}–{shortDate(b.end_date, is)}</span>
              <span className="text-[12px] text-slate-500">{days(b)} {is ? "dagar" : "days"}</span>
              {b.label && <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{b.label}</span>}
              <button type="button" onClick={() => void onRemove(b.id)} title={is ? "Fjarlægja frí" : "Remove break"} aria-label={is ? "Fjarlægja frí" : "Remove break"} className="ml-auto rounded px-1.5 text-[13px] text-slate-400 hover:bg-[#a83e28]/10 hover:text-[#a83e28]">✕</button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-1.5 text-[12px] text-slate-600">{is ? "Ekkert frí skráð." : "No breaks entered."}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Frá" : "From"}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Til" : "To"}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Heiti (valfrjálst)" : "Label (optional)"}
          <input type="text" value={label} placeholder={is ? "t.d. Jólafrí" : "e.g. Christmas break"} onChange={(e) => setLabel(e.target.value)} className={`${input} min-w-[8rem]`} />
        </label>
        <button type="button" onClick={() => void add()} disabled={invalid || busy} className="h-9 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{is ? "+ Bæta við fríi" : "+ Add break"}</button>
      </div>
      {hasWindows && <p className="mt-2 text-[11px] text-slate-500">{is ? "Landsleikjagluggarnir neðar á síðunni eru flýtileið að sama fríi." : "The international windows further down are a shortcut to the same breaks."}</p>}
    </section>
  );
}

// ─── Gate (Meso / Micro) ──────────────────────────────────────────────────────────────────────────────────

export function MacroSetupGate({ is, onOpenMacro, seasonYear }: { is: boolean; onOpenMacro: () => void; seasonYear: number }) {
  return (
    <section className={card}>
      <p className="text-[15px] font-bold text-slate-900">{is ? "Settu upp Makró-lotu fyrst." : "Set up the Macro cycle first."}</p>
      <p className="mt-1 text-[13px] text-slate-600">{is
        ? `Ekkert tímabil er til fyrir ${seasonYear}. Mesó og Míkró lesa tímabilsrammann, leikina og fríin úr Makró — fylltu þau út og vistaðu þar.`
        : `There is no season for ${seasonYear} yet. Meso and Micro read the season frame, games and breaks from Macro — fill them in and save there.`}</p>
      <button type="button" onClick={onOpenMacro} className="mt-3 h-9 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:brightness-110">{is ? "Opna Makró-lotu →" : "Open Macro cycle →"}</button>
    </section>
  );
}
