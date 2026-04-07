import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

/* ── type definitions ──────────────────────────────────── */

interface LogEntryPayload {
  prescription_id: string;
  sets_completed: number | null;
  reps_completed: string | null; // e.g. "8,8,7,6"
  load_used: number | null;
  rpe_actual: number | null;
  notes?: string | null;
}

interface LogEntryResponse {
  id: string;
  prescription_id: string;
  player_id: string;
  log_date: string;
  actual_sets: number | null;
  actual_reps: string | null;
  actual_load_kg: number | null;
  actual_rpe: number | null;
  readiness_zone: string | null;
  adjustment_applied: string | null;
  notes: string | null;
  completed: boolean;
  created_at: string;
}

/* ── helper function: get readiness zone for today ──────────── */

function getZone(totalScore: number | null): "green" | "yellow" | "red" {
  if (totalScore == null) return "green";
  if (totalScore >= 18) return "green";
  if (totalScore >= 13) return "yellow";
  return "red";
}

/* ── POST /api/player/training-log ─────────────────────────────── */
// Log a completed exercise

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const payload: LogEntryPayload = await req.json();

    // Validate required fields
    if (!payload.prescription_id) {
      return NextResponse.json({ error: "prescription_id is required" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // 1. Get the prescription to find plan_id and exercise_id
    const { data: prescription, error: rxErr } = await sb
      .from("individual_training_prescriptions")
      .select("id, session_id, exercise_id")
      .eq("id", payload.prescription_id)
      .maybeSingle();

    if (rxErr) throw new Error(rxErr.message);
    if (!prescription) {
      return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
    }

    // 2. Get the session to find plan_id
    const { data: session, error: sessErr } = await sb
      .from("individual_training_sessions")
      .select("plan_id")
      .eq("id", prescription.session_id)
      .maybeSingle();

    if (sessErr) throw new Error(sessErr.message);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // 3. Get today's readiness
    const { data: readinessEntry, error: readinessErr } = await sb
      .from("readiness_entries")
      .select("total_score")
      .eq("player_id", playerId)
      .eq("entry_date", today)
      .maybeSingle();

    if (readinessErr) throw new Error(readinessErr.message);

    const readinessZone = getZone(readinessEntry?.total_score ?? null);

    // 4. Get player's team_id
    const { data: player, error: playerErr } = await sb
      .from("players")
      .select("team_id")
      .eq("id", playerId)
      .maybeSingle();

    if (playerErr) throw new Error(playerErr.message);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // 5. Insert into training log
    const { data: logEntry, error: logErr } = await sb
      .from("individual_training_log")
      .insert({
        prescription_id: payload.prescription_id,
        player_id: playerId,
        team_id: player.team_id,
        plan_id: session.plan_id,
        exercise_id: prescription.exercise_id,
        log_date: today,
        actual_sets: payload.sets_completed,
        actual_reps: payload.reps_completed,
        actual_load_kg: payload.load_used,
        actual_rpe: payload.rpe_actual,
        readiness_zone: readinessZone,
        adjustment_applied: "none", // This would be computed from plan settings if needed
        notes: payload.notes || null,
        completed: true,
      })
      .select()
      .single();

    if (logErr) throw new Error(logErr.message);

    const response: LogEntryResponse = {
      id: logEntry.id,
      prescription_id: logEntry.prescription_id,
      player_id: logEntry.player_id,
      log_date: logEntry.log_date,
      actual_sets: logEntry.actual_sets,
      actual_reps: logEntry.actual_reps,
      actual_load_kg: logEntry.actual_load_kg,
      actual_rpe: logEntry.actual_rpe,
      readiness_zone: logEntry.readiness_zone,
      adjustment_applied: logEntry.adjustment_applied,
      notes: logEntry.notes,
      completed: logEntry.completed,
      created_at: logEntry.created_at,
    };

    return NextResponse.json({ ok: true, log_entry: response }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── GET /api/player/training-log ──────────────────────────────── */
// Get recent training log entries for this player (last 7 days)

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromDate = sevenDaysAgo.toISOString().split("T")[0];

    // Get log entries for the past 7 days, joined with exercise info
    const { data: logEntries, error: logErr } = await sb
      .from("individual_training_log")
      .select(
        `id, prescription_id, exercise_id, log_date, actual_sets, actual_reps, actual_load_kg,
         actual_rpe, session_rpe, session_duration_min, readiness_zone, adjustment_applied,
         completed, skipped, skip_reason, notes, created_at,
         individual_training_prescriptions(
           session_id,
           individual_training_sessions(session_name)
         ),
         exercise_library(name, name_is, exercise_type)`
      )
      .eq("player_id", playerId)
      .gte("log_date", fromDate)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (logErr) throw new Error(logErr.message);

    // Format response
    const formatted = (logEntries || []).map((entry: any) => ({
      id: entry.id,
      prescription_id: entry.prescription_id,
      exercise: {
        id: entry.exercise_id,
        name: entry.exercise_library?.name ?? "",
        name_is: entry.exercise_library?.name_is ?? null,
        type: entry.exercise_library?.exercise_type ?? "",
      },
      session_name: entry.individual_training_prescriptions?.individual_training_sessions?.session_name ?? "",
      log_date: entry.log_date,
      performance: {
        actual_sets: entry.actual_sets,
        actual_reps: entry.actual_reps,
        actual_load_kg: entry.actual_load_kg,
        actual_rpe: entry.actual_rpe,
        session_rpe: entry.session_rpe,
        session_duration_min: entry.session_duration_min,
      },
      readiness: {
        zone: entry.readiness_zone,
        adjustment_applied: entry.adjustment_applied,
      },
      status: {
        completed: entry.completed,
        skipped: entry.skipped,
        skip_reason: entry.skip_reason,
      },
      notes: entry.notes,
      created_at: entry.created_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        count: formatted.length,
        from_date: fromDate,
        to_date: today.toISOString().split("T")[0],
        log_entries: formatted,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
