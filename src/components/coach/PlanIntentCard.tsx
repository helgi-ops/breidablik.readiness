"use client";

/**
 * "What do you want from this block / week?" — the coach writes it in their own words, sees how it was read
 * (one chip per goal, with the words it came from), corrects it, and gets the rules' advice.
 *
 * Layered read (docs/explainability-first.md): the verdict first → the chips and one card per recommendation
 * (headline + 2–3 facts + now → suggestion + conflict + link) → "Show details": the day-by-day grid, the
 * citations, what is MicroPulse's own rule, and the AI note. The AI only reads the text; the advice is rules.
 * Nothing is applied: each recommendation links to the page where the coach changes it.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/client/authFetch";
import { useLang } from "@/lib/lang";
import {
  GOAL_LABEL, INTENT_GOALS, INTENT_MODES, MAX_INTENT_TEXT, MODE_LABEL, SOURCE_LABEL,
  type Bi, type IntentGoal, type IntentItem, type IntentMode, type IntentSource, type PlanScope,
} from "@/lib/micropulse/planIntent/vocabulary";
import type { GridItem, PlanAdvice, PlanRecommendation } from "@/lib/micropulse/planIntent/recommend";

type Intent = { text: string; items: IntentItem[]; unclear: string[]; source: IntentSource; aiItems: IntentItem[] | null; updatedAt: string };
type Ctx = { start: string; weeks: number; phase: string | null; matchDates: string[]; mas: { withMas: number; squad: number } };
type Resp = { ok?: boolean; error?: string; intent: Intent | null; advice: PlanAdvice; context: Ctx };

export type PlanIntentCardProps = {
  scope: PlanScope;
  /** Monday of the week, or the block's first Monday. */
  start: string;
  weeks?: number;
  /** Block scope: the block's goal now (accum / transmute / realize) and the season phase it sits in. */
  blockGoal?: string | null;
  phaseHint?: string | null;
};

const LOAD_STYLE: Record<GridItem["load"], { cls: string; en: string; is: string }> = {
  low: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", en: "low", is: "lágt" },
  moderate: { cls: "bg-amber-50 text-amber-900 border-amber-200", en: "moderate", is: "miðlungs" },
  high: { cls: "bg-rose-50 text-rose-800 border-rose-200", en: "high", is: "hátt" },
};
const WHEN_LABEL: Record<GridItem["when"], Bi> = {
  before: { en: "before training", is: "fyrir æfingu" },
  after: { en: "after training", is: "eftir æfingu" },
  part: { en: "part of training", is: "hluti af æfingu" },
  own: { en: "own session", is: "sér æfing" },
};
const CONF_LABEL: Record<PlanRecommendation["confidence"], Bi> = {
  high: { en: "Confidence: high", is: "Vissa: mikil" },
  moderate: { en: "Confidence: moderate", is: "Vissa: miðlungs" },
  low: { en: "Confidence: low", is: "Vissa: lítil" },
};

