"use client";

/**
 * Goal plan preview (lota 1): "if this player asked to improve top speed / acceleration / braking / vertical jump,
 * this is what MicroPulse would suggest". Four tabs, one per quality, built by rules from the player's own data.
 *
 * Layered read: the plan in one sentence → 2–3 plain facts + confidence → "Show details" (weeks, tests, safety,
 * sources). Coach-only preview: nothing is saved or sent to the player. Never the readiness colour, never Today's
 * session.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi, GoalPlan, GoalQuality, GoalWeek } from "@/lib/micropulse/goalPlan/types";

const QUALITY: Record<GoalQuality, Bi> = {
  top_speed: { en: "Top speed", is: "Hámarkshraði" },
  acceleration: { en: "Acceleration", is: "Hröðun" },
  braking: { en: "Braking", is: "Bremsun" },
  jump: { en: "Vertical jump", is: "Lóðrétt stökk" },
};
const EVIDENCE: Record<GoalPlan["evidence"], Bi> = {
  researched: { en: "Researched", is: "Rannsakað" },
  partly: { en: "Partly researched", is: "Að hluta rannsakað" },
  rule_of_thumb: { en: "Rule of thumb", is: "Þumalputtaregla" },
};
const CONF: Record<GoalPlan["confidence"]["level"], Bi> = {
  high: { en: "high confidence", is: "mikil vissa" },
  moderate: { en: "moderate confidence", is: "miðlungs vissa" },
  low: { en: "low confidence", is: "lítil vissa" },
};
const EV_STYLE: Record<GoalPlan["evidence"], string> = {
  researched: "bg-[#1c7a4a]/10 text-[#1c7a4a]",
  partly: "bg-[#de9328]/15 text-[#8a5a12]",
  rule_of_thumb: "bg-slate-200 text-slate-600",
};

export default function GoalPlanPreviewCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [plans, setPlans] = React.useState<GoalPlan[] | null>(null);
  const [openGoal, setOpenGoal] = React.useState<{ id: string; quality: GoalQuality; status: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<GoalQuality>("top_speed");
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  React.useEffect(() => {
    // The parent mounts this card with key={playerId}, so a new player starts from empty state.
    let alive = true;
    if (!playerId) return;
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const res = await fetch(`/api/coach/goal-plans/${encodeURIComponent(playerId)}/preview`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.status === 402) { setErr("locked"); return; }
        if (!res.ok || !Array.isArray(j.plans)) { setErr(String(j.error ?? res.status)); return; }
        setPlans(j.plans as GoalPlan[]);
        setOpenGoal((j.openGoal ?? null) as typeof openGoal);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : "error"); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (err === "locked") return null;
  const plan = plans?.find((p) => p.quality === tab) ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold text-slate-900">{T("Goal plans: what MicroPulse would suggest", "Markmiðsáætlanir: hvað MicroPulse myndi leggja til")}</h3>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{T("Preview: nothing is sent to the player", "Forskoðun: ekkert fer til leikmanns")}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">{T("If the player asked to improve one of these, this 8-week add-on would be suggested from the player's own data. Rules, not AI.", "Ef leikmaðurinn bæði um að bæta eitt af þessu yrði þessi 8 vikna viðbót lögð til út frá gögnum leikmannsins. Reglur, ekki gervigreind.")}</p>
      {openGoal ? (
        <a href={`/coach/goal-requests?id=${encodeURIComponent(openGoal.id)}`} className="mt-2 block rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] text-slate-800 hover:bg-primary/10">
          <span className="font-semibold">{openGoal.status === "requested"
            ? T(`The player asked for a ${L(QUALITY[openGoal.quality]).toLowerCase()} plan.`, `Leikmaðurinn bað um áætlun í ${L(QUALITY[openGoal.quality]).toLowerCase()}.`)
            : T(`${L(QUALITY[openGoal.quality])} plan is ${openGoal.status === "paused" ? "paused" : "approved"}.`, `Áætlun í ${L(QUALITY[openGoal.quality]).toLowerCase()} er ${openGoal.status === "paused" ? "í bið" : "samþykkt"}.`)}</span>{" "}
          <span className="text-primary">{openGoal.status === "requested" ? T("Review it →", "Fara yfir →") : T("Open →", "Opna →")}</span>
        </a>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
        {(Object.keys(QUALITY) as GoalQuality[]).map((q) => {
          const p = plans?.find((x) => x.quality === q);
          const active = q === tab;
          return (
            <button key={q} type="button" role="tab" aria-selected={active} onClick={() => setTab(q)}
              className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium ${active ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              {L(QUALITY[q])}{p?.status === "blocked" ? <span className={active ? "text-white/70" : "text-slate-400"}> · {T("not now", "ekki núna")}</span> : null}
            </button>
          );
        })}
      </div>

      {err ? <p className="mt-3 text-[12px] text-[#a83e28]">{T("Couldn't load the preview.", "Tókst ekki að sækja forskoðunina.")} ({err})</p> : null}
      {!plans && !err ? <p className="mt-3 text-[12px] text-slate-400">{T("Reading the player's data…", "Les gögn leikmannsins…")}</p> : null}

      {plan ? <div className="mt-3"><GoalPlanView key={plan.quality} plan={plan} isEN={isEN} /></div> : null}
    </section>
  );
}

/**
 * One plan, layered: the plan in one sentence → 2–3 plain facts + evidence/confidence → what would change it and
 * missing data → "Show details" (weeks, tests, safety, limits, sources). Shared by the preview card and the coach's
 * review of a player's request.
 */
