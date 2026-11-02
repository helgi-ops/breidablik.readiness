"use client";

/**
 * ClientCorrectiveControl — trainer authoring for a PT client's corrective /
 * prehab "morning" session.
 *
 * Flow: type the client's injury history → "Búa til með AI" proposes a cited
 * corrective list (library-first; gaps flagged "AI-tillaga") → the trainer
 * reviews/removes items, can add more (typeahead over the exercise library),
 * sets which weekdays EACH exercise runs on (independently), picks a duration →
 * Vista. Nothing reaches the client until saved. "Slökkva" archives it.
 *
 * AI proposes; the trainer confirms. Screening / training support, not a diagnosis.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
  manual?: boolean;
  /** ISO weekdays (1=Mon..7=Sun) this exercise runs on — independent per item. */
  days?: number[];
};
type Injury = { body_part: string; side: string | null; type: string | null; note: string | null };
type Suggestion = {
  name: string; nameIs?: string; slug?: string;
  dose?: string; doseIs?: string; cue?: string; cueIs?: string;
  citation?: string; videoUrl?: string | null; kind: "corrective" | "library";
};

const WEEKDAYS: Array<{ iso: number; en: string; is: string }> = [
  { iso: 1, en: "Mon", is: "Mán" },
  { iso: 2, en: "Tue", is: "Þri" },
  { iso: 3, en: "Wed", is: "Mið" },
  { iso: 4, en: "Thu", is: "Fim" },
  { iso: 5, en: "Fri", is: "Fös" },
  { iso: 6, en: "Sat", is: "Lau" },
  { iso: 7, en: "Sun", is: "Sun" },
];
// What a newly added/generated exercise starts on when there's nothing to copy.
const DEFAULT_DAYS = [1, 3, 5]; // Mon/Wed/Fri — a sensible corrective cadence

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
  const [durationMin, setDurationMin] = useState<number | "">("");
  const [model, setModel] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<unknown>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState<"load" | "ai" | "save" | "off" | null>("load");
  const [msg, setMsg] = useState<string | null>(null);
  // Manual add + typeahead.
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDose, setAddDose] = useState("");
  const [addCue, setAddCue] = useState("");
  const [sug, setSug] = useState<Suggestion[]>([]);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  // A new exercise starts on the days the existing exercises use (union), else
  // the default. Each exercise's days are then edited independently.
  function defaultDays(): number[] {
    const union = new Set<number>();
    for (const it of items) for (const d of it.days ?? []) union.add(d);
    return union.size ? [...union].sort((a, b) => a - b) : [...DEFAULT_DAYS];
  }

  function addManual() {
    const name = addName.trim();
    if (!name) return;
    setItems((xs) => [...xs, { name, dose: addDose.trim() || undefined, cue: addCue.trim() || undefined, manual: true, days: defaultDays() }]);
    setAddName(""); setAddDose(""); setAddCue(""); setSug([]); setShowAdd(false);
  }

  function pickSuggestion(s: Suggestion) {
    const base = { name: s.name, nameIs: s.nameIs, dose: s.dose, doseIs: s.doseIs, cue: s.cue, cueIs: s.cueIs, videoUrl: s.videoUrl ?? null, days: defaultDays() };
    const it: Item = s.kind === "corrective"
      ? { ...base, slug: s.slug, citation: s.citation }   // cited library pick
      : { ...base, manual: true };                         // exercise_library pick (has video)
    setItems((xs) => [...xs, it]);
    setAddName(""); setAddDose(""); setAddCue(""); setSug([]);
  }

  function onAddNameChange(v: string) {
    setAddName(v);
    if (sugTimer.current) clearTimeout(sugTimer.current);
    if (v.trim().length < 2) { setSug([]); return; }
    sugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trainer/exercise-search?q=${encodeURIComponent(v.trim())}`, { headers: await authHeader() });
        const j = await res.json().catch(() => ({}));
        setSug(Array.isArray(j.results) ? j.results : []);
      } catch { setSug([]); }
    }, 180);
  }

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/corrective`, { headers: await authHeader() });
      const j = await res.json().catch(() => ({}));
      const p = j.prescription;
      if (p) {
        // Backfill days on legacy items (saved before per-item days): use the
        // prescription's weekdays, else the default.
        const fallback = Array.isArray(p.weekdays) && p.weekdays.length ? p.weekdays : [...DEFAULT_DAYS];
        setInjuryText(p.injuryText ?? "");
        setItems((Array.isArray(p.items) ? p.items : []).map((it: Item) => ({
          ...it,
          days: Array.isArray(it.days) && it.days.length ? it.days : [...fallback],
        })));
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
    // Seed generated exercises with the days already in use, else the default.
    const seed = (() => {
      const u = new Set<number>();
      for (const it of items) for (const d of it.days ?? []) u.add(d);
      return u.size ? [...u].sort((a, b) => a - b) : [...DEFAULT_DAYS];
    })();
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/corrective`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ injuryText }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      const prop = j.proposal ?? {};
      setItems((Array.isArray(prop.items) ? prop.items : []).map((it: Item) => ({
        ...it,
        days: Array.isArray(it.days) && it.days.length ? it.days : [...seed],
      })));
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
    if (items.some((it) => !it.days || it.days.length === 0)) { setMsg(isIS ? "Hver æfing þarf a.m.k. einn dag." : "Every exercise needs at least one day."); return; }
    const weekdays = Array.from(new Set(items.flatMap((it) => it.days ?? []))).sort((a, b) => a - b);
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
      setMsg(isIS ? "✓ Vistað — hver æfing birtist á sínum dögum." : "✓ Saved — each exercise shows on its own days.");
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
      setActive(false); setItems([]); setDurationMin("");
      setMsg(isIS ? "Slökkt." : "Turned off.");
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : (isIS ? "Villa" : "Error"));
    } finally {
      setBusy(null);
    }
  }

  const pick = (en?: string | null, is?: string | null) => (isIS ? is || en : en || is) ?? "";

  // Per-exercise day toggle — independent, no coupling to other exercises.
  function toggleItemDay(idx: number, iso: number) {
    setItems((xs) => xs.map((it, i) => {
      if (i !== idx) return it;
      const cur = new Set(it.days ?? []);
      if (cur.has(iso)) cur.delete(iso); else cur.add(iso);
      return { ...it, days: [...cur].sort((a, b) => a - b) };
    }));
  }
  // Copy one exercise's days onto every exercise (the "same days for all" shortcut).
  function copyDaysToAll(idx: number) {
    setItems((xs) => {
      const src = [...(xs[idx]?.days ?? [])];
      return xs.map((it) => ({ ...it, days: [...src] }));
    });
  }

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
          ? "Skrifaðu meiðslasögu viðskiptavinarins; AI leggur til leiðréttingaræfingar úr cited safni (göt merkt „AI-tillaga“). Þú yfirferð og velur daga fyrir hverja æfingu."
          : "Describe the client's injury history; AI proposes corrective exercises from the cited library (gaps flagged “AI suggestion”). You review and set days for each exercise."}
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
        <ul className="mt-3 space-y-1.5">
          {items.map((it, i) => (
            <li key={`${it.slug ?? it.name}-${i}`} className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800 truncate">{pick(it.name, it.nameIs)}</span>
                    {it.manual ? (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-violet-100 text-violet-700">{isIS ? "þjálfari" : "trainer"}</span>
                    ) : it.aiSuggested ? (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800">{isIS ? "AI-tillaga" : "AI suggestion"}</span>
                    ) : (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium bg-slate-200 text-slate-600">{isIS ? "heimild" : "cited"}</span>
                    )}
                    {it.videoUrl && <span className="shrink-0 text-[9px] text-violet-500" title={isIS ? "Myndband" : "Video"}>▶</span>}
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
              </div>
              {/* This exercise's own days — independent of the others. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[10px] text-slate-400">{isIS ? "Dagar:" : "Days:"}</span>
                {WEEKDAYS.map((d) => {
                  const on = (it.days ?? []).includes(d.iso);
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => toggleItemDay(i, d.iso)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${on ? "bg-violet-500 text-white" : "bg-white text-slate-400 border border-slate-200 hover:bg-slate-100"}`}
                    >
                      {isIS ? d.is : d.en}
                    </button>
                  );
                })}
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => copyDaysToAll(i)}
                    className="ml-1 text-[10px] font-medium text-violet-600 hover:underline"
                    title={isIS ? "Nota þessa daga á allar æfingar" : "Use these days for every exercise"}
                  >
                    {isIS ? "afrita á allar" : "copy to all"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add an exercise — typeahead over the cited library + your exercise_library. */}
      {!(busy === "load") && (
        <div className="mt-2">
          {!showAdd ? (
            <button type="button" onClick={() => setShowAdd(true)} className="text-[11px] font-medium text-violet-700 hover:underline">
              {isIS ? "+ Bæta við æfingu" : "+ Add an exercise"}
            </button>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
              <div className="relative">
                <input
                  value={addName}
                  onChange={(e) => onAddNameChange(e.target.value)}
                  placeholder={isIS ? "Leitaðu eða skrifaðu æfingu…" : "Search or type an exercise…"}
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                {sug.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                    {sug.map((s, k) => (
                      <li key={`${s.name}-${k}`}>
                        <button
                          type="button"
                          onClick={() => pickSuggestion(s)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-violet-50"
                        >
                          <span className="min-w-0 truncate">{pick(s.name, s.nameIs)}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {s.videoUrl && <span className="text-[9px] text-violet-500">▶</span>}
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.kind === "corrective" ? "bg-slate-200 text-slate-600" : "bg-sky-100 text-sky-700"}`}>
                              {s.kind === "corrective" ? (isIS ? "heimild" : "cited") : (isIS ? "safn" : "library")}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={addDose}
                  onChange={(e) => setAddDose(e.target.value)}
                  placeholder={isIS ? "Skammtur (t.d. 3×8)" : "Dose (e.g. 3×8)"}
                  className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <input
                value={addCue}
                onChange={(e) => setAddCue(e.target.value)}
                placeholder={isIS ? "Vísbending (valfrjálst)" : "Cue (optional)"}
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={addManual} disabled={!addName.trim()} className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                  {isIS ? "Bæta við" : "Add"}
                </button>
                <button type="button" onClick={() => { setShowAdd(false); setAddName(""); setAddDose(""); setAddCue(""); setSug([]); }} className="text-[11px] font-medium text-slate-500 hover:underline">
                  {isIS ? "Hætta við" : "Cancel"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-2">
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
