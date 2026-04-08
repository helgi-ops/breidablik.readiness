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

export type VelocityZone = "max_strength" | "strength_speed" | "speed_strength" | "speed" | "custom";

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
  /** VBT: target mean concentric velocity (m/s) */
  velocityTarget?: number;
  /** VBT: velocity loss threshold to terminate set (%) */
  velocityLoss?: number;
  /** VBT: training zone */
  velocityZone?: VelocityZone;
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
  bodySplit?: BodySplit;
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
  movement_pattern?: "push" | "pull" | "hinge" | "squat" | "carry" | null;
  is_bilateral?: boolean;
}

type BodySplit = "upper" | "lower" | "full";

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

/* ── Method presets: correct default exercise variables per slot ─── */

type SlotPreset = Omit<Exercise, "exerciseId" | "name"> & {
  /** Suggested movement patterns for exercise search (upper body) */
  suggestUpper?: string[];
  /** Suggested movement patterns for exercise search (lower body) */
  suggestLower?: string[];
  /** Suggested category filter */
  suggestCategory?: string;
};

const METHOD_SLOT_PRESETS: Record<SessionMethod, SlotPreset[]> = {
  french_contrast: [
    // A1 — Heavy Compound (85% 1RM, 3-5 reps, slow eccentric)
    { sets: 3, reps: "3-5", loadType: "%1RM", loadValue: 85, tempo: "3010", restSeconds: 15, notes: "",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"], suggestCategory: "compound" },
    // A2 — Plyometric (bodyweight, explosive)
    { sets: 3, reps: "5", loadType: "kg", loadValue: 0, tempo: "X0X0", restSeconds: 15, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"], suggestCategory: "plyometric" },
    // A3 — Accentuated/Light Compound (30% 1RM, fast concentric)
    { sets: 3, reps: "3-5", loadType: "%1RM", loadValue: 30, tempo: "X010", restSeconds: 15, notes: "",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"], suggestCategory: "compound" },
    // A4 — Reactive Plyo (bodyweight, reactive)
    { sets: 3, reps: "5", loadType: "kg", loadValue: 0, tempo: "X0X0", restSeconds: 180, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"], suggestCategory: "plyometric" },
  ],
  contrast: [
    // A1 — Heavy (85% 1RM)
    { sets: 4, reps: "3-5", loadType: "%1RM", loadValue: 85, tempo: "3010", restSeconds: 30, notes: "",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"], suggestCategory: "compound" },
    // A2 — Explosive (bodyweight/light)
    { sets: 4, reps: "3-5", loadType: "kg", loadValue: 0, tempo: "X0X0", restSeconds: 180, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"], suggestCategory: "plyometric" },
  ],
  potentiation_cluster: [
    // A1 — Heavy (90% 1RM, 1-2 reps)
    { sets: 5, reps: "1-2", loadType: "%1RM", loadValue: 90, tempo: "2010", restSeconds: 30, notes: "",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"], suggestCategory: "compound" },
    // A2 — Explosive (3-5 reps)
    { sets: 5, reps: "3-5", loadType: "kg", loadValue: 0, tempo: "X0X0", restSeconds: 180, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"], suggestCategory: "plyometric" },
  ],
  cluster: [
    // Cluster set (85% 1RM, 2+2+2 reps, intra-set rest)
    { sets: 5, reps: "6", loadType: "%1RM", loadValue: 85, tempo: "2010", restSeconds: 180, notes: "",
      intraSetRest: 20, clusterReps: "2+2+2",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"], suggestCategory: "compound" },
  ],
  straight: [
    { sets: 3, reps: "8-10", loadType: "kg", loadValue: 0, tempo: "3010", restSeconds: 120, notes: "",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"] },
  ],
  superset: [
    // A1 — agonist
    { sets: 3, reps: "8-10", loadType: "kg", loadValue: 0, tempo: "3010", restSeconds: 0, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"] },
    // A2 — antagonist
    { sets: 3, reps: "8-10", loadType: "kg", loadValue: 0, tempo: "3010", restSeconds: 90, notes: "",
      suggestUpper: ["pull"], suggestLower: ["hinge"] },
  ],
  triset: [
    { sets: 3, reps: "8-10", loadType: "kg", loadValue: 0, tempo: "3010", restSeconds: 0, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"] },
    { sets: 3, reps: "8-10", loadType: "kg", loadValue: 0, tempo: "3010", restSeconds: 0, notes: "",
      suggestUpper: ["pull"], suggestLower: ["hinge"] },
    { sets: 3, reps: "8-10", loadType: "kg", loadValue: 0, tempo: "3010", restSeconds: 90, notes: "",
      suggestUpper: ["push", "pull"], suggestLower: ["squat", "hinge"] },
  ],
  giant: [
    { sets: 3, reps: "10-12", loadType: "kg", loadValue: 0, tempo: "2010", restSeconds: 0, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"] },
    { sets: 3, reps: "10-12", loadType: "kg", loadValue: 0, tempo: "2010", restSeconds: 0, notes: "",
      suggestUpper: ["pull"], suggestLower: ["hinge"] },
    { sets: 3, reps: "10-12", loadType: "kg", loadValue: 0, tempo: "2010", restSeconds: 0, notes: "",
      suggestUpper: ["push"], suggestLower: ["squat"] },
    { sets: 3, reps: "10-12", loadType: "kg", loadValue: 0, tempo: "2010", restSeconds: 120, notes: "",
      suggestUpper: ["pull"], suggestLower: ["hinge"] },
  ],
};

const MOVEMENT_PATTERN_LABELS: Record<string, Record<string, string>> = {
  IS: { push: "Ýta", pull: "Toga", hinge: "Hip hinge", squat: "Squat", carry: "Bera" },
  EN: { push: "Push", pull: "Pull", hinge: "Hinge", squat: "Squat", carry: "Carry" },
};

const BODY_SPLIT_LABELS: Record<string, Record<BodySplit, string>> = {
  IS: { upper: "Efri", lower: "Neðri", full: "Heild" },
  EN: { upper: "Upper", lower: "Lower", full: "Full" },
};

/* ── VBT: Velocity zones & reference data from research ─── */

interface VelocityZoneConfig {
  label: Record<string, string>;
  /** Approximate %1RM range */
  pctRange: string;
  /** Default target MV for squat-type exercises (m/s) */
  targetSquat: number;
  /** Default target MV for bench/upper exercises (m/s) */
  targetUpper: number;
  /** Recommended velocity loss threshold (%) */
  defaultVLoss: number;
  /** Suggested reps range */
  repsHint: string;
  color: string;
}

const VELOCITY_ZONES: Record<Exclude<VelocityZone, "custom">, VelocityZoneConfig> = {
  max_strength: {
    label: { IS: "Hámarkskraftur", EN: "Max Strength" },
    pctRange: "85–100%",
    targetSquat: 0.40,
    targetUpper: 0.25,
    defaultVLoss: 10,
    repsHint: "1–3",
    color: "bg-red-100 text-red-700",
  },
  strength_speed: {
    label: { IS: "Krafthraði", EN: "Strength-Speed" },
    pctRange: "70–85%",
    targetSquat: 0.60,
    targetUpper: 0.45,
    defaultVLoss: 20,
    repsHint: "3–6",
    color: "bg-orange-100 text-orange-700",
  },
  speed_strength: {
    label: { IS: "Hraðakraftur", EN: "Speed-Strength" },
    pctRange: "55–70%",
    targetSquat: 0.80,
    targetUpper: 0.65,
    defaultVLoss: 20,
    repsHint: "4–8",
    color: "bg-amber-100 text-amber-700",
  },
  speed: {
    label: { IS: "Hraði / Sprengiafli", EN: "Speed / Power" },
    pctRange: "<55%",
    targetSquat: 1.00,
    targetUpper: 0.85,
    defaultVLoss: 10,
    repsHint: "3–5",
    color: "bg-emerald-100 text-emerald-700",
  },
};

/** General V1RM (velocity at 1RM) reference per exercise — from Weakley et al. 2021, Table 2 */
const V1RM_REFERENCE: Record<string, number> = {
  "Back Squat": 0.30, "Front Squat": 0.30, "Leg Press": 0.21,
  "Bench Press": 0.17, "Overhead Press": 0.19,
  "Deadlift": 0.15, "Trap Bar Deadlift": 0.15, "Romanian Deadlift": 0.15,
  "Hip Thrust": 0.25, "Bent Over Row": 0.50, "Pull Up": 0.47,
};

const VL_THRESHOLD_OPTIONS = [5, 10, 15, 20, 25, 30] as const;

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
      bodySplit: s.bodySplit || "full",
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
            bodySplit: "full",
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

  /** Get suggested movement pattern for a specific slot based on method + body split */
  function getSlotSuggestion(sessionIdx: number, slotIdx: number): { pattern?: string; category?: string } {
    const session = weeks[currentWeekIndex]?.sessions[sessionIdx];
    if (!session) return {};
    const presets = METHOD_SLOT_PRESETS[session.method];
    const preset = presets[slotIdx] || presets[0];
    const split = session.bodySplit || "full";
    const patterns = split === "upper" ? preset.suggestUpper : split === "lower" ? preset.suggestLower : undefined;
    return {
      pattern: patterns?.[0], // Use first suggestion as default filter
      category: preset.suggestCategory,
    };
  }

  async function searchExercises(query: string, extraParams?: string) {
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

      let url = `/api/trainer/exercises?search=${encodeURIComponent(query)}&${qs}`;
      if (extraParams) url += `&${extraParams}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

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

  /* ── Session body split change ────────────────────── */

  function changeBodySplit(sessionIdx: number, split: BodySplit) {
    const newWeeks = [...weeks];
    const session = newWeeks[currentWeekIndex].sessions[sessionIdx];
    session.bodySplit = split;
    setWeeks(newWeeks);
  }

  /* ── Add exercise group ────────────────────────────── */

  function addGroup(sessionIdx: number) {
    const newWeeks = [...weeks];
    const session = newWeeks[currentWeekIndex].sessions[sessionIdx];
    const groupSize = METHOD_GROUP_SIZE[session.method];
    const newGroupIdx = session.groups.length;
    const label = groupLetter(newGroupIdx);
    const presets = METHOD_SLOT_PRESETS[session.method];

    const emptySlots: Exercise[] = Array.from(
      { length: groupSize },
      (_, slotIdx) => {
        const preset = presets[slotIdx] || presets[0];
        return {
          exerciseId: "",
          name: "",
          sets: preset.sets,
          reps: preset.reps,
          loadType: (planType === "endurance" ? "RPE" : preset.loadType) as Exercise["loadType"],
          loadValue: planType === "endurance" ? 7 : preset.loadValue,
          tempo: preset.tempo,
          restSeconds: preset.restSeconds,
          notes: "",
          ...(preset.intraSetRest != null ? { intraSetRest: preset.intraSetRest } : {}),
          ...(preset.clusterReps ? { clusterReps: preset.clusterReps } : {}),
        };
      }
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

                      {/* Body split selector */}
                      <div className="flex rounded overflow-hidden border text-xs">
                        {(["upper", "lower", "full"] as BodySplit[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => changeBodySplit(sessionIdx, s)}
                            className={`px-2.5 py-1 transition-colors ${
                              (session.bodySplit || "full") === s
                                ? "bg-black text-white"
                                : "bg-white text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {BODY_SPLIT_LABELS[isIS ? "IS" : "EN"][s]}
                          </button>
                        ))}
                      </div>
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

                                        {isSearchOpen && (() => {
                                          const suggestion = getSlotSuggestion(sessionIdx, slotIdx);
                                          const suggestionParams = [
                                            suggestion.pattern ? `pattern=${suggestion.pattern}` : "",
                                            suggestion.category ? `category=${suggestion.category}` : "",
                                          ].filter(Boolean).join("&");
                                          const patternLabels = MOVEMENT_PATTERN_LABELS[isIS ? "IS" : "EN"];

                                          return (
                                          <div className="absolute top-full left-0 mt-1 w-80 bg-white border rounded-lg shadow-lg z-20 p-2">
                                            {/* Suggestion hint */}
                                            {suggestion.pattern && (
                                              <div className="text-[10px] text-indigo-500 mb-1.5 px-1">
                                                {isIS ? "Ráðlagt" : "Suggested"}: {patternLabels[suggestion.pattern] || suggestion.pattern}
                                                {suggestion.category ? ` · ${suggestion.category}` : ""}
                                              </div>
                                            )}
                                            <input
                                              type="text"
                                              value={searchQuery}
                                              onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                searchExercises(e.target.value, suggestionParams);
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
                                                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                                                      >
                                                        <div className="font-medium">
                                                          {isIS
                                                            ? result.name_is ||
                                                              result.name
                                                            : result.name}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5">
                                                          <span>{result.category}</span>
                                                          {result.movement_pattern && (
                                                            <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                                                              {patternLabels[result.movement_pattern] || result.movement_pattern}
                                                            </span>
                                                          )}
                                                          <span className={`px-1.5 py-0.5 rounded ${
                                                            result.is_bilateral === false
                                                              ? "bg-amber-50 text-amber-600"
                                                              : "bg-gray-50 text-gray-500"
                                                          }`}>
                                                            {result.is_bilateral === false
                                                              ? (isIS ? "Einhlið" : "Uni")
                                                              : (isIS ? "Tvíhlið" : "Bi")}
                                                          </span>
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
                                          );
                                        })()}
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

                                          {/* ── Velocity-based training controls ── */}
                                          {ex.loadType === "velocity" ? (
                                            <>
                                              <div>
                                                <label className="block text-gray-500 mb-0.5">
                                                  {isIS ? "Svæði" : "Zone"}
                                                </label>
                                                <select
                                                  value={ex.velocityZone || "strength_speed"}
                                                  onChange={(e) => {
                                                    const zone = e.target.value as VelocityZone;
                                                    if (zone === "custom") {
                                                      updateExercise(currentWeekIndex, sessionIdx, groupIdx, slotIdx, { velocityZone: zone });
                                                    } else {
                                                      const cfg = VELOCITY_ZONES[zone];
                                                      const split = session.bodySplit || "full";
                                                      const target = split === "upper" ? cfg.targetUpper : cfg.targetSquat;
                                                      updateExercise(currentWeekIndex, sessionIdx, groupIdx, slotIdx, {
                                                        velocityZone: zone,
                                                        velocityTarget: target,
                                                        velocityLoss: cfg.defaultVLoss,
                                                        reps: cfg.repsHint,
                                                      });
                                                    }
                                                  }}
                                                  className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                                >
                                                  {(Object.keys(VELOCITY_ZONES) as Array<Exclude<VelocityZone, "custom">>).map((z) => (
                                                    <option key={z} value={z}>
                                                      {VELOCITY_ZONES[z].label[isIS ? "IS" : "EN"]} ({VELOCITY_ZONES[z].pctRange})
                                                    </option>
                                                  ))}
                                                  <option value="custom">{isIS ? "Sérsniðið" : "Custom"}</option>
                                                </select>
                                              </div>
                                              <div>
                                                <label className="block text-gray-500 mb-0.5">
                                                  {isIS ? "Markhraði" : "Target"} (m/s)
                                                </label>
                                                <input
                                                  type="number"
                                                  step="0.05"
                                                  min="0.1"
                                                  max="1.5"
                                                  value={ex.velocityTarget ?? 0.60}
                                                  onChange={(e) =>
                                                    updateExercise(currentWeekIndex, sessionIdx, groupIdx, slotIdx, {
                                                      velocityTarget: +e.target.value,
                                                      velocityZone: "custom",
                                                    })
                                                  }
                                                  className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-gray-500 mb-0.5">
                                                  VL%
                                                </label>
                                                <select
                                                  value={ex.velocityLoss ?? 20}
                                                  onChange={(e) =>
                                                    updateExercise(currentWeekIndex, sessionIdx, groupIdx, slotIdx, {
                                                      velocityLoss: +e.target.value,
                                                    })
                                                  }
                                                  className="w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-black"
                                                >
                                                  {VL_THRESHOLD_OPTIONS.map((v) => (
                                                    <option key={v} value={v}>{v}%</option>
                                                  ))}
                                                </select>
                                              </div>
                                            </>
                                          ) : (
                                            <>
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
                                            </>
                                          )}

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

                                          {/* VBT zone info badge */}
                                          {ex.loadType === "velocity" && ex.velocityZone && ex.velocityZone !== "custom" && (
                                            <div className="col-span-3 sm:col-span-6">
                                              <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-[10px] font-medium ${VELOCITY_ZONES[ex.velocityZone].color}`}>
                                                <span>{VELOCITY_ZONES[ex.velocityZone].label[isIS ? "IS" : "EN"]}</span>
                                                <span>·</span>
                                                <span>~{VELOCITY_ZONES[ex.velocityZone].pctRange} 1RM</span>
                                                <span>·</span>
                                                <span>{ex.velocityTarget?.toFixed(2)} m/s</span>
                                                <span>·</span>
                                                <span>VL {ex.velocityLoss}%</span>
                                                {ex.velocityLoss != null && ex.velocityLoss <= 10 && (
                                                  <span className="ml-1 text-[9px] opacity-70">({isIS ? "kraftmiðað" : "power focus"})</span>
                                                )}
                                                {ex.velocityLoss != null && ex.velocityLoss >= 25 && (
                                                  <span className="ml-1 text-[9px] opacity-70">({isIS ? "vöðvaþroski" : "hypertrophy"})</span>
                                                )}
                                              </div>
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
