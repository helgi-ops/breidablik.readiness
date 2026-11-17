"use client";

/**
 * "My exercises & goal" (2026-11-17): the player picks ONE strength goal (lota 2) and which of the team's exercises
 * they want in their own strength session (lota 1). Opened from Today → See more, and only shown when the coach has
 * turned it on for the team, or for this one player (test).
 *
 * Layered read: one sentence (what this does) → plain facts → the goal buttons (with what each one does) → the
 * groups with the team's exercises as buttons (1st / 2nd choice). What the coach locked shows "Your coach chose
 * this" and can't be changed. Plain words only; no sport-science terms.
 *
 * Season (2026-11-17): the goal's extra set comes only in pre-season and off-season; in season the session is
 * maintenance and the goal is kept. When the player's force-plate tests suggest a goal (DSI against the team, rules
 * not AI) the sheet says so and marks that button "Suggested" — the player still chooses.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Group = { slot: string; label: { en: string; is: string }; max: number; options: { id: string; nameEN: string; nameIS: string }[] };
type Goal = { id: string; en: string; is: string; whatEN: string; whatIS: string };
type Suggestion = { goal: string; reasonEN: string; reasonIS: string; cmjDate: string; imtpDate: string; tested: number; confidence: "high" | "moderate"; source: string };
type State =
  | { ok: true; enabled: false }
  | {
      ok: true;
      enabled: true;
      groups: Group[];
      picks: Record<string, string[]>;
      locked: string[];
      goals: Goal[];
      goal: string | null;
      goalLocked: boolean;
      suggestion?: Suggestion | null;
      updatedAt: string | null;
      updatedByRole: "player" | "coach" | null;
    };

const API = "/api/player/strength-picks";

async function call(method: "GET" | "PUT", body?: unknown) {
  const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch(API, {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, j };
}

/** Which Today rows the player sees: "My exercises & goal" (picks on) and "My goal" (the player takes part under the
 *  team's send mode, or has a goal plan to look at; three send modes, 2026-11-17). Read lazily (after Today has
 *  loaded) and remembered (12 h when something is on, 2 h when not, so a coach turning it on shows up the same day),
 *  so Today's morning load gets no extra request on most opens. v3: a fresh read for everyone after the modes shipped. */
const CACHE_KEY = "mp_strength_picks_on_v3";
type Rows = { picks: boolean; goal: boolean };
const cacheMs = (r: Rows) => (r.picks || r.goal ? 12 : 2) * 60 * 60 * 1000;
function readCache(): Rows | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const hit = raw ? (JSON.parse(raw) as { v: Rows; at: number }) : null;
    return hit && hit.v && Date.now() - hit.at < cacheMs(hit.v) ? { picks: !!hit.v.picks, goal: !!hit.v.goal } : null;
  } catch {
    return null; // no storage: read from the server below
  }
}

export function useStrengthPicksEnabled(): Rows {
  // The Today "See more" rows render only on the client (portal after mount), so reading storage here is safe.
  const [cached] = React.useState<Rows | null>(readCache);
  const [rows, setRows] = React.useState<Rows>(cached ?? { picks: false, goal: false });
  React.useEffect(() => {
    if (cached != null) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const { res, j } = await call("GET");
        if (!res.ok || !alive) return;
        const v: Rows = { picks: j.enabled === true, goal: j.goalRow === true };
        setRows(v);
        try { window.localStorage.setItem(CACHE_KEY, JSON.stringify({ v, at: Date.now() })); } catch { /* ignore */ }
      } catch { /* stay hidden */ }
    }, 6000);
    return () => { alive = false; window.clearTimeout(t); };
  }, [cached]);
  return rows;
}

