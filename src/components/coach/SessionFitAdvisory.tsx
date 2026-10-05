"use client";

/**
 * Session-fit advisory — does the built session fit TODAY'S MD day, under the coach's chosen
 * periodization model? Layered, explainable, advisory-only (never blocks the save, never a colour).
 *
 *   (0) one-line verdict — "Fits today (MD-4 · mechanical)" / "Review — doesn't match today".
 *   (1) 2–3 plain "why" facts + the counterfactual, visible without a click.
 *   (2) behind "Show details" — the day spec (intended type + cap), the model used, confidence.
 *
 * A small model picker (Default MD microcycle / Tactical Periodization / Custom) drives the check;
 * Custom opens a per-MD-day editor. "Use anyway" logs the override with an optional reason. All copy
 * EN default / IS toggle. This component owns the model fetch + checkSessionFit; the builder passes
 * the built-session summary, the day target, and the drills.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";
import {
  modelFromStored,
  specForDay,
  BUILTIN_MODELS,
  type ModelSource,
  type MdDaySpec,
  type IntendedType,
  type PeriodizationModel,
} from "@/lib/micropulse/periodization/periodizationModel";
import {
  checkSessionFit,
  type BuiltSessionSummary,
  type DayLoadTarget,
  type DrillForFit,
  type SessionFitWarning,
} from "@/lib/micropulse/periodization/sessionFitCheck";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

const INTENDED_TYPES: IntendedType[] = ["mechanical", "locomotive", "speed", "mixed"];

const SOURCE_LABEL: Record<ModelSource, Bi> = {
  default_md: { en: "Default MD microcycle", is: "Sjálfgefinn MD-vikuhringur" },
  tactical_periodization: { en: "Tactical Periodization", is: "Taktísk periodisering" },
  custom: { en: "Custom model", is: "Sérsniðið módel" },
};

const TYPE_LABEL: Record<IntendedType, Bi> = {
  mechanical: { en: "mechanical", is: "vélrænt" },
  locomotive: { en: "locomotive", is: "hlaupaálag" },
  speed: { en: "speed", is: "hraði" },
  mixed: { en: "mixed", is: "blandað" },
};

const LLABEL_SOURCE = { en: "Periodization model", is: "Periodiseringar-módel" };

export default function SessionFitAdvisory({
  teamId, mdDay, lang, session, dayTarget, drills, sessionDate,
}: {
  teamId: string;
  mdDay: string | null;
  lang: Lang;
  session: BuiltSessionSummary;
  dayTarget: DayLoadTarget | null;
  drills: DrillForFit[];
  sessionDate?: string | null;
}) {
  const is = lang === "IS";
  const L = React.useCallback((b: Bi) => (is ? b.is : b.en), [is]);

  const [source, setSource] = React.useState<ModelSource>("default_md");
  const [customDays, setCustomDays] = React.useState<MdDaySpec[] | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  // Fetch the team's active model once.
  React.useEffect(() => {
    if (!teamId) return;
    let alive = true;
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/team/periodization-model?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (alive && j?.ok) {
          setSource((j.source as ModelSource) ?? "default_md");
          setCustomDays(Array.isArray(j.days) ? (j.days as MdDaySpec[]) : null);
        }
      } finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [teamId, token]);

  // Re-evaluate on any changing input → never keep a stale "overridden" banner.
  React.useEffect(() => { setDismissed(false); setOverrideOpen(false); }, [mdDay, session.dominantType, session.matchPct, source]);

  const activeModel: PeriodizationModel = React.useMemo(
    () => modelFromStored({ source, days: source === "custom" ? customDays : null }),
    [source, customDays],
  );
  const daySpec = React.useMemo(() => specForDay(activeModel, mdDay), [activeModel, mdDay]);

  const result = React.useMemo(
    () => checkSessionFit({ session, dayTarget, daySpec, modelName: activeModel.name, drills }),
    [session, dayTarget, daySpec, activeModel, drills],
  );

  async function saveModel(next: ModelSource, days?: MdDaySpec[] | null) {
    const tok = await token(); if (!tok) return;
    setSaving(true);
    try {
      await fetch(`/api/coach/team/periodization-model`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, source: next, days: next === "custom" ? (days ?? customDays ?? activeModel.days) : undefined }),
      });
    } finally { setSaving(false); }
  }

  function onPickSource(next: ModelSource) {
    setSource(next);
    if (next === "custom" && !customDays) {
      // Seed the custom editor from the current built-in so the coach edits from a sensible base.
      const seed = (BUILTIN_MODELS.default_md.days).map((d) => ({ ...d }));
      setCustomDays(seed);
      setEditing(true);
      void saveModel("custom", seed);
    } else {
      setEditing(next === "custom");
      void saveModel(next);
    }
  }

  function updateCustomDay(idx: number, patch: Partial<MdDaySpec>) {
    setCustomDays((prev) => {
      const base = prev ?? BUILTIN_MODELS.default_md.days.map((d) => ({ ...d }));
      const next = base.map((d, i) => (i === idx ? { ...d, ...patch } : d));
      return next;
    });
  }

  async function logOverride() {
    const tok = await token(); if (!tok) return;
    setSaving(true);
    try {
      await fetch(`/api/coach/team/periodization-model`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId, sessionDate: sessionDate ?? null, mdDay, modelSource: source,
          verdict: result.verdict, warnings: result.warnings.map((w) => ({ kind: w.kind, level: w.level })),
          reason: reason.trim() || null,
        }),
      });
    } finally { setSaving(false); setOverrideOpen(false); setDismissed(true); }
  }

  // Nothing to say without an MD day or before the model loads.
  if (!mdDay || !loaded) return null;
  if (dismissed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
        {is ? "Ráðlegging hunsuð fyrir þessa æfingu (skráð)." : "Advisory overridden for this session (logged)."}
        <button onClick={() => setDismissed(false)} className="ml-2 font-medium text-[#2740e6] hover:underline">{is ? "Sýna aftur" : "Show again"}</button>
      </div>
    );
  }

  const review = result.verdict === "review";
  const hasWatch = result.warnings.some((w) => w.level === "watch");
  const tone = review
    ? "border-amber-300 bg-amber-50"
    : hasWatch ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50";
  // mismatch first, then watch — the layer-1 read order.
  const ordered = [...result.warnings].sort((a, b) => (a.level === "mismatch" ? 0 : 1) - (b.level === "mismatch" ? 0 : 1));

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      {/* Layer 0 — verdict + model picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold leading-snug text-slate-800">
          {review ? "⚠ " : "✓ "}{L(result.headline)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500" title={L(LLABEL_SOURCE)}>{is ? "Módel" : "Model"}</label>
          <select
            value={source}
            onChange={(e) => onPickSource(e.target.value as ModelSource)}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
          >
            <option value="default_md">{L(SOURCE_LABEL.default_md)}</option>
            <option value="tactical_periodization">{L(SOURCE_LABEL.tactical_periodization)}</option>
            <option value="custom">{L(SOURCE_LABEL.custom)}</option>
          </select>
        </div>
      </div>

      {/* Layer 1 — the plain why + counterfactual for each warning (visible, no click) */}
      {ordered.length > 0 && (
        <div className="mt-2 space-y-2">
          {ordered.map((w, i) => (
            <WarningRow key={`${w.kind}-${i}`} w={w} L={L} is={is} />
          ))}
        </div>
      )}

      {/* Day-spec one-liner when the model defines the day but nothing is flagged */}
      {ordered.length === 0 && daySpec && (
        <p className="mt-1 text-[12px] text-slate-600">
          {is ? "Dagurinn kallar á " : "The day calls for a "}<b>{L(TYPE_LABEL[daySpec.intendedType])}</b>{is ? " áreiti" : " stimulus"}
          {daySpec.intensityCapPct != null ? (is ? ` (þak ~${daySpec.intensityCapPct}% af leik)` : ` (cap ~${daySpec.intensityCapPct}% of a match)`) : ""}.
        </p>
      )}

      {/* Layer 2 — details toggle */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={() => setShowDetails((s) => !s)} className="text-[12px] font-medium text-[#2740e6] hover:underline">
          {showDetails ? (is ? "Fela smáatriði" : "Hide details") : (is ? "Sýna smáatriði" : "Show details")}
        </button>
        {source === "custom" && (
          <button onClick={() => setEditing((s) => !s)} className="text-[12px] font-medium text-[#2740e6] hover:underline">
            {editing ? (is ? "Loka módel-breyti" : "Close model editor") : (is ? "Breyta módeli" : "Edit model")}
          </button>
        )}
        {review && !overrideOpen && (
          <button onClick={() => setOverrideOpen(true)} className="ml-auto rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:border-slate-400">
            {is ? "Nota samt" : "Use anyway"}
          </button>
        )}
      </div>

      {showDetails && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white/70 p-2.5 text-[11px] text-slate-600">
          <p><b>{L(LLABEL_SOURCE)}:</b> {L(activeModel.name)}</p>
          {daySpec ? (
            <ul className="mt-1 space-y-0.5">
              <li>{daySpec.mdDay}: {is ? "ætluð gerð" : "intended type"} <b>{L(TYPE_LABEL[daySpec.intendedType])}</b>{daySpec.intensityCapPct != null ? `, ${is ? "ákafa-þak" : "intensity cap"} ${daySpec.intensityCapPct}%` : ""}{daySpec.principleTag ? ` · ${daySpec.principleTag}` : ""}</li>
              <li className="text-slate-500">{L(daySpec.note)}</li>
            </ul>
          ) : <p className="mt-1 text-slate-500">{is ? "Módelið skilgreinir ekki þennan dag." : "The model doesn't define this day."}</p>}
          {result.warnings.map((w, i) => (
            <p key={i} className="mt-1 text-slate-500">{w.kind} · {w.level} · {is ? "traust" : "confidence"}: {w.confidence}</p>
          ))}
          <p className="mt-1.5 text-[10px] text-slate-400">
            {is
              ? "Reglur reikna — ekki AI. Ráðgefandi; hindrar aldrei vistun og snertir aldrei readiness-litinn. Byggt á plannedSessionLoad / drillMdFit / taktískri periodiseringu (Frade)."
              : "Rules compute — not AI. Advisory; never blocks a save and never touches the readiness colour. Built on plannedSessionLoad / drillMdFit / Tactical Periodization (Frade)."}
          </p>
        </div>
      )}

      {/* Custom model editor */}
      {source === "custom" && editing && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-700">{is ? "Sérsníddu hvern MD-dag" : "Customise each MD day"}</p>
          <div className="space-y-1.5">
            {(customDays ?? BUILTIN_MODELS.default_md.days).map((d, idx) => (
              <div key={d.mdDay} className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="w-12 font-medium text-slate-700">{d.mdDay}</span>
                <select
                  value={d.intendedType}
                  onChange={(e) => updateCustomDay(idx, { intendedType: e.target.value as IntendedType })}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5"
                >
                  {INTENDED_TYPES.map((tt) => <option key={tt} value={tt}>{L(TYPE_LABEL[tt])}</option>)}
                </select>
                <label className="text-slate-500">{is ? "þak %" : "cap %"}</label>
                <input
                  type="number"
                  value={d.intensityCapPct ?? ""}
                  onChange={(e) => updateCustomDay(idx, { intensityCapPct: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 tabular-nums"
                />
                <input
                  type="text"
                  value={d.principleTag ?? ""}
                  placeholder={is ? "prinsipp (t.d. háþrýstingur)" : "principle (e.g. high press)"}
                  onChange={(e) => updateCustomDay(idx, { principleTag: e.target.value || null })}
                  className="min-w-[160px] flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => { void saveModel("custom", customDays); setEditing(false); }}
            disabled={saving}
            className="mt-2 rounded-md bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? (is ? "Vista…" : "Saving…") : (is ? "Vista módel" : "Save model")}
          </button>
        </div>
      )}

      {/* Override reason */}
      {overrideOpen && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <label className="text-[11px] font-medium text-slate-600">{is ? "Ástæða (valfrjáls) — skráð" : "Reason (optional) — logged"}</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={is ? "t.d. meðvituð of-hleðsla fyrir tvöfalda viku" : "e.g. deliberate overload before a double week"}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px]"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={logOverride} disabled={saving} className="rounded-md bg-slate-900 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50">
              {saving ? (is ? "Skrái…" : "Logging…") : (is ? "Nota samt & skrá" : "Use anyway & log")}
            </button>
            <button onClick={() => setOverrideOpen(false)} className="text-[12px] text-slate-500 hover:underline">{is ? "Hætta við" : "Cancel"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function WarningRow({ w, L, is }: { w: SessionFitWarning; L: (b: Bi) => string; is: boolean }) {
  const dot = w.level === "mismatch" ? "#a83e28" : "#de9328";
  return (
    <div className="rounded-lg bg-white/70 px-2.5 py-1.5">
      <p className="flex items-start gap-1.5 text-[12px] font-semibold text-slate-800">
        <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        {L(w.headline)}
      </p>
      <ul className="ml-3.5 mt-0.5 list-disc space-y-0.5 pl-3 text-[12px] text-slate-600">
        {w.why.map((f, i) => <li key={i}>{L(f)}</li>)}
      </ul>
      <p className="ml-3.5 mt-0.5 text-[12px] text-slate-700"><b>{is ? "Lagfæring:" : "Fix:"}</b> {L(w.counterfactual)}
        {w.confidence === "low" ? <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">· {is ? "lítið traust" : "low confidence"}</span> : null}
      </p>
    </div>
  );
}
