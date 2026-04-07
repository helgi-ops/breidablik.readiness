"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { INDIVIDUAL_TRAINING_COPY } from "./individualTrainingCopy";
import type { Lang } from "@/lib/lang";

type Exercise = {
  id: string;
  name: string;
  name_is: string;
  sets: number;
  reps: number;
  load: number;
  load_type: "kg" | "m/s" | "%1RM" | "RPE";
  tempo?: string;
  rest_seconds?: number;
  notes?: string;
  original_sets?: number;
  original_reps?: number;
  original_load?: number;
  is_adjusted: boolean;
};

type TrainingSession = {
  date: string;
  session_type: "strength" | "endurance" | "mixed" | "recovery";
  exercises: Exercise[];
  readiness_zone: "green" | "yellow" | "red" | null;
  readiness_adjustment_reason?: string;
  week_number?: number;
  total_weeks?: number;
  day_in_week?: number;
};

type ExerciseLog = {
  exercise_id: string;
  sets_completed: number;
  reps_completed: number;
  load_used: number;
  rpe_actual: number;
  notes?: string;
};

interface IndividualTrainingViewProps {
  playerId: string;
  lang: Lang;
}

const getReadinessColor = (zone: string | null) => {
  switch (zone) {
    case "green":
      return "bg-green-50 border-green-200";
    case "yellow":
      return "bg-yellow-50 border-yellow-200";
    case "red":
      return "bg-red-50 border-red-200";
    default:
      return "bg-zinc-50 border-zinc-200";
  }
};

const getReadinessBadgeColor = (zone: string | null) => {
  switch (zone) {
    case "green":
      return "bg-green-100 text-green-900";
    case "yellow":
      return "bg-yellow-100 text-yellow-900";
    case "red":
      return "bg-red-100 text-red-900";
    default:
      return "bg-zinc-100 text-zinc-900";
  }
};

const getLoadTypeLabel = (type: string, lang: Lang) => {
  const copy = INDIVIDUAL_TRAINING_COPY[lang];
  switch (type) {
    case "kg":
      return copy.exercise.kg;
    case "m/s":
      return copy.exercise.ms;
    case "%1RM":
      return copy.exercise.percentage;
    case "RPE":
      return copy.exercise.rpe;
    default:
      return type;
  }
};

