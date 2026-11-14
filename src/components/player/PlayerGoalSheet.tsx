"use client";

/**
 * "My goal" (lota 2): the player asks to improve one quality (top speed, acceleration, braking, vertical jump).
 * The coach reviews a plan built by rules from the player's own data and approves or declines it. Once approved,
 * each day's session shows on Today (PlayerGoalTodayCard, lota 3); this sheet shows the status and the answer.
 *
 * Opened from Today → See more. It reads nothing until it is opened, so Today's first load is unchanged.
 * Plain words only: no sport-science terms, no colour, no load numbers.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi, GoalQuality } from "@/lib/micropulse/goalPlan/types";
import { PLAYER_NOTE_MAX } from "@/lib/micropulse/goalPlan/requests";
import type { GoalHistoryItem } from "@/lib/micropulse/goalPlan/history";

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
};

const QUALITY: Record<GoalQuality, { label: Bi; sub: Bi }> = {
  top_speed: { label: { en: "Top speed", is: "Hámarkshraði" }, sub: { en: "Run faster when you are flat out", is: "Hlaupa hraðar á fullri ferð" } },
  acceleration: { label: { en: "Acceleration", is: "Hröðun" }, sub: { en: "Quicker first steps", is: "Snarpari fyrstu skref" } },
  braking: { label: { en: "Braking", is: "Bremsun" }, sub: { en: "Stop and turn more sharply", is: "Stoppa og snúa snarpar" } },
  jump: { label: { en: "Vertical jump", is: "Lóðrétt stökk" }, sub: { en: "Jump higher", is: "Stökkva hærra" } },
};

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
  const [history, setHistory] = React.useState<GoalHistoryItem[] | null>(null);
  const [historyState, setHistoryState] = React.useState<"closed" | "loading" | "open" | "error">("closed");

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
    const { res, j } = await call("POST", { quality: pick, note: note.trim() || undefined });
    setBusy(false);
    if (!res.ok) { setMsg(errText(j, T("Could not send. Try again.", "Tókst ekki að senda. Reyndu aftur."))); return; }
    setPick(null); setNote(""); setReload((n) => n + 1);
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
            ) : null}
            <p className="text-xs text-slate-500">{T("One goal at a time.", "Eitt markmið í einu.")}</p>
          </div>
        ) : null}

        {state === "ready" && !open ? (
          <div className="space-y-3">
            {current?.status === "completed" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">{T(`Your 8 weeks of ${L(QUALITY[current.quality].label).toLowerCase()} finished on ${fmtDate(current.endDate, false)}.`, `8 vikna áætluninni (${L(QUALITY[current.quality].label).toLowerCase()}) lauk ${fmtDate(current.endDate, true)}.`)}</div>
                <p className="mt-1">{T("You can ask for a new goal below.", "Þú getur beðið um nýtt markmið hér fyrir neðan.")}</p>
              </div>
            ) : null}
            {current?.status === "declined" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">{T(`Your coach said not now to ${L(QUALITY[current.quality].label).toLowerCase()}.`, `Þjálfarinn sagði ekki núna (${L(QUALITY[current.quality].label).toLowerCase()}).`)}</div>
                {current.declineReason ? <p className="mt-1">{current.declineReason}</p> : null}
                {current.coachNote ? <p className="mt-1">{current.coachNote}</p> : null}
              </div>
            ) : null}
            <div className="grid gap-2">
              {(eligibility ?? []).map((e) => {
                const q = QUALITY[e.quality];
                const disabled = !!e.blocked;
                const active = pick === e.quality;
                return (
                  <button key={e.quality} type="button" disabled={disabled} onClick={() => setPick(e.quality)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-60`}>
                    <span className="block text-sm font-semibold text-slate-900">{L(q.label)}</span>
                    <span className="block text-xs text-slate-500">{disabled && e.blockedText ? L(e.blockedText) : L(q.sub)}</span>
                  </button>
                );
              })}
            </div>
            {pick ? (
              <>
                <label className="block text-sm text-slate-700">
                  <span className="text-xs font-semibold">{T("Anything your coach should know? (optional)", "Eitthvað sem þjálfarinn ætti að vita? (valfrjálst)")}</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={PLAYER_NOTE_MAX} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <p className="text-xs text-slate-500">{T("What happens next: MicroPulse builds an 8-week plan from your own data (two short extra sessions a week), and your coach says yes or no.", "Hvað gerist næst: MicroPulse býr til 8 vikna áætlun út frá þínum gögnum (tvær stuttar aukaæfingar á viku) og þjálfarinn segir já eða nei.")}</p>
                <button type="button" disabled={busy} onClick={send} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? T("Sending…", "Sendi…") : T("Ask my coach", "Biðja þjálfarann")}
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
