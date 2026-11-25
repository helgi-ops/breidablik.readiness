"use client";

/**
 * "Build meso" / "Build macro" — the button + the draft on the hub's Meso and Macro tabs (plan_proposals,
 * draft → accept, one route with `?scope=meso|macro`).
 *
 * The system proposes from its existing rules (meso: the fixture-aware block engine; macro: the season-phase
 * dates from the fixtures). The coach's saved choices stand, the rule fills the rest, and the coach changes any
 * of it in the draft. Nothing reaches the season plan until "Use this plan", which first shows what changes.
 * Layered read: verdict → 2–3 facts + confidence → the editable table behind a toggle. Rules decide; no AI.
 */

import * as React from "react";
import { CiteRefs } from "@/components/coach/CiteRefs";
import type { MesoProposal, MesoEdits } from "@/lib/micropulse/periodization/mesoProposal";
import type { MacroProposal, MacroEdits, MacroKey } from "@/lib/micropulse/periodization/macroProposal";
import { macroDateEn, macroDateIs } from "@/lib/micropulse/periodization/macroProposal";

type Bi = { en: string; is: string };
type Scope = "meso" | "macro";
type Draft<P> = { id: string; season_year: number; from_scratch: boolean; proposal: P; coach_edits: unknown; updated_at: string; created_at: string };
type MesoSummary = { lengths: number; goals: number; lightWeeks: number };
type MacroSummary = { datesChanged: number };

const API = "/api/coach/periodization/proposal";
const GOAL: Record<"accum" | "transmute" | "realize", Bi> = {
  accum: { en: "Accumulation", is: "Uppsöfnun" },
  transmute: { en: "Transmutation", is: "Umbreyting" },
  realize: { en: "Realization", is: "Framkvæmd" },
};
const DAY = 86_400_000;
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);

const COPY: Record<Scope, { title: Bi; blurb: Bi; button: Bi; done: Bi }> = {
  meso: {
    title: { en: "Build the season's blocks for me", is: "Settu upp lotur tímabilsins fyrir mig" },
    blurb: { en: "The system lays out every block of the competitive season from the fixtures: length, goal and light weeks. Your saved choices stay. You get a draft to change before anything is saved.", is: "Kerfið setur upp allar lotur keppnistímabilsins út frá leikjaskránni: lengd, markmið og léttar vikur. Það sem þú hefur vistað stendur. Þú færð drög til að breyta áður en nokkuð er vistað." },
    button: { en: "Build meso", is: "Setja upp meso" },
    done: { en: "Blocks saved to the season plan.", is: "Loturnar eru vistaðar í tímabilsplanið." },
  },
  macro: {
    title: { en: "Set the season's dates for me", is: "Settu upp dagsetningar tímabilsins fyrir mig" },
    blurb: { en: "The system proposes the season's dates from the fixtures: pre-season start, season end, off-season and the next pre-season. Your saved dates stay. You get a draft to change before anything is saved.", is: "Kerfið leggur til dagsetningar tímabilsins út frá leikjaskránni: upphaf undirbúnings, lok tímabils, undirbúningshlé og næsta undirbúning. Dagsetningar sem þú hefur vistað standa. Þú færð drög til að breyta áður en nokkuð er vistað." },
    button: { en: "Build macro", is: "Setja upp makró" },
    done: { en: "Season dates saved.", is: "Dagsetningar tímabilsins eru vistaðar." },
  },
};

