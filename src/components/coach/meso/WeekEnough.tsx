"use client";

/**
 * "Did we do enough?" as a total — the week (Micro tab card, a badge per week on the Meso tab) and the block (one line
 * in the block summary). Layered read: (0) the verdict → (1) 2–3 plain facts, confidence, what would have flipped it,
 * one bar per judged movement type → (2) planned / done / % per variable and day by day behind "Show details".
 * Rules decide (sessionEnough/weekEnough); descriptive only — never the readiness colour.
 */

import * as React from "react";
import ShowDetails from "@/components/common/ShowDetails";
import type { PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import type { TeamVerdict } from "@/lib/micropulse/sessionEnough";
import { ENOUGH_TECH } from "@/lib/micropulse/sessionEnough";
import {
  buildWeekEnough, dayTypeName, DOW, WEEK_ENOUGH_CITATIONS, WEEK_KEYS, WEEK_LABEL,
  type BlockEnough, type DayRole, type PlanWeek, type WeekEnough, type WeekKey,
} from "@/lib/micropulse/sessionEnough/weekEnough";
import { useWeekEnoughActuals } from "./useWeekEnough";

type Bi = { en: string; is: string };

const TONE: Record<TeamVerdict, { box: string; chip: string }> = {
  yes: { box: "border-[#1c7a4a] bg-[#1c7a4a]/[0.07] text-[#14181c]", chip: "bg-[#1c7a4a]/10 text-[#15603a]" },
  mostly: { box: "border-[#de9328] bg-[#de9328]/[0.09] text-[#14181c]", chip: "bg-[#de9328]/15 text-[#7a4a06]" },
  no: { box: "border-[#a83e28] bg-[#a83e28]/[0.07] text-[#14181c]", chip: "bg-[#a83e28]/10 text-[#8a2f1c]" },
};
export const VERDICT_WORD: Record<TeamVerdict, Bi> = {
  yes: { en: "Enough", is: "Nóg" }, mostly: { en: "Mostly", is: "Að mestu" }, no: { en: "Not enough", is: "Ekki nóg" },
};
const BAR: Record<PvaStatus, string> = {
  on: "bg-[#1c7a4a]", over: "bg-[#1c7a4a]", well_over: "bg-[#de9328]", under: "bg-[#de9328]", well_under: "bg-[#a83e28]", na: "bg-slate-300",
};
const CELL: Record<PvaStatus, string> = {
  on: "text-[#15603a]", over: "text-[#15603a]", well_over: "text-[#7a4a06]", under: "text-[#7a4a06]", well_under: "text-[#8a2f1c]", na: "text-slate-400",
};
const CONF: Record<"high" | "moderate" | "low", Bi> = { high: { en: "high", is: "há" }, moderate: { en: "moderate", is: "miðlungs" }, low: { en: "low", is: "lág" } };
const ROLE: Record<DayRole, Bi> = {
  counted: { en: "counted", is: "talið" }, extra: { en: "extra (planned off)", is: "aukaæfing (planað frí)" }, no_data: { en: "no data", is: "engin gögn" },
  topup_few: { en: "top-up, too few non-starters", is: "áfylling, of fáir" }, upcoming: { en: "not yet", is: "ekki komið" }, off: { en: "off", is: "frí" }, match: { en: "match", is: "leikur" },
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
const KEY_TECH: Record<WeekKey, string> = {
  imaAccel: ENOUGH_TECH.imaAccel, imaDecel: ENOUGH_TECH.imaDecel, imaCod: ENOUGH_TECH.imaCod, hsr: ENOUGH_TECH.hsr,
  load: "Catapult Player Load (au)", dist: "GPS total distance (m) — needs GPS",
};

/** A week's verdict as a small chip (the Meso week rows). Nothing when the week has no verdict yet. */
export function WeekEnoughBadge({ is, enough }: { is: boolean; enough: WeekEnough | null }) {
  if (!enough || enough.state !== "ok" || !enough.verdict) return null;
  const v = enough.verdict;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[v].chip}`} title={`${is ? enough.headline.is : enough.headline.en} ${is ? "(Gerðum við nóg? miðað við planið)" : "(Did we do enough? against the plan)"}`}>
      {is ? VERDICT_WORD[v].is : VERDICT_WORD[v].en}{enough.inProgress ? (is ? " hingað til" : " so far") : ""}
    </span>
  );
}

function VarBars({ is, rows }: { is: boolean; rows: WeekEnough["vars"] }) {
  return (
    <div className="mt-3 space-y-1.5">
      {rows.filter((r) => r.judged).map((r) => {
        const w = r.pct == null ? 0 : Math.min(100, (r.pct / 150) * 100);
        return (
          <div key={r.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2 text-[12px]">
            <span className="truncate text-slate-700" title={KEY_TECH[r.key]}>{is ? WEEK_LABEL[r.key].is : WEEK_LABEL[r.key].en}</span>
            <div className="relative h-2.5 rounded-full bg-[#ece9e2]">
              <div className={`absolute inset-y-0 left-0 rounded-full ${BAR[r.status]}`} style={{ width: `${w}%` }} />
              <div className="absolute inset-y-[-2px] w-px bg-[#14181c]" style={{ left: `${(100 / 150) * 100}%` }} title={is ? "Planið" : "The plan"} />
            </div>
            <span className="w-[7.5rem] text-right tabular-nums text-slate-600">{r.pct == null ? (is ? "ekki mælt" : "not measured") : <>{r.pct}% <span className="text-slate-400">{is ? "af plani" : "of plan"}</span></>}</span>
          </div>
        );
      })}
    </div>
  );
}

function VarTable({ is, rows, plannedLabel }: { is: boolean; rows: WeekEnough["vars"]; plannedLabel: Bi }) {
  return (
    <table className="w-full text-[12px]">
      <thead className="text-slate-500">
        <tr className="border-b border-[#e3e0d8] text-left">
          <th className="py-1 pr-2 font-semibold">{is ? "Breyta" : "Variable"}</th>
          <th className="py-1 pr-2 text-right font-semibold">{is ? plannedLabel.is : plannedLabel.en}</th>
          <th className="py-1 pr-2 text-right font-semibold">{is ? "Gert" : "Done"}</th>
          <th className="py-1 pr-2 text-right font-semibold">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={`border-b border-[#ece9e2] ${r.judged ? "" : "text-slate-500"}`}>
            <td className="py-1 pr-2" title={KEY_TECH[r.key]}>{is ? WEEK_LABEL[r.key].is : WEEK_LABEL[r.key].en}{!r.judged && <span className="text-slate-400"> · {is ? "sýnt, ekki metið" : "shown, not judged"}</span>}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.planned)}</td>
            <td className="py-1 pr-2 text-right font-semibold tabular-nums text-[#14181c]">{fmt(r.actual)}</td>
            <td className={`py-1 pr-2 text-right font-semibold tabular-nums ${r.judged ? CELL[r.status] : "text-slate-500"}`}>{r.pct == null ? "—" : `${r.pct}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const METHOD: Bi = {
  en: "Planned = the Meso calendar's numbers for each training day (the team's average match × the day-type share × the block's ramp, with your − / + per variable, the light week, camps and moved days), summed over the days that have passed. Done = the squad median of each session (players with a full session: some movement recorded, 20 min or more, not under 60% of the squad's session length), summed the same way. On a top-up day (MD+1) the players who started the last match (60+ min) recover, so the median of the others is compared. Judged: accelerations, braking, changes of direction and high-speed running (GPS bands 5–6); Player Load and distance are shown only. Enough = 85% of plan or more on a movement type (the session card's threshold); 'short' = most of them under 85%, or two under 60%. Above plan is a note, not a fail. A planned session with no data, and high-speed running indoors (no GPS), are left out of both sides, never counted as 0. The session card on Post-training judges each day against the standard day share, so a week you have set yourself can read differently there.",
  is: "Planað = tölur Mesó-dagatalsins fyrir hvern æfingadag (meðalleikur liðsins × hlutfall dagsgerðar × stígandi lotunnar, með þínum − / + á hverja breytu, léttri viku, æfingabúðum og færðum dögum), lagðar saman yfir dagana sem eru liðnir. Gert = miðgildi hópsins á hverri æfingu (leikmenn með fulla æfingu: einhver hreyfing skráð, 20 mín eða meira, ekki undir 60% af lengd æfingar hópsins), lagt saman á sama hátt. Á áfyllingardegi (MD+1) jafna þeir sig sem byrjuðu síðasta leik (60+ mín), svo miðgildi hinna er borið saman. Metið: hraðaaukningar, hemlun, stefnubreytingar og háhraðahlaup (GPS-bönd 5–6); Player Load og vegalengd eru aðeins sýnd. Nóg = 85% af plani eða meira í hreyfiþætti (sami þröskuldur og á dagsspjaldinu); „ekki nóg“ = flestir undir 85%, eða tveir undir 60%. Yfir plani er athugasemd, ekki fall. Skipulögð æfing án gagna, og háhraðahlaup innanhúss (ekkert GPS), eru tekin út beggja vegna, aldrei talin sem 0. Dagsspjaldið á Eftir æfingu metur hvern dag við staðlaða dagshlutfallið, svo vika sem þú hefur stillt sjálfur getur lesist öðruvísi þar.",
};

/** Pre-season: the friendly is in the plan's week total, so it is in the comparison too. */
const METHOD_PRESEASON: Bi = {
  en: "Pre-season: the plan is the Pre-season tab's week, and its total includes the friendly (the training days are fitted around it). So the friendly counts on both sides: planned = the plan's game-day numbers (a share of a match, 50% of the minutes in week 1 rising to 90% before the opener), done = the squad median that day (players with a full game share, same filters). The league opener is a match, never in the total.",
  is: "Undirbúningur: planið er vika Pre-season-flipans og heildin hennar inniheldur æfingaleikinn (æfingadagarnir eru felldir að honum). Því er æfingaleikurinn talinn báðum megin: planað = tölur plansins fyrir leikdaginn (hluti af leik, 50% af mínútunum í viku 1 upp í 90% fyrir fyrsta leik), gert = miðgildi hópsins þann dag (leikmenn með fullan hlut í leiknum, sömu síur). Fyrsti deildarleikurinn er leikur og aldrei í heildinni.",
};

/** The Micro tab's card: did the open week do what its plan asked? */
export function WeekEnoughCard({ is, enough, loading }: { is: boolean; enough: WeekEnough | null; loading?: boolean }) {
  const L = (b: Bi) => (is ? b.is : b.en);
  if (!enough) return null;
  const title = L({ en: "Did we do enough this week?", is: "Gerðum við nóg í vikunni?" });
  const sub = enough.friendlies
    ? L({ en: "The week's training and friendly against the pre-season plan for it, squad medians.", is: "Æfingar og æfingaleikur vikunnar miðað við undirbúningsplanið fyrir hana, miðgildi hópsins." })
    : L({ en: "The week's training against the Meso plan for it, squad medians.", is: "Æfingar vikunnar miðað við Mesó-planið fyrir hana, miðgildi hópsins." });
  const head = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-[15px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{title}</h3>
      <span className="text-[11px] text-slate-500">{sub}</span>
    </div>
  );
  if (loading) return <section className="rounded-2xl border border-[#e3e0d8] bg-white px-5 py-4 sm:px-6">{head}<p className="mt-2 text-[13px] text-slate-500">{L({ en: "Reading the sessions…", is: "Les æfingarnar…" })}</p></section>;
  if (enough.state !== "ok" || !enough.verdict) {
    return <section className="rounded-2xl border border-[#e3e0d8] bg-white px-5 py-4 sm:px-6">{head}<p className="mt-2 text-[13px] text-slate-600">{L(enough.headline)}</p>{enough.state === "no_data" && <p className="mt-1 text-[12px] text-slate-500">{L(enough.confidence.note)}</p>}</section>;
  }
  const v = enough.verdict;
  return (
    <section className="rounded-2xl border border-[#e3e0d8] bg-white px-5 py-4 sm:px-6">
      {head}
      {/* (0) Verdict */}
      <div className={`mt-3 rounded-lg border-l-4 px-3 py-2 ${TONE[v].box}`}>
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{L(VERDICT_WORD[v])}{enough.inProgress ? L({ en: " · so far", is: " · hingað til" }) : ""}</div>
        <div className="text-[15px] font-semibold leading-snug">{L(enough.headline)}</div>
      </div>
      {/* (1) The plain why */}
      <ul className="mt-2.5 space-y-1 text-[13px] text-slate-700">
        {enough.facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-slate-300">•</span><span>{L(f)}</span></li>)}
      </ul>
      {enough.counterfactual && <p className="mt-2 text-[13px] text-slate-600"><span className="font-medium text-[#14181c]">{L({ en: "What would have flipped it: ", is: "Hvað hefði snúið því: " })}</span>{L(enough.counterfactual)}</p>}
      {enough.overNote && <p className="mt-1.5 text-[12px] text-[#7a4a06]">{L(enough.overNote)}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full border border-[#e3e0d8] bg-[#f4f2ec] px-2 py-0.5 text-[11px] font-medium text-slate-700">{L({ en: "Confidence", is: "Vissa" })}: {L(CONF[enough.confidence.level])}</span>
        <span className="text-[11px] text-slate-500">{L(enough.confidence.note)}</span>
      </div>
      <VarBars is={is} rows={enough.vars} />
      {/* (2) Behind the numbers */}
      <ShowDetails label={{ EN: "Show details — planned vs done, day by day, how it's calculated", IS: "Sýna nánar — planað og gert, dag fyrir dag, útreikningur" }}>
        <div className="overflow-x-auto"><VarTable is={is} rows={enough.vars} plannedLabel={{ en: "Planned (days so far)", is: "Planað (liðnir dagar)" }} /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-slate-500">
              <tr className="border-b border-[#e3e0d8] text-left">
                <th className="py-1 pr-2 font-semibold">{L({ en: "Day", is: "Dagur" })}</th>
                <th className="py-1 pr-2 font-semibold">{L({ en: "Plan", is: "Plan" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Players", is: "Leikmenn" })}</th>
                {WEEK_KEYS.filter((k) => k !== "load" && k !== "dist").map((k) => <th key={k} className="py-1 pr-2 text-right font-semibold" title={KEY_TECH[k]}>{L(WEEK_LABEL[k])}</th>)}
                <th className="py-1 pr-2 font-semibold">{L({ en: "In the total", is: "Í summunni" })}</th>
              </tr>
            </thead>
            <tbody>
              {enough.days.map((d, i) => (
                <tr key={d.date} className="border-b border-[#ece9e2]">
                  <td className="whitespace-nowrap py-1 pr-2 text-slate-800">{L(DOW[i])} <span className="text-slate-400">{d.date.slice(5)}</span></td>
                  <td className="whitespace-nowrap py-1 pr-2 text-slate-600">{L(dayTypeName(d.type, enough.friendlies))}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{d.players || "—"}</td>
                  {WEEK_KEYS.filter((k) => k !== "load" && k !== "dist").map((k) => {
                    const c = d.byKey[k];
                    return <td key={k} className={`whitespace-nowrap py-1 pr-2 text-right tabular-nums ${c.counted ? "text-[#14181c]" : "text-slate-400"}`}>{fmt(c.actual)}<span className="text-[10px] text-slate-400"> / {fmt(c.planned)}</span></td>;
                  })}
                  <td className="whitespace-nowrap py-1 pr-2 text-slate-600">{L(ROLE[d.role])}{d.pct != null ? ` · ${d.pct}%` : ""}{d.noGps ? L({ en: " · no GPS", is: " · ekkert GPS" }) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-400">{L({ en: "Each cell: done (squad median) / planned. Grey = not in the total.", is: "Hver reitur: gert (miðgildi hópsins) / planað. Grátt = ekki í summunni." })}</p>
        </div>
        <div className="mt-4 rounded-lg bg-[#f4f2ec] p-3 text-[11px] leading-relaxed text-slate-600">
          <div className="mb-1 font-semibold text-slate-700">{L({ en: "How this is calculated", is: "Hvernig þetta er reiknað" })}</div>
          <p>{L(METHOD)}</p>
          {enough.friendlies && <p className="mt-1.5">{L(METHOD_PRESEASON)}</p>}
          <p className="mt-1.5 text-slate-500">{L({ en: "Sources: ", is: "Heimildir: " })}{WEEK_ENOUGH_CITATIONS.join(" · ")}</p>
        </div>
      </ShowDetails>
    </section>
  );
}

/** The block summary's line: how many finished weeks hit the plan, and the block's totals behind a toggle. */
export function BlockEnoughLine({ is, block, weeks }: { is: boolean; block: BlockEnough | null; weeks: Array<{ weekNo: number; enough: WeekEnough }> }) {
  const L = (b: Bi) => (is ? b.is : b.en);
  if (!block) return null;
  const rated = weeks.filter((w) => w.enough.state === "ok" && w.enough.verdict);
  const judgedKeys = WEEK_KEYS.filter((k) => k !== "load" && k !== "dist");
  return (
    <div className="px-5 pb-1 pt-4 sm:px-7">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-slate-700">
        <span className="font-semibold text-[#14181c]">{L({ en: "Did we do enough?", is: "Gerðum við nóg?" })}</span>
        {block.verdict && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[block.verdict].chip}`} title={L({ en: "The block's total so far against its plan", is: "Samtala lotunnar hingað til miðað við planið" })}>{L(VERDICT_WORD[block.verdict])}</span>}
        <span>{L(block.line)}</span>
      </div>
      <ShowDetails label={{ EN: "Show the weeks and the block's totals", IS: "Sýna vikurnar og samtölu lotunnar" }} className="mt-2">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-slate-500">
              <tr className="border-b border-[#e3e0d8] text-left">
                <th className="py-1 pr-2 font-semibold">{L({ en: "Week", is: "Vika" })}</th>
                {judgedKeys.map((k) => <th key={k} className="py-1 pr-2 text-right font-semibold" title={KEY_TECH[k]}>{L(WEEK_LABEL[k])}</th>)}
                <th className="py-1 pr-2 font-semibold">{L({ en: "Verdict", is: "Mat" })}</th>
              </tr>
            </thead>
            <tbody>
              {rated.map((w) => (
                <tr key={w.weekNo} className="border-b border-[#ece9e2]">
                  <td className="whitespace-nowrap py-1 pr-2 text-slate-800">{L({ en: `Week ${w.weekNo}`, is: `Vika ${w.weekNo}` })}{w.enough.inProgress ? L({ en: " (so far)", is: " (hingað til)" }) : ""}</td>
                  {judgedKeys.map((k) => { const r = w.enough.vars.find((x) => x.key === k)!; return <td key={k} className={`py-1 pr-2 text-right font-semibold tabular-nums ${CELL[r.status]}`}>{r.pct == null ? "—" : `${r.pct}%`}</td>; })}
                  <td className="py-1 pr-2"><WeekEnoughBadge is={is} enough={w.enough} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3"><VarTable is={is} rows={block.vars} plannedLabel={{ en: "Planned (block so far)", is: "Planað (lotan hingað til)" }} /></div>
          <p className="mt-1 text-[10px] text-slate-400">{L({ en: "% of each week's plan. Same rule as the Micro tab's week card (85% = enough). Squad medians of full sessions.", is: "% af plani hverrar viku. Sama regla og vikuspjaldið í Míkró (85% = nóg). Miðgildi hópsins á fullum æfingum." })}</p>
        </div>
      </ShowDetails>
    </div>
  );
}

const addDaysIso = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The Micro tab's slot: reads the open week's sessions and shows the card. Nothing outside the pre-season and
 *  in-season plans (`plan` null), for a team without Vector Pro, or when the read failed. */
export function MicroWeekEnough({ is, plan }: { is: boolean; plan: { week: PlanWeek; friendlies: { opener: string | null } | null } | null }) {
  const week = plan?.week ?? null, friendlies = plan?.friendlies ?? null;
  const ws = week?.weekStart ?? null;
  const actual = useWeekEnoughActuals(ws, ws ? addDaysIso(ws, 6) : null);
  const today = new Date().toISOString().slice(0, 10);
  const enough = React.useMemo(() => (week ? buildWeekEnough({ week, actual: actual.days, today, friendlies }) : null), [week, actual.days, today, friendlies]);
  if (!week || actual.state === "not_available" || actual.state === "error") return null;
  return <div className="mt-3"><WeekEnoughCard is={is} enough={enough} loading={actual.state === "loading"} /></div>;
}
