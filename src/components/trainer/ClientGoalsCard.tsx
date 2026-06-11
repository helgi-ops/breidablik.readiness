"use client";

/**
 * ClientGoalsCard — the trainer records what a PT client wants to train (ticked
 * quality tags + the client's own words), and the system recommends a
 * programme from the trainer's library, ranked with plain-language reasons.
 *
 * Rules decide, the card explains (manifesto): the recommender is deterministic
 * (src/lib/trainer/goalRecommend) and every suggestion shows WHY it scored and
 * a one-tap "Use this programme" that opens the normal assign flow. The trainer
 * always chooses — nothing is auto-assigned.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { GOALS, recommendProgrammes, type GoalId, type TemplateLite, type Experience } from "@/lib/trainer/goalRecommend";

type Props = {
  clientId: string;
  lang: "EN" | "IS";
  /** The trainer's own templates (training_plan_templates). */
  templates: TemplateLite[];
  /** Ready-made starter programmes, pre-mapped to candidates (source:"starter"). */
  starterCandidates?: TemplateLite[];
  /** Opens the existing PlanAssigner pre-filled with this custom programme. */
  onUseProgramme: (templateId: string, templateName: string) => void;
  /** Assigns a starter programme directly (programme_key + level). */
  onAssignStarter?: (programmeKey: string, level: string) => Promise<void>;
};

