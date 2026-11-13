"use client";

/**
 * "My goal" (lota 2): the player asks to improve one quality (top speed, acceleration, braking, vertical jump).
 * The coach reviews a plan built by rules from the player's own data and approves or declines it. In lota 2 the
 * player only sees the request and the answer; the plan itself reaches Today in lota 3.
 *
 * Opened from Today → See more. It reads nothing until it is opened, so Today's first load is unchanged.
 * Plain words only: no sport-science terms, no colour, no load numbers.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi, GoalQuality } from "@/lib/micropulse/goalPlan/types";
import { PLAYER_NOTE_MAX } from "@/lib/micropulse/goalPlan/requests";

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
};

const QUALITY: Record<GoalQuality, { label: Bi; sub: Bi }> = {
  top_speed: { label: { en: "Top speed", is: "Hámarkshraði" }, sub: { en: "Run faster when you are flat out", is: "Hlaupa hraðar á fullri ferð" } },
  acceleration: { label: { en: "Acceleration", is: "Hröðun" }, sub: { en: "Quicker first steps", is: "Snarpari fyrstu skref" } },
  braking: { label: { en: "Braking", is: "Bremsun" }, sub: { en: "Stop and turn more sharply", is: "Stoppa og snúa snarpar" } },
  jump: { label: { en: "Vertical jump", is: "Lóðrétt stökk" }, sub: { en: "Jump higher", is: "Stökkva hærra" } },
};

async function call(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch("/api/player/goal-plan", {
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
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [reload]);

  const send = async () => {
    if (!pick) return;
    setBusy(true); setMsg(null);
    const { res, j } = await call("POST", { quality: pick, note: note.trim() || undefined });
    setBusy(false);
    if (!res.ok) { setMsg(String(j.error ?? T("Could not send. Try again.", "Tókst ekki að senda. Reyndu aftur."))); return; }
    setPick(null); setNote(""); setReload((n) => n + 1);
  };

  const withdraw = async () => {
    setBusy(true); setMsg(null);
    const { res, j } = await call("DELETE");
    setBusy(false);
    if (!res.ok) { setMsg(String(j.error ?? T("Could not withdraw. Try again.", "Tókst ekki að draga til baka. Reyndu aftur."))); return; }
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
                <p className="mt-1 text-sm text-slate-700">{T(`Your coach said yes. The 8 weeks start ${fmtDate(current.startDate, false)}.`, `Þjálfarinn sagði já. Vikurnar 8 hefjast ${fmtDate(current.startDate, true)}.`)}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-700">{T("Your coach has paused the plan for now.", "Þjálfarinn hefur sett áætlunina í bið í bili.")}</p>
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
            {current?.status === "declined" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">{T(`Your coach said not now to ${L(QUALITY[current.quality].label).toLowerCase()}.`, `Þjálfarinn sagði ekki núna við ${L(QUALITY[current.quality].label).toLowerCase()}.`)}</div>
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
      </div>
    </div>
  );
}
