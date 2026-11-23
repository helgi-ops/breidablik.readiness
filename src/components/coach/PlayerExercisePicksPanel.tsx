"use client";

/**
 * "Players' exercise picks & goals" (2026-11-17) on Player goals: who takes part, every player's strength goal
 * (lota 2) and picks (lota 1); the coach can change either or lock it (with a reason, kept in the history). No
 * approval step: a choice applies from the player's next session sent.
 *
 * Three send modes (2026-11-17): the team's mode (strength send page) is the switch. On "Individualised + goals"
 * everyone takes part and the coach can take a player out (reason kept); on "Individualised" the coach can let one
 * player in (e.g. a test); on "Standard" nobody chooses. Rules: strengthProgramming/sendMode.ts.
 *
 * Layered read: one sentence (mode + how many take part / have chosen) → plain facts → who takes part →
 * the player × (goal, groups) table (click a cell to change or lock).
 *
 * 2026-11-17: the goal's extra set only in pre-season / off-season (in season = maintenance), and the goal cell shows
 * what the player's force-plate tests suggest ("DSI suggests: …", rules not AI) next to what the player chose.
 *
 * Goals step 3 (2026-11-18): "Stronger legs" / "More explosive" are retired; only "Stronger hamstrings" can be set.
 * The DSI line now names the 8-week gym goal (Maximal strength / Explosive power) the player sees on My goal. A
 * retired goal still stored shows as a muted line (it adds nothing).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import Link from "next/link";
import { PICK_REASON_MIN } from "@/lib/micropulse/strengthProgramming/playerPicks";
import { SEND_MODE_TEXT, type SendMode } from "@/lib/micropulse/strengthProgramming/sendMode";

type Group = { slot: string; label: { en: string; is: string }; max: number; options: { id: string; nameEN: string; nameIS: string }[] };
type Goal = { id: string; en: string; is: string; whatEN: string; whatIS: string };
type Suggestion = { goal: string; reasonEN: string; reasonIS: string; cmjDate: string | null; imtpDate: string; tested: number; confidence: "high" | "moderate"; source: string; basis?: "imtp" | "dsi" };
type PlayerRow = {
  id: string;
  name: string;
  picks: Record<string, string[]>;
  locked: string[];
  goal: string | null;
  goalLocked: boolean;
  /** A retired goal still stored (2026-11-18), or null. */
  retiredGoal?: { en: string; is: string } | null;
  testEnabled: boolean;
  choicesOff: boolean;
  takesPart: boolean;
  suggestion?: Suggestion | null;
  updatedAt: string | null;
  updatedByRole: "player" | "coach" | null;
};
type State = {
  mode: SendMode;
  enabled: boolean;
  taking: number;
  out: number;
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
/** The 8-week gym goal a DSI suggestion names (goalSuggestion.ts, since 2026-11-18). */
const DSI_GOAL: Record<string, { en: string; is: string }> = {
  explosive: { en: "Explosive power (8-week goal)", is: "Sprengikraftur (8 vikna markmið)" },
  max_strength: { en: "Maximal strength (8-week goal)", is: "Hámarksstyrkur (8 vikna markmið)" },
};
const dsiGoalLabel = (id: string, isEN: boolean) => (DSI_GOAL[id] ? (isEN ? DSI_GOAL[id].en : DSI_GOAL[id].is) : id);

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
  const [outPick, setOutPick] = React.useState("");
  const [outReason, setOutReason] = React.useState("");

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
  const dsiGoalName = (id: string) => dsiGoalLabel(id, isEN);
  const testers = s ? s.players.filter((p) => p.testEnabled) : [];
  const outs = s ? s.players.filter((p) => p.choicesOff) : [];
  // Only the players who take part under the team's mode.
  const rows = s ? s.players.filter((p) => p.takesPart) : [];
  const modeName = (m: SendMode) => (isEN ? SEND_MODE_TEXT[m].label.en : SEND_MODE_TEXT[m].label.is);

  const verdict = (st: State) => {
    if (st.mode !== "individualised_goals") {
      const base = T(`Players choose nothing: the team's mode is ${modeName(st.mode)}.`, `Leikmenn velja ekkert: hamur liðsins er ${modeName(st.mode)}.`);
      if (st.mode === "standard" || st.taking === 0) return base;
      return st.taking === 1
        ? T(`${base.slice(0, -1)}; 1 player you let in takes part.`, `${base.slice(0, -1)}; 1 leikmaður sem þú hleyptir inn tekur þátt.`)
        : T(`${base.slice(0, -1)}; ${st.taking} players you let in take part.`, `${base.slice(0, -1)}; ${st.taking} leikmenn sem þú hleyptir inn taka þátt.`);
    }
    const a = T(`${st.taking} of ${st.total} players take part`, `${st.taking} af ${st.total} leikmönnum taka þátt`);
    if (!st.hasList) return `${a}.`;
    const b = st.picked === 1 ? T("1 has picked exercises", "1 hefur valið æfingar") : T(`${st.picked} have picked exercises`, `${st.picked} hafa valið æfingar`);
    const c = st.withGoal === 1 ? T("1 has a goal", "1 er með markmið") : T(`${st.withGoal} have a goal`, `${st.withGoal} eru með markmið`);
    return `${a}; ${b}; ${c}.`;
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
              <li>{T("A player who takes part starts an 8-week goal (top speed, acceleration, braking, jump, maximal strength, explosive power, strength + power) themselves; it starts the next Monday without your approval. You see it in the list above and can stop it with a reason. Players who don't take part can't start one.", "Leikmaður sem tekur þátt byrjar sjálfur 8 vikna markmið (hámarkshraði, hröðun, bremsun, stökk, hámarksstyrkur, sprengikraftur, styrkur + sprengikraftur) næsta mánudag án samþykkis þíns. Þú sérð það í listanum hér fyrir ofan og getur stöðvað með ástæðu. Leikmenn sem taka ekki þátt geta ekki byrjað.")}</li>
              <li>{T("Same plan and safety rules as when you approve with no changes. Injured or returning players can't start one; under-18s get the youth plan.", "Sama áætlun og öryggisreglur og þegar þú samþykkir án breytinga. Meiddir eða leikmenn í endurkomu geta ekki byrjað; undir 18 ára fá unglingaáætlun.")}</li>
              <li>{T("Exercise picks and a strength goal come too once the team has an exercise list (Strength → Exercise palette, at least 2 exercises in a group).", "Æfingaval og styrktarmarkmið bætast við þegar liðið er komið með æfingalista (Styrkur → Æfingasafn, a.m.k. 2 æfingar í flokki).")}</li>
            </ul>
          ) : (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-slate-600">
            <li>{T("Players choose from your team list (Strength → Exercise palette). Their picks go first in that group; you see every pick here.", "Leikmenn velja af æfingalista liðsins (Styrkur → Æfingasafn). Valið fer fremst í flokknum; þú sérð allt val hér.")}</li>
            <li>{T("No approval: a pick counts from the player's next session sent. Sets, reps and rest don't change, and the Nordic / Copenhagen block stays.", "Ekkert samþykki: valið gildir frá næstu æfingu sem leikmaður fær. Sett, endurtekningar og hvíld breytast ekki og Nordic / Copenhagen haldast.")}</li>
            <li>{T("In pre-season and off-season the “Stronger hamstrings” goal adds one set of Nordics on MD-4 (with no match within 5 days, every strength day). In season the session is maintenance: no extra set, the goal is kept.", "Á undirbúnings- og hvíldartímabili bætir markmiðið „Sterkari aftan í læri“ við einu setti af Nordic á MD-4 (enginn leikur innan 5 daga: hver styrktardagur). Á tímabili er æfingin viðhald: ekkert aukasett, markmiðið er geymt.")}</li>
            <li>{T("“Stronger legs” and “More explosive” are retired (since 18 Nov): the 8-week goals Maximal strength and Explosive power replace them. A player who had one keeps it on record, but it no longer adds a set.", "„Sterkari fætur“ og „Meiri sprengikraftur“ eru hætt (frá 18. nóv.): 8 vikna markmiðin Hámarksstyrkur og Sprengikraftur koma í staðinn. Leikmaður sem var með slíkt heldur því skráðu, en það bætir ekki lengur við setti.")}</li>
            <li>{T("Never more than one extra set: not on top of the build block's extra set, not on a day the player's data already added an exercise, a light or taper week, a yellow or red day, a two-match week, or after a safety swap.", "Aldrei meira en eitt aukasett: ekki ofan á aukasett uppbyggingarblokkar, ekki þegar gögn leikmannsins bættu þegar við æfingu, í léttri viku eða niðurtröppun, á gulum eða rauðum degi, í viku með tveimur leikjum eða eftir öryggisskipti.")}</li>
            <li>{T("“DSI suggests” = the 8-week gym goal the player's force-plate tests (jump ÷ mid-thigh pull) point to, against the team: lower third → Explosive power, upper third → Maximal strength, middle → nothing, both tests within 12 months. The player sees it on My goal and chooses. Rules, not AI.", "„DSI bendir á“ = 8 vikna salarmarkmiðið sem kraftplötupróf leikmannsins (stökk ÷ tog) benda á, borin saman við liðið: neðsti þriðjungur → Sprengikraftur, efsti þriðjungur → Hámarksstyrkur, miðjan → ekkert, bæði próf innan 12 mánaða. Leikmaðurinn sér það undir Markmiðið mitt og velur. Reglur, ekki gervigreind.")}</li>
            <li>{T("Safety rules still win (e.g. a sore lower back swaps the deadlift that day). Applies to individualised sessions.", "Öryggisreglur ráða áfram (t.d. aumur mjóhryggur skiptir út réttstöðulyftu þann dag). Gildir um einstaklingsmiðaðar æfingar.")}</li>
            <li>{T("8-week goals (top speed, acceleration, braking, jump, maximal strength, explosive power, strength + power) start the next Monday without your approval, and their gym lifts go into the day's strength session in pre- and off-season. You see them in the list above and can stop one with a reason. Injured or returning players still can't start one; under-18s get the youth plan.", "8 vikna markmið (hámarkshraði, hröðun, bremsun, stökk, hámarksstyrkur, sprengikraftur, styrkur + sprengikraftur) byrja næsta mánudag án samþykkis þíns, og lyftur þeirra fara inn í styrktaræfingu dagsins á undirbúnings- og hvíldartímabili. Þú sérð þau í listanum hér fyrir ofan og getur stöðvað með ástæðu. Meiddir eða leikmenn í endurkomu geta ekki byrjað; undir 18 ára fá unglingaáætlun.")}</li>
          </ul>
          )}

          {/* The switch is the team's send mode (strength send page). */}
          <p className="mt-3 text-[13px] text-slate-800" data-testid="picks-mode">
            {s.mode === "individualised_goals"
              ? T("On: the team's mode is Individualised + goals. ", "Kveikt: hamur liðsins er Einstaklingsmiðað + markmið. ")
              : T("To let the whole team choose, set Individualised + goals as the team's mode. ", "Til að leyfa öllu liðinu að velja, gerðu Einstaklingsmiðað + markmið að ham liðsins. ")}
            <Link href="/coach/strength" className="font-semibold text-[#2740e6] underline">{T("Strength send page", "Sendingarsíða styrktaræfinga")}</Link>
          </p>

          {s.mode === "individualised_goals" ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3" data-testid="picks-out">
              <p className="text-[12px] font-semibold text-slate-800">{T("Take a player out", "Taka leikmann út")}</p>
              <p className="mt-0.5 text-[12px] text-slate-600">
                {T("That player gets the data + screen session without their own goal or picks, and can't start a new 8-week goal. A goal already running finishes as its own card. The reason is kept in the history.",
                  "Sá leikmaður fær æfingu út frá gögnum og skimun án eigin markmiðs og vals og getur ekki byrjað nýtt 8 vikna markmið. Markmið sem er í gangi klárast sem sér spjald. Ástæðan er vistuð í sögunni.")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={outPick} onChange={(e) => setOutPick(e.target.value)} disabled={busy}
                  className="min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]">
                  <option value="">{T("Choose a player…", "Veldu leikmann…")}</option>
                  {s.players.filter((p) => !p.choicesOff).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input value={outReason} onChange={(e) => setOutReason(e.target.value)} maxLength={500} disabled={busy}
                  placeholder={T("Reason (required)", "Ástæða (skylda)")}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" />
                <button type="button" disabled={busy || !outPick || outReason.trim().length < PICK_REASON_MIN}
                  onClick={async () => { const m = await put({ action: "out", playerId: outPick, out: true, reason: outReason }); if (m) setErr(m); else { setOutPick(""); setOutReason(""); } }}
                  className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                  {T("Take out", "Taka út")}
                </button>
              </div>
              {outs.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {outs.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 text-[12px] text-slate-700">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-400">{T("out", "úti")}</span>
                      <button type="button" disabled={busy || outReason.trim().length < PICK_REASON_MIN}
                        title={T("Write a reason above first", "Skrifaðu ástæðu fyrir ofan fyrst")}
                        onClick={async () => { const m = await put({ action: "out", playerId: p.id, out: false, reason: outReason }); if (m) setErr(m); else setOutReason(""); }}
                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        {T("Put back", "Setja aftur inn")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : s.mode === "individualised" ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3" data-testid="picks-test">
              <p className="text-[12px] font-semibold text-slate-800">{T("Let one player take part", "Hleypa einum leikmanni inn")}</p>
              <p className="mt-0.5 text-[12px] text-slate-600">
                {s.hasList
                  ? T("Only this player sees “My goal” and “My exercises & goal”, and their goal goes into their strength session; the rest of the team sees nothing new. Good for a test.", "Aðeins þessi leikmaður sér „Markmiðið mitt“ og „Mínar æfingar og markmið“, og markmiðið fer inn í styrktaræfinguna; restin af liðinu sér ekkert nýtt. Hentar sem prufa.")
                  : T("Only this player can start an 8-week goal (without approval); the rest of the team sees nothing new. Good for a test.", "Aðeins þessi leikmaður getur byrjað 8 vikna markmið (án samþykkis); restin af liðinu sér ekkert nýtt. Hentar sem prufa.")}
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
                  {T("Let this player in", "Hleypa þessum leikmanni inn")}
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
                        {T("Take out", "Taka út")}
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
                          {p.testEnabled && s.mode !== "individualised_goals" ? <span className="ml-1 rounded bg-[#2740e6]/10 px-1 text-[10px] font-semibold text-[#2740e6]">{T("let in", "hleypt inn")}</span> : null}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5">
                          <button type="button" onClick={() => setEdit(edit?.playerId === p.id && edit.slot === GOAL_CELL ? null : { playerId: p.id, slot: GOAL_CELL })}
                            className={`w-full rounded px-1.5 py-1 text-left hover:bg-slate-50 ${edit?.playerId === p.id && edit.slot === GOAL_CELL ? "bg-[#2740e6]/5" : ""}`}>
                            {p.goal ? <span className="block text-slate-800">{goalName(p.goal)}</span> : <span className="text-slate-400">{T("none", "ekkert")}</span>}
                            {p.retiredGoal ? <span className="mt-0.5 block text-[10px] text-slate-400" title={isEN ? p.retiredGoal.en : p.retiredGoal.is}>{T("old goal retired", "gamalt markmið hætt")}</span> : null}
                            {p.suggestion ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500" title={`${isEN ? p.suggestion.reasonEN : p.suggestion.reasonIS} (${[p.suggestion.cmjDate, p.suggestion.imtpDate].filter(Boolean).join(" / ")}, ${p.suggestion.tested} ${T("tested", "prófaðir")}). ${p.suggestion.source}`}>
                                {p.suggestion.basis === "imtp" ? T("Pull test suggests: ", "Togpróf bendir á: ") : T("DSI suggests: ", "DSI bendir á: ")}{dsiGoalName(p.suggestion.goal)}
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
      {player.retiredGoal ? <p className="text-[12px] text-slate-500">{isEN ? player.retiredGoal.en : player.retiredGoal.is}</p> : null}
      {player.suggestion ? (
        <p className="text-[12px] text-slate-600" data-testid="coach-goal-suggestion">
          <span className="font-semibold">{player.suggestion.basis === "imtp" ? T("Pull test suggests: ", "Togpróf bendir á: ") : T("DSI suggests: ", "DSI bendir á: ")}{dsiGoalLabel(player.suggestion.goal, isEN)}</span>
          {" — "}{isEN ? player.suggestion.reasonEN : player.suggestion.reasonIS}
          <span className="block text-[11px] text-slate-400">
            {T(`${player.suggestion.cmjDate ? `Jump test ${player.suggestion.cmjDate}, pull` : "Pull"} test ${player.suggestion.imtpDate}; ${player.suggestion.tested} tested on the team; ${player.suggestion.confidence === "high" ? (player.suggestion.basis === "imtp" ? "3+ good tries" : "3+ good tries in both") : "few tries, treat as provisional"}. Rules, not AI.`,
              `${player.suggestion.cmjDate ? `Stökkpróf ${player.suggestion.cmjDate}, togpróf` : "Togpróf"} ${player.suggestion.imtpDate}; ${player.suggestion.tested} prófaðir í liðinu; ${player.suggestion.confidence === "high" ? (player.suggestion.basis === "imtp" ? "3+ góðar tilraunir" : "3+ góðar tilraunir í báðum") : "fáar tilraunir, bráðabirgða"}. Reglur, ekki gervigreind.`)}
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
