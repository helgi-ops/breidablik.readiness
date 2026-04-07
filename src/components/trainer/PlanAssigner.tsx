"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { TRAINER_COPY } from "./trainerCopy";
import type { Exercise } from "./PlanBuilder";

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
        if (json.template?.structure) {
          const structure =
            typeof json.template.structure === "string"
              ? JSON.parse(json.template.structure)
              : json.template.structure;
          setTemplate(structure);
        }
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
