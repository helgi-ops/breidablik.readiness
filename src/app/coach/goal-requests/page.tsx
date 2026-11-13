"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/goal-requests — players' goal requests (lota 2): "I want to improve my top speed / acceleration / braking /
 * vertical jump". The coach reviews the plan the rules built from the player's own data, can choose another start
 * the safety rules allow (with a logged reason), sets the start date, and approves or declines. Approved plans can be
 * stopped with a reason. Every step is in the plan's history (audit trail).
 *
 * The plan is an add-on on its own card: it never changes the readiness colour or Today's session. From its start
 * date the player sees each day's session on Today (lota 3). It pauses itself when the player is marked injured /
 * in rehab / returning to training, and the coach restarts it here (at the paused week, or week 1 after a long
 * break). Nothing is sent (no push).
 *
 * Lota 4: progress and outcome for a running, paused, finished or stopped plan — sessions the player ticked, the
 * test results (the coach enters them; jump height also comes from VALD), the change against the plan's "clear
 * change" mark, GPS as context only, and a PDF of the whole plan.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";
import { getSupabaseClient } from "@/lib/supabaseClient";
import PagePurpose from "@/components/coach/PagePurpose";
import { GoalPlanView } from "@/components/coach/GoalPlanPreviewCard";
import type { Bi, GoalPlan, GoalQuality } from "@/lib/micropulse/goalPlan/types";
import {
  EVENT_LABEL,
  REASON_MIN,
  STATUS_LABEL,
  nextMonday,
  type GoalPlanEventRow,
  type GoalPlanRow,
  type GoalPlanStatus,
} from "@/lib/micropulse/goalPlan/requests";
import { MEASURE_DEF, PHASE_LABEL, QUALITY_MEASURES, type GoalMeasure, type GoalProgress, type ResultPhase } from "@/lib/micropulse/goalPlan/outcome";

const QUALITY: Record<GoalQuality, Bi> = {
  top_speed: { en: "Top speed", is: "Hámarkshraði" },
  acceleration: { en: "Acceleration", is: "Hröðun" },
  braking: { en: "Braking", is: "Bremsun" },
  jump: { en: "Vertical jump", is: "Lóðrétt stökk" },
};

const STATUS_STYLE: Record<GoalPlanStatus, string> = {
  requested: "bg-[#de9328]/15 text-[#8a5a12]",
  approved: "bg-[#1c7a4a]/10 text-[#1c7a4a]",
  paused: "bg-slate-200 text-slate-700",
  declined: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
  completed: "bg-slate-100 text-slate-500",
};

type ListItem = Omit<GoalPlanRow, "proposal" | "plan" | "engine_version" | "content_version"> & { player_name: string | null };
type Review = {
  row: GoalPlanRow;
  playerName: string | null;
  plan: GoalPlan;
  ruleStart: string | null;
  starts: { key: string; label: Bi; rule: boolean }[];
  events: GoalPlanEventRow[];
  weekView: { week: number; sessions: { slot: string; focus: Bi; date: string | null; md: string | null }[]; weekKnown: boolean } | null;
  resumeDefault: number | null;
  progress: GoalProgress | null;
};