export default function PlanIntentCard({ scope, start, weeks, blockGoal, phaseHint }: PlanIntentCardProps) {
  const [lang] = useLang();
  const is = lang === "IS";
  const t = (b: Bi | null | undefined) => (b ? (is ? b.is : b.en) : "");

  const [data, setData] = useState<Resp | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "load" | "read" | "save">("load");
  const [err, setErr] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [addGoal, setAddGoal] = useState<IntentGoal | "">("");
  const [addMode, setAddMode] = useState<IntentMode>("build");

  const extra = useCallback(() => {
    const p = new URLSearchParams();
    if (weeks) p.set("weeks", String(weeks));
    if (blockGoal) p.set("blockGoal", blockGoal);
    if (phaseHint) p.set("phase", phaseHint);
    return p;
  }, [weeks, blockGoal, phaseHint]);

  useEffect(() => {
    let off = false;
    (async () => {
      setBusy("load"); setErr(null);
      try {
        const p = extra(); p.set("scope", scope); p.set("start", start);
        const r = await authFetch(`/api/coach/plan-intent?${p.toString()}`);
        const j = (await r.json()) as Resp;
        if (off) return;
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setData(j); setText(j.intent?.text ?? "");
      } catch (e) {
        if (!off) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!off) setBusy(null);
      }
    })();
    return () => { off = true; };
  }, [scope, start, extra]);

  const post = async (kind: "read" | "save", items?: IntentItem[]) => {
    setBusy(kind); setErr(null);
    try {
      const r = await authFetch("/api/coach/plan-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, start, text, items, weeks, blockGoal, phase: phaseHint }),
      });
      const j = (await r.json()) as Resp;
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const items = data?.intent?.items ?? [];
  const advice = data?.advice ?? null;
  const unread = (data?.intent?.text ?? "") !== text.trim();
  const removeItem = (g: IntentGoal) => post("save", items.filter((i) => i.goal !== g));
  const setMode = (g: IntentGoal, m: IntentMode) => post("save", items.map((i) => (i.goal === g ? { ...i, mode: m } : i)));
  const add = () => {
    if (!addGoal) return;
    post("save", [...items.filter((i) => i.goal !== addGoal), { goal: addGoal, mode: addGoal === "freshness" ? "build" : addMode, quote: "" }]);
    setAddGoal("");
  };

  const what = scope === "block" ? (is ? "þessari lotu" : "this block") : (is ? "þessari viku" : "this week");
  const placeholder = scope === "block"
    ? (is ? "T.d. „Næstu fjórar vikur vil ég byggja upp hámarkshraða og halda styrk.“" : "E.g. “The next four weeks I want to build top speed and keep strength.”")
    : (is ? "T.d. „Í vikunni vil ég halda styrk og leikmenn eiga að vera ferskir fyrir leikinn.“" : "E.g. “This week I want to keep strength and have the players fresh for the match.”");
  const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(is ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const ownRules = (advice?.recommendations ?? []).filter((r) => r.ownRule);
  const cites = [...new Set((advice?.recommendations ?? []).flatMap((r) => r.cite.split(/;\s*/)).filter(Boolean))];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={is ? "Markmið í orðum" : "Goals in your words"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-slate-900">{is ? `Hverju viltu ná fram með ${what}?` : `What do you want from ${what}?`}</h2>
        {data?.intent && <span className="text-[11px] font-medium text-slate-500">{t(SOURCE_LABEL[data.intent.source])}</span>}
      </div>

      {/* Level 0 — the verdict */}
      {advice && <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{t(advice.verdict)}</p>}

      <div className="mt-3 flex flex-col gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_INTENT_TEXT))} rows={2} placeholder={placeholder}
          className="w-full min-w-0 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => post("read")} disabled={!!busy || !text.trim()}
            className="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
            {busy === "read" ? (is ? "Les…" : "Reading…") : unread || !data?.intent ? (is ? "Lesa og ráðleggja" : "Read and advise") : (is ? "Lesa aftur" : "Read again")}
          </button>
          <span className="text-[11px] text-slate-500">{is ? "Kerfið breytir engu sjálft — tenglarnir vísa á hvar þú breytir." : "Nothing changes on its own — the links show where you change it."}</span>
        </div>
      </div>

      {err && <p className="mt-2 text-[12px] font-medium text-rose-700">{err}</p>}
      {busy === "load" && !data && <p className="mt-2 text-[12px] text-slate-500">{is ? "Hleð…" : "Loading…"}</p>}

      {/* Level 1 — how it was read (chips) */}
      {data?.intent && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="text-[12px] font-semibold text-slate-500">{is ? "Svona skildist textinn — leiðréttu ef þarf" : "How the text was read — correct it if needed"}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.length === 0 && <span className="text-[12px] text-slate-500">{is ? "Ekkert markmið fannst í textanum." : "No goal found in the text."}</span>}
            {items.map((it) => (
              <span key={it.goal} title={it.quote ? `„${it.quote}“` : t(SOURCE_LABEL.coach)}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-1 pl-3 pr-1 text-[12px] font-semibold text-slate-900">
                {t(GOAL_LABEL[it.goal])}
                {it.goal === "freshness" ? null : (
                  <select value={it.mode} onChange={(e) => setMode(it.goal, e.target.value as IntentMode)} disabled={!!busy}
                    aria-label={is ? "Hvaða átt" : "Direction"} className="rounded-full border-0 bg-transparent py-0 pl-1 pr-5 text-[12px] font-medium text-primary">
                    {INTENT_MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL[m])}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => removeItem(it.goal)} disabled={!!busy} aria-label={is ? `Fjarlægja ${GOAL_LABEL[it.goal].is}` : `Remove ${GOAL_LABEL[it.goal].en}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">×</button>
              </span>
            ))}
            <span className="inline-flex flex-wrap items-center gap-1">
              <select value={addGoal} onChange={(e) => setAddGoal(e.target.value as IntentGoal | "")} disabled={!!busy}
                className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[12px]" aria-label={is ? "Bæta við markmiði" : "Add a goal"}>
                <option value="">{is ? "+ Bæta við markmiði" : "+ Add a goal"}</option>
                {INTENT_GOALS.filter((g) => !items.some((i) => i.goal === g)).map((g) => <option key={g} value={g}>{t(GOAL_LABEL[g])}</option>)}
              </select>
              {addGoal && addGoal !== "freshness" && (
                <select value={addMode} onChange={(e) => setAddMode(e.target.value as IntentMode)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[12px]" aria-label={is ? "Hvaða átt" : "Direction"}>
                  {INTENT_MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL[m])}</option>)}
                </select>
              )}
              {addGoal && <button type="button" onClick={add} disabled={!!busy} className="h-8 rounded-lg border border-primary px-2 text-[12px] font-semibold text-primary hover:bg-primary/5">{is ? "Bæta við" : "Add"}</button>}
            </span>
          </div>
          {data.intent.unclear.length > 0 && (
            <p className="mt-2 text-[12px] text-amber-900">
              {is ? "Skildist ekki (ekki á listanum, ekkert giskað): " : "Not understood (not on the list, nothing guessed): "}
              {data.intent.unclear.map((u) => `„${u}“`).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Level 1 — one card per recommendation */}
      {advice && advice.recommendations.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {advice.recommendations.map((r, i) => (
            <article key={`${r.goal}-${i}`} className={`min-w-0 rounded-lg border p-3 ${r.conflict ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
              <p className="text-[13px] font-semibold leading-snug text-slate-900">{t(r.headline)}</p>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-slate-700">
                {r.facts.map((f, k) => <li key={k} className="flex gap-1.5"><span aria-hidden="true" className="text-slate-400">·</span><span>{t(f)}</span></li>)}
              </ul>
              {r.now && r.suggestion && (
                <p className="mt-2 text-[12px] text-slate-800"><span className="text-slate-500">{is ? "Núna: " : "Now: "}</span>{t(r.now)} <span className="text-slate-400">→</span> <span className="font-semibold">{t(r.suggestion)}</span></p>
              )}
              {r.conflict && <p className="mt-2 text-[12px] font-medium text-amber-900">⚠ {t(r.conflict)}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>{t(CONF_LABEL[r.confidence])}</span>
                {r.link && <Link href={r.link.href} className="font-semibold text-primary hover:underline">{t(r.link.label)} →</Link>}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Level 2 — details */}
      {advice && items.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="text-[12px] font-semibold text-primary hover:underline">
            {details ? (is ? "Fela nánar" : "Hide details") : (is ? "Sýna nánar — vikan dag fyrir dag, heimildir" : "Show details — the week day by day, sources")}
          </button>
          {details && (
            <div className="mt-2 space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-3 font-semibold">{is ? "Dagur" : "Day"}</th>
                      <th className="py-1.5 pr-3 font-semibold">{is ? "Fótbolti" : "Football"}</th>
                      <th className="py-1.5 font-semibold">{is ? "Viðbót út frá markmiðum (lengd · álag)" : "Added for your goals (length · load)"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advice.grid.map((d) => (
                      <tr key={d.date} className={`border-b border-slate-100 align-top ${d.isMatch ? "bg-slate-50" : ""}`}>
                        <td className="whitespace-nowrap py-1.5 pr-3"><div className="font-semibold text-slate-900">{d.md ?? "—"}</div><div className="text-slate-500">{dateLabel(d.date)}</div></td>
                        <td className="py-1.5 pr-3 text-slate-700">{t(d.football) || "—"}</td>
                        <td className="py-1.5">
                          {d.items.length === 0 ? <span className="text-slate-400">—</span> : (
                            <div className="flex flex-col gap-1">
                              {d.items.map((it, k) => (
                                <div key={k} className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-slate-800">{t(it.text)}</span>
                                  <span className="text-slate-500">· {t(WHEN_LABEL[it.when])} · ~{it.minutes} {is ? "mín" : "min"}</span>
                                  <span className={`rounded border px-1.5 text-[11px] font-semibold ${LOAD_STYLE[it.load].cls}`}>{is ? `álag ${LOAD_STYLE[it.load].is}` : `${LOAD_STYLE[it.load].en} load`}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {advice.notes.map((n, k) => <p key={k} className="text-[11px] text-slate-500">{t(n)}</p>)}
              {ownRules.length > 0 && (
                <div className="text-[11px] text-slate-600">
                  <div className="font-semibold text-slate-700">{is ? "Regla MicroPulse, ekki rannsókn:" : "MicroPulse's rule, not a study:"}</div>
                  <ul className="mt-0.5 list-disc pl-4">{[...new Set(ownRules.map((r) => t(r.ownRule)))].map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}
              {cites.length > 0 && <p className="text-[11px] text-slate-500">{is ? "Heimildir: " : "Sources: "}{cites.join("; ")}</p>}
              <p className="text-[11px] text-slate-500">
                {data?.intent?.source === "ai"
                  ? (is ? "Gervigreind las aðeins textann í listann hér að ofan; hvert markmið vitnar í orðin þín. Ráðleggingarnar koma úr reglum, ekki frá gervigreindinni." : "AI only read the text into the list above; each goal quotes your words. The advice comes from rules, not from the AI.")
                  : (is ? "Textinn var lesinn með lykilorðum (engin gervigreind). Ráðleggingarnar koma úr reglum." : "The text was read by keywords (no AI). The advice comes from rules.")}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
