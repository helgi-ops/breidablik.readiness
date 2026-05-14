"use client";

/**
 * LvProfilePanel — Load-Velocity Profile data entry + visualisation
 *
 * Where it lives: rendered inside TrainerDashboard's new "LV Profile" tab.
 * Lifecycle: client picker → addon gate → test form + saved tests list.
 *
 * Data flow:
 *   GET  /api/trainer/lv-profile?clientId=…  → tests + addonEnabled flag
 *   POST /api/trainer/lv-profile             → save new test
 *   POST /api/trainer/lv-profile/addon       → enable add-on for this client
 *
 * The math (linear regression, 1RM prediction, DSI) is shared with the API
 * via @/lib/lvProfile so the UI shows live results as the trainer types.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LV_EXERCISES,
  computeLvProfile,
  computeDsi,
  type LvDatapoint,
  type LvExerciseKey,
  type LvProfileResult,
  type DsiResult,
} from "@/lib/lvProfile";

interface ClientOption {
  id: string;
  name: string;
}

interface LvProfilePanelProps {
  clients: ClientOption[];
  lang: "IS" | "EN";
}

interface SavedTest {
  id: string;
  test_date: string;
  exercise_key: LvExerciseKey;
  exercise_label: string | null;
  datapoints: LvDatapoint[];
  mvt: number;
  slope: number | null;
  intercept: number | null;
  see: number | null;
  r_squared: number | null;
  y_offset_velocity: number | null;
  x_offset_load: number | null;
  zero_velocity_load: number | null;
  est_one_rm: number | null;
  est_one_rm_high: number | null;
  est_one_rm_low: number | null;
  profile_type: string | null;
  profile_reason: string | null;
  dsi_ballistic_peak_n: number | null;
  dsi_iso_peak_n: number | null;
  dsi_ratio: number | null;
  dsi_tier: string | null;
  notes: string | null;
}

const COPY = {
  IS: {
    title: "Kraft-/hraðapróf (Load-Velocity Profile)",
    subtitle: "ELITE viðbót — skráðu rampa-próf og spáðu 1RM, V0 og styrk-/hraðamerki",
    pickClient: "Veldu skjólstæðing",
    addonOff: "Þessi viðbót er ekki virk fyrir þennan skjólstæðing.",
    addonExplain: "Load-Velocity Profile er ELITE-viðbót. Þegar þú kveikir á henni getur þú skráð kraft-/hraðapróf, fengið 1RM-spá, lóðlína á V-L kúrfu, sjálfvirka flokkun (styrkur vs hraði) og DSI.",
    enableAddon: "Virkja fyrir þennan skjólstæðing (ELITE)",
    enabling: "Virkja…",
    formTitle: "Nýtt próf",
    date: "Dagsetning",
    exercise: "Æfing",
    mvt: "Lágmarks-hraði (MVT, m/s)",
    datapoints: "Mælingar (þyngd × hraði)",
    load: "Þyngd (kg)",
    velocity: "Hraði (m/s)",
    addRow: "Bæta við mælingu",
    removeRow: "Fjarlægja",
    optionalDsi: "DSI (valkvætt)",
    ballistic: "Ballistic peak force (N)",
    iso: "Iso peak force (N)",
    notes: "Athugasemd",
    save: "Vista próf",
    saving: "Vista…",
    livePreview: "Lifandi forskoðun",
    history: "Saga próf",
    noTests: "Engin próf skráð.",
    slope: "Halli",
    intercept: "Y-skurðpunktur",
    see: "SEE",
    rSq: "R²",
    n: "n",
    yOffset: "V₀ (V við 0 kg)",
    xOffset: "1RM við MVT",
    zeroV: "Þyngd við V = 0",
    oneRm: "Áætlað 1RM",
    profile: "Flokkun",
    dsi: "DSI",
    deleteTest: "Eyða",
    confirmDelete: "Eyða þessu prófi?",
    needTwoPoints: "Þarft a.m.k. 2 mælingar með mismunandi þyngdir.",
    fitFailed: "Tókst ekki að reikna línu — athugaðu gildi.",
  },
  EN: {
    title: "Load-Velocity Profile",
    subtitle: "ELITE add-on — log ramp tests, predict 1RM, V0, and strength/velocity bias",
    pickClient: "Select a client",
    addonOff: "This add-on is not enabled for this client.",
    addonExplain: "Load-Velocity Profile is an ELITE add-on. Enabling it for a client unlocks ramp-test logging, regression-based 1RM prediction, V-L curve plot, automatic profile classification (strength vs velocity dominant) and DSI.",
    enableAddon: "Enable for this client (ELITE)",
    enabling: "Enabling…",
    formTitle: "New test",
    date: "Date",
    exercise: "Exercise",
    mvt: "Min velocity threshold (m/s)",
    datapoints: "Datapoints (load × velocity)",
    load: "Load (kg)",
    velocity: "Velocity (m/s)",
    addRow: "Add row",
    removeRow: "Remove",
    optionalDsi: "DSI (optional)",
    ballistic: "Ballistic peak force (N)",
    iso: "Iso peak force (N)",
    notes: "Notes",
    save: "Save test",
    saving: "Saving…",
    livePreview: "Live preview",
    history: "Test history",
    noTests: "No tests saved yet.",
    slope: "Slope",
    intercept: "Intercept",
    see: "SEE",
    rSq: "R²",
    n: "n",
    yOffset: "V₀ (V at 0 kg)",
    xOffset: "1RM at MVT",
    zeroV: "Load at V = 0",
    oneRm: "Est. 1RM",
    profile: "Profile",
    dsi: "DSI",
    deleteTest: "Delete",
    confirmDelete: "Delete this test?",
    needTwoPoints: "Need at least 2 datapoints with different loads.",
    fitFailed: "Could not fit a line — check the values.",
  },
} as const;

const PROFILE_LABEL = {
  IS: {
    velocity_dominant: "Hraða-yfirburðir",
    strength_dominant: "Styrk-yfirburðir",
    balanced: "Jafnvægi",
    insufficient_data: "Ófullnægjandi gögn",
  },
  EN: {
    velocity_dominant: "Velocity dominant",
    strength_dominant: "Strength dominant",
    balanced: "Balanced",
    insufficient_data: "Insufficient data",
  },
};

const DSI_LABEL = {
  IS: { ballistic: "Ballistic þjálfun", concurrent: "Samhliða", max_strength: "Hámarks-styrkur", insufficient: "—" },
  EN: { ballistic: "Ballistic training", concurrent: "Concurrent", max_strength: "Max strength", insufficient: "—" },
};

function emptyDatapoint(): LvDatapoint {
  return { load: 0, velocity: 0 };
}

export default function LvProfilePanel({ clients, lang }: LvProfilePanelProps) {
  const t = COPY[lang];
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [addonEnabled, setAddonEnabled] = useState<boolean | null>(null);
  const [tests, setTests] = useState<SavedTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);

  // ── Form state ─────────────────────────────────────────────────
  const [exerciseKey, setExerciseKey] = useState<LvExerciseKey>("bench_press");
  const [testDate, setTestDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mvt, setMvt] = useState<number>(LV_EXERCISES.bench_press.mvt);
  const [rows, setRows] = useState<LvDatapoint[]>([
    emptyDatapoint(),
    emptyDatapoint(),
    emptyDatapoint(),
  ]);
  const [ballisticN, setBallisticN] = useState<string>("");
  const [isoN, setIsoN] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // When exercise changes, reset MVT to its default (coach can still override).
  useEffect(() => {
    setMvt(LV_EXERCISES[exerciseKey].mvt);
  }, [exerciseKey]);

  // ── Fetch addon + tests when client changes ───────────────────
  const refresh = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`/api/trainer/lv-profile?clientId=${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to load");
      setAddonEnabled(!!j.addonEnabled);
      setTests((j.tests ?? []) as SavedTest[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Live regression result ────────────────────────────────────
  const liveResult: LvProfileResult | null = useMemo(() => {
    const clean = rows.filter((r) => r.load > 0 && r.velocity > 0);
    return computeLvProfile(clean, mvt);
  }, [rows, mvt]);

  const liveDsi: DsiResult | null = useMemo(() => {
    const b = Number(ballisticN);
    const i = Number(isoN);
    if (!Number.isFinite(b) || !Number.isFinite(i) || b <= 0 || i <= 0) return null;
    return computeDsi(b, i);
  }, [ballisticN, isoN]);

  // ── Actions ───────────────────────────────────────────────────
  async function enableAddon() {
    if (!clientId) return;
    setEnabling(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/trainer/lv-profile/addon", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId, enabled: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to enable");
      setAddonEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnabling(false);
    }
  }

  async function saveTest() {
    const clean = rows.filter((r) => r.load > 0 && r.velocity > 0);
    if (clean.length < 2) {
      setError(t.needTwoPoints);
      return;
    }
    if (!liveResult) {
      setError(t.fitFailed);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const body = {
        clientId,
        testDate,
        exerciseKey,
        exerciseLabel: LV_EXERCISES[exerciseKey].label,
        mvt,
        datapoints: clean,
        dsiBallisticPeakN: ballisticN ? Number(ballisticN) : undefined,
        dsiIsoPeakN: isoN ? Number(isoN) : undefined,
        notes: notes || undefined,
      };
      const res = await fetch("/api/trainer/lv-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Failed to save");
      // Reset rows for next entry but keep date + exercise.
      setRows([emptyDatapoint(), emptyDatapoint(), emptyDatapoint()]);
      setBallisticN("");
      setIsoN("");
      setNotes("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTest(id: string) {
    if (!confirm(t.confirmDelete)) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`/api/trainer/lv-profile?testId=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Delete failed");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /* ─── Render ─────────────────────────────────────────────────────── */

  if (!clients.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        {lang === "IS" ? "Engir skjólstæðingar tengdir. Sendu boð fyrst." : "No clients linked. Send an invitation first."}
      </div>
    );
  }

  const profileLabel = liveResult ? PROFILE_LABEL[lang][liveResult.profile] : "—";
  const dsiLabel = liveDsi ? DSI_LABEL[lang][liveDsi.tier] : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t.title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{t.subtitle}</p>
      </div>

      {/* Client picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">{t.pickClient}:</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : addonEnabled === false ? (
        // ── Addon gate ─────────────────────────────────────────────
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 text-amber-700"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-900">{t.addonOff}</div>
              <p className="mt-1.5 text-sm leading-6 text-amber-900/90">{t.addonExplain}</p>
              <button
                type="button"
                onClick={enableAddon}
                disabled={enabling}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {enabling ? t.enabling : t.enableAddon}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ── Form + history ─────────────────────────────────────────
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">{t.formTitle}</div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-slate-600">{t.date}</label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t.exercise}</label>
                <select
                  value={exerciseKey}
                  onChange={(e) => setExerciseKey(e.target.value as LvExerciseKey)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {Object.values(LV_EXERCISES).map((ex) => (
                    <option key={ex.key} value={ex.key}>{ex.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t.mvt}</label>
                <input
                  type="number"
                  step="0.01"
                  value={mvt}
                  onChange={(e) => setMvt(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
                />
              </div>
            </div>

            {/* Datapoints */}
            <div className="mt-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.datapoints}</div>
              <div className="mt-2 space-y-2">
                {rows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder={t.load}
                      step="0.5"
                      value={row.load || ""}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRows((rs) => rs.map((r, i) => i === idx ? { ...r, load: v } : r));
                      }}
                      className="h-10 w-32 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
                    />
                    <span className="text-slate-400">×</span>
                    <input
                      type="number"
                      placeholder={t.velocity}
                      step="0.01"
                      value={row.velocity || ""}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRows((rs) => rs.map((r, i) => i === idx ? { ...r, velocity: v } : r));
                      }}
                      className="h-10 w-32 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                      disabled={rows.length <= 2}
                      className="text-xs text-slate-500 hover:text-red-600 disabled:opacity-30"
                    >
                      {t.removeRow}
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRows((rs) => [...rs, emptyDatapoint()])}
                disabled={rows.length >= 8}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-30"
              >
                + {t.addRow}
              </button>
            </div>

            {/* Optional DSI inputs */}
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.optionalDsi}</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  placeholder={t.ballistic}
                  value={ballisticN}
                  onChange={(e) => setBallisticN(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
                />
                <input
                  type="number"
                  placeholder={t.iso}
                  value={isoN}
                  onChange={(e) => setIsoN(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-600">{t.notes}</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              />
            </div>

            {/* Live preview */}
            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{t.livePreview}</div>
              {liveResult ? (
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <StatLine label={t.oneRm} value={`${liveResult.estOneRmLow.toFixed(1)}–${liveResult.estOneRmHigh.toFixed(1)} kg`} strong />
                  <StatLine label={t.yOffset} value={`${liveResult.yOffsetVelocity.toFixed(2)} m/s`} />
                  <StatLine label={t.zeroV} value={`${liveResult.zeroVelocityLoad.toFixed(1)} kg`} />
                  <StatLine label={t.slope} value={liveResult.slope.toFixed(4)} />
                  <StatLine label={t.intercept} value={liveResult.intercept.toFixed(3)} />
                  <StatLine label={t.see} value={liveResult.see.toFixed(3)} />
                  <StatLine label={t.rSq} value={liveResult.rSquared.toFixed(3)} />
                  <StatLine label={t.n} value={String(liveResult.n)} />
                  <StatLine label={t.profile} value={profileLabel} strong />
                  {liveDsi ? <StatLine label={t.dsi} value={`${liveDsi.ratio.toFixed(2)} · ${dsiLabel}`} /> : null}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500">
                  {lang === "IS" ? "Fylltu inn 2+ mælingar með mismunandi þyngdir." : "Enter 2+ datapoints with different loads."}
                </div>
              )}
              {liveResult ? (
                <p className="mt-3 text-xs leading-5 text-slate-700">{liveResult.profileReason}</p>
              ) : null}
            </div>

            {/* Save */}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={saveTest}
                disabled={saving || !liveResult}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>

          {/* History */}
          <div>
            <div className="text-sm font-semibold text-slate-900">{t.history}</div>
            {tests.length === 0 ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{t.noTests}</div>
            ) : (
              <div className="mt-2 space-y-2">
                {tests.map((test) => (
                  <div key={test.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{test.exercise_label}</div>
                        <div className="text-xs text-slate-500">{test.test_date}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {test.est_one_rm != null ? (
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.oneRm}</div>
                            <div className="text-base font-semibold tabular-nums text-slate-900">
                              {test.est_one_rm_low?.toFixed(1)}–{test.est_one_rm_high?.toFixed(1)} kg
                            </div>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => deleteTest(test.id)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {t.deleteTest}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-4">
                      <StatLine label={t.yOffset} value={`${(test.y_offset_velocity ?? 0).toFixed(2)} m/s`} />
                      <StatLine label={t.slope} value={(test.slope ?? 0).toFixed(4)} />
                      <StatLine label={t.rSq} value={(test.r_squared ?? 0).toFixed(2)} />
                      <StatLine
                        label={t.profile}
                        value={PROFILE_LABEL[lang][(test.profile_type as keyof typeof PROFILE_LABEL.EN) ?? "insufficient_data"]}
                      />
                    </div>
                    {test.profile_reason ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600">{test.profile_reason}</p>
                    ) : null}
                    {test.dsi_ratio != null ? (
                      <div className="mt-2 text-xs text-slate-700">
                        DSI: <span className="font-semibold tabular-nums">{test.dsi_ratio.toFixed(2)}</span> ·{" "}
                        {DSI_LABEL[lang][(test.dsi_tier as keyof typeof DSI_LABEL.EN) ?? "insufficient"]}
                      </div>
                    ) : null}
                    {test.notes ? <div className="mt-2 text-xs italic text-slate-600">{test.notes}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`tabular-nums ${strong ? "text-base font-semibold text-slate-900" : "text-sm text-slate-800"}`}>{value}</div>
    </div>
  );
}
