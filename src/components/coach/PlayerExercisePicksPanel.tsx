"use client";

/**
 * "Players' exercise picks" (player exercise picks, lota 1, 2026-11-17) on Player goals: the coach turns picks on
 * for the team, sees every player's picks, and can change a pick or lock a group (with a reason, kept in the
 * history). No approval step: a player's pick applies from their next session sent.
 *
 * Layered read: one sentence (how many have picked / off) → three plain facts → the switch → the player × group
 * table (click a cell to change or lock).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { PICK_REASON_MIN } from "@/lib/micropulse/strengthProgramming/playerPicks";

type Group = { slot: string; label: { en: string; is: string }; max: number; options: { id: string; nameEN: string; nameIS: string }[] };
type PlayerRow = { id: string; name: string; picks: Record<string, string[]>; locked: string[]; updatedAt: string | null; updatedByRole: "player" | "coach" | null };
type State = { enabled: boolean; hasList: boolean; groups: Group[]; players: PlayerRow[]; picked: number; total: number };

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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="exercise-picks-panel">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{T("Players' exercise picks", "Æfingaval leikmanna")}</div>
      {err ? <p className="mt-1 text-[13px] text-[#a83e28]">{err}</p> : null}
      {!err && !s ? <p className="mt-1 text-[13px] text-slate-400">{T("Loading…", "Sæki…")}</p> : null}

      {s ? (
        <>
          <p className="mt-1 text-[15px] font-semibold text-slate-900">
            {!s.hasList
              ? T("Players can't pick yet: the team list needs at least 2 exercises in a group.", "Leikmenn geta ekki valið enn: æfingalisti liðsins þarf a.m.k. 2 æfingar í flokki.")
              : !s.enabled
                ? T("Off: players use your list in your order.", "Slökkt: leikmenn fá listann þinn í þinni röð.")
                : s.picked === 1
                  ? T(`1 of ${s.total} players has picked exercises.`, `1 af ${s.total} leikmönnum hefur valið æfingar.`)
                  : T(`${s.picked} of ${s.total} players have picked exercises.`, `${s.picked} af ${s.total} leikmönnum hafa valið æfingar.`)}
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-slate-600">
            <li>{T("Players choose from your team list (Strength → Exercise palette). Their picks go first in that group; you see every pick here.", "Leikmenn velja af æfingalista liðsins (Styrkur → Æfingasafn). Valið fer fremst í flokknum; þú sérð allt val hér.")}</li>
            <li>{T("No approval: a pick counts from the player's next session sent. Sets, reps and rest don't change, and the Nordic / Copenhagen block stays.", "Ekkert samþykki: valið gildir frá næstu æfingu sem leikmaður fær. Sett, endurtekningar og hvíld breytast ekki og Nordic / Copenhagen haldast.")}</li>
            <li>{T("Safety rules still win (e.g. a sore lower back swaps the deadlift that day). Applies to individualised sessions.", "Öryggisreglur ráða áfram (t.d. aumur mjóhryggur skiptir út réttstöðulyftu þann dag). Gildir um einstaklingsmiðaðar æfingar.")}</li>
          </ul>

          {s.hasList ? (
            <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-800">
              <input type="checkbox" checked={s.enabled} disabled={busy}
                onChange={async (e) => { const m = await put({ action: "enable", enabled: e.target.checked }); if (m) setErr(m); }} />
              {T("Players may pick exercises from the team list", "Leikmenn mega velja æfingar af æfingalista liðsins")}
            </label>
          ) : null}

          {s.enabled && s.groups.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="border-b border-slate-200 py-1.5 pr-2 font-medium">{T("Player", "Leikmaður")}</th>
                    {s.groups.map((g) => <th key={g.slot} className="border-b border-slate-200 px-2 py-1.5 font-medium">{isEN ? g.label.en : g.label.is}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.players.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr className="align-top">
                        <td className="border-b border-slate-100 py-1.5 pr-2 font-medium text-slate-900">
                          {p.name}
                          {p.updatedByRole === "coach" ? <span className="ml-1 text-[10px] font-normal text-slate-400">{T("(you changed)", "(þú breyttir)")}</span> : null}
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
                          <td colSpan={s.groups.length + 1} className="border-b border-slate-200 bg-slate-50 p-3">
                            <CellEditor key={`${p.id}-${edit.slot}`} isEN={isEN} player={p} group={s.groups.find((g) => g.slot === edit.slot)!} busy={busy}
                              onSave={async (body) => { const m = await put({ ...body, playerId: p.id, slot: edit.slot }); if (!m) setEdit(null); return m; }}
                              onClose={() => setEdit(null)} />
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
