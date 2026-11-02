"use client";

/**
 * SessionRunner — the PT client's guided session on /client/log.
 *
 * One block at a time: single exercises by set, groups (superset, triset, giant,
 * contrast) by round. Everything is prefilled from the plan, so a set or round is
 * one tap; rest then counts down from the plan (2 min if none is set). Each
 * finished round saves straight away through the existing day-replacing
 * /api/player/exercise-sets, so closing the app loses nothing. The session ends
 * on one required question, session RPE, which is what load is built on.
 *
 * There's no per-set RPE here by design. Sets with no RPE count as taken to
 * failure in the e1RM estimate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ExerciseInfo from "@/components/exercise/ExerciseInfo";
import {
  addSet, applySaved, buildRunnerBlocks, completeRound, firstOpen, lastTimeByExercise,
  roundsIn, skipBlock, summarize, toPayload, updateSet,
  type LoggedSet, type PlanRow, type Position, type RunBlock, type RunExercise, type RunSet,
} from "@/lib/client/sessionRunner";

type Lang = "IS" | "EN";
type Phase = "loading" | "run" | "rest" | "finish";

const todayIso = () => new Date().toISOString().slice(0, 10);
const startKey = (d: string) => `mp_session_start_${d}`;

function readStart(date: string): number {
  try {
    const saved = Number(window.localStorage.getItem(startKey(date)));
    if (saved > 0) return saved;
    const now = Date.now();
    window.localStorage.setItem(startKey(date), String(now));
    return now;
  } catch {
    return Date.now();
  }
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Stepper({ label, value, step, onChange, lessLabel, moreLabel }: {
  label: string; value: number | null; step: number;
  onChange: (v: number | null) => void; lessLabel: string; moreLabel: string;
}) {
  const shift = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <span className="flex items-center justify-between rounded-[10px] border border-slate-300 bg-white">
        <button type="button" aria-label={lessLabel} onClick={(e) => { e.preventDefault(); shift(-step); }} className="h-11 w-11 shrink-0 text-xl text-slate-900">−</button>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full min-w-0 bg-transparent text-center font-display text-xl font-bold text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" aria-label={moreLabel} onClick={(e) => { e.preventDefault(); shift(step); }} className="h-11 w-11 shrink-0 text-xl text-slate-900">+</button>
      </span>
    </label>
  );
}

export default function SessionRunner({ lang, planRows, sessionName, onManual }: {
  lang: Lang;
  planRows: PlanRow[];
  sessionName: string;
  onManual: () => void;
}) {
  const router = useRouter();
  const IS = lang === "IS";
  const t = useMemo(() => (IS ? {
    pause: "Gera hlé", block: (a: number, b: number) => `Blokk ${a} af ${b}`, weight: "Þyngd, kg", reps: "Endurt.",
    less: "Minna", more: "Meira", bodyweight: "Eigin þyngd", addWeight: "Bæta við þyngd", useBw: "Eigin þyngd",
    today: "Í dag", last: "Síðast", set: "Sett", doneWord: "lokið", round: (a: number, b: number) => `Umferð ${a} af ${b}`,
    setDone: "Setti lokið", roundDone: "Umferð lokið", restAfter: (s: string) => `Síðan hvíld ${s}`, tapHint: "Ýttu á æfingu til að breyta",
    together: "Allar í röð", addSet: "Bæta við setti", skip: "Sleppa", manual: "Skrá handvirkt", rest: "Hvíld",
    setBy: (s: string) => `Hvíld: ${s}`, next: "Næst", plus: "+30 s", start: "Áfram", doneTitle: "Æfingu lokið",
    exercises: "æfingar", sets: "sett", lifted: "lyft", howHard: "Hversu erfið var æfingin?", feeds: "Þannig sér þjálfarinn álagið þitt.",
    easy: "Mjög létt", max: "Hámark", duration: "Lengd, mín", save: "Vista æfingu", saving: "Vista…",
    pickRpe: "Veldu hversu erfið æfingin var.", notSaved: "Ekki vistað enn, reyni aftur við næsta sett.",
    saveErr: "Ekki tókst að vista. Reyndu aftur.", noneDone: "Engin sett skráð.", back: "Til baka í æfingu",
  } : {
    pause: "Pause session", block: (a: number, b: number) => `Block ${a} of ${b}`, weight: "Weight, kg", reps: "Reps",
    less: "Less", more: "More", bodyweight: "Bodyweight", addWeight: "Add weight", useBw: "Bodyweight",
    today: "Today", last: "Last time", set: "Set", doneWord: "done", round: (a: number, b: number) => `Round ${a} of ${b}`,
    setDone: "Set done", roundDone: "Round done", restAfter: (s: string) => `Then rest ${s}`, tapHint: "Tap an exercise to change it",
    together: "Do them back to back", addSet: "Add a set", skip: "Skip", manual: "Log manually", rest: "Rest",
    setBy: (s: string) => `Rest: ${s}`, next: "Next", plus: "+30 s", start: "Start now", doneTitle: "Session done",
    exercises: "exercises", sets: "sets", lifted: "lifted", howHard: "How hard was it?", feeds: "This is how your trainer sees your load.",
    easy: "Very easy", max: "Maximal", duration: "Duration, min", save: "Save session", saving: "Saving…",
    pickRpe: "Pick how hard it was.", notSaved: "Not saved yet, retrying after your next set.",
    saveErr: "Could not save. Try again.", noneDone: "No sets logged.", back: "Back to session",
  }), [IS]);

  const [date] = useState(todayIso);
  const [phase, setPhase] = useState<Phase>("loading");
  const [blocks, setBlocks] = useState<RunBlock[]>([]);
  const [pos, setPos] = useState<Position | null>(null);
  const [openEx, setOpenEx] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [restEnd, setRestEnd] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [rpe, setRpe] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const buzzed = useRef(false);

  // Load what's already logged, so reopening the app picks up where it stopped.
  useEffect(() => {
    let alive = true;
    (async () => {
      let rows: LoggedSet[] = [];
      let saved: { rpe: number | null; duration_minutes: number | null } | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/player/exercise-sets?days=180", {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const json = await res.json();
        rows = (json.sets ?? []) as LoggedSet[];
        saved = ((json.session_loads ?? []) as Array<{ session_date: string; session_type: string | null; rpe: number | null; duration_minutes: number | null }>)
          .find((l) => l.session_date === date && (l.session_type ?? "individual") === "individual") ?? null;
      } catch { /* start from the plan alone */ }
      if (!alive) return;
      const built = applySaved(
        buildRunnerBlocks(planRows, lastTimeByExercise(rows, date)),
        rows.filter((r) => r.session_date === date),
      );
      const open = firstOpen(built);
      const started = readStart(date);
      setBlocks(built);
      setPos(open);
      setStartedAt(started);
      setNow(started);
      setRpe(saved?.rpe ?? null);
      setMinutes(saved?.duration_minutes ?? null);
      setPhase(open ? "run" : "finish");
    })();
    return () => { alive = false; };
  }, [date, planRows]);

  // Clock tick. Rest runs off an end time, so a locked phone stays correct.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keep the screen awake through the session where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => { /* optional */ });
    return () => { void lock?.release().catch(() => { /* already released */ }); };
  }, []);

  const restLeft = (restEnd - now) / 1000;

  useEffect(() => {
    if (phase !== "rest" || restLeft > 0 || buzzed.current) return;
    buzzed.current = true;
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* optional */ }
  }, [phase, restLeft]);

  async function post(extra?: { duration_minutes: number; session_rpe: number }, source: RunBlock[] = blocks) {
    const exercises = toPayload(source);
    if (exercises.length === 0) return false;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/player/exercise-sets", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ session_date: date, exercises, ...extra }),
    });
    const json = await res.json();
    return res.ok && json.ok === true;
  }

  /** Saves run one at a time; each replaces the whole day, so order matters. */
  function autosave(next: RunBlock[]) {
    queue.current = queue.current
      .then(() => post(undefined, next))
      .then((ok) => setSaveFailed(!ok))
      .catch(() => setSaveFailed(true));
  }

  function goToFinish() {
    setMinutes((m) => m ?? Math.max(1, Math.round((Date.now() - startedAt) / 60000)));
    setPhase("finish");
  }

  function finishRound() {
    if (!pos) return;
    const next = completeRound(blocks, pos);
    setBlocks(next);
    autosave(next);
    setOpenEx(null);
    const nextPos = firstOpen(next);
    if (!nextPos) { setPos(null); goToFinish(); return; }
    const rest = blocks[pos.block].restSeconds;
    setPos(nextPos);
    setRestTotal(rest);
    setRestEnd(Date.now() + rest * 1000);
    setNow(Date.now());
    buzzed.current = false;
    setPhase("rest");
  }

  function skip() {
    if (!pos) return;
    const next = skipBlock(blocks, pos.block);
    setBlocks(next);
    setOpenEx(null);
    const nextPos = firstOpen(next);
    setPos(nextPos);
    if (!nextPos) goToFinish();
  }

  async function saveSession() {
    if (rpe == null) { setErr(t.pickRpe); return; }
    if (toPayload(blocks).length === 0) { setErr(t.noneDone); return; }
    setSaving(true);
    setErr(null);
    try {
      await queue.current;
      const ok = await post({ duration_minutes: minutes ?? 1, session_rpe: rpe });
      if (!ok) { setErr(t.saveErr); return; }
      try { window.localStorage.removeItem(startKey(date)); } catch { /* optional */ }
      router.push("/client");
    } catch {
      setErr(t.saveErr);
    } finally {
      setSaving(false);
    }
  }

  const shell = "fixed inset-0 z-40 flex flex-col gap-3.5 overflow-y-auto p-4";
  const padding = { paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" };
  const primary = "min-h-[52px] w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50";

  if (phase === "loading") {
    return <div className={`${shell} items-center justify-center bg-background text-sm text-slate-500`}>{IS ? "Hleð…" : "Loading…"}</div>;
  }

  /* ── Finish ─────────────────────────────────────────────────────── */
  if (phase === "finish") {
    const s = summarize(blocks);
    return (
      <div className={`${shell} bg-background text-slate-900`} style={padding}>
        <header className="mx-auto w-full max-w-xl">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{t.doneTitle}</h1>
        </header>
        <section className="mx-auto grid w-full max-w-xl grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          {[
            [`${s.exercisesDone} / ${s.exercisesTotal}`, t.exercises],
            [String(s.sets), t.sets],
            [`${s.liftedKg.toLocaleString(IS ? "is-IS" : "en-GB")} kg`, t.lifted],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="font-display text-[22px] font-bold">{v}</div>
              <div className="text-xs text-slate-500">{l}</div>
            </div>
          ))}
        </section>
        <section className="mx-auto w-full max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h2 className="font-display text-xl font-bold">{t.howHard}</h2>
            <div className="text-[13px] text-slate-700">{t.feeds}</div>
          </div>
          <div role="group" aria-label={t.howHard} className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={rpe === n}
                onClick={() => { setRpe(n); setErr(null); }}
                className={`min-h-11 rounded-[10px] border text-[15px] font-semibold ${rpe === n ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white text-slate-900"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500"><span>{t.easy}</span><span>{t.max}</span></div>
          <label className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
            <span>{t.duration}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={300}
              value={minutes ?? ""}
              onChange={(e) => setMinutes(e.target.value === "" ? null : Number(e.target.value))}
              className="min-h-11 w-24 rounded-[10px] border border-slate-300 bg-white px-3 text-right font-semibold"
            />
          </label>
        </section>
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-xl space-y-2">
          {err && <div role="alert" className="text-center text-sm text-red-700">{err}</div>}
          <button type="button" disabled={saving} onClick={() => { void saveSession(); }} className={primary}>
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
    );
  }

  const block = pos ? blocks[pos.block] : null;
  if (!block || !pos) return null;

  const rounds = roundsIn(block);
  const grouped = block.exercises.length > 1;
  const restText = (s: number) => s % 60 === 0 ? `${s / 60} ${IS ? "mín" : "min"}` : (s >= 60 ? clock(s) : `${s} s`);
  const weightText = (s: RunSet) => s.is_bodyweight ? t.bodyweight : `${s.weight_kg ?? "–"} kg`;
  const setText = (s: RunSet) => `${weightText(s)} × ${s.reps ?? "–"}`;

  /* ── Rest ───────────────────────────────────────────────────────── */
  if (phase === "rest") {
    const first = block.exercises[0].sets[pos.round] ?? block.exercises[0].sets[0];
    return (
      <div className={`${shell} bg-slate-900 text-white`} style={padding}>
        <header className="text-center">
          <div className="font-semibold">{sessionName}</div>
        </header>
        <section aria-label={t.rest} className="flex flex-1 flex-col items-center justify-center gap-2">
          <div className="text-[15px] font-medium text-slate-300">{t.rest}</div>
          <div role="timer" className="font-display text-8xl font-extrabold leading-none tracking-tight tabular-nums">{clock(restLeft)}</div>
          <div aria-hidden="true" className="mt-3 h-1.5 w-60 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(0, Math.min(100, (restLeft / restTotal) * 100))}%` }} />
          </div>
          <div className="mt-2 text-[13px] text-slate-300">{t.setBy(restText(restTotal))}</div>
        </section>
        <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-600 px-4 py-3.5">
          <div className="text-xs font-semibold text-slate-300">
            {t.next}{grouped ? ` · ${t.round(pos.round + 1, rounds)}` : ""}
          </div>
          <div className="mt-0.5 font-medium">
            {block.exercises[0].name} · {setText(first)}
            {grouped ? ` +${block.exercises.length - 1}` : ""}
          </div>
        </section>
        <footer className="mx-auto grid w-full max-w-xl grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setRestEnd((e) => e + 30000); setRestTotal((r) => r + 30); buzzed.current = false; }}
            className="min-h-[52px] rounded-xl border border-slate-500 text-[15px] font-semibold text-white"
          >
            {t.plus}
          </button>
          <button type="button" onClick={() => setPhase("run")} className="min-h-[52px] rounded-xl bg-white text-[15px] font-semibold text-slate-900">
            {t.start}
          </button>
        </footer>
      </div>
    );
  }

  /* ── Run ────────────────────────────────────────────────────────── */
  const editor = (ex: RunExercise, index: number) => {
    const s = ex.sets[pos.round];
    if (!s) return null;
    const set = (patch: Partial<RunSet>) => setBlocks((b) => updateSet(b, pos, index, patch));
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2.5">
          {s.is_bodyweight ? (
            <div>
              <span className="mb-1 block text-xs text-slate-500">{t.weight}</span>
              <button
                type="button"
                onClick={() => set({ is_bodyweight: false, weight_kg: ex.last?.weight_kg ?? ex.plannedKg ?? 20 })}
                className="h-[46px] w-full rounded-[10px] border border-slate-300 bg-white text-sm font-medium text-primary"
              >
                {t.addWeight}
              </button>
            </div>
          ) : (
            <Stepper label={t.weight} value={s.weight_kg} step={2.5} lessLabel={`${t.less}: ${t.weight}`} moreLabel={`${t.more}: ${t.weight}`} onChange={(v) => set({ weight_kg: v })} />
          )}
          <Stepper label={t.reps} value={s.reps} step={1} lessLabel={`${t.less}: ${t.reps}`} moreLabel={`${t.more}: ${t.reps}`} onChange={(v) => set({ reps: v })} />
        </div>
        {!s.is_bodyweight && (
          <button type="button" onClick={() => set({ is_bodyweight: true, weight_kg: null })} className="min-h-9 text-[13px] font-medium text-primary">
            {t.useBw}
          </button>
        )}
      </div>
    );
  };

  const lastLine = (ex: RunExercise) => {
    const parts: string[] = [];
    if (ex.plannedKg != null && ex.plannedReps != null) parts.push(`${t.today} ${ex.plannedKg} kg × ${ex.plannedReps}`);
    if (ex.last) parts.push(`${t.last} ${ex.last.is_bodyweight ? t.bodyweight : `${ex.last.weight_kg ?? "–"} kg`} × ${ex.last.reps ?? "–"}`);
    return parts.join(" · ");
  };

  return (
    <div className={`${shell} bg-background text-slate-900`} style={padding}>
      <header className="mx-auto w-full max-w-xl space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label={t.pause} onClick={() => router.push("/client")} className="-ml-2.5 flex h-11 w-11 items-center justify-center text-slate-900">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="min-w-0 text-center">
            <div className="truncate font-semibold">{sessionName}</div>
            <div className="text-xs text-slate-500">{t.block(pos.block + 1, blocks.length)}</div>
          </div>
          <div className="w-11 text-right text-[13px] font-medium tabular-nums text-slate-700">{clock((now - startedAt) / 1000)}</div>
        </div>
        <div aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${blocks.length}, minmax(0, 1fr))` }}>
          {blocks.map((b, i) => <span key={b.key} className={`h-1 rounded-full ${i <= pos.block ? "bg-primary" : "bg-slate-300"}`} />)}
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        {grouped ? (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{block.label[lang]}</span>
                <span className="text-xs text-slate-700">{t.together}</span>
              </div>
              <h1 className="mt-2 font-display text-[26px] font-extrabold leading-tight tracking-tight">{t.round(pos.round + 1, rounds)}</h1>
            </div>
            <div>
              {block.exercises.map((ex, i) => {
                const s = ex.sets[pos.round];
                if (!s) return null;
                const open = openEx === i;
                return (
                  <div key={`${ex.name}-${i}`} className={open ? "my-2 space-y-2 rounded-xl border-2 border-primary p-3" : "border-b border-slate-100 last:border-b-0"}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenEx(open ? null : i)}
                      className={`flex w-full items-center justify-between gap-3 text-left ${open ? "" : "min-h-[52px]"}`}
                    >
                      <span className="min-w-0 font-medium">{block.tag}{i + 1} · {ex.name}</span>
                      {!open && <span className="shrink-0 text-sm text-slate-700">{setText(s)}</span>}
                    </button>
                    {open && (
                      <>
                        {lastLine(ex) && <div className="text-[13px] text-slate-600">{lastLine(ex)}</div>}
                        {editor(ex, i)}
                        <ExerciseInfo name={ex.name} description={ex.description} descriptionIs={ex.descriptionIs} videoUrl={ex.videoUrl} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (() => {
          const ex = block.exercises[0];
          return (
            <>
              <div>
                <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{ex.name}</h1>
                {lastLine(ex) && <div className="mt-0.5 text-[13px] text-slate-700">{lastLine(ex)}</div>}
              </div>
              <div className="space-y-1.5">
                {ex.sets.map((s, i) => i === pos.round ? (
                  <div key={i} className="space-y-2.5 rounded-xl border-2 border-primary p-3">
                    <div className="font-semibold text-primary">{t.set} {i + 1}</div>
                    {editor(ex, 0)}
                  </div>
                ) : (
                  <div key={i} className={`flex min-h-9 items-center justify-between rounded-[10px] px-3 ${s.done ? "bg-slate-100" : "text-slate-500"}`}>
                    <span className={s.done ? "font-semibold text-emerald-700" : ""}>{t.set} {i + 1}{s.done ? ` ${t.doneWord}` : ""}</span>
                    <span>{setText(s)}</span>
                  </div>
                ))}
              </div>
              <ExerciseInfo name={ex.name} description={ex.description} descriptionIs={ex.descriptionIs} videoUrl={ex.videoUrl} />
            </>
          );
        })()}

        <div className="flex-1" />
        <div className="flex flex-wrap justify-between gap-2 text-sm font-medium text-primary">
          <button type="button" className="min-h-11" onClick={() => setBlocks((b) => addSet(b, pos.block))}>{t.addSet}</button>
          <button type="button" className="min-h-11" onClick={skip}>{t.skip}</button>
          <button type="button" className="min-h-11" onClick={onManual}>{t.manual}</button>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-xl space-y-2">
        {saveFailed && <div role="status" className="text-center text-[13px] text-amber-800">{t.notSaved}</div>}
        <button type="button" onClick={finishRound} className={primary}>{grouped ? t.roundDone : t.setDone}</button>
        <div className="text-center text-[13px] text-slate-700">
          {grouped ? `${t.tapHint} · ` : ""}{t.restAfter(restText(block.restSeconds))}
        </div>
      </footer>
    </div>
  );
}
