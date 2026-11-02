"use client";

/**
 * CorrectiveRunner — today's corrective, one exercise at a time. Rep work is a
 * single "Done"; timed holds count down, per set and per side. No weights, reps
 * or RPE are logged, and none of it enters load. It ends on one pain question,
 * which the trainer sees. Training support, not a diagnosis.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ExerciseVideo from "@/components/exercise/ExerciseVideo";
import { buildSteps, type CorrectiveStepItem } from "@/lib/client/correctiveRun";

type Lang = "IS" | "EN";
type Pain = "none" | "little" | "yes";

const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function CorrectiveRunner({ lang, items, week }: {
  lang: Lang;
  items: CorrectiveStepItem[];
  week: { done: number; planned: number } | null;
}) {
  const IS = lang === "IS";
  const router = useRouter();
  const steps = useMemo(() => buildSteps(items), [items]);
  const pick = (en?: string | null, is?: string | null) => (IS ? is || en : en || is) ?? "";

  const [index, setIndex] = useState(0);
  const [holdEnd, setHoldEnd] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [pain, setPain] = useState<Pain | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const buzzed = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const left = holdEnd == null ? null : (holdEnd - now) / 1000;

  useEffect(() => {
    if (left == null || left > 0 || buzzed.current) return;
    buzzed.current = true;
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* optional */ }
  }, [left]);

  const finished = index >= steps.length;
  const step = finished ? null : steps[index];

  function advance() {
    setHoldEnd(null);
    buzzed.current = false;
    setIndex((i) => i + 1);
  }

  function startHold(seconds: number) {
    const t = Date.now();
    buzzed.current = false;
    setNow(t);
    setHoldEnd(t + seconds * 1000);
  }

  async function save() {
    if (!pain) { setErr(IS ? "Veldu svar." : "Pick an answer."); return; }
    setSaving(true);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/client/corrective", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ itemsDone: items.length, itemsTotal: items.length, pain }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(IS ? "Ekki tókst að vista. Reyndu aftur." : "Could not save. Try again."); return; }
      router.push("/client");
    } catch {
      setErr(IS ? "Ekki tókst að vista. Reyndu aftur." : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const shell = "fixed inset-0 z-40 flex flex-col gap-3.5 overflow-y-auto bg-background p-4 text-slate-900";
  const padding = { paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" };
  const primary = "min-h-[52px] w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50";

  if (!step) {
    const options: [Pain, string][] = [
      ["none", IS ? "Nei" : "No"],
      ["little", IS ? "Smá" : "A little"],
      ["yes", IS ? "Já" : "Yes"],
    ];
    const weekDone = week ? Math.min(week.done + 1, Math.max(week.planned, week.done + 1)) : null;
    return (
      <div className={shell} style={padding}>
        <header className="mx-auto w-full max-w-xl">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
            {IS ? "Leiðréttingum lokið" : "Corrective done"}
          </h1>
          {week && week.planned > 0 && (
            <p className="mt-1.5 text-[15px] text-slate-700">
              {IS ? `${weekDone} af ${week.planned} dögum í vikunni` : `${weekDone} of ${week.planned} days this week`}
            </p>
          )}
        </header>
        <section className="mx-auto w-full max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h2 className="font-display text-xl font-bold">{IS ? "Einhver verkur?" : "Any pain?"}</h2>
            <div className="text-[13px] text-slate-700">{IS ? "Þjálfarinn sér svarið." : "Your trainer sees your answer."}</div>
          </div>
          <div role="group" aria-label={IS ? "Einhver verkur?" : "Any pain?"} className="grid grid-cols-3 gap-2">
            {options.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={pain === value}
                onClick={() => { setPain(value); setErr(null); }}
                className={`min-h-12 rounded-[10px] border text-[15px] font-semibold ${pain === value ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white text-slate-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <div className="flex-1" />
        <footer className="mx-auto w-full max-w-xl space-y-2">
          {err && <div role="alert" className="text-center text-sm text-red-700">{err}</div>}
          <button type="button" disabled={saving} onClick={() => { void save(); }} className={primary}>
            {saving ? (IS ? "Vista…" : "Saving…") : (IS ? "Vista" : "Save")}
          </button>
          <div className="text-center text-xs text-slate-500">
            {IS
              ? "Þjálfunarstuðningur, ekki greining. Ef verkur heldur áfram, hafðu samband við þjálfara eða klíníker."
              : "Training support, not a diagnosis. For pain that stays, contact your trainer or clinician."}
          </div>
        </footer>
      </div>
    );
  }

  const name = pick(step.item.name, step.item.nameIs);
  const dose = pick(step.item.dose, step.item.doseIs);
  const cue = pick(step.item.cue, step.item.cueIs);
  const sideLabel = step.side === "left" ? (IS ? "Vinstri hlið" : "Left side") : step.side === "right" ? (IS ? "Hægri hlið" : "Right side") : null;
  const setLabel = step.set != null && step.totalSets > 1 ? (IS ? `Sett ${step.set} af ${step.totalSets}` : `Set ${step.set} of ${step.totalSets}`) : null;
  const running = holdEnd != null;

  const next = steps[index + 1];
  const nextText = !next
    ? (IS ? "Síðasta æfingin" : "Last one")
    : next.itemIndex === step.itemIndex
      ? `${IS ? "Næst" : "Next"}: ${next.side === "right" ? (IS ? "hægri hlið" : "right side") : next.side === "left" ? (IS ? "vinstri hlið" : "left side") : (IS ? "næsta sett" : "next set")}`
      : `${IS ? "Næst" : "Next"}: ${pick(next.item.name, next.item.nameIs)}`;

  const showTimer = step.holdSeconds != null;

  return (
    <div className={shell} style={padding}>
      <header className="mx-auto w-full max-w-xl space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label={IS ? "Loka" : "Close corrective"} onClick={() => router.push("/client")} className="-ml-2.5 flex h-11 w-11 items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="text-center">
            <div className="font-semibold">{IS ? "Leiðréttingaræfingar" : "Corrective"}</div>
            <div className="text-xs text-slate-500">
              {IS ? `Æfing ${step.itemIndex + 1} af ${items.length}` : `Exercise ${step.itemIndex + 1} of ${items.length}`}
            </div>
          </div>
          <div className="w-11" />
        </div>
        <div aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((_, i) => <span key={i} className={`h-1 rounded-full ${i <= step.itemIndex ? "bg-primary" : "bg-slate-300"}`} />)}
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <ExerciseVideo name={name} url={step.item.videoUrl} lang={lang} />
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{name}</h1>
          {dose && <div className="mt-1 text-slate-700">{dose}</div>}
        </div>
        {cue && <p className="rounded-[10px] bg-slate-100 px-3 py-2.5 text-sm text-slate-700">{cue}</p>}
        <div className="flex-1" />
        {showTimer && (
          <div className="flex flex-col items-center gap-0.5">
            {(sideLabel || setLabel) && (
              <div className="text-[13px] font-medium text-slate-700">{[sideLabel, setLabel].filter(Boolean).join(" · ")}</div>
            )}
            <div role="timer" className="font-display text-6xl font-extrabold leading-none tabular-nums">
              {clock(left ?? step.holdSeconds ?? 0)}
            </div>
          </div>
        )}
      </section>

      <footer className="mx-auto w-full max-w-xl space-y-2">
        {showTimer && !running ? (
          <button type="button" onClick={() => startHold(step.holdSeconds ?? 0)} className={primary}>
            {IS ? "Byrja" : "Start"}
          </button>
        ) : (
          <button type="button" onClick={advance} className={primary}>{IS ? "Lokið" : "Done"}</button>
        )}
        <div className="text-center text-[13px] text-slate-700">{nextText}</div>
        {showTimer && !running && (
          <button type="button" onClick={advance} className="min-h-11 w-full text-sm font-medium text-primary">{IS ? "Sleppa tímamæli" : "Skip timer"}</button>
        )}
      </footer>
    </div>
  );
}
