"use client";

/**
 * PtSessionLogForm
 *
 * Player-facing form: log today's training session with per-set weight + reps
 * + per-set RPE. Submits a single batch (replaces any existing rows for the
 * day so re-submitting "edits" rather than duplicates).
 *
 * Mounts on /player surface. Initially loads any rows already logged for
 * `session_date` so the player can keep editing during the day.
 *
 * Session-level RPE (Foster sRPE, 1-10) + duration is logged separately via
 * the existing /api/player/session-rpe endpoint — this form focuses on the
 * per-set detail that feeds strength progression analytics.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buildSessionBlocks, type SessionBlock } from "@/lib/client/sessionGrouping";

type Lang = "IS" | "EN";

type SetRow = {
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
};
type ExerciseDraft = {
  name: string;
  sets: SetRow[];
  /** Grouping carried from the prescribed plan so the form can show whether
   *  this exercise is standalone or part of a superset/triset/giant/contrast
   *  block. Undefined for exercises the athlete adds manually. */
  group?: string | null;
  groupMethod?: string | null;
  num?: string | null;
};

interface Props {
  lang?: Lang;
  /** Override the session_date — defaults to today (local). */
  date?: string;
  /** When true, and nothing is logged yet for the date, pre-fill the form
   *  with today's prescribed session (exercise names + set count) pulled from
   *  /api/client/today. Opt-in so the /player surface is unaffected. */
  prefillFromPlan?: boolean;
}

/** Per-exercise grouping metadata, aligned to the exercises array, so the form
 *  can render a "Superset / Triset / French contrast" header above the first
 *  exercise of each performed block. */
type GroupMeta = { headerBlock: SessionBlock | null; grouped: boolean; tag: string; idxInGroup: number };
function computeGroupMeta(exercises: ExerciseDraft[]): GroupMeta[] {
  const blocks = buildSessionBlocks(
    exercises.map((e) => ({ group: e.group, group_method: e.groupMethod, num: e.num })),
  );
  const meta: GroupMeta[] = [];
  for (const blk of blocks) {
    blk.rows.forEach((_, j) => {
      meta.push({ headerBlock: j === 0 ? blk : null, grouped: blk.kind !== "single", tag: blk.tag, idxInGroup: j });
    });
  }
  return meta;
}

/** Parse a prescription reps string ("5", "8-10", "5 ea leg") into a leading
 *  integer, or null if there's no clean number to seed. */
function parseReps(reps: unknown): number | null {
  if (typeof reps === "number") return Number.isFinite(reps) ? reps : null;
  if (typeof reps !== "string") return null;
  const m = reps.match(/\d+/);
  return m ? Number(m[0]) : null;
}

const COPY = {
  IS: {
    title: "Skrá æfingu",
    subtitle: "Þyngd × endurtekningar × RPE per sett. Þú getur breytt þessu yfir daginn.",
    date: "Dagsetning",
    exerciseName: "Æfing",
    addExercise: "+ Bæta við æfingu",
    addSet: "+ Bæta við setti",
    weight: "Kg",
    reps: "Endurt.",
    rpe: "RPE",
    notes: "Athugasemd",
    save: "Vista æfingu",
    saving: "Vista…",
    saved: "Æfing skráð.",
    delete: "Eyða",
    examplePlaceholder: "t.d. Bench Press",
    empty: "Bæta við fyrstu æfingunni hér að ofan.",
    error: "Ekki tókst að vista. Reyndu aftur.",
    sessionLoadTitle: "Álag æfingar (sRPE)",
    duration: "Lengd (mín)",
    durationPlaceholder: "t.d. 60",
    sessionRpe: "Session RPE (1–10)",
    derivedHint: "Reiknað sjálfkrafa: meðaltal RPE úr settunum þínum. Þú mátt breyta.",
    manualHint: "Engin RPE skráð á settin — sláðu inn heildar-RPE fyrir æfinguna.",
    loadAu: "Álag",
    loadFormula: "RPE × mínútur",
  },
  EN: {
    title: "Log session",
    subtitle: "Weight × reps × RPE per set. You can edit this throughout the day.",
    date: "Date",
    exerciseName: "Exercise",
    addExercise: "+ Add exercise",
    addSet: "+ Add set",
    weight: "kg",
    reps: "Reps",
    rpe: "RPE",
    notes: "Notes",
    save: "Save session",
    saving: "Saving…",
    saved: "Session saved.",
    delete: "Delete",
    examplePlaceholder: "e.g. Bench Press",
    empty: "Add your first exercise above.",
    error: "Failed to save. Try again.",
    sessionLoadTitle: "Session load (sRPE)",
    duration: "Duration (min)",
    durationPlaceholder: "e.g. 60",
    sessionRpe: "Session RPE (1–10)",
    derivedHint: "Auto-calculated: the average RPE across your sets. You can override it.",
    manualHint: "No per-set RPE logged — enter an overall RPE for the session.",
    loadAu: "Load",
    loadFormula: "RPE × minutes",
  },
} as const;

function todayIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function emptySet(): SetRow { return { weight_kg: null, reps: null, rpe: null }; }
function emptyExercise(): ExerciseDraft { return { name: "", sets: [emptySet()] }; }

export default function PtSessionLogForm({ lang = "IS", date: dateProp, prefillFromPlan = false }: Props) {
  const t = COPY[lang];
  const [sessionDate, setSessionDate] = useState<string>(dateProp ?? todayIso());
  const [exercises, setExercises] = useState<ExerciseDraft[]>([emptyExercise()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Foster session load inputs. Duration is entered by the client; the
  // session RPE is auto-derived (average of per-set RPEs) but can be overridden.
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [manualRpe, setManualRpe] = useState<number | null>(null);
  // Exercise-name typeahead: the library names the client can pick from, plus
  // which exercise input currently has focus (so we only show one dropdown).
  const [exerciseOptions, setExerciseOptions] = useState<{ name: string; name_is: string | null }[]>([]);
  const [activeAuto, setActiveAuto] = useState<number | null>(null);

  // Average of every per-set RPE the client has entered, or null if none.
  const allRpes = exercises.flatMap((e) => e.sets.map((s) => s.rpe)).filter((r): r is number => r != null);
  const derivedRpe = allRpes.length > 0
    ? Math.round((allRpes.reduce((a, b) => a + b, 0) / allRpes.length) * 10) / 10
    : null;
  // Effective session RPE: a manual override wins, otherwise the derived avg.
  const effectiveRpe = manualRpe ?? derivedRpe;
  const sessionLoad = (effectiveRpe != null && durationMin != null && durationMin > 0)
    ? Math.round(effectiveRpe * durationMin)
    : null;

  /* ── Load existing rows for this date ─────────────────────────────── */

  /** Pull today's prescribed session and turn each prescribed exercise into a
   *  draft with the right number of (empty) sets, reps seeded from the plan.
   *  Returns null if there's nothing prescribed (rest day / no plan). */
  const buildPrefill = useCallback(async (token: string): Promise<ExerciseDraft[] | null> => {
    try {
      const res = await fetch(`/api/client/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const blocks = (json?.explosive?.blocks ?? []) as Array<{
        name: string;
        rows: Array<{ exercise: string; reps?: unknown; sets?: number | null; group?: string | null; group_method?: string | null; num?: string | null }>;
      }>;
      const drafts: ExerciseDraft[] = [];
      for (const b of blocks) {
        for (const r of b.rows ?? []) {
          if (!r.exercise) continue;
          const nSets = Math.max(1, Number(r.sets) || 1);
          const reps = parseReps(r.reps);
          drafts.push({
            name: r.exercise,
            sets: Array.from({ length: nSets }, () => ({ weight_kg: null, reps, rpe: null })),
            group: r.group ?? null,
            groupMethod: r.group_method ?? null,
            num: r.num ?? null,
          });
        }
      }
      return drafts.length > 0 ? drafts : null;
    } catch {
      return null;
    }
  }, []);

  const loadExisting = useCallback(async (forDate: string) => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(`/api/player/exercise-sets?days=180`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      const rows = ((json.sets ?? []) as Array<{
        session_date: string; exercise_name: string;
        weight_kg: number | null; reps: number | null; rpe: number | null;
        set_number: number;
      }>).filter((r) => r.session_date === forDate);

      // Restore any saved Foster session-load row for this day (duration +
      // a manually-overridden RPE) so re-opening keeps the inputs.
      const loadRow = ((json.session_loads ?? []) as Array<{
        session_date: string; session_type: string | null;
        duration_minutes: number | null; rpe: number | null;
      }>).find((l) => l.session_date === forDate && (l.session_type ?? "individual") === "individual");
      setDurationMin(loadRow?.duration_minutes ?? null);
      setManualRpe(loadRow?.rpe ?? null);

      if (rows.length === 0) {
        // Nothing logged yet — seed from the prescribed plan when asked,
        // otherwise fall back to a single blank exercise.
        const prefill = prefillFromPlan ? await buildPrefill(session.access_token) : null;
        setExercises(prefill ?? [emptyExercise()]);
        return;
      }
      // Group by exercise_name, preserving set_number order.
      const grouped = new Map<string, ExerciseDraft>();
      for (const r of rows) {
        if (!grouped.has(r.exercise_name)) grouped.set(r.exercise_name, { name: r.exercise_name, sets: [] });
        grouped.get(r.exercise_name)!.sets.push({
          weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe,
        });
      }
      setExercises(Array.from(grouped.values()));
    } catch {
      // Soft failure — keep blank form
      setExercises([emptyExercise()]);
    } finally {
      setLoading(false);
    }
  }, [prefillFromPlan, buildPrefill]);

  useEffect(() => { void loadExisting(sessionDate); }, [loadExisting, sessionDate]);

  // Load the exercise-name library once (for the typeahead). Optional — if it
  // fails the input is still a plain free-text field.
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/player/exercises`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (res.ok && Array.isArray(json.exercises)) setExerciseOptions(json.exercises);
      } catch { /* typeahead is a nicety, not required */ }
    })();
  }, []);

  /** Up to 8 library matches for a typed query — names STARTING with the query
   *  first (e.g. "b" → Back Squat, Bench Press…), then names that merely
   *  contain it. Matches the English name and the Icelandic alias. */
  const suggestionsFor = (q: string) => {
    const query = q.trim().toLowerCase();
    if (query.length < 1) return [] as typeof exerciseOptions;
    const starts: typeof exerciseOptions = [];
    const contains: typeof exerciseOptions = [];
    for (const o of exerciseOptions) {
      const en = o.name.toLowerCase();
      const is = (o.name_is ?? "").toLowerCase();
      if (en === query || is === query) continue; // already an exact pick
      if (en.startsWith(query) || is.startsWith(query)) starts.push(o);
      else if (en.includes(query) || is.includes(query)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, 8);
  };

  /* ── Mutators ─────────────────────────────────────────────────────── */

  function updateExercise(idx: number, patch: Partial<ExerciseDraft>) {
    setExercises((prev) => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
  }
  function updateSet(exIdx: number, setIdx: number, patch: Partial<SetRow>) {
    setExercises((prev) => prev.map((e, i) =>
      i === exIdx ? { ...e, sets: e.sets.map((s, j) => j === setIdx ? { ...s, ...patch } : s) } : e
    ));
  }
  function addExercise() { setExercises((prev) => [...prev, emptyExercise()]); }
  function removeExercise(idx: number) { setExercises((prev) => prev.filter((_, i) => i !== idx)); }
  function addSet(exIdx: number) {
    // Copy the last set's weight/reps/RPE so the athlete only edits what
    // changed — far faster than re-typing the same numbers each set.
    setExercises((prev) => prev.map((e, i) => {
      if (i !== exIdx) return e;
      const last = e.sets[e.sets.length - 1];
      const next: SetRow = last ? { weight_kg: last.weight_kg, reps: last.reps, rpe: last.rpe } : emptySet();
      return { ...e, sets: [...e.sets, next] };
    }));
  }
  /** Duplicate one set, inserting the copy right after it. */
  function copySet(exIdx: number, setIdx: number) {
    setExercises((prev) => prev.map((e, i) => {
      if (i !== exIdx) return e;
      const src = e.sets[setIdx];
      if (!src) return e;
      const copy: SetRow = { weight_kg: src.weight_kg, reps: src.reps, rpe: src.rpe };
      const sets = [...e.sets.slice(0, setIdx + 1), copy, ...e.sets.slice(setIdx + 1)];
      return { ...e, sets };
    }));
  }
  function removeSet(exIdx: number, setIdx: number) {
    setExercises((prev) => prev.map((e, i) =>
      i === exIdx ? { ...e, sets: e.sets.filter((_, j) => j !== setIdx) } : e
    ));
  }

  /* ── Save ─────────────────────────────────────────────────────────── */

  async function save() {
    setSaving(true);
    setErr(null);
    setSavedAt(null);
    try {
      // Drop completely empty exercises (no name + no values).
      const cleaned = exercises
        .map((e) => ({
          name: e.name.trim(),
          sets: e.sets.filter((s) =>
            s.weight_kg !== null || s.reps !== null || s.rpe !== null
          ),
        }))
        .filter((e) => e.name && e.sets.length > 0);

      if (cleaned.length === 0) {
        setErr(lang === "IS" ? "Engar æfingar til að vista." : "No exercises to save.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(`/api/player/exercise-sets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          session_date: sessionDate,
          exercises: cleaned,
          duration_minutes: durationMin,
          session_rpe: effectiveRpe,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? t.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString(lang === "IS" ? "is-IS" : "en-GB", {
        hour: "2-digit", minute: "2-digit",
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">🏋️ {t.title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{t.subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-600">{t.date}</label>
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          className="rounded-lg border px-2 py-1 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : (
        <div className="space-y-3">
          {exercises.length === 0 && (
            <div className="text-sm text-slate-500">{t.empty}</div>
          )}
          {(() => {
            const groupMeta = computeGroupMeta(exercises);
            return exercises.map((ex, exIdx) => {
            const meta = groupMeta[exIdx];
            return (
            <div key={exIdx}>
              {meta?.grouped && meta.headerBlock && (
                <div className="mb-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{meta.headerBlock.label[lang]}</span>
                    <span className="text-[11px] font-medium text-indigo-700">{meta.headerBlock.rows.length} {lang === "IS" ? "æfingar saman" : "exercises together"}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{meta.headerBlock.howto[lang]}</p>
                </div>
              )}
            <div className={`rounded-xl border p-3 space-y-2 ${meta?.grouped ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                {meta?.grouped && <span className="shrink-0 text-xs font-semibold text-indigo-400">{meta.tag}{meta.idxInGroup + 1}</span>}
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={ex.name}
                    placeholder={t.examplePlaceholder}
                    autoComplete="off"
                    onChange={(e) => { updateExercise(exIdx, { name: e.target.value }); setActiveAuto(exIdx); }}
                    onFocus={() => setActiveAuto(exIdx)}
                    onBlur={() => setTimeout(() => setActiveAuto((cur) => (cur === exIdx ? null : cur)), 120)}
                    className="w-full rounded-lg border bg-white px-3 py-1.5 text-sm font-medium"
                  />
                  {activeAuto === exIdx && (() => {
                    const sugg = suggestionsFor(ex.name);
                    if (sugg.length === 0) return null;
                    return (
                      <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        {sugg.map((o) => (
                          <li key={o.name}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { updateExercise(exIdx, { name: o.name }); setActiveAuto(null); }}
                              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-indigo-50"
                            >
                              <span className="font-medium text-slate-800">{o.name}</span>
                              {o.name_is && o.name_is.toLowerCase() !== o.name.toLowerCase() && (
                                <span className="ml-2 text-xs text-slate-400">{o.name_is}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => removeExercise(exIdx)}
                  className="text-xs text-red-600 hover:underline"
                >
                  {t.delete}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left w-8">#</th>
                      <th className="text-left">{t.weight}</th>
                      <th className="text-left">{t.reps}</th>
                      <th className="text-left">{t.rpe}</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {ex.sets.map((s, setIdx) => (
                      <tr key={setIdx} className="border-t border-slate-200">
                        <td className="py-1.5 text-slate-500 tabular-nums">{setIdx + 1}</td>
                        <td className="py-1.5">
                          <input
                            type="number" step="0.5" min="0"
                            value={s.weight_kg ?? ""}
                            onChange={(e) => updateSet(exIdx, setIdx, { weight_kg: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-20 rounded-md border bg-white px-2 py-1"
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            type="number" step="1" min="0"
                            value={s.reps ?? ""}
                            onChange={(e) => updateSet(exIdx, setIdx, { reps: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-16 rounded-md border bg-white px-2 py-1"
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            type="number" step="0.5" min="1" max="10"
                            value={s.rpe ?? ""}
                            onChange={(e) => updateSet(exIdx, setIdx, { rpe: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-16 rounded-md border bg-white px-2 py-1"
                          />
                        </td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => copySet(exIdx, setIdx)}
                              className="text-slate-400 hover:text-indigo-600 text-sm leading-none"
                              aria-label={lang === "IS" ? "Afrita sett" : "Copy set"}
                              title={lang === "IS" ? "Afrita sett" : "Copy set"}
                            >⧉</button>
                            <button
                              type="button"
                              onClick={() => removeSet(exIdx, setIdx)}
                              className="text-slate-400 hover:text-red-600 text-base leading-none"
                              aria-label="Remove set"
                            >×</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => addSet(exIdx)}
                className="text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                {t.addSet}
              </button>
            </div>
            </div>
            );
            });
          })()}

          <button
            type="button"
            onClick={addExercise}
            className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t.addExercise}
          </button>
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-900">{t.sessionLoadTitle}</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">{t.duration}</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={300}
                value={durationMin ?? ""}
                placeholder={t.durationPlaceholder}
                onChange={(e) => setDurationMin(e.target.value === "" ? null : Number(e.target.value))}
                className="w-24 rounded-lg border px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">{t.sessionRpe}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={10}
                step={0.5}
                value={manualRpe ?? derivedRpe ?? ""}
                onChange={(e) => setManualRpe(e.target.value === "" ? null : Number(e.target.value))}
                className="w-24 rounded-lg border px-2 py-1 text-sm"
              />
            </div>
            {sessionLoad != null && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">{t.loadAu}</span>
                <span className="rounded-lg bg-neutral-900 px-3 py-1 text-sm font-semibold text-white">
                  {sessionLoad} AU
                </span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {derivedRpe != null ? t.derivedHint : t.manualHint}
            {sessionLoad != null && <> · {effectiveRpe} × {durationMin} {t.loadFormula}</>}
          </p>
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-700">{t.saved} {savedAt}</span>
        )}
      </div>
    </div>
  );
}
