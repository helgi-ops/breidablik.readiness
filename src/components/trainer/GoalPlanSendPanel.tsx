"use client";

/**
 * Programme Library "Speed & power": the coach picks a player and sends a goal plan for this quality to the player's
 * app (2026-11-15). The plan is the player's own goal plan — built from their data by the same rules as a player's
 * request (start, level, the team's swaps) — and it is written as approved in one step
 * (`/api/coach/goal-plans/start`). The player sees it under "My goal" on Today. Nothing else is sent (no push, no
 * email); never the readiness colour or Today's session.
 *
 * Layered read: the plan in one sentence + why this start → what the player gets → "See the plan" (GoalPlanView,
 * weeks and sources) → the send form.
 */

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client/authFetch";
import { GoalPlanView } from "@/components/coach/GoalPlanPreviewCard";
import { QUALITY_LABEL } from "@/lib/micropulse/goalPlan/common";
import { LEVEL_LABEL, LEVEL_YOUTH_NOTE, type TrainingLevel } from "@/lib/micropulse/goalPlan/levels";
import { REASON_MIN, STATUS_LABEL, nextMonday, type GoalPlanStatus } from "@/lib/micropulse/goalPlan/requests";
import type { Bi, GoalPlan, GoalQuality } from "@/lib/micropulse/goalPlan/types";

type Lang = "IS" | "EN";
export type RosterPlayer = { id: string; name: string; openGoal: { id: string; quality: GoalQuality; status: GoalPlanStatus } | null };

type Preview = {
  playerName: string | null;
  plan: GoalPlan;
  ruleStart: string | null;
  starts: { key: string; label: Bi; rule: boolean }[];
  levels: TrainingLevel[];
  openGoal: RosterPlayer["openGoal"];
};

const API = "/api/coach/goal-plans/start";
// Written out: not every browser has Icelandic date names.
const IS_DAY = ["sunnudeginum", "mánudeginum", "þriðjudeginum", "miðvikudeginum", "fimmtudeginum", "föstudeginum", "laugardeginum"];
const IS_MONTH = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
const fmtDay = (iso: string, IS: boolean) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return IS
    ? `${IS_DAY[d.getUTCDay()]} ${d.getUTCDate()}. ${IS_MONTH[d.getUTCMonth()]}`
    : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};
const errText = (j: Record<string, unknown>, IS: boolean, fallback: string) =>
  String((IS ? j.error_is : null) ?? j.error ?? fallback);