export default function PlayerExercisePicksSheet({ lang, onClose }: { lang?: "IS" | "EN"; onClose: () => void }) {
  const is = lang === "IS";
  const T = (en: string, isText: string) => (is ? isText : en);
  const [state, setState] = React.useState<State | "loading" | "error" | "locked">("loading");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { res, j } = await call("GET");
      if (!alive) return;
      if (res.status === 402) { setState("locked"); return; }
      if (!res.ok) { setState("error"); return; }
      setState(j as unknown as State);
    })();
    return () => { alive = false; };
  }, []);

  const save = async (slot: string, ids: string[]) => put(slot, { slot, ids });
  const saveGoal = async (goal: string | null) => put("goal", { goal });
  const put = async (key: string, body: unknown) => {
    setBusy(key); setMsg(null); setSaved(false);
    try {
      const { res, j } = await call("PUT", body);
      if (!res.ok) { setMsg(String((is ? j.error_is : null) ?? j.error ?? T("Could not save.", "Tókst ekki að vista."))); return; }
      setState(j as unknown as State);
      setSaved(true);
    } finally {
      setBusy(null);
    }
  };

  // Tap: not picked → becomes the next choice (if room); picked → removed.
  const toggle = (g: Group, id: string, current: string[]) => {
    if (current.includes(id)) return save(g.slot, current.filter((x) => x !== id));
    if (current.length >= g.max) return save(g.slot, g.max === 1 ? [id] : [...current.slice(0, g.max - 1), id]);
    return save(g.slot, [...current, id]);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{T("My exercises & goal", "Mínar æfingar og markmið")}</div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{T("Choose your goal and the exercises you want in your strength session", "Veldu markmið og æfingarnar sem þú vilt í styrktaræfingunni þinni")}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label={T("Close", "Loka")}>✕</button>
        </div>

        {state === "loading" ? <p className="text-sm text-slate-400">{T("Loading…", "Sæki…")}</p> : null}
        {state === "locked" ? <p className="text-sm text-slate-600">{T("This is not on your team's plan.", "Þetta er ekki í áskrift liðsins.")}</p> : null}
        {state === "error" ? <p className="text-sm text-[#a83e28]">{T("Couldn't load. Close and try again.", "Tókst ekki að sækja. Lokaðu og reyndu aftur.")}</p> : null}
        {typeof state === "object" && !state.enabled ? (
          <p className="text-sm text-slate-600">{T("Your coach has not turned this on for the team.", "Þjálfarinn þinn hefur ekki kveikt á þessu fyrir liðið.")}</p>
        ) : null}

        {typeof state === "object" && state.enabled ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-800">
              {T("In pre-season and off-season your goal adds one extra set on the right day; your picks go first when your session is built.", "Á undirbúnings- og hvíldartímabili bætir markmiðið við einu setti á réttum degi; valið þitt fer fremst þegar æfingin þín er sett saman.")}
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
              <li>{T("In season your session is maintenance: no extra set. Your goal is kept and adds its set again in pre-season.", "Á tímabili er æfingin viðhald: ekkert aukasett. Markmiðið þitt er geymt og bætir við setti aftur á undirbúningstímabili.")}</li>
              <li>{T("With no match in the next days, every strength session counts as a goal day.", "Ef enginn leikur er næstu daga telst hver styrktaræfing markmiðsdagur.")}</li>
              <li>{T("It counts from the next session you get (not one already sent today).", "Það gildir frá næstu æfingu sem þú færð (ekki þeirri sem er þegar komin í dag).")}</li>
              <li>{T("Your picks change which exercise, not the sets, reps or rest.", "Valið breytir hvaða æfing það er, ekki settum, endurtekningum eða hvíld.")}</li>
              <li>{T("No extra set on a light or recovery day, in a week with two matches, or if something is sore: then the app keeps you safe first.", "Ekkert aukasett á léttum degi eða endurheimtardegi, í viku með tveimur leikjum eða ef eitthvað er aumt: þá gætir appið öryggis fyrst.")}</li>
            </ul>

            <section className="rounded-xl border border-slate-200 p-3" data-testid="goal-group">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{T("My goal", "Markmiðið mitt")}</h3>
                <span className="text-[11px] text-slate-400">{state.goalLocked ? T("Your coach chose this", "Þjálfarinn þinn valdi þetta") : T("Pick 1", "Veldu 1")}</span>
              </div>
              {state.suggestion ? (() => {
                const sg = state.suggestion;
                const label = state.goals.find((g) => g.id === sg.goal);
                return (
                  <div className="mt-2 rounded-lg border border-[#2740e6]/25 bg-[#2740e6]/5 px-3 py-2" data-testid="goal-suggestion">
                    <p className="text-sm font-semibold text-slate-900">
                      {T("Your force-plate tests suggest: ", "Kraftplötuprófin þín benda á: ")}{label ? (is ? label.is : label.en) : sg.goal}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">{is ? sg.reasonIS : sg.reasonEN}</p>
                    <p className="mt-1 text-[11px] text-slate-400" title={sg.source}>
                      {T(`A suggestion from rules, not AI · jump test ${sg.cmjDate}, pull test ${sg.imtpDate} · you choose`, `Tillaga út frá reglum, ekki gervigreind · stökkpróf ${sg.cmjDate}, togpróf ${sg.imtpDate} · þú velur`)}
                    </p>
                  </div>
                );
              })() : null}
              <div className="mt-2 grid gap-2">
                {state.goals.map((g) => {
                  const on = state.goal === g.id;
                  const suggested = state.suggestion?.goal === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={state.goalLocked || busy === "goal"}
                      onClick={() => saveGoal(on ? null : g.id)}
                      aria-pressed={on}
                      className={`rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${on ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {is ? g.is : g.en}
                        {suggested ? (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-[#2740e6]/10 text-[#2740e6]"}`}>{T("Suggested", "Tillaga")}</span>
                        ) : null}
                      </span>
                      <span className={`block text-xs ${on ? "text-white/85" : "text-slate-500"}`}>{is ? g.whatIS : g.whatEN}</span>
                    </button>
                  );
                })}
              </div>
              {!state.goal && !state.goalLocked ? (
                <p className="mt-1.5 text-[11px] text-slate-400">{T("No goal: your session stays as your coach planned it.", "Ekkert markmið: æfingin er eins og þjálfarinn skipulagði hana.")}</p>
              ) : null}
            </section>

            {state.groups.map((g) => {
              const current = state.picks[g.slot] ?? [];
              const locked = state.locked.includes(g.slot);
              return (
                <section key={g.slot} className="rounded-xl border border-slate-200 p-3" data-testid="picks-group" data-slot={g.slot}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{is ? g.label.is : g.label.en}</h3>
                    <span className="text-[11px] text-slate-400">
                      {locked ? T("Your coach chose this", "Þjálfarinn þinn valdi þetta") : g.max === 1 ? T("Pick 1", "Veldu 1") : T(`Pick up to ${g.max}`, `Veldu allt að ${g.max}`)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {g.options.map((o) => {
                      const rank = current.indexOf(o.id);
                      const on = rank >= 0;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={locked || busy === g.slot}
                          onClick={() => toggle(g, o.id, current)}
                          aria-pressed={on}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${on ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                        >
                          {on && g.max > 1 ? <span className="mr-1 font-semibold">{rank + 1}.</span> : null}
                          {is ? o.nameIS : o.nameEN}
                        </button>
                      );
                    })}
                  </div>
                  {current.length === 0 && !locked ? (
                    <p className="mt-1.5 text-[11px] text-slate-400">{T("No pick: your coach's order is used.", "Ekkert val: röð þjálfarans er notuð.")}</p>
                  ) : null}
                </section>
              );
            })}

            {saved ? <p className="text-xs text-[#1c7a4a]">{T("Saved. Your coach can see your picks.", "Vistað. Þjálfarinn þinn sér valið þitt.")}</p> : null}
            {msg ? <p className="text-xs text-[#a83e28]">{msg}</p> : null}
            {state.updatedByRole === "coach" ? (
              <p className="text-[11px] text-slate-500">{T("Your coach changed your picks last.", "Þjálfarinn þinn breytti valinu þínu síðast.")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
