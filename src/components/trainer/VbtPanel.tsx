"use client";

/**
 * VbtPanel — manual Velocity-Based Training for a PT client (no GymAware needed).
 *
 * Where it lives: TrainerDashboard "VBT" tab (/coach?tab=vbt).
 * Data flow:
 *   GET    /api/trainer/vbt?clientId=…&date=…  → dashboard (PBs, today-vs-PB,
 *                                                 velocity-loss, trend)
 *   POST   /api/trainer/vbt                     → log one set (load·velocity·reps)
 *   DELETE /api/trainer/vbt?clientId&…          → remove one logged set
 *
 * The trainer types the mean bar velocity (m/s) read off the client's VBT
 * device/app. It feeds the SAME analytics GymAware teams get (shared engine in
 * @/lib/micropulse/vbtReadiness). Explainability-first: verdict → facts → detail.
 * Refs: Sánchez-Medina & González-Badillo (2011); González-Badillo (2010).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LV_EXERCISES } from "@/lib/lvProfile";

interface ClientOption {
  id: string;
  name: string;
}
interface VbtPanelProps {
  clients: ClientOption[];
  lang: "IS" | "EN";
}

type VelocityLossFlag = {
  exerciseName: string;
  loadKg: number;
  baselineVelocity: number;
  worstVelocity: number;
  velocityDropPct: number;
  totalSets: number;
};
type ExercisePB = {
  exerciseName: string;
  bestLoadKg: number | null;
  bestMeanVelocity: number | null;
  estimated1RM: number | null;
  lastSessionDate: string | null;
};
type HistoryDay = {
  date: string;
  sets: Array<{
    exerciseName: string;
    meanVelocity: number;
    loadKg: number | null;
    reps: number | null;
    pbDiffPct: number | null;
    isPB: boolean;
  }>;
};
type Dashboard = {
  date: string;
  exercises: ExercisePB[];
  velocityLoss: VelocityLossFlag[];
  recentHistory: HistoryDay[];
};

const COPY = {
  IS: {
    title: "VBT — hraðaþjálfun (handvirk skráning)",
    subtitle:
      "Sláðu inn stangarhraða (m/s) af VBT-tæki/appi. Fæðir sömu greiningu og GymAware — án vélbúnaðar.",
    pickClient: "Veldu skjólstæðing",
    noClients: "Engir skjólstæðingar enn.",
    logTitle: "Skrá sett",
    exercise: "Æfing",
    loadKg: "Þyngd (kg)",
    velocity: "Hraði (m/s)",
    reps: "Reps",
    addSet: "Bæta við setti",
    todaySets: "Sett í dag",
    noToday: "Engin sett skráð í dag.",
    fatigue: "Þreytumerki (velocity loss)",
    noFatigue: "Ekkert velocity-loss merki í dag.",
    fatigueFlag: (ex: string, drop: number) =>
      `${ex}: hraði fallinn um ${Math.abs(drop)}% — taugaþreyta, íhugaðu að stoppa settið.`,
    summary: "Yfirlit per æfingu",
    est1rm: "Áætlað 1RM",
    bestV: "Besti hraði",
    delete: "Eyða",
    saving: "Vista…",
    showDetails: "Sýna smáatriði",
    hideDetails: "Fela smáatriði",
    detailBaseline: "Grunnlína (fyrstu 2 sett)",
    detailWorst: "Versti hraði",
    atLoad: "við",
  },
  EN: {
    title: "VBT — velocity-based training (manual entry)",
    subtitle:
      "Type the bar velocity (m/s) off the client's VBT device/app. Feeds the same analytics as GymAware — no hardware.",
    pickClient: "Select client",
    noClients: "No clients yet.",
    logTitle: "Log a set",
    exercise: "Exercise",
    loadKg: "Load (kg)",
    velocity: "Velocity (m/s)",
    reps: "Reps",
    addSet: "Add set",
    todaySets: "Today's sets",
    noToday: "No sets logged today.",
    fatigue: "Fatigue signal (velocity loss)",
    noFatigue: "No velocity-loss flag today.",
    fatigueFlag: (ex: string, drop: number) =>
      `${ex}: velocity down ${Math.abs(drop)}% — neuromuscular fatigue, consider ending the set.`,
    summary: "Per-exercise summary",
    est1rm: "Est. 1RM",
    bestV: "Best velocity",
    delete: "Delete",
    saving: "Saving…",
    showDetails: "Show details",
    hideDetails: "Hide details",
    detailBaseline: "Baseline (first 2 sets)",
    detailWorst: "Worst velocity",
    atLoad: "at",
  },
} as const;

async function authHeaders(json = false): Promise<Record<string, string>> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token ?? "";
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function VbtPanel({ clients, lang }: VbtPanelProps) {
  const t = COPY[lang];
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Log form
  const [exercise, setExercise] = useState("");
  const [loadKg, setLoadKg] = useState("");
  const [velocity, setVelocity] = useState("");
  const [reps, setReps] = useState("");

  const load = useCallback(async (cid: string) => {
    if (!cid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trainer/vbt?clientId=${cid}&date=${today()}`, {
        headers: await authHeaders(),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Error");
      setData(j as Dashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (clientId) load(clientId);
  }, [clientId, load]);

  const todaySets = data?.recentHistory.find((d) => d.date === today())?.sets ?? [];

  async function addSet() {
    const ex = exercise.trim();
    const v = Number(velocity);
    if (!ex || !Number.isFinite(v) || v <= 0) {
      setError(lang === "IS" ? "Sláðu inn æfingu og hraða." : "Enter an exercise and velocity.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const setIndex = todaySets.filter((s) => s.exerciseName.toLowerCase() === ex.toLowerCase()).length;
      const res = await fetch("/api/trainer/vbt", {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({
          clientId,
          exercise_name: ex,
          set_index: setIndex,
          weight_kg: loadKg ? Number(loadKg) : null,
          reps: reps ? Number(reps) : null,
          mean_velocity: v,
          session_date: today(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Error");
      setVelocity("");
      setReps("");
      await load(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet(exerciseName: string, setIndex: number) {
    const exId = exerciseName.toLowerCase().replace(/\s+/g, "_");
    await fetch(
      `/api/trainer/vbt?clientId=${clientId}&session_date=${today()}&exercise_id=${encodeURIComponent(exId)}&set_index=${setIndex}`,
      { method: "DELETE", headers: await authHeaders() },
    );
    await load(clientId);
  }

  if (clients.length === 0) {
    return <p className="text-sm text-gray-500">{t.noClients}</p>;
  }

  const flags = data?.velocityLoss ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{t.title}</h2>
        <p className="text-sm text-gray-500">{t.subtitle}</p>
      </div>

      {/* Client picker */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{t.pickClient}</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Log a set */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">{t.logTitle}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.exercise}</label>
            <input
              list="vbt-exercises"
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
              placeholder="Back squat"
              className="w-44 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <datalist id="vbt-exercises">
              {Object.values(LV_EXERCISES).map((ex) => (
                <option key={ex.key} value={ex.label} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.loadKg}</label>
            <input
              type="number"
              inputMode="decimal"
              value={loadKg}
              onChange={(e) => setLoadKg(e.target.value)}
              className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.velocity}</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={velocity}
              onChange={(e) => setVelocity(e.target.value)}
              className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.reps}</label>
            <input
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={addSet}
            disabled={saving}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? t.saving : t.addSet}
          </button>
        </div>
      </div>

      {/* Fatigue verdict (explainability-first) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold">{t.fatigue}</h3>
        {flags.length === 0 ? (
          <p className="text-sm text-gray-500">{t.noFatigue}</p>
        ) : (
          <>
            <ul className="space-y-1">
              {flags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <span>{t.fatigueFlag(f.exerciseName, f.velocityDropPct)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              {showDetail ? t.hideDetails : t.showDetails}
            </button>
            {showDetail && (
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                {flags.map((f, i) => (
                  <li key={i}>
                    {f.exerciseName} {t.atLoad} {f.loadKg} kg — {t.detailBaseline}: {f.baselineVelocity} m/s,{" "}
                    {t.detailWorst}: {f.worstVelocity} m/s ({f.totalSets} sets)
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] italic text-gray-400">
              Sánchez-Medina &amp; González-Badillo (2011): velocity loss as a fatigue proxy.
            </p>
          </>
        )}
      </div>

      {/* Today's sets */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold">{t.todaySets}</h3>
        {todaySets.length === 0 ? (
          <p className="text-sm text-gray-500">{t.noToday}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {todaySets.map((s, i) => {
              const idx = todaySets.filter((x, j) => j < i && x.exerciseName === s.exerciseName).length;
              return (
                <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    <b>{s.exerciseName}</b> — {s.loadKg ?? "–"} kg · {s.meanVelocity.toFixed(2)} m/s
                    {s.reps != null ? ` · ${s.reps} reps` : ""}
                    {s.isPB && <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-medium text-green-700">PB</span>}
                  </span>
                  <button
                    onClick={() => deleteSet(s.exerciseName, idx)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    {t.delete}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Per-exercise summary */}
      {data && data.exercises.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">{t.summary}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 pr-4">{t.exercise}</th>
                  <th className="py-1 pr-4">{t.est1rm}</th>
                  <th className="py-1 pr-4">{t.bestV}</th>
                </tr>
              </thead>
              <tbody>
                {data.exercises.map((e, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 pr-4 font-medium">{e.exerciseName}</td>
                    <td className="py-1.5 pr-4">{e.estimated1RM != null ? `${Math.round(e.estimated1RM)} kg` : "–"}</td>
                    <td className="py-1.5 pr-4">
                      {e.bestMeanVelocity != null ? `${e.bestMeanVelocity.toFixed(2)} m/s` : "–"}
                      {e.bestLoadKg != null ? ` @ ${e.bestLoadKg} kg` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <p className="text-xs text-gray-400">…</p>}
    </div>
  );
}
