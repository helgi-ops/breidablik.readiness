import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

interface Prescription {
  id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_name_is: string | null;
  exercise_type: string;
  sort_order: number;
  sets: number | null;
  reps: string | null;
  load_type: string | null;
  load_value: number | null;
  rpe_target: number | null;
  tempo: string | null;
  rest_seconds: number | null;
  duration_min: number | null;
  hr_zone_target: number | null;
  pace_target: string | null;
  work_seconds: number | null;
  rest_work_seconds: number | null;
  interval_count: number | null;
  notes: string | null;
}

interface AdjustedPrescription extends Prescription {
  adjusted_sets?: number | null;
  adjusted_load_value?: number | null;
  pct_1rm?: number | null;
}

interface ExerciseMax {
  exercise_id: string;
  estimated_1rm: number;
}

/* ── helper functions ──────────────────────────────────── */

function getZone(totalScore: number | null): "green" | "yellow" | "red" {
  if (totalScore == null) return "green";
  if (totalScore >= 18) return "green";
  if (totalScore >= 13) return "yellow";
  return "red";
}

function roundUp(value: number): number {
  return Math.ceil(value);
}

function adjustPrescriptionForReadiness(
  prescription: Prescription,
  zone: "green" | "yellow" | "red",
  plan: {
    readiness_enabled: boolean;
    readiness_red_action: string;
    deload_volume_pct: number;
    deload_intensity_pct: number;
  },
  exerciseMaxes: Map<string, number>
): AdjustedPrescription {
  const adjusted: AdjustedPrescription = { ...prescription };

  // Fetch 1RM if available
  const oneRm = exerciseMaxes.get(prescription.exercise_id);

  if (!plan.readiness_enabled || zone === "green") {
    // No adjustment for green zone or if readiness is disabled
    if (oneRm && prescription.load_type === "pct_1rm" && prescription.load_value) {
      adjusted.pct_1rm = prescription.load_value;
    }
    return adjusted;
  }

  if (zone === "yellow") {
    // Apply deload: reduce volume and intensity
    if (prescription.sets) {
      adjusted.adjusted_sets = roundUp((prescription.sets * plan.deload_volume_pct) / 100);
    }
    if (prescription.load_value && (prescription.load_type === "absolute_kg" || prescription.load_type === "pct_1rm")) {
      adjusted.adjusted_load_value = parseFloat(
        ((prescription.load_value * plan.deload_intensity_pct) / 100).toFixed(1)
      );
    }
    if (oneRm && prescription.load_type === "pct_1rm" && prescription.load_value) {
      adjusted.pct_1rm = prescription.load_value;
    }
    return adjusted;
  }

  // zone === "red"
  if (plan.readiness_red_action === "recovery") {
    // Return a marker indicating recovery-only (will be handled at session level)
    return adjusted;
  }

  if (plan.readiness_red_action === "deload") {
    // Apply deload percentages (similar to yellow, but more aggressive)
    if (prescription.sets) {
      adjusted.adjusted_sets = roundUp((prescription.sets * plan.deload_volume_pct) / 100);
    }
    if (prescription.load_value && (prescription.load_type === "absolute_kg" || prescription.load_type === "pct_1rm")) {
      adjusted.adjusted_load_value = parseFloat(
        ((prescription.load_value * plan.deload_intensity_pct) / 100).toFixed(1)
      );
    }
    if (oneRm && prescription.load_type === "pct_1rm" && prescription.load_value) {
      adjusted.pct_1rm = prescription.load_value;
    }
  }

  return adjusted;
}

