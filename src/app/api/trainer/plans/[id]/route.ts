import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── helpers ─────────────────────────────────────────── */

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

interface AuthProfile {
  role: string;
  team_id: string;
}

async function requireTrainerContext(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdmin();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const userId = userRes.user.id;

  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userId)
    .maybeSingle();

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF"))
    throw new Error("Forbidden");

  // Accept team_id from query string (frontend sends it when switching teams)
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("team_id");
  const effectiveTeamId = requestedTeamId || profile?.team_id;
  if (!effectiveTeamId) throw new Error("No team context");

  // Verify the coach has access to this team via coach_teams
  if (requestedTeamId && requestedTeamId !== profile?.team_id) {
    const { data: access } = await sb
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", requestedTeamId)
      .maybeSingle();
    if (!access) throw new Error("Forbidden: no access to this team");
  }

  const { data: team } = await sb
    .from("teams")
    .select("id, name, team_type, sport")
    .eq("id", effectiveTeamId)
    .maybeSingle();

  return {
    userId,
    teamId: effectiveTeamId,
    teamType: team?.team_type ?? "club_team",
    teamName: team?.name ?? "",
  };
}

/* ── GET /api/trainer/plans/[id] ──────────────────────── */
// Get plan with sessions and prescriptions

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const { id } = await params;

    // Get plan
    const { data: plan, error: planErr } = await sb
      .from("individual_training_plans")
      .select(
        "id, player_id, plan_name, plan_type, status, start_date, end_date, readiness_enabled, readiness_red_action, readiness_yellow_action, deload_volume_pct, deload_intensity_pct, notes, created_at, updated_at, players(full_name)"
      )
      .eq("id", id)
      .eq("team_id", ctx.teamId)
      .single();

    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error("Not found");

    // Get sessions with prescriptions
    const { data: sessions, error: sessErr } = await sb
      .from("individual_training_sessions")
      .select(
        "id, week_number, day_of_week, session_name, session_type, estimated_duration_min, notes, sort_order, individual_training_prescriptions(id, exercise_id, sets, reps, load_type, load_value, rpe_target, tempo, rest_seconds, duration_min, hr_zone_target, pace_target, work_seconds, rest_work_seconds, interval_count, notes, sort_order, exercise_library(name, name_is, exercise_type, category))"
      )
      .eq("plan_id", id)
      .order("week_number")
      .order("sort_order");

    if (sessErr) throw new Error(sessErr.message);

    return NextResponse.json({
      plan: {
        id: plan.id,
        playerId: plan.player_id,
        playerName: (plan as any).players?.full_name || "Unknown",
        planName: plan.plan_name,
        planType: plan.plan_type,
        status: plan.status,
        startDate: plan.start_date,
        endDate: plan.end_date,
        readinessEnabled: plan.readiness_enabled,
        readinessRedAction: plan.readiness_red_action,
        readinessYellowAction: plan.readiness_yellow_action,
        deloadVolumePct: plan.deload_volume_pct,
        deloadIntensityPct: plan.deload_intensity_pct,
        notes: plan.notes,
        createdAt: plan.created_at,
        updatedAt: plan.updated_at,
      },
      sessions: (sessions || []).map((s: any) => ({
        id: s.id,
        weekNumber: s.week_number,
        dayOfWeek: s.day_of_week,
        sessionName: s.session_name,
        sessionType: s.session_type,
        estimatedDurationMin: s.estimated_duration_min,
        notes: s.notes,
        sortOrder: s.sort_order,
        prescriptions: (s.individual_training_prescriptions || []).map((rx: any) => ({
          id: rx.id,
          exerciseId: rx.exercise_id,
          exerciseName: rx.exercise_library?.name,
          exerciseNameIs: rx.exercise_library?.name_is,
          exerciseType: rx.exercise_library?.exercise_type,
          category: rx.exercise_library?.category,
          sets: rx.sets,
          reps: rx.reps,
          loadType: rx.load_type,
          loadValue: rx.load_value,
          rpeTarget: rx.rpe_target,
          tempo: rx.tempo,
          restSeconds: rx.rest_seconds,
          durationMin: rx.duration_min,
          hrZoneTarget: rx.hr_zone_target,
          paceTarget: rx.pace_target,
          workSeconds: rx.work_seconds,
          restWorkSeconds: rx.rest_work_seconds,
          intervalCount: rx.interval_count,
          notes: rx.notes,
          sortOrder: rx.sort_order,
        })),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── PUT /api/trainer/plans/[id] ───────────────────────── */
// Update plan (tweak exercises)

interface ExerciseTweak {
  prescriptionId: string;
  sets?: number;
  reps?: string;
  loadValue?: number;
  rpeTarget?: number;
  tempo?: string;
  restSeconds?: number;
  notes?: string;
}

interface UpdatePlanBody {
  planName?: string;
  readinessEnabled?: boolean;
  readinessRedAction?: "skip" | "recovery" | "deload";
  readinessYellowAction?: "normal" | "deload";
  deloadVolumePct?: number;
  deloadIntensityPct?: number;
  notes?: string;
  tweaks?: ExerciseTweak[];
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const { id } = await params;

    // Verify plan exists and belongs to trainer's team
    const { data: existing, error: fetchErr } = await sb
      .from("individual_training_plans")
      .select("team_id")
      .eq("id", id)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Not found");
    if (existing.team_id !== ctx.teamId) throw new Error("Forbidden");

    const body: UpdatePlanBody = await req.json();

    // Update plan fields
    const updates: Record<string, unknown> = {};
    if (body.planName !== undefined) updates.plan_name = body.planName;
    if (body.readinessEnabled !== undefined) updates.readiness_enabled = body.readinessEnabled;
    if (body.readinessRedAction !== undefined) updates.readiness_red_action = body.readinessRedAction;
    if (body.readinessYellowAction !== undefined) updates.readiness_yellow_action = body.readinessYellowAction;
    if (body.deloadVolumePct !== undefined) updates.deload_volume_pct = body.deloadVolumePct;
    if (body.deloadIntensityPct !== undefined) updates.deload_intensity_pct = body.deloadIntensityPct;
    if (body.notes !== undefined) updates.notes = body.notes;

    if (Object.keys(updates).length > 0) {
      const { error: planErr } = await sb
        .from("individual_training_plans")
        .update(updates)
        .eq("id", id);

      if (planErr) throw new Error(planErr.message);
    }

    // Update prescriptions (exercise tweaks)
    if (body.tweaks && body.tweaks.length > 0) {
      for (const tweak of body.tweaks) {
        const rxUpdates: Record<string, unknown> = {};
        if (tweak.sets !== undefined) rxUpdates.sets = tweak.sets;
        if (tweak.reps !== undefined) rxUpdates.reps = tweak.reps;
        if (tweak.loadValue !== undefined) rxUpdates.load_value = tweak.loadValue;
        if (tweak.rpeTarget !== undefined) rxUpdates.rpe_target = tweak.rpeTarget;
        if (tweak.tempo !== undefined) rxUpdates.tempo = tweak.tempo;
        if (tweak.restSeconds !== undefined) rxUpdates.rest_seconds = tweak.restSeconds;
        if (tweak.notes !== undefined) rxUpdates.notes = tweak.notes;

        if (Object.keys(rxUpdates).length > 0) {
          const { error: rxErr } = await sb
            .from("individual_training_prescriptions")
            .update(rxUpdates)
            .eq("id", tweak.prescriptionId);

          if (rxErr) throw new Error(rxErr.message);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── DELETE /api/trainer/plans/[id] ────────────────────── */
// Archive plan (set status='archived')

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const { id } = await params;

    // Verify plan exists and belongs to trainer's team
    const { data: existing, error: fetchErr } = await sb
      .from("individual_training_plans")
      .select("team_id")
      .eq("id", id)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Not found");
    if (existing.team_id !== ctx.teamId) throw new Error("Forbidden");

    // Archive instead of delete
    const { error: err } = await sb
      .from("individual_training_plans")
      .update({ status: "archived" })
      .eq("id", id);

    if (err) throw new Error(err.message);

    return NextResponse.json({ success: true, status: "archived" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