export default function PlanProposalPanel({ scope, is, authHeader, onAccepted }: {
  scope: Scope;
  is: boolean;
  authHeader: () => Promise<string>;
  onAccepted: () => void;
}) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const fmt = (iso: string | null) => (iso ? (is ? macroDateIs(iso) : macroDateEn(iso)) : "–");
  const [draft, setDraft] = React.useState<Draft<MesoProposal | MacroProposal> | null>(null);
  const [busy, setBusy] = React.useState<null | "load" | "build" | "edit" | "preview" | "accept" | "discard">("load");
  const [err, setErr] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState(true);
  const [confirm, setConfirm] = React.useState<null | { kind: "accept"; summary: MesoSummary | MacroSummary } | { kind: "scratch" } | { kind: "discard" }>(null);
  const [lastAcceptedAt, setLastAcceptedAt] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const call = React.useCallback(async (method: "GET" | "POST", body?: unknown, extra = "") => {
    const r = await fetch(`${API}?scope=${scope}${extra}`, { method, headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }, [authHeader, scope]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const j = await call("GET");
        if (!live) return;
        setDraft(j.draft ?? null); setLastAcceptedAt(j.lastAcceptedAt ?? null); setBusy(null);
      } catch (e) { if (live) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); } }
    })();
    return () => { live = false; };
  }, [call]);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const build = (fromScratch: boolean) => run("build", async () => { setConfirm(null); setDone(false); const j = await call("POST", { action: "build", fromScratch }); setDraft(j.draft); });
  const edit = (body: MesoEdits | { dates: MacroEdits }) => run("edit", async () => { const j = await call("POST", { action: "edit", ...body }); setDraft(j.draft); });
  const preview = () => run("preview", async () => { const j = await call("GET", undefined, "&preview=1"); if (j.preview) setConfirm({ kind: "accept", summary: j.preview }); else setErr(t({ en: "Nothing to preview.", is: "Ekkert að sýna." })); });
  const accept = () => run("accept", async () => { await call("POST", { action: "accept" }); setConfirm(null); setDraft(null); setDone(true); setLastAcceptedAt(new Date().toISOString()); onAccepted(); });
  const discard = () => run("discard", async () => { await call("POST", { action: "discard" }); setDraft(null); setConfirm(null); });

  const btn = "h-9 rounded-lg px-3 text-[13px] font-semibold disabled:opacity-50";
  const primary = `${btn} bg-[#2740e6] text-white hover:brightness-110`;
  const ghost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  const sel = "h-8 rounded-md border border-slate-300 bg-white px-1.5 text-[12px] text-slate-900 disabled:opacity-50";
  const badge = (coach: boolean) => (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${coach ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-100 text-slate-600"}`}>{coach ? t({ en: "your choice", is: "þitt val" }) : t({ en: "rule", is: "regla" })}</span>
  );
  const c = COPY[scope];

  if (!draft) {
    return (
      <section className="mb-4 rounded-xl border border-[#2740e6]/25 bg-[#2740e6]/[0.03] p-4 sm:p-5" aria-label={t(c.button)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-slate-900">{t(c.title)}</h2>
            <p className="mt-0.5 text-[13px] text-slate-600">{t(c.blurb)}</p>
            {lastAcceptedAt && <p className="mt-1 text-[11px] text-slate-400">{t({ en: "Last plan used", is: "Síðasta plan notað" })} {new Date(lastAcceptedAt).toLocaleDateString(is ? "is-IS" : "en-GB")}</p>}
          </div>
          <button type="button" className={primary} disabled={busy != null} onClick={() => void build(false)}>
            {busy === "build" ? t({ en: "Building…", is: "Set upp…" }) : t(c.button)}
          </button>
        </div>
        {done && <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-800">✓ {t(c.done)}</p>}
        {err && <p className="mt-2 text-[12px] font-medium text-[#a83e28]">{err}</p>}
      </section>
    );
  }

  const p = draft.proposal;
  const confTone = p.confidence.level === "high" ? "bg-emerald-50 text-emerald-800" : p.confidence.level === "moderate" ? "bg-amber-50 text-amber-800" : "bg-[#a83e28]/10 text-[#a83e28]";
  const lock = busy != null;

  const mesoTable = (m: MesoProposal) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-2 font-semibold">{t({ en: "Block", is: "Lota" })}</th>
            <th className="py-1 pr-2 font-semibold">{t({ en: "Weeks", is: "Vikur" })}</th>
            <th className="py-1 pr-2 font-semibold">{t({ en: "Goal", is: "Markmið" })}</th>
            <th className="py-1 pr-2 font-semibold">{t({ en: "Light week", is: "Létt vika" })}</th>
            <th className="py-1 font-semibold">{t({ en: "Why", is: "Af hverju" })}</th>
          </tr>
        </thead>
        <tbody>
          {m.blocks.map((b) => (
            <tr key={b.start} className="border-b border-slate-100 align-top">
              <td className="py-1.5 pr-2 font-medium text-slate-800">
                {fmt(b.start)} → {fmt(b.end)}
                <div className="text-[11px] font-normal text-slate-500">{b.games} {t(b.games === 1 ? { en: "game", is: "leikur" } : { en: "games", is: "leikir" })}</div>
              </td>
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1">
                  <select className={sel} disabled={lock} value={b.lengthSource === "coach" ? String(b.weeks) : ""} aria-label={t({ en: "Block length", is: "Lengd lotu" })}
                    onChange={(e) => void edit({ blockWeeks: { [b.start]: e.target.value ? Number(e.target.value) : null } })}>
                    <option value="">{t({ en: `rule (${b.weeks})`, is: `regla (${b.weeks})` })}</option>
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {badge(b.lengthSource === "coach")}
                </div>
              </td>
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1">
                  <select className={sel} disabled={lock} value={b.goalSource === "coach" ? b.goal : ""} aria-label={t({ en: "Block goal", is: "Markmið lotu" })}
                    onChange={(e) => void edit({ blockGoals: { [b.start]: (e.target.value || null) as "accum" | "transmute" | "realize" | null } })}>
                    <option value="">{t({ en: `rule (${GOAL[b.goal].en})`, is: `regla (${GOAL[b.goal].is})` })}</option>
                    {(["accum", "transmute", "realize"] as const).map((g) => <option key={g} value={g}>{t(GOAL[g])}</option>)}
                  </select>
                  {badge(b.goalSource === "coach")}
                </div>
              </td>
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1">
                  <select className={sel} disabled={lock} value={b.lightWeek ?? ""} aria-label={t({ en: "Light week", is: "Létt vika" })}
                    onChange={(e) => void edit({ blockDeload: { [b.start]: e.target.value || null } })}>
                    <option value="">{t({ en: "none", is: "engin" })}</option>
                    {Array.from({ length: b.weeks }, (_, k) => addDays(b.start, k * 7)).map((w, k) => (
                      <option key={w} value={w}>{t({ en: `week ${k + 1} (${fmt(w)})`, is: `vika ${k + 1} (${fmt(w)})` })}</option>
                    ))}
                  </select>
                  {b.lightWeek && badge(b.lightSource === "coach")}
                </div>
              </td>
              <td className="py-1.5 text-slate-600">{t(b.reason)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {t({ en: "Block goals", is: "Markmið lota" })}: <CiteRefs text={m.cite.goals} is={is} /> · {t({ en: "light weeks in-season", is: "léttar vikur á tímabili" })}: <CiteRefs text={m.cite.light} is={is} />
      </p>
    </div>
  );

  const macroTable = (m: MacroProposal) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-2 font-semibold">{t({ en: "Date", is: "Dagsetning" })}</th>
            <th className="py-1 pr-2 font-semibold">{t({ en: "Value", is: "Gildi" })}</th>
            <th className="py-1 pr-2 font-semibold">{t({ en: "Whose", is: "Hvers" })}</th>
            <th className="py-1 font-semibold">{t({ en: "Why", is: "Af hverju" })}</th>
          </tr>
        </thead>
        <tbody>
          {m.dates.map((d) => (
            <tr key={d.key} className="border-b border-slate-100 align-top">
              <td className="py-1.5 pr-2 font-medium text-slate-800">{t(d.label)}</td>
              <td className="py-1.5 pr-2">
                {d.editable ? (
                  <input type="date" className={`${sel} tabular-nums`} disabled={lock} value={d.value ?? ""} aria-label={t(d.label)}
                    onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) void edit({ dates: { [d.key as MacroKey]: e.target.value } }); }} />
                ) : <span className="tabular-nums text-slate-900">{fmt(d.value)}</span>}
              </td>
              <td className="py-1.5 pr-2">
                {d.source === "fixtures" ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{t({ en: "fixtures", is: "leikjaskrá" })}</span> : badge(d.source === "coach")}
                {d.source === "coach" && d.editable && (
                  <button type="button" disabled={lock} className="ml-1 text-[11px] font-semibold text-[#2740e6] hover:underline disabled:opacity-50"
                    onClick={() => void edit({ dates: { [d.key as MacroKey]: null } })}>{t({ en: "back to rule", is: "aftur í reglu" })}</button>
                )}
              </td>
              <td className="py-1.5 text-slate-600">{t(d.reason)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const summaryText = (s: MesoSummary | MacroSummary): { head: Bi; note: Bi } => scope === "meso"
    ? {
        head: { en: `${(s as MesoSummary).lengths} block lengths, ${(s as MesoSummary).goals} goals and ${(s as MesoSummary).lightWeeks} light weeks change in the season plan.`, is: `${(s as MesoSummary).lengths} lengdir, ${(s as MesoSummary).goals} markmið og ${(s as MesoSummary).lightWeeks} léttar vikur breytast í tímabilsplaninu.` },
        note: { en: "Only your choices are saved; the rest keeps following the fixtures. Days already set in Week Setup are not rewritten.", is: "Aðeins þitt val er vistað; restin fylgir áfram leikjaskránni. Dögum sem eru þegar settir í vikuplanið er ekki breytt." },
      }
    : {
        head: { en: `${(s as MacroSummary).datesChanged} season dates change.`, is: `${(s as MacroSummary).datesChanged} dagsetningar tímabilsins breytast.` },
        note: { en: "Dates you didn't set keep following the fixtures. A saved season end turns on the off-season after it.", is: "Dagsetningar sem þú stillir ekki fylgja áfram leikjaskránni. Vistuð lok tímabils kveikja á undirbúningshléi eftir þau." },
      };

  return (
    <section className="mb-4 rounded-xl border-2 border-dashed border-[#2740e6]/40 bg-white p-4 sm:p-5" aria-label={t(c.button)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#2740e6] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">{t({ en: "Draft", is: "Drög" })}</span>
        <span className="text-[12px] text-slate-500">{t({ en: "Nothing is saved yet. Changes in this box go into the draft; the rest of the page shows the saved plan.", is: "Ekkert vistað enn. Breytingar í þessum reit fara í drögin; restin af síðunni sýnir vistaða planið." })}</span>
        {draft.from_scratch && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t({ en: "from scratch", is: "frá grunni" })}</span>}
      </div>

      {/* 0 — the verdict */}
      <p className="mt-2 text-[17px] font-bold leading-snug text-slate-900" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{t(p.verdict)}</p>

      {/* 1 — the plain why, no click */}
      <ul className="mt-2 space-y-1 text-[13px] text-slate-700">
        {p.facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">•</span><span>{t(f)}</span></li>)}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${confTone}`}>{t(p.confidence.note)}</span>
        <span className="text-slate-500">{t({ en: `${p.confidence.coachChoices} of ${p.confidence.totalChoices} choices are yours, the rest follow the rules.`, is: `${p.confidence.coachChoices} af ${p.confidence.totalChoices} valkostum eru þínir, restin fylgir reglunum.` })}</span>
      </div>
      {p.gaps.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[12px] text-amber-900">
          {p.gaps.map((g, i) => <li key={i}>⚠ {t(g)}</li>)}
        </ul>
      )}

      {/* 2 — the editable table */}
      <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="mt-3 text-[12px] font-semibold text-[#2740e6] hover:underline">
        {details ? t({ en: "Hide details", is: "Fela nánar" }) : t(scope === "meso" ? { en: "Show and change the blocks", is: "Sýna og breyta lotunum" } : { en: "Show and change the dates", is: "Sýna og breyta dagsetningunum" })}
      </button>
      {details && (p.scope === "meso" ? mesoTable(p) : macroTable(p))}
      {busy === "edit" && <p className="mt-1 text-[11px] text-slate-400">{t({ en: "Updating the draft…", is: "Uppfæri drögin…" })}</p>}

      {confirm?.kind === "accept" ? (
        <div className="mt-3 rounded-lg border border-[#2740e6]/30 bg-[#2740e6]/[0.04] p-3">
          <p className="text-[13px] font-semibold text-slate-900">{t(summaryText(confirm.summary).head)}</p>
          <p className="mt-0.5 text-[12px] text-slate-600">{t(summaryText(confirm.summary).note)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={lock} onClick={() => void accept()}>{busy === "accept" ? t({ en: "Saving…", is: "Vista…" }) : t({ en: "Yes, use this plan", is: "Já, nota þetta plan" })}</button>
            <button type="button" className={ghost} disabled={lock} onClick={() => setConfirm(null)}>{t({ en: "Not yet", is: "Ekki strax" })}</button>
          </div>
        </div>
      ) : confirm?.kind === "scratch" ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3">
          <p className="text-[13px] font-semibold text-amber-900">{t(scope === "meso"
            ? { en: "Start from scratch? The draft ignores the block lengths, goals and light weeks you saved for this season. When you use it, they go back to the rule.", is: "Byrja frá grunni? Drögin hunsa lengdir, markmið og léttar vikur sem þú vistaðir fyrir tímabilið. Ef þú notar þau fara þau aftur í regluna." }
            : { en: "Start from scratch? The draft ignores the season dates you saved. When you use it, your saved dates stay unless you set new ones in the draft.", is: "Byrja frá grunni? Drögin hunsa dagsetningar sem þú vistaðir. Ef þú notar þau standa vistuðu dagsetningarnar nema þú setjir nýjar í drögin." })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-amber-600 text-white hover:brightness-110`} disabled={lock} onClick={() => void build(true)}>{t({ en: "Yes, from scratch", is: "Já, frá grunni" })}</button>
            <button type="button" className={ghost} onClick={() => setConfirm(null)}>{t({ en: "Cancel", is: "Hætta við" })}</button>
          </div>
        </div>
      ) : confirm?.kind === "discard" ? (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <p className="text-[13px] font-semibold text-slate-900">{t({ en: "Throw the draft away? The season plan stays exactly as it is.", is: "Henda drögunum? Tímabilsplanið helst nákvæmlega eins og það er." })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-[#a83e28] text-white hover:brightness-110`} disabled={lock} onClick={() => void discard()}>{t({ en: "Throw it away", is: "Henda" })}</button>
            <button type="button" className={ghost} onClick={() => setConfirm(null)}>{t({ en: "Keep the draft", is: "Halda drögunum" })}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primary} disabled={lock} onClick={() => void preview()}>{busy === "preview" ? t({ en: "Checking…", is: "Athuga…" }) : t({ en: "Use this plan", is: "Nota þetta plan" })}</button>
          <button type="button" className={ghost} disabled={lock} onClick={() => void build(false)}>{t({ en: "Rebuild", is: "Setja upp aftur" })}</button>
          <button type="button" className={ghost} disabled={lock} onClick={() => setConfirm({ kind: "scratch" })}>{t({ en: "Start from scratch", is: "Byrja frá grunni" })}</button>
          <button type="button" className={`${btn} text-[#a83e28] hover:underline`} disabled={lock} onClick={() => setConfirm({ kind: "discard" })}>{t({ en: "Throw away draft", is: "Henda drögum" })}</button>
        </div>
      )}
      {err && <p className="mt-2 text-[12px] font-medium text-[#a83e28]">{err}</p>}
    </section>
  );
}
