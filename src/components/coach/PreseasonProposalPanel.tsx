"use client";

/**
 * "Build pre-season" — the button + the draft read on the hub's Pre-season tab.
 *
 * The system builds the whole pre-season from its existing rules and the team's data (the coach's saved
 * choices stand; the rule fills the rest). It is a DRAFT: nothing reaches Week Setup until "Use this plan",
 * which first shows what will change. Layered read: verdict → 2–3 facts + confidence → "Show details"
 * (every choice, the coach's or the rule's, with its reason and citation). Rules decide; no AI.
 */

import * as React from "react";
import { CiteRefs } from "@/components/coach/CiteRefs";
import type { PreseasonProposal } from "@/lib/micropulse/periodization/preseasonProposal";
import type { AcceptPlan } from "@/lib/micropulse/periodization/preseasonAccept";
import type { ProposalEdits } from "@/lib/micropulse/periodization/preseasonProposalServer";

type Bi = { en: string; is: string };
export type PsDraft = { id: string; season_year: number; from_scratch: boolean; proposal: Omit<PreseasonProposal, "engine">; coach_edits: ProposalEdits | null; updated_at: string; created_at: string };

const API = "/api/coach/periodization/proposal";

export default function PreseasonProposalPanel({ is, draft, setDraft, authHeader, autoBuild, onAccepted }: {
  is: boolean;
  draft: PsDraft | null;
  setDraft: (d: PsDraft | null) => void;
  authHeader: () => Promise<string>;
  /** Open with ?build=1 (the link from Week Setup): build straight away when there's no draft. */
  autoBuild?: boolean;
  onAccepted: (summary: AcceptPlan["summary"], settings: PreseasonProposal["settings"]) => void;
}) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const [busy, setBusy] = React.useState<null | "load" | "build" | "preview" | "accept" | "discard">("load");
  const [err, setErr] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | { kind: "accept"; summary: AcceptPlan["summary"] } | { kind: "scratch" } | { kind: "discard" }>(null);
  const [lastAcceptedAt, setLastAcceptedAt] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<AcceptPlan["summary"] | null>(null);
  const autoRan = React.useRef(false);

  const call = React.useCallback(async (method: "GET" | "POST", body?: unknown, qs = "") => {
    const r = await fetch(`${API}${qs}`, { method, headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }, [authHeader]);

  const build = React.useCallback(async (fromScratch: boolean) => {
    setBusy("build"); setErr(null); setConfirm(null); setDone(null);
    try { const j = await call("POST", { action: "build", fromScratch }); setDraft(j.draft as PsDraft); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, [call, setDraft]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const j = await call("GET");
        if (!live) return;
        setDraft((j.draft as PsDraft | null) ?? null);
        setLastAcceptedAt(j.lastAcceptedAt ?? null);
        setBusy(null);
        if (autoBuild && !j.draft && !autoRan.current) { autoRan.current = true; void build(false); }
      } catch (e) { if (live) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); } }
    })();
    return () => { live = false; };
  }, [call, setDraft, autoBuild, build]);

  const preview = async () => {
    setBusy("preview"); setErr(null);
    try { const j = await call("GET", undefined, "?preview=1"); if (j.preview) setConfirm({ kind: "accept", summary: j.preview }); else setErr(t({ en: "Nothing to preview.", is: "Ekkert að sýna." })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const accept = async () => {
    if (!draft) return;
    setBusy("accept"); setErr(null);
    try {
      const j = await call("POST", { action: "accept" });
      setDone(j.summary); setConfirm(null); setLastAcceptedAt(new Date().toISOString());
      const settings = draft.proposal.settings;
      setDraft(null);
      onAccepted(j.summary, settings);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const discard = async () => {
    setBusy("discard"); setErr(null);
    try { await call("POST", { action: "discard" }); setDraft(null); setConfirm(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const btn = "h-9 rounded-lg px-3 text-[13px] font-semibold disabled:opacity-50";
  const primary = `${btn} bg-[#2740e6] text-white hover:brightness-110`;
  const ghost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

  // ── No draft: the button ──
  if (!draft) {
    return (
      <section className="rounded-xl border border-[#2740e6]/25 bg-[#2740e6]/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-slate-900">{t({ en: "Build the pre-season for me", is: "Settu upp undirbúninginn fyrir mig" })}</h2>
            <p className="mt-0.5 text-[13px] text-slate-600">{t({ en: "The system lays out the whole pre-season from its rules and your data: blocks, weekly load, days and tests. Your saved choices stay. You get a draft to change before anything reaches Week Setup.", is: "Kerfið setur upp allan undirbúninginn út frá reglum sínum og ykkar gögnum: lotur, vikuálag, daga og mælingar. Það sem þú hefur vistað stendur. Þú færð drög til að breyta áður en nokkuð fer í vikuplanið." })}</p>
            {lastAcceptedAt && <p className="mt-1 text-[11px] text-slate-400">{t({ en: "Last plan used", is: "Síðasta plan notað" })} {new Date(lastAcceptedAt).toLocaleDateString(is ? "is-IS" : "en-GB")}</p>}
          </div>
          <button type="button" className={primary} disabled={busy != null} onClick={() => void build(false)}>
            {busy === "build" ? t({ en: "Building…", is: "Set upp…" }) : t({ en: "Build pre-season", is: "Setja upp undirbúning" })}
          </button>
        </div>
        {done && (
          <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-800">
            ✓ {t({ en: `Plan in use: ${done.daysChanged} days set in Week Setup, ${done.testsAdded} tests scheduled.`, is: `Planið er komið í notkun: ${done.daysChanged} dagar settir í vikuplanið, ${done.testsAdded} mælingar skráðar.` })}
          </p>
        )}
        {err && <p className="mt-2 text-[12px] font-medium text-[#a83e28]">{err}</p>}
      </section>
    );
  }

  // ── Draft open: the layered read ──
  const p = draft.proposal;
  const confTone = p.confidence.level === "high" ? "bg-emerald-50 text-emerald-800" : p.confidence.level === "moderate" ? "bg-amber-50 text-amber-800" : "bg-[#a83e28]/10 text-[#a83e28]";
  return (
    <section className="rounded-xl border-2 border-dashed border-[#2740e6]/40 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#2740e6] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">{t({ en: "Draft", is: "Drög" })}</span>
        <span className="text-[12px] text-slate-500">{t({ en: "Nothing is saved to the week plan yet. Changes below go into the draft.", is: "Ekkert vistað í vikuplanið enn. Breytingar hér fyrir neðan fara í drögin." })}</span>
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

      {/* 2 — every choice behind a toggle */}
      <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="mt-3 text-[12px] font-semibold text-[#2740e6] hover:underline">
        {details ? t({ en: "Hide details", is: "Fela nánar" }) : t({ en: "Show details: each choice and why", is: "Sýna nánar: hvert val og af hverju" })}
      </button>
      {details && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-1 pr-2 font-semibold">{t({ en: "Choice", is: "Val" })}</th><th className="py-1 pr-2 font-semibold">{t({ en: "Value", is: "Gildi" })}</th><th className="py-1 pr-2 font-semibold">{t({ en: "Whose", is: "Hvers" })}</th><th className="py-1 font-semibold">{t({ en: "Why", is: "Af hverju" })}</th></tr></thead>
            <tbody>
              {p.choices.map((c) => (
                <tr key={c.key} className="border-b border-slate-100 align-top">
                  <td className="py-1.5 pr-2 font-medium text-slate-800">{t(c.label)}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-slate-900">{t(c.value)}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.source === "coach" ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-100 text-slate-600"}`}>{c.source === "coach" ? t({ en: "your choice", is: "þitt val" }) : t({ en: "rule", is: "regla" })}</span>
                  </td>
                  <td className="py-1.5 text-slate-600">
                    {t(c.reason)}
                    {c.micropulseLine && <span className="ml-1 text-[10px] text-slate-400">· {t({ en: "MicroPulse line", is: "lína MicroPulse" })}</span>}
                    {c.cite && <span className="ml-1 text-[10px] text-slate-400">· <CiteRefs text={c.cite} is={is} /></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {confirm?.kind === "accept" ? (
        <div className="mt-3 rounded-lg border border-[#2740e6]/30 bg-[#2740e6]/[0.04] p-3">
          <p className="text-[13px] font-semibold text-slate-900">
            {t({ en: `${confirm.summary.daysChanged} days change in the week plan (${confirm.summary.weeksTouched} weeks), ${confirm.summary.testsAdded} tests are added.`, is: `${confirm.summary.daysChanged} dagar breytast í vikuplaninu (${confirm.summary.weeksTouched} vikur), ${confirm.summary.testsAdded} mælingar bætast við.` })}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-600">
            {t({ en: `Left as they are: ${confirm.summary.kept.coachDay} days you already set, ${confirm.summary.kept.match} match days, ${confirm.summary.kept.teamBreak} break days, and every day before today.`, is: `Óbreytt: ${confirm.summary.kept.coachDay} dagar sem þú hafðir sett, ${confirm.summary.kept.match} leikdagar, ${confirm.summary.kept.teamBreak} frídagar og allir dagar fyrir daginn í dag.` })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy != null} onClick={() => void accept()}>{busy === "accept" ? t({ en: "Saving…", is: "Vista…" }) : t({ en: "Yes, use this plan", is: "Já, nota þetta plan" })}</button>
            <button type="button" className={ghost} disabled={busy != null} onClick={() => setConfirm(null)}>{t({ en: "Not yet", is: "Ekki strax" })}</button>
          </div>
        </div>
      ) : confirm?.kind === "scratch" ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3">
          <p className="text-[13px] font-semibold text-amber-900">{t({ en: "Start from scratch? The draft ignores your saved settings and days. When you use it, it can replace days you set in Week Setup (matches, breaks and past days are never touched).", is: "Byrja frá grunni? Drögin hunsa vistaðar stillingar og daga. Ef þú notar þau geta þau komið í stað daga sem þú settir í vikuplanið (leikdögum, frídögum og liðnum dögum er aldrei breytt)." })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-amber-600 text-white hover:brightness-110`} disabled={busy != null} onClick={() => void build(true)}>{t({ en: "Yes, from scratch", is: "Já, frá grunni" })}</button>
            <button type="button" className={ghost} onClick={() => setConfirm(null)}>{t({ en: "Cancel", is: "Hætta við" })}</button>
          </div>
        </div>
      ) : confirm?.kind === "discard" ? (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <p className="text-[13px] font-semibold text-slate-900">{t({ en: "Throw the draft away? Your week plan stays exactly as it is.", is: "Henda drögunum? Vikuplanið helst nákvæmlega eins og það er." })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-[#a83e28] text-white hover:brightness-110`} disabled={busy != null} onClick={() => void discard()}>{t({ en: "Throw it away", is: "Henda" })}</button>
            <button type="button" className={ghost} onClick={() => setConfirm(null)}>{t({ en: "Keep the draft", is: "Halda drögunum" })}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primary} disabled={busy != null} onClick={() => void preview()}>{busy === "preview" ? t({ en: "Checking…", is: "Athuga…" }) : t({ en: "Use this plan", is: "Nota þetta plan" })}</button>
          <button type="button" className={ghost} disabled={busy != null} onClick={() => void build(false)}>{t({ en: "Rebuild", is: "Setja upp aftur" })}</button>
          <button type="button" className={ghost} disabled={busy != null} onClick={() => setConfirm({ kind: "scratch" })}>{t({ en: "Start from scratch", is: "Byrja frá grunni" })}</button>
          <button type="button" className={`${btn} text-[#a83e28] hover:underline`} disabled={busy != null} onClick={() => setConfirm({ kind: "discard" })}>{t({ en: "Throw away draft", is: "Henda drögum" })}</button>
        </div>
      )}
      {err && <p className="mt-2 text-[12px] font-medium text-[#a83e28]">{err}</p>}
    </section>
  );
}
