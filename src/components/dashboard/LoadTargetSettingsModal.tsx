"use client";

/**
 * Load Target Settings Modal
 *
 * Lets the coach pick between three weekly-load target modes and tune
 * parameters for each. Talks to /api/coach/load-targets (GET + PUT).
 */

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { WeeklyLoadMetricKey, WeeklyLoadTargetMeta } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import {
  WEEKLY_LOAD_LABELS,
  getActiveWeeklyLoadMetrics,
} from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    /* ignore — fall through to cookie-only */
  }
  return {};
}

type Lang = "IS" | "EN";
type Mode = "baseline" | "match_demand" | "coach_weekly";
type Phase = "build" | "maintain" | "taper" | null;

type Config = {
  team_id: string;
  mode: Mode;
  corridor_pct: number;
  mesocycle_phase: Phase;
  mesocycle_multiplier: number;
  coach_weekly_targets: Partial<Record<WeeklyLoadMetricKey, number>>;
  match_demand_lookback_days: number;
  match_day_detection_min_td: number;
  match_day_detection_min_player_load: number;
  match_demand_min_minutes: number;
  match_demand_template: Record<string, Partial<Record<WeeklyLoadMetricKey, number>>>;
  match_demand_overrides: Partial<Record<WeeklyLoadMetricKey, number>>;
  baseline_exclude_match_days: boolean;
};

type Preview = {
  mode: Mode;
  corridor_pct: number;
  target_week_total: Partial<Record<WeeklyLoadMetricKey, number | null>>;
  match_demand_avg?: Partial<Record<WeeklyLoadMetricKey, number>>;
  matches_sampled?: number;
  full_match_rows_used?: number;
  rows_skipped_partial?: number;
  min_minutes_used?: number;
  template_week_sum?: Partial<Record<WeeklyLoadMetricKey, number>>;
  indoor?: boolean;
};

