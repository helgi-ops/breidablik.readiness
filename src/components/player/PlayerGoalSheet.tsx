"use client";

/**
 * "My goal" (lota 2): the player asks to improve one quality (top speed, acceleration, braking, vertical jump).
 * The coach reviews a plan built by rules from the player's own data and approves or declines it. Once approved,
 * each day's session shows on Today (PlayerGoalTodayCard, lota 3); this sheet shows the status and the answer.
 *
 * Opened from Today → See more. It reads nothing until it is opened, so Today's first load is unchanged.
 * Plain words only: no sport-science terms, no colour, no load numbers.
 *
 * Lota 7: when the player picks a quality, the rules check whether another one is a clear weakness (bottom third of
 * the same position on the team) while the picked one is not, and if so suggest it. The player decides (switch or
 * keep); the coach sees the same read and the choice. Read once, on the first pick.
 *
 * Lota 7b: for the picked (or suggested) quality, one plain line on why it matters in a game, and behind a click
 * what improves it, each line with its study (`qualityWhy.ts`, fixed text, not AI).
 *
 * Goals step 3 (2026-11-18): when the player's force-plate tests point to a gym goal (DSI against the team: lower
 * third → Explosive power, upper third → Maximal strength), the list opens with that suggestion and marks the button
 * "Suggested". Rules, not AI; the player chooses. It replaces the suggestion the retired "+1 set" goal had.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi, GoalQuality } from "@/lib/micropulse/goalPlan/types";
import { PLAYER_NOTE_MAX } from "@/lib/micropulse/goalPlan/requests";
import type { GoalHistoryItem } from "@/lib/micropulse/goalPlan/history";
import { Q_DAT, type PriorityView } from "@/lib/micropulse/goalPlan/priority";
import { QUALITY_WHY, WHY_FOOTER, refShort, whyTitles } from "@/lib/micropulse/goalPlan/qualityWhy";

type Suggestion = { suggested: GoalQuality; view: PriorityView } | null;
/** The force-plate (DSI) suggestion of a gym goal (goalSuggestion.ts). */
type DsiSuggestion = { goal: GoalQuality; reasonEN: string; reasonIS: string; cmjDate: string; imtpDate: string; confidence: "high" | "moderate"; source: string };

type Eligibility = { quality: GoalQuality; blocked: string | null; blockedText: Bi | null };
type Current = {
  id: string;
  quality: GoalQuality;
  status: "requested" | "approved" | "declined" | "cancelled" | "paused" | "completed";
  note: string | null;
  requestedAt: string;
  startDate: string | null;
  endDate: string | null;
  coachNote: string | null;
  declineReason: string | null;
  pausedWeek?: number | null;
  /** Started without the coach's approval (player choices on). */
  autoStarted?: boolean;
  /** A waiting request, or an auto-started plan that has not begun. */
  canWithdraw?: boolean;
};

const QUALITY: Record<GoalQuality, { label: Bi; sub: Bi }> = {
  top_speed: { label: { en: "Top speed", is: "Hámarkshraði" }, sub: { en: "Run faster when you are flat out", is: "Hlaupa hraðar á fullri ferð" } },
  acceleration: { label: { en: "Acceleration", is: "Hröðun" }, sub: { en: "Quicker first steps", is: "Snarpari fyrstu skref" } },
  braking: { label: { en: "Braking", is: "Bremsun" }, sub: { en: "Stop and turn more sharply", is: "Stoppa og snúa snarpar" } },
  jump: { label: { en: "Vertical jump", is: "Lóðrétt stökk" }, sub: { en: "Jump higher", is: "Stökkva hærra" } },
  // Gym-only goals (2026-11-18): no extra session, the lifts go into the team strength session.
  max_strength: { label: { en: "Maximal strength", is: "Hámarksstyrkur" }, sub: { en: "Stronger legs · in the team gym session", is: "Sterkari fætur · í styrktaræfingu liðsins" } },
  explosive: { label: { en: "Explosive power", is: "Sprengikraftur" }, sub: { en: "Use your strength faster · in the team gym session", is: "Nýta styrkinn hraðar · í styrktaræfingu liðsins" } },
  strength_power: { label: { en: "Strength + power", is: "Styrkur + sprengikraftur" }, sub: { en: "Both · in the team gym session", is: "Hvort tveggja · í styrktaræfingu liðsins" } },
};
const GYM_ONLY = new Set<GoalQuality>(["max_strength", "explosive", "strength_power"]);
/** What the plan adds to the week, for the "What happens next" line. */
const weekShape = (q: GoalQuality): Bi => GYM_ONLY.has(q)
  ? { en: "two goal days a week inside the team strength session, no extra session; it builds in pre-season and off-season and holds in season", is: "tveir markmiðsdagar á viku inni í styrktaræfingu liðsins, engin aukaæfing; byggir upp á undirbúnings- og hvíldartímabili og heldur á tímabili" }
  : { en: "two short extra sessions a week", is: "tvær stuttar aukaæfingar á viku" };