export function GoalPlanView({ plan, isEN }: { plan: GoalPlan; isEN: boolean }) {
  const [open, setOpen] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  return (
        <div>
          <p className="text-[14px] font-semibold leading-snug text-slate-900">{L(plan.verdict)}</p>
          {plan.status === "ok" ? (
            <>
              <ul className="mt-2 space-y-1">
                {plan.facts.map((f, i) => <li key={i} className="text-[12.5px] leading-snug text-slate-700">• {L(f)}</li>)}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                <span className={`rounded px-1.5 py-0.5 font-medium ${EV_STYLE[plan.evidence]}`}>{L(EVIDENCE[plan.evidence])}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{L(CONF[plan.confidence.level])}</span>
                <span className="text-slate-500">{T(`${plan.sessionsPerWeek} short sessions a week · 8 weeks`, `${plan.sessionsPerWeek} stuttar æfingar á viku · 8 vikur`)}</span>
                {plan.youthLevel ? <span className="rounded bg-[#de9328]/15 px-1.5 py-0.5 text-[#8a5a12]">{T("Easier level, coach at every session", "Léttara stig, þjálfari við hverja æfingu")}</span> : null}
              </div>
              {plan.counterfactual ? <p className="mt-2 text-[11.5px] text-slate-500"><span className="font-semibold">{T("What would change it:", "Hvað myndi breyta því:")}</span> {L(plan.counterfactual)}</p> : null}
              {plan.confidence.missing.length ? (
                <p className="mt-1 text-[11px] text-slate-500"><span className="font-semibold">{T("Missing data:", "Gögn sem vantar:")}</span> {plan.confidence.missing.map(L).join(" · ")}</p>
              ) : null}

              <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-[12px] font-medium text-primary hover:underline">
                {open ? T("Hide details", "Fela nánar") : T("Show details", "Sýna nánar")}
              </button>
              {open ? <Details plan={plan} L={L} T={T} /> : null}
            </>
          ) : null}
        </div>
  );
}

function Details({ plan, L, T }: { plan: GoalPlan; L: (b: Bi) => string; T: (en: string, is: string) => string }) {
  return (
    <div className="mt-2 space-y-3 border-t border-slate-100 pt-3">
      {plan.branch ? (
        <p className="text-[12px] text-slate-700"><span className="font-semibold">{T("Starting point:", "Upphaf:")}</span> {L(plan.branch.label)}. {L(plan.branch.why)}</p>
      ) : null}
      {plan.confidence.used.length ? (
        <p className="text-[11.5px] text-slate-600"><span className="font-semibold">{T("Data used:", "Gögn notuð:")}</span> {plan.confidence.used.map(L).join(" · ")}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2 font-semibold">{T("Week", "Vika")}</th>
              <th className="py-1 pr-2 font-semibold">{T("Session", "Æfing")}</th>
              <th className="py-1 font-semibold">{T("What", "Hvað")}</th>
            </tr>
          </thead>
          <tbody>
            {plan.weeks.map((w: GoalWeek) => w.sessions.map((s, si) => (
              <tr key={`${w.week}-${s.slot}`} className="border-b border-slate-100 align-top">
                {si === 0 ? <td className="py-1.5 pr-2 font-medium text-slate-800" rowSpan={w.sessions.length}>{L(w.label)}</td> : null}
                <td className="py-1.5 pr-2 text-slate-700">
                  <span className="font-semibold">{s.slot}</span> · {L(s.focus)}
                  <div className="text-[10.5px] text-slate-500">{L(s.when)} · {s.minutes} min</div>
                </td>
                <td className="py-1.5 text-slate-700">
                  {s.blocks.map((b, bi) => (
                    <div key={bi} className={bi ? "mt-1" : ""}>
                      <span className="font-medium">{L(b.what)}</span>: {L(b.dose)}
                      {b.supervised ? <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] text-primary">{T("coach there", "þjálfari á staðnum")}</span> : null}
                      {b.test ? <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{T("test", "mæling")}</span> : null}
                    </div>
                  ))}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Tests", "Mælingar")}</p>
        <p className="text-[12px] text-slate-700">{L(plan.tests.what)}</p>
        <p className="text-[11.5px] text-slate-500">{L(plan.tests.change)}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Safety", "Öryggi")}</p>
        <p className="text-[12px] text-slate-700">{L(plan.supervision)}</p>
        <ul className="mt-1 space-y-0.5">{plan.safety.map((s, i) => <li key={i} className="text-[11.5px] text-slate-600">• {L(s)}</li>)}</ul>
      </div>
      {plan.limits.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("What the research does not show", "Það sem rannsóknirnar sýna ekki")}</p>
          <ul className="mt-1 space-y-0.5">{plan.limits.map((s, i) => <li key={i} className="text-[11.5px] text-slate-600">• {L(s)}</li>)}</ul>
        </div>
      ) : null}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Sources", "Heimildir")}</p>
        <ul className="mt-1 space-y-0.5">
          {plan.refs.map((r) => (
            <li key={r.key} className="text-[10.5px] text-slate-500">
              {r.cite} <span className="text-slate-400">({r.verifiedFrom === "full_text" ? T("read in full", "lesin í heild") : T("abstract only", "aðeins ágrip")})</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] italic text-slate-500">{L(plan.basis)}</p>
      </div>
    </div>
  );
}
