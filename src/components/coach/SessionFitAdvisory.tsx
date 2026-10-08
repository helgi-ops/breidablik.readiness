"use client";

/**
 * Session-fit advisory — does the built session fit TODAY'S MD day, under the coach's chosen
 * periodization model? Layered, explainable, advisory-only (never blocks the save, never a colour).
 *
 *   (0) one-line verdict — "Fits today (MD-4 · mechanical)" / "Review — doesn't match today".
 *   (1) 2–3 plain "why" facts + the counterfactual, visible without a click.
 *   (2) behind "Show details" — the day spec (intended type + cap), the model used, confidence.
 *
 * The model picker is the shared PeriodizationModelPicker (same per-team row the Periodization Hub
 * edits). "Use anyway" logs the override with an optional reason. EN default / IS toggle. This
 * component runs checkSessionFit; the builder passes the built-session summary, day target and drills.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";
import PeriodizationModelPicker from "@/components/coach/PeriodizationModelPicker";
import {
  modelFromStored,
  specForDay,
  type ModelSource,
  type MdDaySpec,
  type IntendedType,
  type PeriodizationModel,
} from "@/lib/micropulse/periodization/periodizationModel";
import {
  checkSessionFit,
  stimulusToIntended,
  type BuiltSessionSummary,
  type DayLoadTarget,
  type DrillForFit,
  type SessionFitWarning,
} from "@/lib/micropulse/periodization/sessionFitCheck";
import type { StimulusType } from "@/lib/drill-stimulus";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

const TYPE_LABEL: Record<IntendedType, Bi> = {
  mechanical: { en: "mechanical", is: "vélrænt" },
  locomotive: { en: "locomotive", is: "hlaupaálag" },
  speed: { en: "speed", is: "hraði" },
  mixed: { en: "mixed", is: "blandað" },
};
const LLABEL_SOURCE = { en: "Periodization model", is: "Periodiseringar-módel" };

export default function SessionFitAdvisory({
  teamId, mdDay, plannedStimulus, lang, session, dayTarget, drills, sessionDate,
}: {
  teamId: string;
  mdDay: string | null;
  /** The coach's EXPLICIT stimulus for this day from Week Setup / the mesocycle. When set it IS
   *  the day's intended type — it overrides the periodization model's generic per-MD principle
   *  (e.g. a locomotive MD-4 even though Tactical Periodization's MD-4 is a mechanical day). */
  plannedStimulus?: StimulusType | null;
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
  const [dismissed, setDismissed] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  // Fed by the shared picker once it has loaded / whenever the coach switches model.
  const onModelChange = React.useCallback((s: ModelSource, d: MdDaySpec[] | null) => {
    setSource(s); setCustomDays(d); setLoaded(true);
  }, []);

  // Re-evaluate on any changing input → never keep a stale "overridden" banner.
  React.useEffect(() => { setDismissed(false); setOverrideOpen(false); }, [mdDay, plannedStimulus, session.dominantType, session.matchPct, source, customDays]);

  const activeModel: PeriodizationModel = React.useMemo(
    () => modelFromStored({ source, days: source === "custom" ? customDays : null }),
    [source, customDays],
  );
  // The day's intended stimulus. Week Setup's explicit per-day stimulus WINS over the model's
  // generic per-MD type: the coach planned this day as (say) locomotive, so the fit check targets
  // locomotive — never "MD-4 · mechanical" from the model when the plan says otherwise. The model
  // still supplies the MD-tier intensity cap (taper); its tactical principle/moment is dropped when
  // the planned stimulus overrides the type, so the advisory never asserts an emphasis the coach
  // didn't plan. (technical → no physical dominance → "mixed": accommodating, never a hard mismatch.)
  const daySpec = React.useMemo(() => {
    const base = specForDay(activeModel, mdDay);
    if (!plannedStimulus) return base;
    const intended = stimulusToIntended(plannedStimulus) ?? "mixed";
    if (base) return { ...base, intendedType: intended, principleTag: null, tacticalMoment: null };
    if (!mdDay) return null;
    return { mdDay, intendedType: intended, intensityCapPct: null, principleTag: null, tacticalMoment: null, note: { en: "", is: "" } } as MdDaySpec;
  }, [activeModel, mdDay, plannedStimulus]);

  const result = React.useMemo(
    () => checkSessionFit({ session, dayTarget, daySpec, modelName: activeModel.name, drills }),
    [session, dayTarget, daySpec, activeModel, drills],
  );

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

  const picker = (
    <PeriodizationModelPicker teamId={teamId} lang={lang} variant="inline" onChange={onModelChange} className="ml-auto" />
  );

  if (!mdDay) return null;

  if (dismissed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
        {is ? "Ráðlegging hunsuð fyrir þessa æfingu (skráð)." : "Advisory overridden for this session (logged)."}
        <button onClick={() => setDismissed(false)} className="ml-2 font-medium text-[#2740e6] hover:underline">{is ? "Sýna aftur" : "Show again"}</button>
      </div>
    );
  }

  // Before the model loads, still show the picker (it drives the load) so the banner isn't empty.
  if (!loaded) {
    return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2">{picker}</div></div>;
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
        {picker}
      </div>

      {/* Layer 1 — the plain why + counterfactual for each warning (visible, no click) */}
      {ordered.length > 0 && (
        <div className="mt-2 space-y-2">
          {ordered.map((w, i) => <WarningRow key={`${w.kind}-${i}`} w={w} L={L} is={is} />)}
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