export default function ClientGoalsCard({ clientId, lang, templates, starterCandidates = [], onUseProgramme, onAssignStarter }: Props) {
  const is = lang === "IS";
  const [selected, setSelected] = useState<GoalId[]>([]);
  const [notes, setNotes] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Per-starter-rec UI state: chosen level + assign progress/result.
  const [starterLevel, setStarterLevel] = useState<Record<string, string>>({});
  const [starterState, setStarterState] = useState<Record<string, "idle" | "saving" | "done" | "error">>({});
  // Collapsed when goals are already done; remembered per client.
  const [collapsed, setCollapsed] = useState(false);

  const collapseKey = `mp:goalscollapsed:${clientId}`;
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") window.localStorage.setItem(collapseKey, next ? "1" : "0");
      return next;
    });
  };

  const authHeader = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/goals`, { headers: await authHeader() });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      const loadedGoals = (j.goals ?? []) as GoalId[];
      setSelected(loadedGoals);
      setNotes(j.notes ?? "");
      setAge(typeof j.age === "number" ? j.age : null);
      setExperience((j.experience ?? null) as Experience | null);
      setSavedAt(j.updated_at ?? null);
      setDirty(false);
      // Goals live in "hide mode" by default to keep the dashboard clean; the
      // trainer's own Show/Hide choice (localStorage) always wins.
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(`mp:goalscollapsed:${clientId}`) : null;
      setCollapsed(stored != null ? stored === "1" : true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [clientId, authHeader]);
  useEffect(() => { void load(); }, [load]);

  const toggle = (id: GoalId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/trainer/client/${clientId}/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ goals: selected, notes, age, experience }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Save failed"); return; }
      setSavedAt(new Date().toISOString());
      setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setSaving(false); }
  };

  const pool = useMemo(() => [...templates, ...starterCandidates], [templates, starterCandidates]);
  const recs = useMemo(() => recommendProgrammes(selected, pool, { age, experience }), [selected, pool, age, experience]);
  const allowedRecs = recs.filter((r) => !r.blocked);
  const blockedRecs = recs.filter((r) => r.blocked);
  const maxScore = allowedRecs.length ? allowedRecs[0].score : (recs.length ? recs[0].score : 1);

  const assignStarter = async (key: string, level: string, recId: string) => {
    if (!onAssignStarter) return;
    setStarterState((s) => ({ ...s, [recId]: "saving" }));
    try {
      await onAssignStarter(key, level);
      setStarterState((s) => ({ ...s, [recId]: "done" }));
    } catch {
      setStarterState((s) => ({ ...s, [recId]: "error" }));
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">{is ? "Hleð markmiðum…" : "Loading goals…"}</div>;
  }

  const goalSummary = selected.filter((g) => g !== "keep_lean").map((id) => GOALS.find((x) => x.id === id)?.label[lang]).filter(Boolean).join(", ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Markmið & æfingakerfi" : "Goals & programme match"}</span>
        {savedAt && !dirty && <span className="text-[10px] text-slate-400">{is ? "vistað" : "saved"}</span>}
        {dirty && <span className="text-[10px] text-amber-600">{is ? "óvistað" : "unsaved"}</span>}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ml-auto rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {collapsed ? (is ? "Sýna ▾" : "Show ▾") : (is ? "Fela ▴" : "Hide ▴")}
        </button>
      </div>

      {collapsed ? (
        <div className="mt-1 text-[11px] text-slate-500">
          {selected.length > 0
            ? <>{is ? "Markmið: " : "Goals: "}<span className="text-slate-700">{goalSummary || (is ? "engin" : "none")}</span></>
            : (is ? "Engin markmið skráð enn." : "No goals recorded yet.")}
        </div>
      ) : (
      <>
      <p className="mb-2 mt-1 text-[11px] leading-relaxed text-slate-500">
        {is
          ? "Hakaðu við hvað viðskiptavinurinn vill þjálfa — kerfið mælir með æfingakerfi úr safninu þínu og útskýrir af hverju. Þú velur alltaf sjálf(ur)."
          : "Tick what the client wants to train — the system recommends a programme from your library and explains why. You always choose."}
      </p>

      {/* Goal chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {GOALS.map((g) => {
          const on = selected.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {on ? "✓ " : ""}{g.label[lang]}
            </button>
          );
        })}
      </div>

      {/* Client's own words */}
      <label className="mb-1 block text-[11px] font-medium text-slate-500">
        {is ? "Skilaboð / orð viðskiptavinarins" : "Client's own message / words"}
      </label>
      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
        rows={2}
        placeholder={is ? "T.d. „Vil styrkja mig og bæta snerpu, en halda hraðanum…“" : "e.g. \"Want to get stronger and more agile, but keep my speed…\""}
        className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
      />

      {/* Age + experience — gate which methods are appropriate. */}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">{is ? "Aldur" : "Age"}</label>
          <input
            type="number" min={8} max={99}
            value={age ?? ""}
            onChange={(e) => { setAge(e.target.value === "" ? null : Number(e.target.value)); setDirty(true); }}
            placeholder={is ? "ár" : "yrs"}
            className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">{is ? "Reynsla" : "Experience"}</label>
          <div className="flex gap-1">
            {(["beginner", "intermediate", "advanced"] as const).map((lvl) => {
              const on = experience === lvl;
              const label = { beginner: is ? "Byrjandi" : "Beginner", intermediate: is ? "Miðlungs" : "Intermediate", advanced: is ? "Lengra" : "Advanced" }[lvl];
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => { setExperience(on ? null : lvl); setDirty(true); }}
                  className={`rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {saving ? (is ? "Vista…" : "Saving…") : (is ? "Vista markmið" : "Save goals")}
        </button>
        {err && <span className="text-[11px] text-red-600">{err}</span>}
      </div>

      {/* Recommendations */}
      <div className="mt-3 border-t border-slate-100 pt-2">
        {selected.length === 0 ? (
          <p className="text-[11px] text-slate-400">{is ? "Hakaðu við a.m.k. eitt markmið til að fá tillögu." : "Tick at least one goal to get a recommendation."}</p>
        ) : recs.length === 0 ? (
          <p className="text-[11px] text-slate-400">{is ? "Ekkert kerfi í safninu passar við þessi markmið enn." : "No programme in your library matches these goals yet."}</p>
        ) : (
          <>
            <p className="mb-2 text-[11px] font-medium text-slate-500">{is ? "Mælt með (best efst):" : "Recommended (best first):"}</p>
            {allowedRecs.length === 0 && (
              <p className="mb-2 text-[11px] text-amber-700">{is ? "Öll kerfi sem passa eru of þung fyrir aldur/reynslu — byrjaðu á grunnkerfi." : "Every matching programme is too advanced for this age/experience — start with a foundational one."}</p>
            )}
            <div className="space-y-2">
              {allowedRecs.slice(0, 4).map((r, i) => {
                const isStarter = r.template.source === "starter";
                const levels = r.template.levels ?? [];
                // Default the starter level to the client's experience when offered.
                const expDefault = experience && levels.includes(experience) ? experience : (levels[0] ?? "beginner");
                const lvl = starterLevel[r.template.id] ?? expDefault;
                const st = starterState[r.template.id] ?? "idle";
                return (
                <div key={r.template.id} className={`rounded-md border p-2 ${i === 0 ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {i === 0 && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">{is ? "Besta" : "Best"}</span>}
                        <span className="truncate text-xs font-semibold text-slate-800">{r.template.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${isStarter ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                          {isStarter ? (is ? "Tilbúið kerfi" : "Starter") : (is ? "Þitt kerfi" : "Custom")}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{r.family}</span>
                      {r.reasons.map((reason, k) => (
                        <p key={k} className="mt-0.5 text-[11px] leading-snug text-slate-600">{reason}</p>
                      ))}
                    </div>
                    {!isStarter && (
                      <button
                        type="button"
                        onClick={() => onUseProgramme(r.template.id, r.template.name)}
                        className="shrink-0 rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        {is ? "Nota þetta" : "Use this"}
                      </button>
                    )}
                  </div>

                  {/* Starter programmes assign directly by programme_key + level. */}
                  {isStarter && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {levels.length > 1 && (
                        <select
                          value={lvl}
                          onChange={(e) => setStarterLevel((s) => ({ ...s, [r.template.id]: e.target.value }))}
                          className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700"
                          disabled={st === "saving" || st === "done"}
                        >
                          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => r.template.programmeKey && assignStarter(r.template.programmeKey, lvl, r.template.id)}
                        disabled={st === "saving" || st === "done" || !onAssignStarter}
                        className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {st === "saving" ? (is ? "Set á…" : "Assigning…")
                          : st === "done" ? (is ? "✓ Sett á" : "✓ Assigned")
                          : (is ? "Setja á" : "Assign")}
                      </button>
                      {st === "error" && <span className="text-[10px] text-red-600">{is ? "Villa" : "Error"}</span>}
                    </div>
                  )}

                  {/* fit bar */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.round((r.score / maxScore) * 100)}%` }} />
                  </div>
                </div>
                );
              })}
            </div>

            {/* Held-back programmes: too advanced for the client's age/experience. */}
            {blockedRecs.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-2">
                <div className="text-[11px] font-medium text-amber-900">
                  {is ? "Haldið eftir (of þungt fyrir aldur/reynslu):" : "Held back (too advanced for age/experience):"}
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {blockedRecs.slice(0, 4).map((r) => (
                    <li key={r.template.id} className="text-[11px] text-amber-800">
                      <span className="font-medium">{r.template.name}</span> — {r.blockReason?.[lang]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              {is
                ? "Tillagan er reiknuð (engin AI) út frá markmiðunum, eiginleikum kerfanna og aldri/reynslu. Hún velur úr því sem ER í safninu þínu — ekki ný uppsetning."
                : "The match is computed (no AI) from the goals, each programme's qualities and the client's age/experience. It picks from what's already in your library — it doesn't invent a new structure."}
            </p>
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}
