"use client";

/**
 * Periodization model picker — the coach's own periodisation principles, as a reusable control.
 * One canonical surface for choosing the team's model (Default MD microcycle / Tactical
 * Periodization / Custom per-MD-day) and editing a custom model. Reads + writes
 * /api/coach/team/periodization-model (defaults to the coach's own team when no teamId is given),
 * so the Periodization Hub card and the Session Builder's inline picker stay in sync — both write
 * the same per-team row.
 *
 *   variant="card"   — full settings card for the hub (preview of every MD day + custom editor).
 *   variant="inline" — compact select + collapsible custom editor for the builder banner.
 *
 * Descriptive planning layer — the chosen model drives the Session Builder MD-fit advisory; it never
 * writes a readiness colour or the daily decision. EN default, IS toggle.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";
import {
  modelFromStored,
  BUILTIN_MODELS,
  type ModelSource,
  type MdDaySpec,
  type IntendedType,
  type PeriodizationModel,
} from "@/lib/micropulse/periodization/periodizationModel";
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

export default function PeriodizationModelPicker({
  teamId = null, lang, variant = "card", onChange, className,
}: {
  teamId?: string | null;
  lang: Lang;
  variant?: "inline" | "card";
  onChange?: (source: ModelSource, days: MdDaySpec[] | null) => void;
  className?: string;
}) {
  const is = lang === "IS";
  const L = React.useCallback((b: Bi) => (is ? b.is : b.en), [is]);

  const [source, setSource] = React.useState<ModelSource>("default_md");
  const [customDays, setCustomDays] = React.useState<MdDaySpec[] | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  const qs = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/team/periodization-model${qs}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (alive && j?.ok) {
          setSource((j.source as ModelSource) ?? "default_md");
          setCustomDays(Array.isArray(j.days) ? (j.days as MdDaySpec[]) : null);
        }
      } finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [token, qs]);

  const activeModel: PeriodizationModel = React.useMemo(
    () => modelFromStored({ source, days: source === "custom" ? customDays : null }),
    [source, customDays],
  );

  // Notify the parent of the resolved model (after load + on every change) for a live re-check.
  React.useEffect(() => {
    if (!loaded) return;
    onChange?.(source, source === "custom" ? (customDays ?? activeModel.days) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, source, customDays]);

  async function saveModel(next: ModelSource, days?: MdDaySpec[] | null) {
    const tok = await token(); if (!tok) return;
    setSaving(true);
    try {
      await fetch(`/api/coach/team/periodization-model`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: teamId ?? undefined, source: next, days: next === "custom" ? (days ?? customDays ?? activeModel.days) : undefined }),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally { setSaving(false); }
  }

  function onPickSource(next: ModelSource) {
    setSource(next);
    if (next === "custom" && !customDays) {
      const seed = BUILTIN_MODELS.default_md.days.map((d) => ({ ...d }));
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
      return base.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    });
  }

  if (!loaded) return null;

  const selectEl = (
    <select
      value={source}
      onChange={(e) => onPickSource(e.target.value as ModelSource)}
      disabled={saving}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px]"
    >
      <option value="default_md">{L(SOURCE_LABEL.default_md)}</option>
      <option value="tactical_periodization">{L(SOURCE_LABEL.tactical_periodization)}</option>
      <option value="custom">{L(SOURCE_LABEL.custom)}</option>
    </select>
  );

  const editorEl = (
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
      <button
        onClick={() => { void saveModel("custom", customDays); setEditing(false); }}
        disabled={saving}
        className="mt-1 rounded-md bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
      >
        {saving ? (is ? "Vista…" : "Saving…") : (is ? "Vista módel" : "Save model")}
      </button>
    </div>
  );

  // ── Inline variant (builder banner) ──────────────────────────────────────────
  if (variant === "inline") {
    return (
      <div className={className}>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{is ? "Módel" : "Model"}</label>
          {selectEl}
          {source === "custom" && (
            <button onClick={() => setEditing((s) => !s)} className="text-[12px] font-medium text-[#2740e6] hover:underline">
              {editing ? (is ? "Loka" : "Close") : (is ? "Breyta" : "Edit")}
            </button>
          )}
        </div>
        {source === "custom" && editing && <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">{editorEl}</div>}
      </div>
    );
  }

  // ── Card variant (Periodization Hub) ─────────────────────────────────────────
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Periodiseringar-módel liðsins" : "Team periodization model"}</span>
        {savedFlash && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{is ? "Vistað" : "Saved"}</span>}
        <div className="ml-auto">{selectEl}</div>
      </div>
      <p className="mt-1 text-[12px] text-slate-600">
        {is
          ? "Velur hvernig hver MD-dagur á að líta út (álagsgerð + ákafa-þak + prinsipp). Build Session notar þetta til að vara við ef æfing passar ekki við daginn — ráðgefandi, hindrar aldrei og snertir aldrei readiness."
          : "Sets what each MD day should look like (load type + intensity cap + principle). Build Session uses it to warn when a session doesn't fit the day — advisory, never blocking, never readiness."}
      </p>

      {source === "custom" ? (
        <div className="mt-3">{editorEl}</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-3">MD</th>
                <th className="py-1 pr-3">{is ? "Áreiti" : "Stimulus"}</th>
                <th className="py-1 pr-3">{is ? "Ákafa-þak" : "Intensity cap"}</th>
                <th className="py-1">{is ? "Prinsipp" : "Principle"}</th>
              </tr>
            </thead>
            <tbody>
              {activeModel.days.map((d) => (
                <tr key={d.mdDay} className="border-t border-slate-100">
                  <td className="py-1 pr-3 font-medium text-slate-700">{d.mdDay}</td>
                  <td className="py-1 pr-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{L(TYPE_LABEL[d.intendedType])}</span></td>
                  <td className="py-1 pr-3 tabular-nums text-slate-600">{d.intensityCapPct != null ? `${d.intensityCapPct}%` : "—"}</td>
                  <td className="py-1 text-slate-500">{d.principleTag ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-400">
        {is
          ? "Sjálfgefið módel speglar innbyggðu vélina (ekkert breytist ef ekki valið). Taktísk periodisering (Frade) víkur viljandi frá (t.d. MD-2 = hraði). Reglur reikna — ekki AI. Lýsandi; aldrei readiness-litur."
          : "The default mirrors the built-in engine (nothing changes unless you opt in). Tactical Periodization (Frade) deliberately differs (e.g. MD-2 = speed). Rules compute — not AI. Descriptive; never the readiness colour."}
      </p>
    </div>
  );
}
