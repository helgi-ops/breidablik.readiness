"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { TRAINER_COPY } from "./trainerCopy";
import type { Exercise } from "./PlanBuilder";
import { previewSchedule, clampFreq, MIN_FREQ, MAX_FREQ } from "@/lib/trainer/sessionFrequency";

/* ── Types ───────────────────────────────────────────── */

interface Client {
  id: string;
  name: string;
}

interface ExerciseGroup {
  label: string;
  exercises: Exercise[];
}

interface SessionData {
  dayOfWeek: number;
  name: string;
  type: string;
  /** New format: groups */
  groups?: ExerciseGroup[];
  /** Old format: flat exercises */
  exercises?: Exercise[];
}

interface WeekData {
  week: number;
  sessions: SessionData[];
}

/* ── Component ───────────────────────────────────────── */

export default function PlanAssigner({
  teamId,
  templateId,
  templateName,
  onClose,
  onAssigned,
}: {
  teamId: string;
  templateId: string;
  templateName: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [lang] = useLang();
  const ct = TRAINER_COPY[lang as keyof typeof TRAINER_COPY] ?? TRAINER_COPY.IS;
  const isIS = lang === "IS";
  const qs = `team_id=${encodeURIComponent(teamId)}`;

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showTweaks, setShowTweaks] = useState(false);
  const [tweaks, setTweaks] = useState<Record<string, number>>({});
  const [template, setTemplate] = useState<WeekData[] | null>(null);
  // Per-client weekly frequency. `authoredFreq` = the template's designed
  // frequency; `sessionsPerWeek` is what the trainer picks for THIS client.
  const [authoredFreq, setAuthoredFreq] = useState<number>(0);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");

  /* ── Load clients and template ────────────────────── */

  useEffect(() => {
    loadClients();
    loadTemplate();
  }, []);

  async function loadClients() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/clients?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setClients(json.clients || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplate() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/templates?id=${templateId}&${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        let weekOneCount = 0;
        if (json.template?.structure) {
          const structure =
            typeof json.template.structure === "string"
              ? JSON.parse(json.template.structure)
              : json.template.structure;
          setTemplate(structure);
          weekOneCount = Array.isArray(structure)
            ? structure[0]?.sessions?.length ?? 0
            : 0;
        }
        const authored = clampFreq(
          Number(json.template?.sessions_per_week) || weekOneCount || 3,
        );
        setAuthoredFreq(authored);
        setSessionsPerWeek(authored);
      }
    } catch {
      // silent
    }
  }

  /* ── Assign plan ────────────────────────────────────– */

  async function assignPlan() {
    if (!selectedClientId) {
      setError("Please select a client");
      return;
    }

    setAssigning(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const res = await fetch(`/api/trainer/plans?${qs}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          clientId: selectedClientId,
          templateId,
          startDate,
          tweaks: Object.keys(tweaks).length > 0 ? tweaks : undefined,
          // Only send when the trainer changed it — keeps the authored schedule
          // verbatim for the default case.
          sessionsPerWeek:
            sessionsPerWeek && sessionsPerWeek !== authoredFreq ? sessionsPerWeek : undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to assign plan");
      }

      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error assigning plan");
    } finally {
      setAssigning(false);
    }
  }

  /* ── Render ─────────────────────────────────────────– */

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full m-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">{ct.plans.assignPlan}</h2>
            <p className="text-sm text-gray-500 mt-1">{templateName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        {/* Client selection */}
        <div className="mb-6 pb-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {ct.plans.selectClient}
          </label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">
              {isIS ? "Veldu skjólstæðing" : "Select a client"}
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        {/* Start date */}
        <div className="mb-6 pb-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {ct.plans.startDate}
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Sessions per week — per-client frequency */}
        {template && template.length > 0 && authoredFreq > 0 && (() => {
          const base = (template[0]?.sessions ?? []) as { dayOfWeek?: number; name?: string }[];
          const changed = sessionsPerWeek !== authoredFreq;
          const rows = previewSchedule(base, sessionsPerWeek, isIS ? "IS" : "EN", changed);
          return (
            <div className="mb-6 pb-6 border-b">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isIS ? "Æfingar á viku" : "Sessions per week"}
              </label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: MAX_FREQ - MIN_FREQ + 1 }, (_, i) => MIN_FREQ + i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSessionsPerWeek(clampFreq(n))}
                    className={`w-10 h-10 rounded-lg border text-sm font-medium transition ${
                      sessionsPerWeek === n
                        ? "bg-black text-white border-black"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {changed
                  ? isIS
                    ? `Sniðið er hannað fyrir ${authoredFreq}× — því er dreift á ${sessionsPerWeek}× hér að neðan.`
                    : `Template is designed for ${authoredFreq}× — it’s spread to ${sessionsPerWeek}× below.`
                  : isIS
                    ? "Sjálfgefin tíðni sniðsins."
                    : "Template’s default frequency."}
              </p>

              {/* Live schedule preview — exactly what the client will receive */}
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-2">
                  {isIS ? "Vikuáætlun (vika 1)" : "Weekly schedule (week 1)"}
                </div>
                <div className="space-y-1">
                  {rows.map((r, i) => (
                    <div key={`${r.weekdayNum}-${i}`} className="flex items-center gap-3 text-sm">
                      <span className="inline-block w-10 shrink-0 font-semibold text-gray-800">
                        {r.weekday}
                      </span>
                      <span className="text-gray-600">{r.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Optional tweaks */}
        {template && template.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowTweaks(!showTweaks)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <span className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center text-xs">
                {showTweaks ? "−" : "+"}
              </span>
              {ct.plans.tweakLoadValues}
            </button>

            {showTweaks && (
              <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-200">
                {template.map((week) =>
                  week.sessions.map((session) => {
                    // Support both old (flat exercises) and new (groups) format
                    const allExercises: Exercise[] = session.groups
                      ? session.groups.flatMap((g) => g.exercises)
                      : session.exercises || [];
                    return allExercises
                      .filter((ex) => ex.exerciseId)
                      .map((ex) => (
                        <div key={`${week.week}-${ex.exerciseId}`} className="text-sm">
                          <label className="block text-gray-700 font-medium mb-1">
                            {ex.name} ({isIS ? "Vika" : "Week"} {week.week})
                          </label>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <input
                                type="number"
                                step="0.5"
                                defaultValue={ex.loadValue}
                                onChange={(e) => {
                                  const newTweaks = { ...tweaks };
                                  if (e.target.value === String(ex.loadValue)) {
                                    delete newTweaks[ex.exerciseId];
                                  } else {
                                    newTweaks[ex.exerciseId] = +e.target.value;
                                  }
                                  setTweaks(newTweaks);
                                }}
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {ex.loadType}
                            </span>
                          </div>
                        </div>
                      ));
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            {isIS ? "Hætta við" : "Cancel"}
          </button>
          <button
            onClick={assignPlan}
            disabled={assigning || !selectedClientId}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {assigning ? "..." : ct.plans.assignPlan}
          </button>
        </div>
      </div>
    </div>
  );
}