async function call(method: "GET" | "POST" | "DELETE", body?: unknown, path = "/api/player/goal-plan") {
  const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, j };
}

const fmtDate = (iso: string | null, is: boolean) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(is ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
const fmtDay = (iso: string, is: boolean) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Lota 7b: why a quality matters (visible) → what improves it, with sources (behind a click). */
function WhyBlock({ q, is, framed = true }: { q: GoalQuality; is: boolean; framed?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const L = (b: Bi) => (is ? b.is : b.en);
  const w = QUALITY_WHY[q];
  const t = whyTitles(q);
  const src = (refs: string[]) => {
    const r = refShort(refs);
    return r ? <span className="text-slate-400"> {r}</span> : null;
  };
  return (
    <div className={framed ? "rounded-xl border border-slate-200 p-3" : "border-t border-primary/15 pt-2"} data-testid="goal-why" data-quality={q}>
      <p className="text-xs font-semibold text-slate-800">{L(t.matters)}</p>
      <p className="mt-0.5 text-xs text-slate-700">{L(w.matters.text)}{src(w.matters.refs)}</p>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1.5 text-xs font-medium text-primary">
        {L(t.improves)} {open ? "▴" : "▾"}
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">
            {w.improves.map((l, i) => <li key={i}>{L(l.text)}{src(l.refs)}</li>)}
          </ul>
          {w.limit ? <p className="text-xs text-slate-600">{L(w.limit.text)}{src(w.limit.refs)}</p> : null}
          <p className="text-[11px] text-slate-400">{L(WHY_FOOTER)}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Lota 7: "your data points more to …" — verdict → two facts → switch / keep → details behind a toggle. */
function SuggestionCard({ s, from, is, onSwitch, onKeep }: { s: NonNullable<Suggestion>; from: GoalQuality; is: boolean; onSwitch: () => void; onKeep: () => void }) {
  const [open, setOpen] = React.useState(false);
  const L = (b: Bi) => (is ? b.is : b.en);
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="goal-suggestion" data-from={from} data-suggested={s.suggested}>
      <p className="text-sm font-semibold text-slate-900">{L(s.view.verdict)}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
        {s.view.facts.map((f, i) => <li key={i}>{L(f)}</li>)}
      </ul>
      <div className="mt-2"><WhyBlock q={s.suggested} is={is} framed={false} /></div>
      <p className="mt-2 text-xs text-slate-500">{L(s.view.sub)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onSwitch} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">{L(s.view.switchLabel)}</button>
        <button type="button" onClick={onKeep} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">{L(s.view.keepLabel)}</button>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-medium text-primary">
        {open ? (is ? "Fela nánar" : "Hide details") : (is ? "Sýna nánar" : "Show details")}
      </button>
      {open ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {s.view.details.map((d, i) => <li key={i}>{L(d)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** One earlier goal (lota 5): verdict → sessions ticked + coach's note → test lines behind "Show details". */
function HistoryItem({ item, is }: { item: GoalHistoryItem; is: boolean }) {
  const [open, setOpen] = React.useState(false);
  const L = (b: Bi) => (is ? b.is : b.en);
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-semibold text-slate-900">{L(item.title)}</span>
        <span className="text-xs text-slate-500">{fmtDay(item.startDate, is)} – {fmtDay(item.lastDay, is)}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-800">{L(item.verdict)}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
        {item.facts.map((f, i) => <li key={i}>{L(f)}</li>)}
      </ul>
      {item.coachNote ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"><span className="font-semibold">{is ? "Frá þjálfaranum:" : "From your coach:"}</span> {item.coachNote}</p> : null}
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-medium text-primary">
        {open ? (is ? "Fela nánar" : "Hide details") : (is ? "Sýna nánar" : "Show details")}
      </button>
      {open ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {item.details.map((d, i) => <li key={i}>{L(d)}</li>)}
        </ul>
      ) : null}
    </li>
  );
}

export default function PlayerGoalSheet({ lang, onClose }: { lang?: "IS" | "EN"; onClose: () => void }) {
  const is = lang === "IS";
  const L = (b: Bi) => (is ? b.is : b.en);
  const T = (en: string, isText: string) => (is ? isText : en);

  const [eligibility, setEligibility] = React.useState<Eligibility[] | null>(null);
  const [current, setCurrent] = React.useState<Current | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "locked" | "error">("loading");
  const [pick, setPick] = React.useState<GoalQuality | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const [historyCount, setHistoryCount] = React.useState(0);
  // Player choices on: a new goal starts without approval, on this Monday (server's date).
  const [autoStart, setAutoStart] = React.useState<{ on: boolean; date: string | null }>({ on: false, date: null });
  const [dsi, setDsi] = React.useState<DsiSuggestion | null>(null);
  const [history, setHistory] = React.useState<GoalHistoryItem[] | null>(null);
  const [historyState, setHistoryState] = React.useState<"closed" | "loading" | "open" | "error">("closed");
  const [suggestions, setSuggestions] = React.useState<Record<GoalQuality, Suggestion> | null>(null);
  const [sugState, setSugState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  /** The quality the player had picked when they pressed "Switch" (sent so the coach sees it). */
  const [switchedFrom, setSwitchedFrom] = React.useState<GoalQuality | null>(null);
  const [kept, setKept] = React.useState(false);

  /** The suggestion read runs once, on the first pick. A failed read just shows nothing. */
  const choose = async (q: GoalQuality) => {
    setPick(q); setSwitchedFrom(null); setKept(false);
    if (sugState !== "idle") return;
    setSugState("loading");
    try {
      const { res, j } = await call("GET", undefined, "/api/player/goal-plan/suggestion");
      if (!res.ok) { setSugState("error"); return; }
      setSuggestions((j.byQuality ?? null) as Record<GoalQuality, Suggestion> | null);
      setSugState("ready");
    } catch {
      setSugState("error");
    }
  };

  /** Earlier goals are read only when the player opens them. */
  const toggleHistory = async () => {
    if (historyState === "open") { setHistoryState("closed"); return; }
    if (history) { setHistoryState("open"); return; }
    setHistoryState("loading");
    try {
      const { res, j } = await call("GET", undefined, "/api/player/goal-plan/history");
      if (!res.ok) { setHistoryState("error"); return; }
      setHistory((j.items ?? []) as GoalHistoryItem[]);
      setHistoryState("open");
    } catch {
      setHistoryState("error");
    }
  };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { res, j } = await call("GET");
        if (!alive) return;
        if (res.status === 402) { setState("locked"); return; }
        if (!res.ok) { setState("error"); return; }
        setEligibility((j.eligibility ?? []) as Eligibility[]);
        setCurrent((j.current ?? null) as Current | null);
        setHistoryCount(Number(j.historyCount ?? 0) || 0);
        setAutoStart({ on: j.autoStart === true, date: typeof j.autoStartDate === "string" ? j.autoStartDate : null });
        setDsi((j.dsiSuggestion ?? null) as DsiSuggestion | null);
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [reload]);

  /** The server's message in the player's language (Icelandic when the server has it). */
  const errText = (j: Record<string, unknown>, fallback: string) =>
    String((is && typeof j.error_is === "string" && j.error_is) || (typeof j.error === "string" && j.error) || fallback);

  const send = async () => {
    if (!pick) return;
    setBusy(true); setMsg(null);
    const { res, j } = await call("POST", { quality: pick, note: note.trim() || undefined, switchedFrom: switchedFrom ?? undefined });
    setBusy(false);
    if (!res.ok) { setMsg(errText(j, T("Could not send. Try again.", "Tókst ekki að senda. Reyndu aftur."))); return; }
    setPick(null); setNote(""); setSwitchedFrom(null); setKept(false); setReload((n) => n + 1);
  };

  const withdraw = async () => {
    setBusy(true); setMsg(null);
    const { res, j } = await call("DELETE");
    setBusy(false);
    if (!res.ok) { setMsg(errText(j, T("Could not withdraw. Try again.", "Tókst ekki að draga til baka. Reyndu aftur."))); return; }
    setReload((n) => n + 1);
  };

  const open = current && (current.status === "requested" || current.status === "approved" || current.status === "paused");

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{T("My goal", "Markmiðið mitt")}</div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{T("What do you want to improve?", "Hvað viltu bæta?")}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label={T("Close", "Loka")}>✕</button>
        </div>

        {state === "loading" ? <p className="text-sm text-slate-400">{T("Loading…", "Sæki…")}</p> : null}
        {state === "locked" ? <p className="text-sm text-slate-600">{T("Goal plans are not on your team's plan.", "Markmiðsáætlanir eru ekki í áskrift liðsins.")}</p> : null}
        {state === "error" ? <p className="text-sm text-[#a83e28]">{T("Couldn't load. Close and try again.", "Tókst ekki að sækja. Lokaðu og reyndu aftur.")}</p> : null}

        {state === "ready" && open && current ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">{L(QUALITY[current.quality].label)}</div>
              {current.status === "requested" ? (
                <p className="mt-1 text-sm text-slate-700">{T(`Asked on ${fmtDate(current.requestedAt, false)}. Waiting for your coach to look at it.`, `Beðið um ${fmtDate(current.requestedAt, true)}. Bíður þess að þjálfarinn skoði það.`)}</p>
              ) : current.status === "approved" && current.autoStarted ? (
                <p className="mt-1 text-sm text-slate-700">{T(`Your plan is set. The 8 weeks run ${fmtDate(current.startDate, false)} – ${fmtDate(current.endDate, false)}. Each day's session shows on Today. Your coach sees it.`, `Áætlunin þín er klár. Vikurnar 8 standa ${fmtDate(current.startDate, true)} – ${fmtDate(current.endDate, true)}. Æfing hvers dags birtist á Í dag. Þjálfarinn sér hana.`)}</p>
              ) : current.status === "approved" ? (
                <p className="mt-1 text-sm text-slate-700">{T(`Your coach said yes. The 8 weeks run ${fmtDate(current.startDate, false)} – ${fmtDate(current.endDate, false)}. Each day's session shows on Today.`, `Þjálfarinn sagði já. Vikurnar 8 standa ${fmtDate(current.startDate, true)} – ${fmtDate(current.endDate, true)}. Æfing hvers dags birtist á Í dag.`)}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-700">{T(`Paused${current.pausedWeek ? ` in week ${current.pausedWeek}` : ""} while you are injured or coming back. Your coach restarts it.`, `Í bið${current.pausedWeek ? ` í viku ${current.pausedWeek}` : ""} á meðan meiðsli eða endurkoma standa yfir. Þjálfarinn setur hana aftur af stað.`)}</p>
              )}
              {current.note ? <p className="mt-2 text-xs text-slate-500">{T("Your note:", "Þín athugasemd:")} {current.note}</p> : null}
              {current.coachNote ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">{T("From your coach:", "Frá þjálfaranum:")}</span> {current.coachNote}</p> : null}
            </div>
            {current.status === "requested" ? (
              <button type="button" disabled={busy} onClick={withdraw} className="text-sm font-medium text-slate-500 underline disabled:opacity-50">{T("Withdraw the request", "Draga beiðnina til baka")}</button>
            ) : current.canWithdraw ? (
              <button type="button" disabled={busy} onClick={withdraw} className="text-sm font-medium text-slate-500 underline disabled:opacity-50">{T("Cancel before it starts", "Hætta við áður en hún byrjar")}</button>
            ) : current.status === "approved" && current.autoStarted ? (
              <p className="text-xs text-slate-500">{T("To stop it, talk to your coach.", "Talaðu við þjálfarann ef þú vilt hætta.")}</p>
            ) : null}
            <p className="text-xs text-slate-500">{T("One goal at a time.", "Eitt markmið í einu.")}</p>
          </div>
        ) : null}

        {state === "ready" && !open ? (
          <div className="space-y-3">
            {current?.status === "completed" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">{T(`Your 8 weeks of ${L(QUALITY[current.quality].label).toLowerCase()} finished on ${fmtDate(current.endDate, false)}.`, `8 vikna áætluninni (${L(QUALITY[current.quality].label).toLowerCase()}) lauk ${fmtDate(current.endDate, true)}.`)}</div>
                {autoStart.on ? <p className="mt-1">{T("You can ask for a new goal below.", "Þú getur beðið um nýtt markmið hér fyrir neðan.")}</p> : null}
              </div>
            ) : null}
            {current?.status === "declined" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">{T(`Your coach said not now to ${L(QUALITY[current.quality].label).toLowerCase()}.`, `Þjálfarinn sagði ekki núna (${L(QUALITY[current.quality].label).toLowerCase()}).`)}</div>
                {current.declineReason ? <p className="mt-1">{current.declineReason}</p> : null}
                {current.coachNote ? <p className="mt-1">{current.coachNote}</p> : null}
              </div>
            ) : null}
            {/* Three send modes (2026-11-17): a player chooses a goal only when the coach has them take part. */}
            {!autoStart.on ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" data-testid="goal-not-on">
                {T("Choosing your own goal isn't on for you right now. Your coach turns it on.", "Að velja þér markmið er ekki opið fyrir þig núna. Þjálfarinn opnar það.")}
              </p>
            ) : null}
            {autoStart.on && dsi ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2" data-testid="goal-dsi-suggestion" data-goal={dsi.goal}>
                <p className="text-sm font-semibold text-slate-900">{T("Your force-plate tests suggest: ", "Kraftplötuprófin þín benda á: ")}{L(QUALITY[dsi.goal].label)}</p>
                <p className="mt-0.5 text-xs text-slate-700">{is ? dsi.reasonIS : dsi.reasonEN}</p>
                <p className="mt-1 text-[11px] text-slate-500" title={dsi.source}>
                  {T(`A suggestion from rules, not AI · jump test ${fmtDay(dsi.cmjDate, false)}, pull test ${fmtDay(dsi.imtpDate, false)}${dsi.confidence === "high" ? "" : " · few tries, treat as a first read"} · you choose`,
                    `Tillaga út frá reglum, ekki gervigreind · stökkpróf ${fmtDay(dsi.cmjDate, true)}, togpróf ${fmtDay(dsi.imtpDate, true)}${dsi.confidence === "high" ? "" : " · fáar tilraunir, fyrsta mat"} · þú velur`)}
                </p>
              </div>
            ) : null}
            {autoStart.on ? <div className="grid gap-2">
              {(eligibility ?? []).map((e) => {
                const q = QUALITY[e.quality];
                const disabled = !!e.blocked;
                const active = pick === e.quality;
                const suggested = !disabled && dsi?.goal === e.quality;
                return (
                  <button key={e.quality} type="button" disabled={disabled} onClick={() => void choose(e.quality)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-60`}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      {L(q.label)}
                      {suggested ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{T("Suggested", "Tillaga")}</span> : null}
                    </span>
                    <span className="block text-xs text-slate-500">{disabled && e.blockedText ? L(e.blockedText) : L(q.sub)}</span>
                  </button>
                );
              })}
            </div> : null}
            {autoStart.on && pick ? (
              <>
                {(() => {
                  const s = suggestions?.[pick] ?? null;
                  const target = s ? (eligibility ?? []).find((e) => e.quality === s.suggested) : null;
                  if (sugState === "loading") return <p className="text-xs text-slate-400">{T("Checking your data…", "Les gögnin þín…")}</p>;
                  if (!s || !target || target.blocked) return <WhyBlock key={pick} q={pick} is={is} />;
                  if (kept) return <><WhyBlock key={pick} q={pick} is={is} /><p className="text-xs text-slate-500">{T(`You kept ${L(QUALITY[pick].label).toLowerCase()}. Your coach sees the suggestion and your choice.`, `Þú hélst ${Q_DAT[pick]}. Þjálfarinn sér tillöguna og val þitt.`)}</p></>;
                  return <SuggestionCard s={s} from={pick} is={is} onSwitch={() => { setSwitchedFrom(pick); setPick(s.suggested); setKept(false); }} onKeep={() => setKept(true)} />;
                })()}
                {switchedFrom ? <p className="text-xs text-slate-500">{T(`Switched from ${L(QUALITY[switchedFrom].label).toLowerCase()}. Your coach sees the suggestion and your choice.`, `Skipt úr ${Q_DAT[switchedFrom]}. Þjálfarinn sér tillöguna og val þitt.`)}</p> : null}
                <label className="block text-sm text-slate-700">
                  <span className="text-xs font-semibold">{T("Anything your coach should know? (optional)", "Eitthvað sem þjálfarinn ætti að vita? (valfrjálst)")}</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={PLAYER_NOTE_MAX} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                {autoStart.on ? (
                  <p className="text-xs text-slate-500">{T(`What happens next: MicroPulse builds an 8-week plan from your own data (${weekShape(pick).en}). It starts ${autoStart.date ? fmtDate(autoStart.date, false) : "on Monday"}; your coach sees it and can stop it.`, `Hvað gerist næst: MicroPulse býr til 8 vikna áætlun út frá þínum gögnum (${weekShape(pick).is}). Hún byrjar ${autoStart.date ? fmtDate(autoStart.date, true) : "á mánudaginn"}; þjálfarinn sér hana og getur stöðvað hana.`)}</p>
                ) : (
                  <p className="text-xs text-slate-500">{T(`What happens next: MicroPulse builds an 8-week plan from your own data (${weekShape(pick).en}), and your coach says yes or no.`, `Hvað gerist næst: MicroPulse býr til 8 vikna áætlun út frá þínum gögnum (${weekShape(pick).is}) og þjálfarinn segir já eða nei.`)}</p>
                )}
                <button type="button" disabled={busy} onClick={send} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? T("Sending…", "Sendi…") : autoStart.on ? T("Start my plan", "Byrja áætlunina") : T("Ask my coach", "Biðja þjálfarann")}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {msg ? <p className="mt-3 text-sm text-[#a83e28]">{msg}</p> : null}

        {state === "ready" && historyCount > 0 ? (
          <div className="mt-5 border-t border-slate-200 pt-3">
            <button type="button" onClick={toggleHistory} aria-expanded={historyState === "open"} className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-700">
              <span>{T(`Earlier goals (${historyCount})`, `Fyrri markmið (${historyCount})`)}</span>
              <span className="text-slate-400">{historyState === "open" ? "▴" : "▾"}</span>
            </button>
            {historyState === "loading" ? <p className="mt-2 text-sm text-slate-400">{T("Loading…", "Sæki…")}</p> : null}
            {historyState === "error" ? <p className="mt-2 text-sm text-[#a83e28]">{T("Couldn't load. Try again.", "Tókst ekki að sækja. Reyndu aftur.")}</p> : null}
            {historyState === "open" && history ? (
              history.length
                ? <ul className="mt-2 space-y-2">{history.map((h) => <HistoryItem key={h.id} item={h} is={is} />)}</ul>
                : <p className="mt-2 text-sm text-slate-500">{T("No earlier goals.", "Engin fyrri markmið.")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
