"use client";

/**
 * ClientCorrectiveControl — trainer authoring for a PT client's corrective /
 * prehab "morning" session.
 *
 * Flow: type the client's injury history → "Búa til með AI" proposes a cited
 * corrective list (library-first; gaps flagged "AI-tillaga") → the trainer
 * reviews/removes items, picks the weekdays + duration → Vista. Nothing reaches
 * the client until saved. "Slökkva" archives it.
 *
 * AI proposes; the trainer confirms. Screening / training support, not a diagnosis.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Item = {
  slug?: string;
  name: string;
  nameIs?: string;
  cue?: string;
  cueIs?: string;
  dose?: string;
  doseIs?: string;
  target?: string;
  targetIs?: string;
  phase?: string;
  citation?: string;
  videoUrl?: string | null;
  aiSuggested?: boolean;
};
type Injury = { body_part: string; side: string | null; type: string | null; note: string | null };

const WEEKDAYS: Array<{ iso: number; en: string; is: string }> = [
  { iso: 1, en: "Mon", is: "Mán" },
  { iso: 2, en: "Tue", is: "Þri" },
  { iso: 3, en: "Wed", is: "Mið" },
  { iso: 4, en: "Thu", is: "Fim" },
  { iso: 5, en: "Fri", is: "Fös" },
  { iso: 6, en: "Sat", is: "Lau" },
  { iso: 7, en: "Sun", is: "Sun" },
];

export default function ClientCorrectiveControl({
  clientId,
  lang,
  onChanged,
}: {
  clientId: string;
  lang: "IS" | "EN";
  onChanged?: () => void;
}) {
  const isIS = lang === "IS";
  const [injuryText, setInjuryText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [durationMin, setDurationMin] = useState<number | "">("");
  const [model, setModel] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<unknown>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState<"load" | "ai" | "save" | "off" | null>("load");
  const [msg, setMsg] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/corrective`, { headers: await authHeader() });
      const j = await res.json().catch(() => ({}));
      const p = j.prescription;
      if (p) {
        setInjuryText(p.injuryText ?? "");
        setItems(Array.isArray(p.items) ? p.items : []);
        setWeekdays(Array.isArray(p.weekdays) ? p.weekdays : []);
        setDurationMin(p.durationMin ?? "");
        setModel(p.model ?? null);
        setExtracted(p.extracted ?? null);
        setActive(true);
      }
    } catch {
      /* silent */
    } finally {
      setBusy(null);
    }
  }, [clientId, authHeader]);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    if (injuryText.trim().length < 10) { setMsg(isIS ? "Lýstu meiðslunum í aðeins meiri texta." : "Describe the injuries in a little more detail."); return; }
    setBusy("ai"); setMsg(null);
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/corrective`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ injuryText }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      const prop = j.proposal ?? {};
      setItems(Array.isArray(prop.items) ? prop.items : []);
      setInjuries(Array.isArray(prop.injuries) ? prop.injuries : []);
      setModel(prop.model ?? null);
      setExtracted(prop.injuries ?? null);
      if ((prop.items ?? []).length === 0) setMsg(isIS ? "AI fann engar æfingar úr textanum — prófaðu nánari lýsingu." : "AI found no exercises from the text — try a more specific description.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : (isIS ? "Villa" : "Error"));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (items.length === 0) { setMsg(isIS ? "Engar æfingar valdar." : "No exercises selected."); return; }
    if (weekdays.length === 0) { setMsg(isIS ? "Veldu a.m.k. einn dag." : "Pick at least one day."); return; }
    setBusy("save"); setMsg(null);
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/corrective`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ injuryText, items, weekdays, durationMin: durationMin === "" ? null : durationMin, extracted, model }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      setActive(true);
      setMsg(isIS ? "✓ Vistað — birtist hjá viðskiptavininum á völdum dögum." : "✓ Saved — shows for the client on the chosen days.");
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : (isIS ? "Villa" : "Error"));
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    if (typeof window !== "undefined" && !window.confirm(isIS ? "Slökkva á corrective fyrir þennan viðskiptavin?" : "Turn corrective off for this client?")) return;
    setBusy("off"); setMsg(null);
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/corrective`, { method: "DELETE", headers: await authHeader() });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `${res.status}`); }
      setActive(false); setItems([]); setWeekdays([]); setDurationMin("");
      setMsg(isIS ? "Slökkt." : "Turned off.");
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : (isIS ? "Villa" : "Error"));
    } finally {
      setBusy(null);
    }
  }

  const pick = (en?: string | null, is?: string | null) => (isIS ? is || en : en || is) ?? "";
  const toggleDay = (iso: number) => setWeekdays((w) => (w.includes(iso) ? w.filter((d) => d !== iso) : [...w, iso].sort((a, b) => a - b)));

  return (
    <div className="rounded-lg border border-violet-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-700">
          {isIS ? "Corrective æfingar (fyrri partur dags)" : "Corrective exercises (morning)"}
        </div>
        {active && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
            {isIS ? "Virkt" : "Active"}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {isIS
          ? "Skrifaðu meiðslasögu viðskiptavinarins; AI leggur til leiðréttingaræfingar úr cited safni (göt merkt „AI-tillaga“). Þú yfirferð, velur daga og vistar."
          : "Describe the client's injury history; AI proposes corrective exercises from the cited library (gaps flagged “AI suggestion”). You review, pick days, and save."}
      </p>

      <textarea
        value={injuryText}
        onChange={(e) => setInjuryText(e.target.value)}
        rows={4}
        placeholder={isIS ? "T.d. tognun í nára, bakmeiðsli í neðra mjóbaki, beinhimnubólga á veturna…" : "e.g. groin strain, lower-back issues, winter shin splints…"}
        className="mt-2 w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
        >
          {busy === "ai" ? (isIS ? "AI vinnur…" : "AI working…") : (isIS ? "Búa til með AI" : "Generate with AI")}
        </button>
        <span className="text-[10px] text-slate-400">{isIS ? "AI les textann — þú staðfestir." : "AI reads the text — you confirm."}</span>
      </div>

      {injuries.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-500">
          {isIS ? "AI las: " : "AI read: "}
          {injuries.map((inj, i) => (
            <span key={i} className="mr-1.5">
              {[inj.type, inj.body_part, inj.side].filter(Boolean).join(" ")}{i < injuries.length - 1 ? "," : ""}
            </span>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li key={`${it.slug ?? it.name}-${i}`} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-800 truncate">{pick(it.name, it.nameIs)}</span>
                  {it.aiSuggested ? (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800">{isIS ? "AI-tillaga" : "AI suggestion"}</span>
                  ) : (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium bg-slate-200 text-slate-600">{isIS ? "heimild" : "cited"}</span>
                  )}
                </div>
                {pick(it.dose, it.doseIs) && <div className="text-[11px] text-slate-500">{pick(it.dose, it.doseIs)}</div>}
              </div>
              <button
                type="button"
                onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="shrink-0 rounded border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
              >
                {isIS ? "Fjarlægja" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{isIS ? "Dagar" : "Days"}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => toggleDay(d.iso)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${weekdays.includes(d.iso) ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {isIS ? d.is : d.en}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[11px] text-slate-500">{isIS ? "Lengd (mín)" : "Length (min)"}</label>
            <input
              type="number"
              min={0}
              max={180}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value === "" ? "" : Math.max(0, Math.min(180, Number(e.target.value))))}
              placeholder="60"
              className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy === "save" ? (isIS ? "Vista…" : "Saving…") : (isIS ? "Vista og senda" : "Save & send")}
            </button>
            {active && (
              <button
                type="button"
                onClick={disable}
                disabled={busy !== null}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {isIS ? "Slökkva" : "Turn off"}
              </button>
            )}
          </div>
        </>
      )}

      {model && <div className="mt-2 text-[10px] text-slate-400">{isIS ? "Tillaga: " : "Proposed by "}{model} · {isIS ? "þjálfunar-/skimunarstuðningur, ekki greining" : "training/screening support, not a diagnosis"}</div>}
      {msg && <div className="mt-1 text-[11px] text-slate-600">{msg}</div>}
    </div>
  );
}
