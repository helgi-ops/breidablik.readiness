"use client";

/**
 * "Players' exercise picks & goals" (2026-11-17) on Player goals: the coach turns picks on for the team (or for ONE
 * player to test), sees every player's strength goal (lota 2) and picks (lota 1), and can change either or lock it
 * (with a reason, kept in the history). No approval step: a choice applies from the player's next session sent.
 *
 * Layered read: one sentence (how many have chosen / off / testing) → plain facts → the switch + one-player test →
 * the player × (goal, groups) table (click a cell to change or lock).
 *
 * 2026-11-17: the goal's extra set only in pre-season / off-season (in season = maintenance), and the goal cell shows
 * what the player's force-plate tests suggest ("DSI suggests: …", rules not AI) next to what the player chose.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { PICK_REASON_MIN } from "@/lib/micropulse/strengthProgramming/playerPicks";

type Group = { slot: string; label: { en: string; is: string }; max: number; options: { id: string; nameEN: string; nameIS: string }[] };
type Goal = { id: string; en: string; is: string; whatEN: string; whatIS: string };
type Suggestion = { goal: string; reasonEN: string; reasonIS: string; cmjDate: string; imtpDate: string; tested: number; confidence: "high" | "moderate"; source: string };
type PlayerRow = {
  id: string;
  name: string;
  picks: Record<string, string[]>;
  locked: string[];
  goal: string | null;
  goalLocked: boolean;
  testEnabled: boolean;
  suggestion?: Suggestion | null;
  updatedAt: string | null;
  updatedByRole: "player" | "coach" | null;
};
type State = {
  enabled: boolean;
  hasList: boolean;
  groups: Group[];
  goals: Goal[];
  players: PlayerRow[];
  picked: number;
  withGoal: number;
  testing: number;
  total: number;
};
const GOAL_CELL = "__goal";

const API = "/api/coach/team/player-strength-picks";

async function call(method: "GET" | "PUT", body?: unknown) {
  const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch(API, {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, j };
}

export default function PlayerExercisePicksPanel({ isEN }: { isEN: boolean }) {
  const T = (en: string, is: string) => (isEN ? en : is);
  const [s, setS] = React.useState<State | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState<{ playerId: string; slot: string } | null>(null);
  const [testPick, setTestPick] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { res, j } = await call("GET");
      if (!alive) return;
      if (res.status === 402) { setErr(T("Part of the Pro plan.", "Hluti af Pro.")); return; }
      if (!res.ok) { setErr(String(j.error ?? res.status)); return; }
      setS(j as unknown as State);
    })();
    return () => { alive = false; };
    // The language only changes the wording of an error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const put = async (body: unknown): Promise<string | null> => {
    setBusy(true);
    try {
      const { res, j } = await call("PUT", body);
      if (!res.ok) return String((isEN ? null : j.error_is) ?? j.error ?? res.status);
      setS(j as unknown as State);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (g: Group, id: string) => {
    const o = g.options.find((x) => x.id === id);
    return o ? (isEN ? o.nameEN : o.nameIS) : id;
  };
  const goalName = (id: string | null) => {
    const g = s?.goals.find((x) => x.id === id);
    return g ? (isEN ? g.en : g.is) : null;
  };
  const testers = s ? s.players.filter((p) => p.testEnabled) : [];
  // Team on → every player; team off → only the players the coach is testing with.
  const rows = s ? (s.enabled ? s.players : testers) : [];

  const verdict = (st: State) => {
    // Lota 4: without a team list the switch only lets 8-week goals start without approval.
    if (!st.hasList) {
      if (st.enabled) return T("On: players start 8-week goals without your approval.", "Kveikt: leikmenn byrja 8 vikna markmið án samþykkis þíns.");
      if (st.testing === 0) return T("Off: players ask for 8-week goals and you approve them.", "Slökkt: leikmenn biðja um 8 vikna markmið og þú samþykkir.");
      return st.testing === 1
        ? T("Off for the team; on for 1 test player.", "Slökkt fyrir liðið; kveikt fyrir 1 prufuleikmann.")
        : T(`Off for the team; on for ${st.testing} test players.`, `Slökkt fyrir liðið; kveikt fyrir ${st.testing} prufuleikmenn.`);
    }
    if (!st.enabled) {
      if (st.testing === 0) return T("Off: players use your list in your order.", "Slökkt: leikmenn fá listann þinn í þinni röð.");
      return st.testing === 1
        ? T("Off for the team; on for 1 test player.", "Slökkt fyrir liðið; kveikt fyrir 1 prufuleikmann.")
        : T(`Off for the team; on for ${st.testing} test players.`, `Slökkt fyrir liðið; kveikt fyrir ${st.testing} prufuleikmenn.`);
    }
    const a = st.picked === 1
      ? T(`1 of ${st.total} players has picked exercises`, `1 af ${st.total} leikmönnum hefur valið æfingar`)
      : T(`${st.picked} of ${st.total} players have picked exercises`, `${st.picked} af ${st.total} leikmönnum hafa valið æfingar`);
    const b = st.withGoal === 1 ? T("1 has a goal", "1 er með markmið") : T(`${st.withGoal} have a goal`, `${st.withGoal} eru með markmið`);
    return `${a}; ${b}.`;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="exercise-picks-panel">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{T("Players' exercise picks & goals", "Æfingaval og markmið leikmanna")}</div>
      {err ? <p className="mt-1 text-[13px] text-[#a83e28]">{err}</p> : null}
      {!err && !s ? <p className="mt-1 text-[13px] text-slate-400">{T("Loading…", "Sæki…")}</p> : null}

      {s ? (
        <>
          <p className="mt-1 text-[15px] font-semibold text-slate-900">{verdict(s)}</p>
          {!s.hasList ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-slate-600">
              <li>{T("When on, a player's 8-week goal (top speed, acceleration, braking, jump) starts the next Monday without your approval. You see it in the list above and can stop it with a reason.", "Þegar kveikt er byrjar 8 vikna markmið leikmanns (hámarkshraði, hröðun, bremsun, stökk) næsta mánudag án samþykkis þíns. Þú sérð það í listanum hér fyrir ofan og getur stöðvað með ástæðu.")}</li>
              <li>{T("Same plan and safety rules as when you approve with no changes. Injured or returning players can't start one; under-18s get the youth plan.", "Sama áætlun og öryggisreglur og þegar þú samþykkir án breytinga. Meiddir eða leikmenn í endurkomu geta ekki byrjað; undir 18 ára fá unglingaáætlun.")}</li>
              <li>{T("Exercise picks and a strength goal come too once the team has an exercise list (Strength → Exercise palette, at least 2 exercises in a group).", "Æfingaval og styrktarmarkmið bætast við þegar liðið er komið með æfingalista (Styrkur → Æfingasafn, a.m.k. 2 æfingar í flokki).")}</li>
            </ul>
          ) : (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-slate-600">
            <li>{T("Players choose from your team list (Strength → Exercise palette). Their picks go first in that group; you see every pick here.", "Leikmenn velja af æfingalista liðsins (Styrkur → Æfingasafn). Valið fer fremst í flokknum; þú sérð allt val hér.")}</li>
            <li>{T("No approval: a pick counts from the player's next session sent. Sets, reps and rest don't change, and the Nordic / Copenhagen block stays.", "Ekkert samþykki: valið gildir frá næstu æfingu sem leikmaður fær. Sett, endurtekningar og hvíld breytast ekki og Nordic / Copenhagen haldast.")}</li>
            <li>{T("In pre-season and off-season a goal adds one set of the matching exercise on its day (stronger legs / hamstrings: MD-4; explosive: MD-4 and MD-3; with no match within 5 days, every strength day). In season the session is maintenance: no extra set, the goal is kept.", "Á undirbúnings- og hvíldartímabili bætir markmið við einu setti af samsvarandi æfingu á sínum degi (sterkari fætur / aftan í læri: MD-4; sprengikraftur: MD-4 og MD-3; enginn leikur innan 5 daga: hver styrktardagur). Á tímabili er æfingin viðhald: ekkert aukasett, markmiðið er geymt.")}</li>
            <li>{T("Never more than one extra set: not on top of the build block's extra set, not on a day the player's data already added an exercise, a light or taper week, a yellow or red day, a two-match week, or after a safety swap.", "Aldrei meira en eitt aukasett: ekki ofan á aukasett uppbyggingarblokkar, ekki þegar gögn leikmannsins bættu þegar við æfingu, í léttri viku eða niðurtröppun, á gulum eða rauðum degi, í viku með tveimur leikjum eða eftir öryggisskipti.")}</li>
            <li>{T("“DSI suggests” = the player's force-plate tests (jump ÷ mid-thigh pull) against the team: lower third → explosive, upper third → stronger legs, tests within 12 months. A suggestion from rules, not AI; the player chooses.", "„DSI bendir á“ = kraftplötupróf leikmannsins (stökk ÷ tog) borin saman við liðið: neðsti þriðjungur → sprengikraftur, efsti þriðjungur → sterkari fætur, próf innan 12 mánaða. Tillaga út frá reglum, ekki gervigreind; leikmaðurinn velur.")}</li>
            <li>{T("Safety rules still win (e.g. a sore lower back swaps the deadlift that day). Applies to individualised sessions.", "Öryggisreglur ráða áfram (t.d. aumur mjóhryggur skiptir út réttstöðulyftu þann dag). Gildir um einstaklingsmiðaðar æfingar.")}</li>
            <li>{T("8-week goals (top speed, acceleration, braking, jump) start the next Monday without your approval. You see them in the list above and can stop one with a reason. Injured or returning players still can't start one; under-18s get the youth plan.", "8 vikna markmið (hámarkshraði, hröðun, bremsun, stökk) byrja næsta mánudag án samþykkis þíns. Þú sérð þau í listanum hér fyrir ofan og getur stöðvað með ástæðu. Meiddir eða leikmenn í endurkomu geta ekki byrjað; undir 18 ára fá unglingaáætlun.")}</li>
          </ul>
          )}

          <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-800">
            <input type="checkbox" checked={s.enabled} disabled={busy}
              onChange={async (e) => { const m = await put({ action: "enable", enabled: e.target.checked }); if (m) setErr(m); }} />
            {s.hasList
              ? T("Players choose for themselves: exercises from the team list, a strength goal, and 8-week goals without approval", "Leikmenn velja sjálfir: æfingar af æfingalista liðsins, styrktarmarkmið og 8 vikna markmið án samþykkis")
              : T("Players start 8-week goals without my approval", "Leikmenn byrja 8 vikna markmið án samþykkis míns")}
          </label>

          {!s.enabled ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3" data-testid="picks-test">
              <p className="text-[12px] font-semibold text-slate-800">{T("Test with one player first", "Prófaðu fyrst með einum leikmanni")}</p>
              <p className="mt-0.5 text-[12px] text-slate-600">
                {s.hasList
                  ? T("Only this player sees “My exercises & goal”, and their 8-week goal starts without approval; the rest of the team sees nothing new.", "Aðeins þessi leikmaður sér „Mínar æfingar og markmið“ og 8 vikna markmið leikmannsins byrjar án samþykkis; restin af liðinu sér ekkert nýtt.")
                  : T("Only this player's 8-week goal starts without approval; the rest of the team asks as before.", "Aðeins 8 vikna markmið þessa leikmanns byrjar án samþykkis; restin af liðinu biður um eins og áður.")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={testPick} onChange={(e) => setTestPick(e.target.value)} disabled={busy}
                  className="min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]">
                  <option value="">{T("Choose a player…", "Veldu leikmann…")}</option>
                  {s.players.filter((p) => !p.testEnabled).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" disabled={busy || !testPick}
                  onClick={async () => { const m = await put({ action: "test", playerId: testPick, on: true }); if (m) setErr(m); else setTestPick(""); }}
                  className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                  {T("Turn on for this player", "Kveikja fyrir þennan leikmann")}
                </button>
              </div>
              {testers.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {testers.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 text-[12px] text-slate-700">
                      <span className="font-medium">{p.name}</span>
                      <button type="button" disabled={busy}
                        onClick={async () => { const m = await put({ action: "test", playerId: p.id, on: false }); if (m) setErr(m); }}
                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        {T("Turn off", "Slökkva")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {rows.length > 0 && s.groups.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="border-b border-slate-200 py-1.5 pr-2 font-medium">{T("Player", "Leikmaður")}</th>
                    <th className="border-b border-slate-200 px-2 py-1.5 font-medium">{T("Goal", "Markmið")}</th>
                    {s.groups.map((g) => <th key={g.slot} className="border-b border-slate-200 px-2 py-1.5 font-medium">{isEN ? g.label.en : g.label.is}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr className="align-top">
                        <td className="border-b border-slate-100 py-1.5 pr-2 font-medium text-slate-900">
                          {p.name}
                          {p.updatedByRole === "coach" ? <span className="ml-1 text-[10px] font-normal text-slate-400">{T("(you changed)", "(þú breyttir)")}</span> : null}
                          {p.testEnabled ? <span className="ml-1 rounded bg-[#2740e6]/10 px-1 text-[10px] font-semibold text-[#2740e6]">{T("test", "prufa")}</span> : null}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5">
                          <button type="button" onClick={() => setEdit(edit?.playerId === p.id && edit.slot === GOAL_CELL ? null : { playerId: p.id, slot: GOAL_CELL })}
                            className={`w-full rounded px-1.5 py-1 text-left hover:bg-slate-50 ${edit?.playerId === p.id && edit.slot === GOAL_CELL ? "bg-[#2740e6]/5" : ""}`}>
                            {p.goal ? <span className="block text-slate-800">{goalName(p.goal)}</span> : <span className="text-slate-400">{T("none", "ekkert")}</span>}
                            {p.suggestion ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500" title={`${isEN ? p.suggestion.reasonEN : p.suggestion.reasonIS} (${p.suggestion.cmjDate} / ${p.suggestion.imtpDate}, ${p.suggestion.tested} ${T("tested", "prófaðir")}). ${p.suggestion.source}`}>
                                {T("DSI suggests: ", "DSI bendir á: ")}{goalName(p.suggestion.goal)}
                              </span>
                            ) : null}
                            {p.goalLocked ? <span className="mt-0.5 block text-[10px] font-semibold text-[#de9328]">{T("Locked", "Læst")}</span> : null}
                          </button>
                        </td>
                        {s.groups.map((g) => {
                          const ids = p.picks[g.slot] ?? [];
                          const locked = p.locked.includes(g.slot);
                          const open = edit?.playerId === p.id && edit.slot === g.slot;
                          return (
                            <td key={g.slot} className="border-b border-slate-100 px-2 py-1.5">
                              <button type="button" onClick={() => setEdit(open ? null : { playerId: p.id, slot: g.slot })}
                                className={`w-full rounded px-1.5 py-1 text-left hover:bg-slate-50 ${open ? "bg-[#2740e6]/5" : ""}`}>
                                {ids.length ? ids.map((id, i) => <span key={id} className="block text-slate-800">{ids.length > 1 ? `${i + 1}. ` : ""}{nameOf(g, id)}</span>)
                                  : <span className="text-slate-400">{T("your order", "þín röð")}</span>}
                                {locked ? <span className="mt-0.5 block text-[10px] font-semibold text-[#de9328]">{T("Locked", "Læst")}</span> : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                      {edit?.playerId === p.id ? (
                        <tr>
                          <td colSpan={s.groups.length + 2} className="border-b border-slate-200 bg-slate-50 p-3">
                            {edit.slot === GOAL_CELL ? (
                              <GoalEditor key={`${p.id}-goal`} isEN={isEN} player={p} goals={s.goals} busy={busy}
                                onSave={async (body) => { const m = await put({ ...body, playerId: p.id }); if (!m) setEdit(null); return m; }}
                                onClose={() => setEdit(null)} />
                            ) : (
                              <CellEditor key={`${p.id}-${edit.slot}`} isEN={isEN} player={p} group={s.groups.find((g) => g.slot === edit.slot)!} busy={busy}
                                onSave={async (body) => { const m = await put({ ...body, playerId: p.id, slot: edit.slot }); if (!m) setEdit(null); return m; }}
                                onClose={() => setEdit(null)} />
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CellEditor({ isEN, player, group, busy, onSave, onClose }: {
  isEN: boolean;
  player: PlayerRow;
  group: Group;
  busy: boolean;
  onSave: (body: { action: "set"; ids: string[]; reason: string } | { action: "lock"; locked: boolean; reason: string }) => Promise<string | null>;
  onClose: () => void;
}) {
  const T = (en: string, is: string) => (isEN ? en : is);
  const [ids, setIds] = React.useState<string[]>(player.picks[group.slot] ?? []);
  const [reason, setReason] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const locked = player.locked.includes(group.slot);
  const reasonOk = reason.trim().length >= PICK_REASON_MIN;

  const toggle = (id: string) => setIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id)
    : cur.length >= group.max ? (group.max === 1 ? [id] : [...cur.slice(0, group.max - 1), id]) : [...cur, id]);

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-slate-800">{player.name} · {isEN ? group.label.en : group.label.is}</p>
      <div className="flex flex-wrap gap-1.5">
        {group.options.map((o) => {
          const rank = ids.indexOf(o.id);
          return (
            <button key={o.id} type="button" onClick={() => toggle(o.id)} aria-pressed={rank >= 0}
              className={`rounded-full border px-2.5 py-1 text-[12px] ${rank >= 0 ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {rank >= 0 && group.max > 1 ? `${rank + 1}. ` : ""}{isEN ? o.nameEN : o.nameIS}
            </button>
          );
        })}
      </div>
      <label className="block text-[12px] text-slate-700">
        <span className="font-semibold">{T("Reason (required, kept in the history)", "Ástæða (skylda, vistuð í sögunni)")}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !reasonOk}
          onClick={async () => setMsg(await onSave({ action: "set", ids, reason }))}
          className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
          {T("Save picks", "Vista val")}
        </button>
        <button type="button" disabled={busy || !reasonOk}
          onClick={async () => setMsg(await onSave({ action: "lock", locked: !locked, reason }))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50">
          {locked ? T("Unlock (player can choose)", "Aflæsa (leikmaður má velja)") : T("Lock (player can't change)", "Læsa (leikmaður getur ekki breytt)")}
        </button>
        <button type="button" onClick={onClose} className="px-2 text-[12px] text-slate-500">{T("Cancel", "Hætta við")}</button>
      </div>
      {msg ? <p className="text-[12px] text-[#a83e28]">{msg}</p> : null}
    </div>
  );
}

function GoalEditor({ isEN, player, goals, busy, onSave, onClose }: {
  isEN: boolean;
  player: PlayerRow;
  goals: Goal[];
  busy: boolean;
  onSave: (body: { action: "goal"; goal: string | null; reason: string } | { action: "goal_lock"; locked: boolean; reason: string }) => Promise<string | null>;
  onClose: () => void;
}) {
  const T = (en: string, is: string) => (isEN ? en : is);
  const [goal, setGoal] = React.useState<string | null>(player.goal);
  const [reason, setReason] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const reasonOk = reason.trim().length >= PICK_REASON_MIN;

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-slate-800">{player.name} · {T("Goal", "Markmið")}</p>
      <div className="flex flex-wrap gap-1.5">
        {goals.map((g) => (
          <button key={g.id} type="button" onClick={() => setGoal(goal === g.id ? null : g.id)} aria-pressed={goal === g.id} title={isEN ? g.whatEN : g.whatIS}
            className={`rounded-full border px-2.5 py-1 text-[12px] ${goal === g.id ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            {isEN ? g.en : g.is}
          </button>
        ))}
        <button type="button" onClick={() => setGoal(null)} aria-pressed={goal === null}
          className={`rounded-full border px-2.5 py-1 text-[12px] ${goal === null ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
          {T("No goal", "Ekkert markmið")}
        </button>
      </div>
      {goal ? <p className="text-[12px] text-slate-600">{(() => { const g = goals.find((x) => x.id === goal); return g ? (isEN ? g.whatEN : g.whatIS) : null; })()}</p> : null}
      {player.suggestion ? (
        <p className="text-[12px] text-slate-600" data-testid="coach-goal-suggestion">
          <span className="font-semibold">{T("DSI suggests: ", "DSI bendir á: ")}{(() => { const g = goals.find((x) => x.id === player.suggestion!.goal); return g ? (isEN ? g.en : g.is) : player.suggestion!.goal; })()}</span>
          {" — "}{isEN ? player.suggestion.reasonEN : player.suggestion.reasonIS}
          <span className="block text-[11px] text-slate-400">
            {T(`Jump test ${player.suggestion.cmjDate}, pull test ${player.suggestion.imtpDate}; ${player.suggestion.tested} tested on the team; ${player.suggestion.confidence === "high" ? "3+ good tries in both" : "few tries, treat as provisional"}. Rules, not AI.`,
              `Stökkpróf ${player.suggestion.cmjDate}, togpróf ${player.suggestion.imtpDate}; ${player.suggestion.tested} prófaðir í liðinu; ${player.suggestion.confidence === "high" ? "3+ góðar tilraunir í báðum" : "fáar tilraunir, bráðabirgða"}. Reglur, ekki gervigreind.`)}
          </span>
        </p>
      ) : null}
      <label className="block text-[12px] text-slate-700">
        <span className="font-semibold">{T("Reason (required, kept in the history)", "Ástæða (skylda, vistuð í sögunni)")}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !reasonOk}
          onClick={async () => setMsg(await onSave({ action: "goal", goal, reason }))}
          className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
          {T("Save goal", "Vista markmið")}
        </button>
        <button type="button" disabled={busy || !reasonOk}
          onClick={async () => setMsg(await onSave({ action: "goal_lock", locked: !player.goalLocked, reason }))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50">
          {player.goalLocked ? T("Unlock (player can choose)", "Aflæsa (leikmaður má velja)") : T("Lock (player can't change)", "Læsa (leikmaður getur ekki breytt)")}
        </button>
        <button type="button" onClick={onClose} className="px-2 text-[12px] text-slate-500">{T("Cancel", "Hætta við")}</button>
      </div>
      {msg ? <p className="text-[12px] text-[#a83e28]">{msg}</p> : null}
    </div>
  );
}