export default function GoalPlanSendPanel({
  player,
  quality,
  level,
  lang,
  onSent,
}: {
  player: RosterPlayer;
  quality: GoalQuality;
  /** The library's level for this quality (the team's saved level). */
  level: TrainingLevel;
  lang: Lang;
  onSent: () => void;
}) {
  const IS = lang === "IS";
  const L = (b: Bi) => (IS ? b.is : b.en);
  const T = (en: string, is: string) => (IS ? is : en);

  const [start, setStart] = useState<string | null>(null);
  const [data, setData] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => nextMonday(new Date().toISOString().slice(0, 10)));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ id: string; startDate: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const qs = new URLSearchParams({ playerId: player.id, quality, level });
      if (start) qs.set("start", start);
      const res = await authFetch(`${API}?${qs}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!alive) return;
      if (!res.ok) { setErr(errText(j, IS, String(res.status))); return; }
      setErr(null);
      setData(j as unknown as Preview);
    })();
    return () => { alive = false; };
    // The language only changes wording of an error; reloading on it is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, quality, level, start]);

  const name = player.name;
  if (err) return <p className="text-xs text-[#a83e28]">{T("Couldn't read the player's data.", "Tókst ekki að lesa gögn leikmannsins.")} ({err})</p>;
  if (!data) return <p className="text-xs text-slate-400">{T("Reading the player's data…", "Les gögn leikmannsins…")}</p>;

  const open = data.openGoal;
  if (sent || open) {
    const id = sent?.id ?? open!.id;
    return (
      <div className="space-y-2 text-sm">
        {sent ? (
          <p className="rounded-lg bg-[#1c7a4a]/10 px-3 py-2 text-[#1c7a4a]">
            {T(`Sent. ${name} sees the plan under "My goal" on Today from ${fmtDay(sent.startDate, false)}.`, `Sent. ${name} sér planið undir „Markmiðið mitt“ á Í dag frá ${fmtDay(sent.startDate, true)}.`)}
          </p>
        ) : (
          <p className="rounded-lg bg-[#de9328]/10 px-3 py-2 text-slate-700">
            {T(`${name} already has an open goal: ${L(QUALITY_LABEL[open!.quality])} (${L(STATUS_LABEL[open!.status])}). One goal at a time.`,
              `${name} er nú þegar með opið markmið: ${L(QUALITY_LABEL[open!.quality])} (${L(STATUS_LABEL[open!.status])}). Eitt markmið í einu.`)}
          </p>
        )}
        <a href={`/coach/goal-requests?id=${encodeURIComponent(id)}`} className="inline-block text-xs font-semibold text-[#2740e6] underline">
          {T("Open it in Player goals (progress, tests and the PDF with the name)", "Opna í Markmiðum leikmanna (framvinda, próf og PDF með nafni)")}
        </a>
      </div>
    );
  }

  const { plan } = data;
  if (plan.status !== "ok") {
    return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{plan.blocked ? L(plan.blocked.text) : T("No plan can be sent now.", "Ekki hægt að senda plan núna.")}</p>;
  }

  const chosen = start ?? data.ruleStart;
  const changed = !!chosen && !!data.ruleStart && chosen !== data.ruleStart;
  const reasonOk = reason.trim().length >= REASON_MIN;
  const levelNote = plan.youthLevel
    ? L(LEVEL_YOUTH_NOTE)
    : !data.levels.includes(level)
      ? T(`The ${L(LEVEL_LABEL[level]).toLowerCase()} level is not offered for this start; the plan uses ${L(LEVEL_LABEL[plan.level ?? "intermediate"]).toLowerCase()}.`,
        `${L(LEVEL_LABEL[level])} er ekki í boði fyrir þetta upphaf; planið notar ${L(LEVEL_LABEL[plan.level ?? "intermediate"]).toLowerCase()}.`)
      : T(`Level: ${L(LEVEL_LABEL[plan.level ?? level])} (the level picked below).`, `Stig: ${L(LEVEL_LABEL[plan.level ?? level])} (stigið sem er valið hér fyrir neðan).`);

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await authFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player.id, quality, startDate, start: chosen, level: plan.level ?? null,
          reason: changed ? reason : undefined, noteToPlayer: note || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) { setMsg(errText(j, IS, T("Could not send.", "Tókst ekki að senda."))); return; }
      setSent({ id: String(j.id), startDate });
      onSent();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        {T(`${name} gets a goal plan built from their own data: ${plan.sessionsPerWeek} sessions a week for 8 weeks, placed on the team's training days, under "My goal" on Today. It is an add-on to team training, so it can differ from the "Individual" plan below.`,
          `${name} fær markmiðsplan byggt á eigin gögnum: ${plan.sessionsPerWeek} æfingar á viku í 8 vikur, settar á æfingadaga liðsins, undir „Markmiðið mitt“ á Í dag. Það er viðbót við liðsæfingar og getur því verið annað en „Einstaklingur“-planið hér fyrir neðan.`)}
      </p>

      <GoalPlanView key={`${plan.quality}-${plan.branch?.key ?? ""}-${plan.level ?? ""}`} plan={plan} isEN={!IS} />

      <div className="grid gap-3 sm:grid-cols-2">
        {data.starts.length > 1 ? (
          <label className="block text-xs text-slate-700">
            <span className="font-semibold">{T("Start", "Upphaf")}</span>
            <select value={chosen ?? ""} onChange={(e) => setStart(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]">
              {data.starts.map((s) => <option key={s.key} value={s.key}>{L(s.label)}{s.rule ? T(" (rule's suggestion)", " (tillaga reglunnar)") : ""}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block text-xs text-slate-700">
          <span className="font-semibold">{T("First week starts (Monday)", "Fyrsta vika hefst (mánudagur)")}</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">{levelNote}</p>
      {changed ? (
        <label className="block text-xs text-slate-700">
          <span className="font-semibold">{T("Why another start? (required, kept in the history)", "Af hverju annað upphaf? (skylda, vistað í sögunni)")}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" />
        </label>
      ) : null}
      <label className="block text-xs text-slate-700">
        <span className="font-semibold">{T("Note to the player (optional)", "Skilaboð til leikmanns (valfrjálst)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px]" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || (changed && !reasonOk)} onClick={send}
          className="rounded-lg bg-[#1c7a4a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? T("Sending…", "Sendi…") : T(`Send to ${name}'s app`, `Senda í app · ${name}`)}
        </button>
        <span className="text-[11px] text-slate-500">{T("No push or email: it shows on Today. You can stop it in Player goals.", "Engin tilkynning eða tölvupóstur: það birtist á Í dag. Þú getur stöðvað það í Markmiðum leikmanna.")}</span>
      </div>
      {msg ? <p className="text-xs text-[#a83e28]">{msg}</p> : null}
    </div>
  );
}