const COPY = {
  IS: {
    title: "Stillingar fyrir álagsmarkmið",
    subtitle: "Veldu hvernig vikulegt markmið er reiknað",
    mode: "Aðferð",
    modeBaseline: "Söguleg meðaltöl",
    modeBaselineDesc: "Miðað við 8 vikna rolling average af eigin gögnum liðsins.",
    modeMatchDemand: "Leikálag",
    modeMatchDemandDesc: "Miðað við meðaltal síðustu leikja og MD-dag prósentutöflu (vísindaleg nálgun).",
    modeCoachWeekly: "Markmið þjálfara",
    modeCoachWeeklyDesc: "Þjálfari setur vikulegt markmið handvirkt fyrir hvert KPI.",
    corridor: "Leyfilegt bil (±)",
    corridorHint: "Hve mikið má víkja frá markmiði áður en það telst of mikið/lítið álag.",
    baselineExcludeMatches: "Útiloka leikjadaga úr grunnmeðaltali",
    baselineExcludeMatchesHint:
      "Þegar kveikt er á þessu telur kerfið leikjadaga EKKI með í 8 vikna \"venjulegri viku\" útreikningnum. Mælt með fyrir lið sem spila innandyra — 90-mín leikur innanhúss hækkar vikusummuna um 15–25% og skekkir grunnlínuna.",
    baselineExcludeMatchesActive: "Virkt — leikjadagar eru ekki teknir með í grunnmeðaltalinu.",
    mesocycle: "Mesocycle fasi",
    mesoNone: "Ekkert",
    mesoBuild: "Uppbygging",
    mesoMaintain: "Viðhald",
    mesoTaper: "Lækkun",
    mesoMultiplier: "Margfaldari",
    coachWeeklyTitle: "Vikuleg markmið (per KPI)",
    coachWeeklyHint: "Skildu eftir autt til að nota söguleg gildi.",
    matchDemandTitle: "Stillingar fyrir leikálag",
    lookbackDays: "Leikir aftur í tímann (dagar)",
    minTdFallback: "Lágmarks TD fyrir leik-detection (varaleið)",
    minPlFallback: "Lágmarks Player Load fyrir leik-detection (innandyra)",
    minPlFallbackHint: "Þar sem GPS virkar ekki innandyra, notar kerfið Player Load til að greina leiki frá æfingum þegar ekki er merkt í áætlun.",
    matchesFound: "leikir fundnir",
    indoorBadge: "Innandyra (FMP)",
    indoorHint: "Liðið er stillt á innandyra-ham — kerfið notar Football Movement Profile (FMP) og IMA mælingar í stað GPS-byggðra KPI.",
    minMinutes: "Lágmarks leikmínútur (FULL sía)",
    minMinutesHint: "Aðeins leikmenn sem spiluðu a.m.k. þetta margar mínútur eru teknir með í leikálags-meðaltalið. Stilltu á 0 til að slökkva á síunni.",
    fullRowsUsed: "leikmenn með FULL",
    rowsSkipped: "sleppt (of litlar mínútur)",
    preview: "Forskoðun á markmiði",
    noPreview: "Ekkert markmið til forskoðunar.",
    save: "Vista",
    cancel: "Hætta við",
    saving: "Vista...",
    loading: "Hleð stillingum...",
    error: "Villa",
  },
  EN: {
    title: "Load target settings",
    subtitle: "Choose how weekly target is computed",
    mode: "Mode",
    modeBaseline: "Historical baseline",
    modeBaselineDesc: "Use 8-week rolling average from team's own history.",
    modeMatchDemand: "Match demand",
    modeMatchDemandDesc: "Use recent match average × MD-day template (evidence-based).",
    modeCoachWeekly: "Coach target",
    modeCoachWeeklyDesc: "Coach sets per-KPI weekly target by hand.",
    corridor: "Corridor (±)",
    corridorHint: "How much deviation from target counts as normal.",
    baselineExcludeMatches: "Exclude match days from baseline",
    baselineExcludeMatchesHint:
      "When on, detected match days are removed from the 8-week \"typical week\" rolling average. Recommended for indoor teams — a 90-min indoor match inflates weekly totals by 15–25% and skews the baseline upward.",
    baselineExcludeMatchesActive: "Active — match days are not included in the baseline rollup.",
    mesocycle: "Mesocycle phase",
    mesoNone: "None",
    mesoBuild: "Build",
    mesoMaintain: "Maintain",
    mesoTaper: "Taper",
    mesoMultiplier: "Multiplier",
    coachWeeklyTitle: "Weekly targets (per KPI)",
    coachWeeklyHint: "Leave blank to fall back to historical.",
    matchDemandTitle: "Match demand settings",
    lookbackDays: "Lookback (days)",
    minTdFallback: "Min TD for match detection (fallback)",
    minPlFallback: "Min Player Load for match detection (indoor)",
    minPlFallbackHint: "Since GPS does not work indoors, the system uses Player Load to distinguish matches from training when schedule metadata is missing.",
    matchesFound: "matches found",
    indoorBadge: "Indoor (FMP)",
    indoorHint: "Team is in indoor mode — the system uses Football Movement Profile (FMP) and IMA metrics instead of GPS-based KPIs.",
    minMinutes: "Min minutes played (FULL filter)",
    minMinutesHint: "Only players who played at least this many minutes are included in the match demand average. Set to 0 to disable.",
    fullRowsUsed: "players with FULL",
    rowsSkipped: "skipped (partial minutes)",
    preview: "Target preview",
    noPreview: "No target to preview.",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving...",
    loading: "Loading settings...",
    error: "Error",
  },
} as const;

