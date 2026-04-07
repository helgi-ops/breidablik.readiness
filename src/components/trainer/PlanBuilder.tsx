"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { TRAINER_COPY } from "./trainerCopy";

/* ── Types ───────────────────────────────────────────── */

export type SessionMethod =
  | "straight"
  | "superset"
  | "triset"
  | "giant"
  | "french_contrast"
  | "contrast"
  | "potentiation_cluster"
  | "cluster";

export interface Exercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps: string;
  loadType: "kg" | "velocity" | "%1RM" | "RPE";
  loadValue: number;
  rpeTarget?: number;
  tempo: string;
  restSeconds: number;
  notes: string;
  /** Cluster sets: intra-set rest in seconds */
  intraSetRest?: number;
  /** Cluster sets: reps per cluster (e.g. "2+2+2") */
  clusterReps?: string;
}

/** A group of exercises that are performed together (superset, contrast, etc.) */
export interface ExerciseGroup {
  /** Label like "A", "B", "C" */
  label: string;
  exercises: Exercise[];
}

export interface Session {
  dayOfWeek: number;
  name: string;
  type: "strength" | "endurance" | "mixed";
  method: SessionMethod;
  groups: ExerciseGroup[];
  /** @deprecated — kept for backward compat with old templates */
  exercises?: Exercise[];
}

export interface Week {
  week: number;
  sessions: Session[];
}

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  name_is: string;
  exercise_type: string;
  category: string;
  muscle_groups?: string[];
  equipment?: string;
}

type PlanType = "strength" | "endurance" | "mixed";

/* ── Method config ───────────────────────────────────── */

/** How many exercise slots each method needs per group */
const METHOD_GROUP_SIZE: Record<SessionMethod, number> = {
  straight: 1,
  superset: 2,
  triset: 3,
  giant: 4,
  french_contrast: 4,
  contrast: 2,
  potentiation_cluster: 2,
  cluster: 1,
};

const ALL_METHODS: SessionMethod[] = [
  "straight",
  "superset",
  "triset",
  "giant",
  "french_contrast",
  "contrast",
  "potentiation_cluster",
  "cluster",
];

/** Generate slot labels for a method */
function getSlotLabels(method: SessionMethod, ct: any): string[] {
  if (ct.methodSlots?.[method]) return ct.methodSlots[method];
  const size = METHOD_GROUP_SIZE[method];
  if (size === 1) return [""];
  return Array.from({ length: size }, (_, i) => `${i + 1}`);
}

/** Letter label for group index */
function groupLetter(idx: number): string {
  return String.fromCharCode(65 + idx); // A, B, C, ...
}

/** Migrate old templates (flat exercises[] → groups[]) */
function migrateSession(s: any): Session {
  if (s.groups && Array.isArray(s.groups)) {
    return {
      ...s,
      method: s.method || "straight",
      groups: s.groups,
    };
  }
  // Old format: flat exercises array → wrap each in a group
  const exercises: Exercise[] = s.exercises || [];
  const groups: ExerciseGroup[] = exercises.map((ex: Exercise, i: number) => ({
    label: groupLetter(i),
    exercises: [ex],
  }));
  return {
    dayOfWeek: s.dayOfWeek,
    name: s.name,
    type: s.type,
    method: "straight",
    groups,
  };
}

/* ── Component ───────────────────────────────────────── */