/* ── GET /api/player/training-today ──────────────────────────── */
// Returns today's training for the authenticated player, adjusted by readiness

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const today = new Date().toISOString().split("T")[0];

    // 1. Get player profile
    const { data: player, error: playerErr } = await sb
      .from("players")
      .select("id, full_name, team_id")
      .eq("id", playerId)
      .maybeSingle();

    if (playerErr) throw new Error(playerErr.message);
    if (!player) throw new Error("Player not found");

    // 2. Get active individual training plan
    const { data: plan, error: planErr } = await sb
      .from("individual_training_plans")
      .select(
        "id, plan_name, plan_type, start_date, end_date, readiness_enabled, readiness_red_action, deload_volume_pct, deload_intensity_pct"
      )
      .eq("player_id", playerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr) throw new Error(planErr.message);

    // Return empty if no active plan
    if (!plan) {
      return NextResponse.json(
        {
          plan: null,
          readiness: {
            total_score: null,
            zone: "green",
            message: "No active training plan",
          },
          sessions: [],
          player: { id: player.id, name: player.full_name },
        },
        { status: 200 }
      );
    }

    // 3. Calculate week and day
    const planStartDate = new Date(plan.start_date + "T00:00:00Z");
    const todayDate = new Date(today + "T00:00:00Z");
    const daysDiff = Math.floor((todayDate.getTime() - planStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.max(1, Math.floor(daysDiff / 7) + 1);
    const dayOfWeek = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long" });
    const dayOfWeekNum = (todayDate.getUTCDay() + 6) % 7 + 1; // ISO: 1=Mon, 7=Sun

    // 4. Get today's readiness
    const { data: readinessEntry, error: readinessErr } = await sb
      .from("readiness_entries")
      .select("total_score")
      .eq("player_id", playerId)
      .eq("entry_date", today)
      .maybeSingle();

    if (readinessErr) throw new Error(readinessErr.message);

    const readinessZone = getZone(readinessEntry?.total_score ?? null);

    // 5. Get sessions for this week/day
    const { data: sessions, error: sessionsErr } = await sb
      .from("individual_training_sessions")
      .select("id, session_name, session_type, estimated_duration_min")
      .eq("plan_id", plan.id)
      .eq("week_number", weekNumber)
      .eq("day_of_week", dayOfWeekNum)
      .order("sort_order");

    if (sessionsErr) throw new Error(sessionsErr.message);

    // 6. Get player 1RM maxes
    const { data: maxes, error: maxesErr } = await sb
      .from("player_exercise_maxes")
      .select("exercise_id, estimated_1rm")
      .eq("player_id", playerId)
      .order("tested_date", { ascending: false });

    if (maxesErr) throw new Error(maxesErr.message);

    const exerciseMaxesMap = new Map<string, number>();
    maxes?.forEach((m) => {
      if (!exerciseMaxesMap.has(m.exercise_id)) {
        exerciseMaxesMap.set(m.exercise_id, m.estimated_1rm);
      }
    });

    // 7. For each session, get prescriptions and adjust
    const adjustedSessions = await Promise.all(
      (sessions || []).map(async (session) => {
        const { data: prescriptions, error: rxErr } = await sb
          .from("individual_training_prescriptions")
          .select(
            `id, exercise_id, sort_order, sets, reps, load_type, load_value, rpe_target, tempo,
             rest_seconds, duration_min, hr_zone_target, pace_target, work_seconds, rest_work_seconds,
             interval_count, notes, exercise_library(name, name_is, exercise_type)`
          )
          .eq("session_id", session.id)
          .order("sort_order");

        if (rxErr) throw new Error(rxErr.message);

        const adjustedRx = (prescriptions || []).map((rx: any) => {
          const exLib = rx.exercise_library;
          const prescription: Prescription = {
            id: rx.id,
            exercise_id: rx.exercise_id,
            exercise_name: exLib?.name ?? "",
            exercise_name_is: exLib?.name_is ?? null,
            exercise_type: exLib?.exercise_type ?? "",
            sort_order: rx.sort_order,
            sets: rx.sets,
            reps: rx.reps,
            load_type: rx.load_type,
            load_value: rx.load_value,
            rpe_target: rx.rpe_target,
            tempo: rx.tempo,
            rest_seconds: rx.rest_seconds,
            duration_min: rx.duration_min,
            hr_zone_target: rx.hr_zone_target,
            pace_target: rx.pace_target,
            work_seconds: rx.work_seconds,
            rest_work_seconds: rx.rest_work_seconds,
            interval_count: rx.interval_count,
            notes: rx.notes,
          };

          return adjustPrescriptionForReadiness(prescription, readinessZone, plan, exerciseMaxesMap);
        });

        // Determine session adjustment
        let sessionAdjustment = "none";
        if (plan.readiness_enabled) {
          if (readinessZone === "yellow") {
            sessionAdjustment = plan.readiness_red_action === "deload" ? "deload" : "none";
          } else if (readinessZone === "red") {
            sessionAdjustment = plan.readiness_red_action;
          }
        }

        return {
          id: session.id,
          name: session.session_name,
          type: session.session_type,
          estimated_duration_min: session.estimated_duration_min,
          adjustment: sessionAdjustment,
          prescriptions: adjustedRx,
        };
      })
    );

    return NextResponse.json(
      {
        player: { id: player.id, name: player.full_name, team_id: player.team_id },
        plan: {
          id: plan.id,
          name: plan.plan_name,
          type: plan.plan_type,
          start_date: plan.start_date,
          readiness_enabled: plan.readiness_enabled,
        },
        date: today,
        day_of_week: dayOfWeek,
        week_number: weekNumber,
        readiness: {
          total_score: readinessEntry?.total_score ?? null,
          zone: readinessZone,
          snapshot_time: new Date().toISOString(),
        },
        sessions: adjustedSessions,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