export default function LoadTargetSettingsModal({
  teamId,
  lang,
  onClose,
  onSaved,
}: {
  teamId: string;
  lang: Lang;
  onClose: () => void;
  onSaved?: (config: Config, preview: Preview | null) => void;
}) {
  const t = COPY[lang];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Active KPI list depends on the team's indoor flag (echoed by the preview).
  const indoor = preview?.indoor === true;
  const activeMetrics = useMemo(() => getActiveWeeklyLoadMetrics(indoor), [indoor]);

  // Load current config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const headers = await authHeaders();
        const r = await fetch(`/api/coach/load-targets?teamId=${encodeURIComponent(teamId)}`, { headers });
        const j = await r.json();
        if (cancelled) return;
        if (!j.ok) {
          setError(j.error ?? "Failed to load");
        } else {
          setConfig(j.config as Config);
          setPreview((j.preview as Preview) ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        teamId,
        mode: config.mode,
        corridor_pct: config.corridor_pct,
        mesocycle_phase: config.mesocycle_phase,
        mesocycle_multiplier: config.mesocycle_multiplier,
        coach_weekly_targets: config.coach_weekly_targets,
        match_demand_lookback_days: config.match_demand_lookback_days,
        match_day_detection_min_td: config.match_day_detection_min_td,
        match_day_detection_min_player_load: config.match_day_detection_min_player_load,
        match_demand_min_minutes: config.match_demand_min_minutes,
        match_demand_overrides: config.match_demand_overrides,
        baseline_exclude_match_days: config.baseline_exclude_match_days,
      };
      const headers = await authHeaders();
      const r = await fetch("/api/coach/load-targets", {
        method: "PUT",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error ?? "Save failed");
      } else {
        onSaved?.(j.config as Config, (j.preview as Preview) ?? null);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Config>(k: K, v: Config[K]) {
    setConfig((c) => (c ? { ...c, [k]: v } : c));
  }

  function updateCoachWeekly(key: WeeklyLoadMetricKey, v: string) {
    if (!config) return;
    const cleaned = { ...config.coach_weekly_targets };
    const n = Number(v);
    if (v === "" || !Number.isFinite(n)) {
      delete cleaned[key];
    } else {
      cleaned[key] = n;
    }
    update("coach_weekly_targets", cleaned);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800">{t.title}</h2>
              {indoor && (
                <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                  {t.indoorBadge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{t.subtitle}</p>
            {indoor && (
              <p className="text-[10px] text-amber-700 mt-1 max-w-md">{t.indoorHint}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              {t.loading}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {t.error}: {error}
            </div>
          )}

          {config && (
            <>
              {/* Mode picker */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  {t.mode}
                </div>
                <div className="space-y-2">
                  {(
                    [
                      ["baseline", t.modeBaseline, t.modeBaselineDesc],
                      ["match_demand", t.modeMatchDemand, t.modeMatchDemandDesc],
                      ["coach_weekly", t.modeCoachWeekly, t.modeCoachWeeklyDesc],
                    ] as const
                  ).map(([m, label, desc]) => (
                    <label
                      key={m}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        config.mode === m
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={m}
                        checked={config.mode === m}
                        onChange={() => update("mode", m)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">{label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Corridor */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  {t.corridor}: ±{Math.round(config.corridor_pct * 100)}%
                </label>
                <input
                  type="range"
                  min={5}
                  max={35}
                  step={1}
                  value={Math.round(config.corridor_pct * 100)}
                  onChange={(e) => update("corridor_pct", Number(e.target.value) / 100)}
                  className="w-full"
                />
                <p className="text-[10px] text-slate-400 mt-1">{t.corridorHint}</p>
              </div>

              {/* Baseline: exclude match days toggle */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.baseline_exclude_match_days === true}
                    onChange={(e) => update("baseline_exclude_match_days", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      {t.baselineExcludeMatches}
                      {indoor && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold">
                          {t.indoorBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      {t.baselineExcludeMatchesHint}
                    </p>
                    {config.baseline_exclude_match_days === true && (
                      <p className="text-[10px] text-emerald-700 mt-1 font-medium">
                        {t.baselineExcludeMatchesActive}
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Mesocycle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {t.mesocycle}
                  </label>
                  <select
                    value={config.mesocycle_phase ?? ""}
                    onChange={(e) => {
                      const v = e.target.value as "" | "build" | "maintain" | "taper";
                      update("mesocycle_phase", v === "" ? null : v);
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">{t.mesoNone}</option>
                    <option value="build">{t.mesoBuild}</option>
                    <option value="maintain">{t.mesoMaintain}</option>
                    <option value="taper">{t.mesoTaper}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {t.mesoMultiplier}: ×{config.mesocycle_multiplier.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    step={5}
                    value={Math.round(config.mesocycle_multiplier * 100)}
                    onChange={(e) => update("mesocycle_multiplier", Number(e.target.value) / 100)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Coach weekly inputs */}
              {config.mode === "coach_weekly" && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    {t.coachWeeklyTitle}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {activeMetrics.map((key) => {
                      const label = WEEKLY_LOAD_LABELS[key];
                      const val = config.coach_weekly_targets[key];
                      return (
                        <div key={key}>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            {lang === "IS" ? label.is : label.en} ({label.unit || "#"})
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={val ?? ""}
                            onChange={(e) => updateCoachWeekly(key, e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                            placeholder="—"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">{t.coachWeeklyHint}</p>
                </div>
              )}

              {/* Match demand settings */}
              {config.mode === "match_demand" && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    {t.matchDemandTitle}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        {t.lookbackDays}
                      </label>
                      <input
                        type="number"
                        min={14}
                        max={365}
                        value={config.match_demand_lookback_days}
                        onChange={(e) => update("match_demand_lookback_days", Number(e.target.value))}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        {indoor ? t.minPlFallback : t.minTdFallback}
                      </label>
                      {indoor ? (
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          step={25}
                          value={config.match_day_detection_min_player_load}
                          onChange={(e) =>
                            update("match_day_detection_min_player_load", Number(e.target.value))
                          }
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                        />
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={15000}
                          step={100}
                          value={config.match_day_detection_min_td}
                          onChange={(e) => update("match_day_detection_min_td", Number(e.target.value))}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                        />
                      )}
                    </div>
                  </div>
                  {indoor && (
                    <p className="text-[10px] text-slate-400 mt-1">{t.minPlFallbackHint}</p>
                  )}
                  {/* FULL filter */}
                  <div className="mt-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      {t.minMinutes}: {config.match_demand_min_minutes} min
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      step={5}
                      value={config.match_demand_min_minutes}
                      onChange={(e) => update("match_demand_min_minutes", Number(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">{t.minMinutesHint}</p>
                  </div>
                  {preview?.matches_sampled != null && (
                    <div className="text-[10px] text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        {preview.matches_sampled} {t.matchesFound}
                      </span>
                      {preview.full_match_rows_used != null && (
                        <span>
                          · {preview.full_match_rows_used} {t.fullRowsUsed}
                        </span>
                      )}
                      {preview.rows_skipped_partial != null && preview.rows_skipped_partial > 0 && (
                        <span className="text-amber-600">
                          · {preview.rows_skipped_partial} {t.rowsSkipped}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Preview */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  {t.preview}
                </div>
                {preview && Object.values(preview.target_week_total ?? {}).some((v) => v != null) ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {activeMetrics.map((key) => {
                      const v = preview.target_week_total?.[key];
                      const label = WEEKLY_LOAD_LABELS[key];
                      return (
                        <div key={key} className="flex justify-between">
                          <span className="text-slate-500">{lang === "IS" ? label.is : label.en}</span>
                          <span className="font-semibold text-slate-700 tabular-nums">
                            {v != null ? `${Math.round(v).toLocaleString("is-IS")} ${label.unit}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">{t.noPreview}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !config}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-lg"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// Silence unused-warning: the meta type is re-exported for card consumers.
export type { WeeklyLoadTargetMeta };