async function authed(path: string, init?: RequestInit) {
  const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch(path, { ...init, cache: "no-store", headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${tok}`, "Content-Type": "application/json" } });
  const j = await res.json().catch(() => ({}));
  return { res, j: j as Record<string, unknown> };
}

const fmtDate = (iso: string | null, isEN: boolean) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(isEN ? "en-GB" : "is-IS", { day: "numeric", month: "short" }) : "";

export default function GoalRequestsPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  const [items, setItems] = React.useState<ListItem[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { res, j } = await authed("/api/coach/goal-plans/requests");
      if (!alive) return;
      if (res.status === 402) { setErr(T("Goal plans are part of the Pro plan.", "Markmiðsáætlanir eru hluti af Pro.")); return; }
      if (!res.ok) { setErr(String(j.error ?? res.status)); return; }
      const list = (j.items ?? []) as ListItem[];
      setItems(list);
      const fromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") : null;
      setSel((cur) => cur ?? (fromUrl && list.some((i) => i.id === fromUrl) ? fromUrl : list.find((i) => i.status === "requested")?.id ?? list[0]?.id ?? null));
    })();
    return () => { alive = false; };
    // T only switches the wording of an error; reloading on a language change is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const waiting = items?.filter((i) => i.status === "requested").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900">{T("Player goal requests", "Markmiðsbeiðnir leikmanna")}</h1>
        <p className="mt-0.5 text-[13px] text-slate-600">
          {err ? null : items == null ? T("Loading…", "Sæki…") : waiting
            ? T(`${waiting} waiting for your answer.`, `${waiting} bíða svars.`)
            : T("Nothing waiting for an answer.", "Ekkert bíður svars.")}
        </p>
      </div>
      <PagePurpose
        en="answer players who asked to improve one quality: the rules build an 8-week add-on plan from the player's own data, and you approve it, choose another start (with a reason) or decline it. It never changes the readiness colour or Today's session."
        is="svara leikmönnum sem báðu um að bæta einn þátt: reglurnar búa til 8 vikna viðbót út frá gögnum leikmannsins og þú samþykkir, velur annað upphaf (með ástæðu) eða hafnar. Breytir aldrei readiness-litnum eða æfingu dagsins."
      />
      {err ? <p className="text-[13px] text-[#a83e28]">{err}</p> : null}

      {items && items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-600">
          {T("No requests yet. Players ask from Today → See more → My goal.", "Engar beiðnir enn. Leikmenn biðja um í Today → Skoða meira → Markmiðið mitt.")}
        </p>
      ) : null}

      {items && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => setSel(i.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${sel === i.id ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <span className="block text-[13px] font-semibold text-slate-900">{i.player_name ?? T("Player", "Leikmaður")}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    {L(QUALITY[i.quality])}
                    <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[i.status]}`}>{L(STATUS_LABEL[i.status])}</span>
                    {fmtDate(i.requested_at, isEN)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            {sel ? <ReviewPanel key={`${sel}-${reload}`} id={sel} isEN={isEN} onChanged={() => setReload((n) => n + 1)} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewPanel({ id, isEN, onChanged }: { id: string; isEN: boolean; onChanged: () => void }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const [start, setStart] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Review | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [startDate, setStartDate] = React.useState(() => nextMonday(new Date().toISOString().slice(0, 10)));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [fromWeek, setFromWeek] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const q = start ? `?start=${encodeURIComponent(start)}` : "";
      const { res, j } = await authed(`/api/coach/goal-plans/requests/${encodeURIComponent(id)}${q}`);
      if (!alive) return;
      if (!res.ok) { setErr(String(j.error ?? res.status)); return; }
      setErr(null);
      setData(j as unknown as Review);
    })();
    return () => { alive = false; };
  }, [id, start]);

  if (err) return <p className="text-[13px] text-[#a83e28]">{T("Couldn't load this request.", "Tókst ekki að sækja beiðnina.")} ({err})</p>;
  if (!data) return <p className="text-[13px] text-slate-400">{T("Reading the player's data…", "Les gögn leikmannsins…")}</p>;

  const { row, plan } = data;
  const chosen = start ?? data.ruleStart;
  const changed = !!chosen && !!data.ruleStart && chosen !== data.ruleStart;
  const reasonOk = reason.trim().length >= REASON_MIN;

  const pausedWeek = Math.max(1, row.paused_week ?? 1);
  const resumeWeek = fromWeek ?? data.resumeDefault ?? 1;
  const resumeNeedsReason = resumeWeek > (data.resumeDefault ?? 1);

  const decide = async (action: "approve" | "decline" | "stop" | "resume") => {
    setBusy(true); setMsg(null);
    const body = action === "approve"
      ? { action, startDate, start: chosen, reason: changed ? reason : undefined, noteToPlayer: note || undefined }
      : action === "resume" ? { action, startDate, fromWeek: resumeWeek, reason: reason || undefined, noteToPlayer: note || undefined }
      : action === "decline" ? { action, reason, noteToPlayer: note || undefined } : { action, reason };
    const { res, j } = await authed(`/api/coach/goal-plans/requests/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setMsg(String(j.error ?? res.status)); return; }
    onChanged();
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[16px] font-semibold text-slate-900">{data.playerName ?? T("Player", "Leikmaður")} · {L(QUALITY[row.quality])}</h2>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[row.status]}`}>{L(STATUS_LABEL[row.status])}</span>
      </div>
      <p className="text-[12px] text-slate-500">
        {T(`Asked ${fmtDate(row.requested_at, true)}`, `Beðið um ${fmtDate(row.requested_at, false)}`)}
        {row.start_date ? ` · ${T(`Weeks ${fmtDate(row.start_date, true)} – ${fmtDate(row.end_date, true)}`, `Vikur ${fmtDate(row.start_date, false)} – ${fmtDate(row.end_date, false)}`)}` : ""}
      </p>
      {row.player_note ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700"><span className="font-semibold">{T("Player's note:", "Athugasemd leikmanns:")}</span> {row.player_note}</p> : null}
      {row.status === "requested" ? (
        <p className="text-[11px] text-slate-500">{T("Built from today's data. The plan is frozen when you approve it.", "Byggt á gögnum dagsins. Áætlunin er fryst þegar þú samþykkir.")}</p>
      ) : row.plan ? (
        <p className="text-[11px] text-slate-500">{T(`The plan as approved (content ${plan.contentVersion}).`, `Áætlunin eins og hún var samþykkt (efni ${plan.contentVersion}).`)}</p>
      ) : null}

      <GoalPlanView key={`${plan.quality}-${plan.branch?.key ?? ""}`} plan={plan} isEN={isEN} />

      {row.status === "requested" && plan.status === "ok" ? (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {data.starts.length > 1 ? (
            <label className="block text-[12px] text-slate-700">
              <span className="font-semibold">{T("Start", "Upphaf")}</span>
              <select value={chosen ?? ""} onChange={(e) => setStart(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
                {data.starts.map((s) => <option key={s.key} value={s.key}>{L(s.label)}{s.rule ? T(" (rule's suggestion)", " (tillaga reglunnar)") : ""}</option>)}
              </select>
              <span className="mt-0.5 block text-[11px] text-slate-500">{T("Only starts the safety rules allow for this player are listed.", "Aðeins upphöf sem öryggisreglurnar leyfa fyrir þennan leikmann eru í boði.")}</span>
            </label>
          ) : null}
          <label className="block text-[12px] text-slate-700">
            <span className="font-semibold">{T("First week starts (Monday)", "Fyrsta vika hefst (mánudagur)")}</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          </label>
          <label className="block text-[12px] text-slate-700">
            <span className="font-semibold">{changed ? T("Why another start? (required, kept in the history)", "Af hverju annað upphaf? (skylda, vistað í sögunni)") : T("Reason (required to decline, kept in the history)", "Ástæða (skylda til að hafna, vistuð í sögunni)")}</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          </label>
          <label className="block text-[12px] text-slate-700">
            <span className="font-semibold">{T("Note to the player (optional)", "Skilaboð til leikmanns (valfrjálst)")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || (changed && !reasonOk)} onClick={() => decide("approve")}
              className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{T("Approve", "Samþykkja")}</button>
            <button type="button" disabled={busy || !reasonOk} onClick={() => decide("decline")}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 disabled:opacity-50">{T("Decline", "Hafna")}</button>
          </div>
          <p className="text-[11px] text-slate-500">{T("The player sees the answer on their request screen, and from the start date each day's session on Today. Nothing is sent (no push).", "Leikmaðurinn sér svarið á beiðnaskjánum og frá upphafsdegi æfingu hvers dags á Today. Ekkert er sent (engin tilkynning).")}</p>
        </div>
      ) : null}

      {row.status === "requested" && plan.status !== "ok" ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-[12px] text-slate-700">{T("No plan can be approved now. You can decline with a reason.", "Ekki er hægt að samþykkja áætlun núna. Þú getur hafnað með ástæðu.")}</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder={T("Reason", "Ástæða")} className="block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          <button type="button" disabled={busy || !reasonOk} onClick={() => decide("decline")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 disabled:opacity-50">{T("Decline", "Hafna")}</button>
        </div>
      ) : null}

      {row.status === "approved" && data.weekView ? (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="text-[12px] font-semibold text-slate-800">
            {data.weekView.week < 1
              ? T(`Starts ${fmtDate(row.start_date, true)}.`, `Hefst ${fmtDate(row.start_date, false)}.`)
              : T(`Week ${data.weekView.week} of 8 — where this week's sessions land`, `Vika ${data.weekView.week} af 8 — hvar æfingar vikunnar lenda`)}
          </p>
          {data.weekView.sessions.length ? (
            <ul className="space-y-0.5 text-[12px] text-slate-700">
              {data.weekView.sessions.map((s) => (
                <li key={s.slot}>
                  <span className="font-semibold">{s.slot}</span> · {L(s.focus)} · {s.date
                    ? `${new Date(`${s.date}T12:00:00Z`).toLocaleDateString(isEN ? "en-GB" : "is-IS", { weekday: "short", day: "numeric", month: "short" })}${s.md ? ` (${s.md})` : ""}`
                    : T("no free day this week (left out)", "enginn laus dagur þessa viku (sleppt)")}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] text-slate-500">
            {T("Rules place the sessions: never on a match day, the day before or after, a rest or recovery day; at least 2 days apart. The player sees the lighter version on a yellow day and skips it on red.", "Reglur raða æfingunum: aldrei á leikdegi, deginum fyrir eða eftir, hvíldar- eða endurheimtardegi; minnst 2 dagar á milli. Leikmaðurinn sér léttari útgáfu á gulum degi og sleppir henni á rauðum.")}
            {data.weekView.weekKnown ? "" : T(" This week's training days are not set, so any day away from a match counts.", " Æfingadagar vikunnar eru ekki settir, svo allir dagar fjarri leik teljast með.")}
          </p>
        </div>
      ) : null}

      {row.status === "paused" ? (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <p className="text-[12.5px] text-slate-800">
            {T(`Paused in week ${pausedWeek}${row.paused_at ? ` on ${fmtDate(row.paused_at, true)}` : ""}: the player was marked injured, in rehab or returning to training. Only you restart it.`,
              `Sett í bið í viku ${pausedWeek}${row.paused_at ? ` ${fmtDate(row.paused_at, false)}` : ""}: leikmaðurinn var skráður meiddur, í endurhæfingu eða í endurkomu. Aðeins þú setur hana aftur af stað.`)}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="block text-[12px] text-slate-700">
              <span className="font-semibold">{T("Pick up at week", "Halda áfram í viku")}</span>
              <select value={resumeWeek} onChange={(e) => setFromWeek(Number(e.target.value))} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
                {Array.from({ length: pausedWeek }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>{w}{w === data.resumeDefault ? T(" (rule's suggestion)", " (tillaga reglunnar)") : ""}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-slate-700">
              <span className="font-semibold">{T("From Monday", "Frá mánudegi")}</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            {T("After a break of more than 21 days the rule restarts from week 1. Picking up later than the suggestion needs a reason.", "Eftir hlé lengra en 21 dagur byrjar reglan aftur í viku 1. Að halda áfram seinna en tillagan segir þarf ástæðu.")}
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
            placeholder={resumeNeedsReason ? T("Why pick up later than the suggestion? (required)", "Af hverju seinna en tillagan? (skylda)") : T("Reason (optional to restart, required to stop)", "Ástæða (valfrjáls til að halda áfram, skylda til að stöðva)")}
            className="block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder={T("Note to the player (optional)", "Skilaboð til leikmanns (valfrjálst)")} className="block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || (resumeNeedsReason && !reasonOk)} onClick={() => decide("resume")} className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{T("Restart the plan", "Halda áætluninni áfram")}</button>
            <button type="button" disabled={busy || !reasonOk} onClick={() => decide("stop")} className="rounded-lg border border-[#a83e28]/40 px-3 py-1.5 text-[13px] font-medium text-[#a83e28] disabled:opacity-50">{T("Stop the plan", "Stöðva áætlunina")}</button>
          </div>
        </div>
      ) : null}

      {row.status === "approved" ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {row.coach_note ? <p className="text-[12px] text-slate-600"><span className="font-semibold">{T("Your note to the player:", "Skilaboð þín til leikmanns:")}</span> {row.coach_note}</p> : null}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder={T("Reason to stop the plan", "Ástæða til að stöðva áætlunina")} className="block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          <button type="button" disabled={busy || !reasonOk} onClick={() => decide("stop")} className="rounded-lg border border-[#a83e28]/40 px-3 py-1.5 text-[13px] font-medium text-[#a83e28] disabled:opacity-50">{T("Stop the plan", "Stöðva áætlunina")}</button>
        </div>
      ) : null}

      {msg ? <p className="text-[12px] text-[#a83e28]">{msg}</p> : null}

      {data.progress ? <ProgressPanel id={id} data={data} progress={data.progress} isEN={isEN} onChanged={onChanged} /> : null}

      {data.events.length ? (
        <details className="border-t border-slate-100 pt-2">
          <summary className="cursor-pointer text-[12px] font-medium text-primary">{T("History", "Saga")}</summary>
          <ul className="mt-1.5 space-y-1">
            {data.events.map((e) => (
              <li key={e.id} className="text-[11.5px] text-slate-600">
                <span className="text-slate-400">{fmtDate(e.created_at, isEN)}</span> · {L(EVENT_LABEL[e.kind])}
                {e.reason ? <span className="text-slate-500"> · {e.reason}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

const OUTCOME_STYLE = {
  improved: "bg-[#2740e6]/10 text-[#2740e6]",
  no_clear_change: "bg-slate-100 text-slate-600",
  worse: "bg-[#de9328]/15 text-[#8a5a12]",
  waiting: "bg-slate-100 text-slate-500",
} as const;

/** Lota 4: what the 8 weeks did — ticks, tests, outcome — plus result entry and the PDF. */
function ProgressPanel({ id, data, progress, isEN, onChanged }: { id: string; data: Review; progress: GoalProgress; isEN: boolean; onChanged: () => void }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const { row, plan } = data;
  const measures = QUALITY_MEASURES[row.quality];
  const [measure, setMeasure] = React.useState<GoalMeasure>(measures[0]);
  const [phase, setPhase] = React.useState<ResultPhase>(() => (row.status === "completed" || (data.weekView?.week ?? 0) >= 7 ? "retest" : "baseline"));
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const o = progress.outcome;
  const def = MEASURE_DEF[measure];
  const canEnter = row.status === "approved" || row.status === "paused" || row.status === "completed";
  const outcomeLabel = o.state === "improved" ? T("Clear change", "Skýr breyting")
    : o.state === "no_clear_change" ? T("No clear change", "Engin skýr breyting")
      : o.state === "worse" ? T("Changed the wrong way", "Breyting í ranga átt") : T("Waiting for tests", "Bíður prófa");
  const main = o.measures.find((m) => m.measure === o.main) ?? null;

  const add = async () => {
    setBusy(true); setMsg(null);
    const { res, j } = await authed(`/api/coach/goal-plans/requests/${encodeURIComponent(id)}/results`, {
      method: "POST", body: JSON.stringify({ measure, phase, value: Number(value.replace(",", ".")), testDate: date, note: note || undefined }),
    });
    setBusy(false);
    if (!res.ok) { setMsg(String(j.error ?? res.status)); return; }
    onChanged();
  };
  const remove = async (resultId: string) => {
    setBusy(true); setMsg(null);
    const { res, j } = await authed(`/api/coach/goal-plans/requests/${encodeURIComponent(id)}/results?resultId=${encodeURIComponent(resultId)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setMsg(String(j.error ?? res.status)); return; }
    onChanged();
  };
  const pdf = async () => {
    setBusy(true); setMsg(null);
    try {
      const { downloadGoalPlanPdf } = await import("@/components/coach/GoalPlanPdf");
      await downloadGoalPlanPdf({
        playerName: data.playerName, status: row.status, startDate: row.start_date, endDate: row.end_date, coachNote: row.coach_note,
        plan, progress, events: data.events,
      }, isEN ? "EN" : "IS");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{T("Progress and outcome", "Framvinda og niðurstaða")}</p>
        <button type="button" disabled={busy} onClick={pdf} className="rounded-lg border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 disabled:opacity-50">{T("PDF", "PDF")}</button>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${OUTCOME_STYLE[o.state]}`}>{outcomeLabel}</span>
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-slate-900">{L(o.verdict)}</p>
      </div>
      <ul className="space-y-0.5 text-[12.5px] text-slate-700">
        <li>{L(progress.adherence.line)}</li>
        {main ? <li>{T(`Clear change from ${MEASURE_DEF[main.measure].clearPct}%`, `Skýr breyting frá ${MEASURE_DEF[main.measure].clearPct}%`)} · {L(MEASURE_DEF[main.measure].clearBasis)}.</li> : <li>{L(plan.tests.what)}</li>}
      </ul>

      {progress.results.length ? (
        <ul className="space-y-1 rounded-lg border border-slate-200 p-2">
          {progress.results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-[12px] text-slate-700">
              <span className="font-semibold">{L(MEASURE_DEF[r.measure].label)}</span>
              <span className="text-slate-500">{L(PHASE_LABEL[r.phase])} · {fmtDate(r.test_date, isEN)}</span>
              <span className="font-display font-semibold">{r.value.toFixed(MEASURE_DEF[r.measure].decimals)} {MEASURE_DEF[r.measure].unit}</span>
              <span className="text-[11px] text-slate-400">{r.source === "vald" ? r.note ?? "VALD" : r.note ?? ""}</span>
              {r.source === "coach" && canEnter ? (
                <button type="button" disabled={busy} onClick={() => remove(r.id)} className="ml-auto text-[11px] text-[#a83e28] disabled:opacity-50">{T("Remove", "Fjarlægja")}</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canEnter ? (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
          <p className="text-[12px] font-semibold text-slate-800">{T("Enter a test result", "Skrá prófniðurstöðu")}</p>
          <div className="flex flex-wrap gap-2">
            {measures.length > 1 ? (
              <select value={measure} onChange={(e) => setMeasure(e.target.value as GoalMeasure)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
                {measures.map((m) => <option key={m} value={m}>{L(MEASURE_DEF[m].label)}</option>)}
              </select>
            ) : <span className="self-center text-[12.5px] font-medium text-slate-700">{L(def.label)}</span>}
            <select value={phase} onChange={(e) => setPhase(e.target.value as ResultPhase)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
              <option value="baseline">{L(PHASE_LABEL.baseline)}</option>
              <option value="retest">{L(PHASE_LABEL.retest)}</option>
            </select>
            <label className="flex items-center gap-1 text-[12px] text-slate-600">
              <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={def.better === "lower" ? "1.85" : def.unit === "cm" ? "38.5" : "31.2"} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
              {def.unit}
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder={T("Note (optional): gates, video app, best of 3…", "Athugasemd (valfrjáls): tímahlið, myndbandsforrit, besti af 3…")} className="block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          <button type="button" disabled={busy || !value.trim()} onClick={add} className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{T("Save result", "Vista niðurstöðu")}</button>
          <p className="text-[11px] text-slate-500">
            {T(`${def.better === "lower" ? "Lower is better" : "Higher is better"}. ${row.quality === "jump" ? "Jump height from VALD shows on its own; enter it here only when tested another way. " : ""}A later entry for the same test replaces the earlier one in the outcome; every entry is kept in the history.`,
              `${def.better === "lower" ? "Lægra er betra" : "Hærra er betra"}. ${row.quality === "jump" ? "Stökkhæð úr VALD birtist sjálfkrafa; skráðu hér aðeins ef prófað var öðruvísi. " : ""}Seinni skráning á sama próf kemur í stað þeirrar fyrri í niðurstöðunni; allar skráningar eru vistaðar í sögunni.`)}
          </p>
        </div>
      ) : null}

      <details className="text-[11.5px] text-slate-600">
        <summary className="cursor-pointer font-medium text-primary">{T("Show details", "Sýna nánar")}</summary>
        <ul className="mt-1.5 list-inside list-disc space-y-1">
          {o.measures.map((m) => <li key={m.measure}>{L(m.line)}</li>)}
          {progress.gps ? <li>{L(progress.gps.line)}</li> : null}
          <li>{L(plan.tests.change)}</li>
          <li>{T(`Counted up to ${fmtDate(progress.until, true)}. A session counts as due once its day has passed; the player ticks done or not done on Today.`, `Talið til ${fmtDate(progress.until, false)}. Æfing telst á dagskrá þegar dagurinn er liðinn; leikmaðurinn merkir búið eða ekki gert á Í dag.`)}</li>
          <li>{T("Rules compare the tests; there is no AI here.", "Reglur bera prófin saman; hér er engin gervigreind.")}</li>
        </ul>
      </details>
      {msg ? <p className="text-[12px] text-[#a83e28]">{msg}</p> : null}
    </div>
  );
}