export default function PlanBuilder({
  teamId,
  templateId,
  onClose,
  onSaved,
}: {
  teamId: string;
  templateId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lang] = useLang();
  const ct = TRAINER_COPY[lang as keyof typeof TRAINER_COPY] ?? TRAINER_COPY.IS;
  const isIS = lang === "IS";
  const qs = `team_id=${encodeURIComponent(teamId)}`;

  // Form state
  const [templateName, setTemplateName] = useState("");
  const [planType, setPlanType] = useState<PlanType>("strength");
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);

  // Readiness settings
  const [readinessEnabled, setReadinessEnabled] = useState(true);
  const [deloadPercentages, setDeloadPercentages] = useState<number[]>([]);
  const [recoveryPercentages, setRecoveryPercentages] = useState<number[]>([]);

  // Structure
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

  // Exercise search
  const [searchResults, setSearchResults] = useState<ExerciseLibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  /** Target: "weekIdx-sessionIdx-groupIdx-slotIdx" */
  const [searchTarget, setSearchTarget] = useState<string | null>(null);

  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ── Initialize weeks structure ──────────────────────── */

  useEffect(() => {
    if (weeks.length === 0 && durationWeeks > 0 && sessionsPerWeek > 0) {
      const newWeeks: Week[] = [];
      for (let w = 1; w <= durationWeeks; w++) {
        const sessions: Session[] = [];
        for (let d = 1; d <= sessionsPerWeek; d++) {
          sessions.push({
            dayOfWeek: d,
            name: `${isIS ? "Seta" : "Session"} ${d}`,
            type: planType,
            method: "straight",
            groups: [],
          });
        }
        newWeeks.push({ week: w, sessions });
      }
      setWeeks(newWeeks);
      setDeloadPercentages(new Array(durationWeeks).fill(10));
      setRecoveryPercentages(new Array(durationWeeks).fill(20));
    }
  }, [durationWeeks, sessionsPerWeek, planType, isIS]);

  /* ── Load template if editing ────────────────────────– */

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  async function loadTemplate() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/templates?id=${templateId}&${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setError("Failed to load template");
        return;
      }

      const json = await res.json();
      if (json.template) {
        const t = json.template;
        setTemplateName(t.name);
        setPlanType(t.plan_type);
        setDurationWeeks(t.duration_weeks);
        setSessionsPerWeek(t.sessions_per_week);
        setReadinessEnabled(t.readiness_enabled ?? true);
        setDeloadPercentages(t.deload_weeks || []);
        setRecoveryPercentages(t.recovery_weeks || []);

        // Parse structure and migrate old format
        let parsed: Week[] = [];
        if (t.structure && typeof t.structure === "string") {
          parsed = JSON.parse(t.structure);
        } else if (t.structure) {
          parsed = t.structure;
        }

        // Migrate each session
        const migrated = parsed.map((w: any) => ({
          ...w,
          sessions: (w.sessions || []).map(migrateSession),
        }));
        setWeeks(migrated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading template");
    } finally {
      setLoading(false);
    }
  }

  /* ── Exercise search ────────────────────────────────── */

  async function searchExercises(query: string) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(
        `/api/trainer/exercises?search=${encodeURIComponent(query)}&${qs}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.exercises || []);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  }

  /* ── Session method change ─────────────────────────── */

  function changeSessionMethod(sessionIdx: number, method: SessionMethod) {
    const newWeeks = [...weeks];
    const session = { ...newWeeks[currentWeekIndex].sessions[sessionIdx] };
    session.method = method;
    // Keep existing groups — user can reorganize manually
    newWeeks[currentWeekIndex].sessions[sessionIdx] = session;
    setWeeks(newWeeks);
  }

  /* ── Add exercise group ────────────────────────────── */

  function addGroup(sessionIdx: number) {
    const newWeeks = [...weeks];
    const session = newWeeks[currentWeekIndex].sessions[sessionIdx];
    const groupSize = METHOD_GROUP_SIZE[session.method];
    const newGroupIdx = session.groups.length;
    const label = groupLetter(newGroupIdx);

    const emptySlots: Exercise[] = Array.from(
      { length: groupSize },
      () => ({
        exerciseId: "",
        name: "",
        sets: session.method === "cluster" ? 5 : 3,
        reps: session.method === "potentiation_cluster" ? "1-2" : "6",
        loadType: (planType === "endurance" ? "RPE" : "kg") as Exercise["loadType"],
        loadValue: planType === "endurance" ? 7 : 100,
        tempo: "3010",
        restSeconds: session.method === "cluster" ? 20 : 180,
        notes: "",
        ...(session.method === "cluster"
          ? { intraSetRest: 15, clusterReps: "2+2+2" }
          : {}),
      })
    );

    session.groups.push({ label, exercises: emptySlots });
    setWeeks(newWeeks);
  }

  /* ── Set exercise in a slot ────────────────────────── */

  function setExerciseInSlot(
    weekIdx: number,
    sessionIdx: number,
    groupIdx: number,
    slotIdx: number,
    exercise: ExerciseLibraryItem
  ) {
    const newWeeks = [...weeks];
    const slot =
      newWeeks[weekIdx].sessions[sessionIdx].groups[groupIdx].exercises[
        slotIdx
      ];
    slot.exerciseId = exercise.id;
    slot.name = isIS ? exercise.name_is || exercise.name : exercise.name;
    setWeeks(newWeeks);
    setSearchTarget(null);
    setSearchQuery("");
    setSearchResults([]);
  }

  /* ── Remove group ──────────────────────────────────── */

  function removeGroup(sessionIdx: number, groupIdx: number) {
    const newWeeks = [...weeks];
    const session = newWeeks[currentWeekIndex].sessions[sessionIdx];
    session.groups.splice(groupIdx, 1);
    // Re-label
    session.groups.forEach((g, i) => {
      g.label = groupLetter(i);
    });
    setWeeks(newWeeks);
  }

  /* ── Update exercise in slot ───────────────────────── */

  function updateExercise(
    weekIdx: number,
    sessionIdx: number,
    groupIdx: number,
    slotIdx: number,
    updates: Partial<Exercise>
  ) {
    const newWeeks = [...weeks];
    const ex =
      newWeeks[weekIdx].sessions[sessionIdx].groups[groupIdx].exercises[
        slotIdx
      ];
    Object.assign(ex, updates);
    setWeeks(newWeeks);
  }

  /* ── Remove exercise from slot ─────────────────────── */

  function clearSlot(
    sessionIdx: number,
    groupIdx: number,
    slotIdx: number
  ) {
    const newWeeks = [...weeks];
    const ex =
      newWeeks[currentWeekIndex].sessions[sessionIdx].groups[groupIdx]
        .exercises[slotIdx];
    ex.exerciseId = "";
    ex.name = "";
    setWeeks(newWeeks);
  }

  /* ── Copy week ──────────────────────────────────────– */

  function copyWeek(weekIdx: number) {
    if (weekIdx >= weeks.length) return;
    const sourceWeek = weeks[weekIdx];
    const newSessions = sourceWeek.sessions.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        exercises: g.exercises.map((e) => ({ ...e })),
      })),
    }));

    const newWeeks = [
      ...weeks.slice(0, weekIdx + 1),
      { week: weekIdx + 2, sessions: newSessions },
      ...weeks.slice(weekIdx + 1),
    ];

    newWeeks.forEach((w, i) => {
      w.week = i + 1;
    });

    setWeeks(newWeeks);
    setDurationWeeks(newWeeks.length);
  }

  /* ── Save template ──────────────────────────────────– */

  async function save() {
    if (!templateName.trim()) {
      setError("Template name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const method = templateId ? "PUT" : "POST";
      const url = templateId
        ? `/api/trainer/templates?id=${templateId}&${qs}`
        : `/api/trainer/templates?${qs}`;

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          name: templateName,
          planType,
          durationWeeks,
          sessionsPerWeek,
          readinessEnabled,
          deloadPercentages,
          recoveryPercentages,
          structure: weeks,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save template");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving");
    } finally {
      setSaving(false);
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

  const currentWeek = weeks[currentWeekIndex];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-auto">
      <div className="bg-white rounded-lg max-w-4xl w-full m-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {templateId ? ct.plans.editTemplate : ct.plans.createTemplate}
          </h2>
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

        {/* Template basics */}
        <div className="space-y-4 mb-6 pb-6 border-b">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {ct.plans.templateName}
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={isIS ? "Nafn á sniðmáti" : "Template name"}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {ct.plans.planType}
              </label>
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value as PlanType)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="strength">{ct.plan.strength}</option>
                <option value="endurance">{ct.plan.endurance}</option>
                <option value="mixed">{ct.plan.mixed}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {ct.plans.duration} ({isIS ? "vikur" : "weeks"})
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={durationWeeks}
                onChange={(e) =>
                  setDurationWeeks(Math.max(1, Math.min(12, +e.target.value)))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {ct.plans.sessionsPerWeek}
              </label>
              <input
                type="number"
                min="1"
                max="6"
                value={sessionsPerWeek}
                onChange={(e) =>
                  setSessionsPerWeek(
                    Math.max(1, Math.min(6, +e.target.value))
                  )
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                <input
                  type="checkbox"
                  checked={readinessEnabled}
                  onChange={(e) => setReadinessEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                {ct.plans.readiness}
              </label>
            </div>
          </div>
        </div>

        {/* Readiness settings */}
        {readinessEnabled && durationWeeks > 0 && (
          <div className="mb-6 pb-6 border-b">
            <h3 className="font-semibold text-sm mb-3">
              {ct.plans.readinessSettings}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: durationWeeks }).map((_, weekIdx) => (
                <div key={weekIdx}>
                  <label className="block text-xs text-gray-600 mb-1">
                    {isIS ? "Vika" : "Week"} {weekIdx + 1}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={deloadPercentages[weekIdx] ?? 0}
                      onChange={(e) => {
                        const newDeload = [...deloadPercentages];
                        newDeload[weekIdx] = +e.target.value;
                        setDeloadPercentages(newDeload);
                      }}
                      placeholder={isIS ? "Afsláttur %" : "Deload %"}
                      className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={recoveryPercentages[weekIdx] ?? 0}
                      onChange={(e) => {
                        const newRecovery = [...recoveryPercentages];
                        newRecovery[weekIdx] = +e.target.value;
                        setRecoveryPercentages(newRecovery);
                      }}
                      placeholder={isIS ? "Endurh %" : "Recov %"}
                      className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Week tabs */}
        {weeks.length > 0 && (
          <>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {weeks.map((week, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentWeekIndex(idx)}
                  className={`px-3 py-1 text-sm rounded-lg whitespace-nowrap transition-colors ${
                    idx === currentWeekIndex
                      ? "bg-black text-white"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {isIS ? "Vika" : "Week"} {week.week}
                </button>
              ))}
            </div>

            {/* Current week sessions */}
            {currentWeek && (
              <div className="space-y-4 mb-6 pb-6 border-b">
                {currentWeek.sessions.map((session, sessionIdx) => (
                  <div key={sessionIdx} className="bg-gray-50 rounded-lg p-4">
                    {/* Session header: name + type + method */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <input
                        type="text"
                        value={session.name}
                        onChange={(e) => {
                          const newWeeks = [...weeks];
                          newWeeks[currentWeekIndex].sessions[
                            sessionIdx
                          ].name = e.target.value;
                          setWeeks(newWeeks);
                        }}
                        className="flex-1 min-w-[140px] border rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black"
                      />

                      <select
                        value={session.type}
                        onChange={(e) => {
                          const newWeeks = [...weeks];
                          newWeeks[currentWeekIndex].sessions[
                            sessionIdx
                          ].type = e.target.value as PlanType;
                          setWeeks(newWeeks);
                        }}
                        className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        <option value="strength">{ct.plan.strength}</option>
                        <option value="endurance">{ct.plan.endurance}</option>
                        <option value="mixed">{ct.plan.mixed}</option>
                      </select>

                      <select
                        value={session.method}
                        onChange={(e) =>
                          changeSessionMethod(
                            sessionIdx,
                            e.target.value as SessionMethod
                          )
                        }
                        className="border rounded px-2 py-1 text-sm bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {ALL_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {ct.methods[m]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Exercise groups */}
                    <div className="space-y-3 mb-3">
                      {session.groups.map((group, groupIdx) => {
                        const slotLabels = getSlotLabels(session.method, ct);
                        const methodColor =
                          session.method === "french_contrast"
                            ? "border-l-purple-400"
                            : session.method === "contrast"
                            ? "border-l-orange-400"
                            : session.method === "potentiation_cluster"
                            ? "border-l-red-400"
                            : session.method === "cluster"
                            ? "border-l-yellow-400"
                            : session.method === "superset"
                            ? "border-l-blue-400"
                            : session.method === "triset"
                            ? "border-l-green-400"
                            : session.method === "giant"
                            ? "border-l-pink-400"
                            : "border-l-gray-300";

                        return (
                          <div
                            key={groupIdx}
                            className={`bg-white rounded border border-l-4 ${methodColor} p-3`}
                          >
                            {/* Group header */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                {ct.plans.groupLabel} {group.label}
                                {session.method !== "straight" && (
                                  <span className="ml-2 text-xs font-normal text-gray-400">
                                    {ct.methods[session.method]}
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() =>
                                  removeGroup(sessionIdx, groupIdx)
                                }
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                {isIS ? "Fjarlægja" : "Remove"}
                              </button>
                            </div>

                            {/* Exercise slots */}
                            <div className="space-y-2">
                              {group.exercises.map((ex, slotIdx) => {
                                const slotLabel =
                                  slotLabels[slotIdx] || `${slotIdx + 1}`;
                                const targetKey = `${currentWeekIndex}-${sessionIdx}-${groupIdx}-${slotIdx}`;
                                const isSearchOpen =
                                  searchTarget === targetKey;

                                return (
                                  <div key={slotIdx}>
                                    {/* Slot label for structured methods */}
                                    {METHOD_GROUP_SIZE[session.method] > 1 && (
                                      <div className="text-xs text-gray-500 mb-1 font-medium">
                                        {group.label}
                                        {slotIdx + 1}
                                        {slotLabel ? ` — ${slotLabel}` : ""}
                                      </div>
                                    )}

                                    {/* Exercise name / search */}
                                    {!ex.exerciseId ? (
                                      <div className="relative">
                                        <button
                                          onClick={() => {
                                            setSearchTarget(
                                              isSearchOpen ? null : targetKey
                                            );
                                            setSearchQuery("");
                                            setSearchResults([]);
                                          }}
                                          className="w-full text-left px-3 py-2 border border-dashed rounded text-sm text-gray-400 hover:bg-gray-50"
                                        >
                                          {isIS
                                            ? "+ Velja æfingu"
                                            : "+ Choose exercise"}
                                        </button>

                                        {isSearchOpen && (
                                          <div className="absolute top-full left-0 mt-1 w-72 bg-white border rounded-lg shadow-lg z-20 p-2">
                                            <input
                                              type="text"
                                              value={searchQuery}
                                              onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                searchExercises(e.target.value);
                                              }}
                                              placeholder={
                                                ct.plans.searchExercises
                                              }
                                              className="w-full border rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-black"
                                              autoFocus
                                            />
                                            {searchQuery &&
                                              searchResults.length > 0 && (
                                                <div className="max-h-48 overflow-y-auto space-y-1">
                                                  {searchResults.map(
                                                    (result) => (
                                                      <button
                                                        key={result.id}
                                                        onClick={() =>
                                                          setExerciseInSlot(
                                                            currentWeekIndex,
                                                            sessionIdx,
                                                            groupIdx,
                                                            slotIdx,
                                                            result
                                                          )
                                                        }
                                                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                                                      >
                                                        <div className="font-medium">
                                                          {isIS
                                                            ? result.name_is ||
                                                              result.name
                                                            : result.name}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                          {result.category}
                                                        </div>
                                                      </button>
                                                    )
                                                  )}
                                                </div>
                                              )}
                                            {searchQuery &&
                                              searchResults.length === 0 &&
                                              !searching && (
                                                <div className="text-xs text-gray-500 text-center py-2">
                                                  {isIS
                                                    ? "Engar niðurstöður"
                                                    : "No results"}
                                                </div>
                                              )}
                                            {searching && (
                                              <div className="text-xs text-gray-500 text-center py-2">
                                                {isIS
                                                  ? "Leita..."
                                                  : "Searching..."}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-sm font-medium">
                                            {ex.name}
                                          </span>
                                          <button
                                            onClick={() =>
                                              clearSlot(
                                                sessionIdx,
                                                groupIdx,
                                                slotIdx
                                              )
                                            }
                                            className="text-red-500 hover:text-red-700 text-xs"
                                          >
                                            ×
                                          </button>
                                        </div>

                                        {/* Exercise params */}
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
                                          <div>
                                            <label className="block text-gray-500 mb-0.5">
                                              {ct.plans.sets}
                                            </label>
                                            <input
                                              type="number"
                                              min="1"
                                              value={ex.sets}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    sets: +e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                          </div>

                                          <div>
                                            <label className="block text-gray-500 mb-0.5">
                                              {ct.plans.reps}
                                            </label>
                                            <input
                                              type="text"
                                              value={ex.reps}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    reps: e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                          </div>

                                          <div>
                                            <label className="block text-gray-500 mb-0.5">
                                              {ct.plans.loadType}
                                            </label>
                                            <select
                                              value={ex.loadType}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    loadType: e.target
                                                      .value as Exercise["loadType"],
                                                  }
                                                )
                                              }
                                              className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                            >
                                              <option value="kg">kg</option>
                                              <option value="velocity">
                                                m/s
                                              </option>
                                              <option value="%1RM">%1RM</option>
                                              <option value="RPE">RPE</option>
                                            </select>
                                          </div>

                                          <div>
                                            <label className="block text-gray-500 mb-0.5">
                                              {ct.plans.load}
                                            </label>
                                            <input
                                              type="number"
                                              step="0.1"
                                              value={ex.loadValue}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    loadValue: +e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                          </div>

                                          <div>
                                            <label className="block text-gray-500 mb-0.5">
                                              {ct.plans.tempo}
                                            </label>
                                            <input
                                              type="text"
                                              value={ex.tempo}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    tempo: e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                          </div>

                                          <div>
                                            <label className="block text-gray-500 mb-0.5">
                                              {ct.plans.rest} (s)
                                            </label>
                                            <input
                                              type="number"
                                              min="0"
                                              value={ex.restSeconds}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    restSeconds:
                                                      +e.target.value,
                                                  }
                                                )
                                              }
                                              className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                          </div>

                                          {/* Cluster-specific fields */}
                                          {session.method === "cluster" && (
                                            <>
                                              <div>
                                                <label className="block text-gray-500 mb-0.5">
                                                  {ct.plans.clusterReps}
                                                </label>
                                                <input
                                                  type="text"
                                                  value={
                                                    ex.clusterReps || "2+2+2"
                                                  }
                                                  onChange={(e) =>
                                                    updateExercise(
                                                      currentWeekIndex,
                                                      sessionIdx,
                                                      groupIdx,
                                                      slotIdx,
                                                      {
                                                        clusterReps:
                                                          e.target.value,
                                                      }
                                                    )
                                                  }
                                                  placeholder="2+2+2"
                                                  className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-gray-500 mb-0.5">
                                                  {ct.plans.intraSetRest}
                                                </label>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  value={
                                                    ex.intraSetRest ?? 15
                                                  }
                                                  onChange={(e) =>
                                                    updateExercise(
                                                      currentWeekIndex,
                                                      sessionIdx,
                                                      groupIdx,
                                                      slotIdx,
                                                      {
                                                        intraSetRest:
                                                          +e.target.value,
                                                      }
                                                    )
                                                  }
                                                  className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                                />
                                              </div>
                                            </>
                                          )}

                                          {/* RPE field */}
                                          {ex.loadType === "RPE" && (
                                            <div>
                                              <label className="block text-gray-500 mb-0.5">
                                                RPE
                                              </label>
                                              <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={ex.rpeTarget ?? 7}
                                                onChange={(e) =>
                                                  updateExercise(
                                                    currentWeekIndex,
                                                    sessionIdx,
                                                    groupIdx,
                                                    slotIdx,
                                                    {
                                                      rpeTarget:
                                                        +e.target.value,
                                                    }
                                                  )
                                                }
                                                className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                              />
                                            </div>
                                          )}

                                          {/* Notes */}
                                          <div className="col-span-3 sm:col-span-6">
                                            <input
                                              type="text"
                                              value={ex.notes}
                                              onChange={(e) =>
                                                updateExercise(
                                                  currentWeekIndex,
                                                  sessionIdx,
                                                  groupIdx,
                                                  slotIdx,
                                                  {
                                                    notes: e.target.value,
                                                  }
                                                )
                                              }
                                              placeholder={ct.plans.notes}
                                              className="w-full border rounded px-1.5 py-1 text-gray-500 focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add group button */}
                    <button
                      onClick={() => addGroup(sessionIdx)}
                      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
                    >
                      + {ct.plans.addGroup}
                    </button>
                  </div>
                ))}

                {/* Copy week button */}
                {currentWeekIndex < weeks.length - 1 && (
                  <button
                    onClick={() => copyWeek(currentWeekIndex)}
                    className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
                  >
                    {isIS ? "Afrita vikuna" : "Copy week"}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            {isIS ? "Hætta við" : "Cancel"}
          </button>
          <button
            onClick={save}
            disabled={saving || !templateName.trim()}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "..." : ct.plans.save}
          </button>
        </div>
      </div>
    </div>
  );
}