export default function IndividualTrainingView({ playerId, lang }: IndividualTrainingViewProps) {
  const t = INDIVIDUAL_TRAINING_COPY[lang];
  const supabase = getSupabaseClient();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [loggedExercises, setLoggedExercises] = useState<Set<string>>(new Set());
  const [loggingExerciseId, setLoggingExerciseId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState<ExerciseLog>({
    exercise_id: "",
    sets_completed: 0,
    reps_completed: 0,
    load_used: 0,
    rpe_actual: 5,
  });
  const [loggingError, setLoggingError] = useState("");
  const [loggingSuccess, setLoggingSuccess] = useState("");

  const fetchTrainingData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.access_token) {
        setError(t.empty.loadingError);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/player/training-today", {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setSession(null);
        } else {
          setError(t.empty.loadingError);
        }
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!data || Object.keys(data).length === 0) {
        setSession(null);
      } else {
        setSession(data as TrainingSession);
      }
    } catch (err: any) {
      console.error("Error fetching training data:", err);
      setError(t.empty.loadingError);
    } finally {
      setLoading(false);
    }
  }, [playerId, supabase, t]);

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  const handleOpenLogForm = (exerciseId: string) => {
    const exercise = session?.exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;

    setLoggingExerciseId(exerciseId);
    setLogForm({
      exercise_id: exerciseId,
      sets_completed: exercise.sets,
      reps_completed: exercise.reps,
      load_used: exercise.load,
      rpe_actual: 5,
    });
    setLoggingError("");
    setLoggingSuccess("");
  };

  const handleCloseLogForm = () => {
    setLoggingExerciseId(null);
    setLogForm({
      exercise_id: "",
      sets_completed: 0,
      reps_completed: 0,
      load_used: 0,
      rpe_actual: 5,
    });
  };

  const handleSubmitLog = async () => {
    setLoggingError("");
    setLoggingSuccess("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.access_token) {
        setLoggingError(t.logging.error);
        return;
      }

      const res = await fetch("/api/player/training-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          ...logForm,
          session_date: session?.date,
        }),
      });

      if (!res.ok) {
        setLoggingError(t.logging.error);
        return;
      }

      setLoggedExercises((prev) => new Set([...prev, logForm.exercise_id]));
      setLoggingSuccess(t.logging.success);
      handleCloseLogForm();

      setTimeout(() => {
        setLoggingSuccess("");
      }, 3000);
    } catch (err: any) {
      console.error("Error logging exercise:", err);
      setLoggingError(t.logging.error);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="text-center text-sm text-zinc-600">{INDIVIDUAL_TRAINING_COPY[lang].empty.notFound}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-zinc-900">{t.empty.loadingError}</div>
          <button
            onClick={fetchTrainingData}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {t.empty.tryAgain}
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="space-y-2 text-center">
          <div className="text-sm font-semibold text-zinc-900">{t.empty.restDay}</div>
          <div className="text-sm text-zinc-600">{t.empty.restDayMessage}</div>
        </div>
      </div>
    );
  }

  const exercises = session.exercises || [];
  const readinessZone = session.readiness_zone;
  const showReadinessAdjustment = session.readiness_adjustment_reason || exercises.some((e) => e.is_adjusted);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900">{t.section.title}</h2>
        <p className="text-sm text-zinc-600">{t.section.subtitle}</p>
      </div>

      {/* Readiness Adjustment Badge */}
      {showReadinessAdjustment && readinessZone && (
        <div className={`rounded-2xl border p-4 sm:p-5 ${getReadinessColor(readinessZone)}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getReadinessBadgeColor(readinessZone)}`}>
                  {t.readiness.zone[readinessZone as keyof typeof t.readiness.zone]}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700">{t.readiness.adjusted}</p>
              {session.readiness_adjustment_reason && (
                <p className="mt-2 text-xs text-zinc-600">{session.readiness_adjustment_reason}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plan Overview */}
      {(session.week_number || session.day_in_week) && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600">
              {t.overview.week} {session.week_number}
              {session.total_weeks ? ` ${t.overview.of} ${session.total_weeks}` : ""}
            </span>
            {session.day_in_week && <span className="text-zinc-600">{t.overview.day} {session.day_in_week}</span>}
          </div>
        </div>
      )}

      {/* Exercises */}
      <div className="space-y-3">
        {exercises.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 text-center text-sm text-zinc-600">
            {t.empty.notFound}
          </div>
        ) : (
          exercises.map((exercise) => {
            const isLogged = loggedExercises.has(exercise.id);
            const isLogging = loggingExerciseId === exercise.id;
            const exerciseName = lang === "IS" ? exercise.name_is : exercise.name;

            return (
              <div key={exercise.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                {/* Exercise Header */}
                <div className="p-4 sm:p-5 border-b border-zinc-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-zinc-900">{exerciseName}</h3>
                      {exercise.notes && <p className="mt-2 text-sm text-zinc-600">{exercise.notes}</p>}
                    </div>
                    {isLogged && (
                      <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-900">
                        <span>✓</span>
                        <span>{t.exercise.logged}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Exercise Details Grid */}
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Sets */}
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-500 uppercase">{t.exercise.sets}</div>
                      {exercise.is_adjusted && exercise.original_sets !== undefined ? (
                        <div className="flex items-baseline gap-2">
                          <span className="line-through text-sm text-zinc-500">{exercise.original_sets}</span>
                          <span className="text-sm font-semibold text-zinc-900">{exercise.sets}</span>
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-zinc-900">{exercise.sets}</div>
                      )}
                    </div>

                    {/* Reps */}
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-500 uppercase">{t.exercise.reps}</div>
                      {exercise.is_adjusted && exercise.original_reps !== undefined ? (
                        <div className="flex items-baseline gap-2">
                          <span className="line-through text-sm text-zinc-500">{exercise.original_reps}</span>
                          <span className="text-sm font-semibold text-zinc-900">{exercise.reps}</span>
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-zinc-900">{exercise.reps}</div>
                      )}
                    </div>

                    {/* Load */}
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-500 uppercase">{t.exercise.load}</div>
                      {exercise.is_adjusted && exercise.original_load !== undefined ? (
                        <div className="flex flex-col gap-1">
                          <span className="line-through text-sm text-zinc-500">
                            {exercise.original_load} {getLoadTypeLabel(exercise.load_type, lang)}
                          </span>
                          <span className="text-sm font-semibold text-zinc-900">
                            {exercise.load} {getLoadTypeLabel(exercise.load_type, lang)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-zinc-900">
                          {exercise.load} {getLoadTypeLabel(exercise.load_type, lang)}
                        </div>
                      )}
                    </div>

                    {/* Tempo */}
                    {exercise.tempo && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-zinc-500 uppercase">{t.exercise.tempo}</div>
                        <div className="text-sm font-semibold text-zinc-900">{exercise.tempo}</div>
                      </div>
                    )}

                    {/* Rest */}
                    {exercise.rest_seconds !== undefined && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-zinc-500 uppercase">{t.exercise.rest}</div>
                        <div className="text-sm font-semibold text-zinc-900">{exercise.rest_seconds}s</div>
                      </div>
                    )}
                  </div>

                  {/* Log Button */}
                  {!isLogged && !isLogging && (
                    <button
                      onClick={() => handleOpenLogForm(exercise.id)}
                      className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 transition-colors"
                    >
                      {t.exercise.logButton}
                    </button>
                  )}

                  {/* Logging Form */}
                  {isLogging && (
                    <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <h4 className="text-sm font-semibold text-zinc-900">{t.logging.title}</h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            {t.logging.setsCompleted}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={logForm.sets_completed}
                            onChange={(e) =>
                              setLogForm({
                                ...logForm,
                                sets_completed: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            {t.logging.repsCompleted}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={logForm.reps_completed}
                            onChange={(e) =>
                              setLogForm({
                                ...logForm,
                                reps_completed: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            {t.logging.loadUsed}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={logForm.load_used}
                            onChange={(e) =>
                              setLogForm({
                                ...logForm,
                                load_used: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            {t.logging.rpeActual}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={logForm.rpe_actual}
                            onChange={(e) =>
                              setLogForm({
                                ...logForm,
                                rpe_actual: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1">
                          {t.logging.notes}
                        </label>
                        <textarea
                          value={logForm.notes || ""}
                          onChange={(e) =>
                            setLogForm({
                              ...logForm,
                              notes: e.target.value,
                            })
                          }
                          placeholder="Optional notes..."
                          rows={2}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                        />
                      </div>

                      {loggingError && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{loggingError}</div>
                      )}

                      {loggingSuccess && (
                        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">{loggingSuccess}</div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={handleSubmitLog}
                          className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
                        >
                          {t.logging.submit}
                        </button>
                        <button
                          onClick={handleCloseLogForm}
                          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 transition-colors"
                        >
                          {t.logging.cancel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
