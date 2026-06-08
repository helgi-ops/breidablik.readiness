import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adaptStructure, clampFreq, type PlanWeekLike } from "@/lib/trainer/sessionFrequency";

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

/* ── GET /api/trainer/plans ───────────────────────────── */
// List all individual plans the trainer created

export async function GET(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    const { data: plans, error: err } = await sb
      .from("individual_training_plans")
      .select(
        "id, player_id, plan_name, plan_type, status, start_date, end_date, readiness_enabled, deload_volume_pct, deload_intensity_pct, created_at, updated_at, players(full_name)"
      )
      .eq("team_id", ctx.teamId)
      .order("created_at", { ascending: false });

    if (err) throw new Error(err.message);

    // Flatten player data
    const formattedPlans = (plans || []).map((p: any) => ({
      id: p.id,
      playerId: p.player_id,
      playerName: p.players?.full_name || "Unknown",
      planName: p.plan_name,
      planType: p.plan_type,
      status: p.status,
      startDate: p.start_date,
      endDate: p.end_date,
      readinessEnabled: p.readiness_enabled,
      deloadVolumePct: p.deload_volume_pct,
      deloadIntensityPct: p.deload_intensity_pct,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return NextResponse.json({
      plans: formattedPlans,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── POST /api/trainer/plans ──────────────────────────── */
// Assign a template to a client (copy structure to individual plan)

interface ExerciseTweak {
  exerciseId: string;
  sets?: number;
  reps?: string;
  loadValue?: number;
  rpeTarget?: number;
}

interface SessionTweak {
  sessionIndex: number;
  tweaks: ExerciseTweak[];
}

/** A prescribed exercise inside an authored template session. Loosely typed
 *  (the structure JSON is author-shaped) but enough to flow grouping through. */
type RxExercise = {
  exerciseId?: string | null;
  sortOrder?: number;
  _groupLabel?: string | null;
  _method?: string | null;
  [k: string]: unknown;
};
type RxGroup = { label?: string | null; exercises?: RxExercise[] };

interface AssignTemplateBody {
  templateId: string;
  /** The client/player to assign to. The PlanAssigner UI historically sends
   *  this as `clientId`; we accept either so the assign actually persists. */
  playerId?: string;
  clientId?: string;
  startDate: string; // ISO date
  tweaks?: SessionTweak[];
  /** Optional per-client weekly frequency override (1–6). When omitted, or equal
   *  to the template's authored frequency, the structure is copied unchanged. */
  sessionsPerWeek?: number;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    const body: AssignTemplateBody = await req.json();
    // The PlanAssigner UI sends `clientId`; older callers send `playerId`.
    // Accept either so the assign reliably persists instead of 400-ing.
    const playerId = body.playerId ?? body.clientId;

    if (!body.templateId || !playerId || !body.startDate) {
      return NextResponse.json(
        { error: "Missing required fields: templateId, clientId/playerId, startDate" },
        { status: 400 }
      );
    }

    // Verify template exists and belongs to trainer's team
    const { data: template, error: templateErr } = await sb
      .from("training_plan_templates")
      .select("id, name, plan_type, duration_weeks, sessions_per_week, readiness_enabled, deload_volume_pct, deload_intensity_pct, structure")
      .eq("id", body.templateId)
      .eq("team_id", ctx.teamId)
      .single();

    if (templateErr) throw new Error(templateErr.message);
    if (!template) throw new Error("Template not found");

    // Verify player exists and is on trainer's team
    const { data: player, error: playerErr } = await sb
      .from("players")
      .select("id, full_name, team_id")
      .eq("id", playerId)
      .eq("team_id", ctx.teamId)
      .single();

    if (playerErr) throw new Error(playerErr.message);
    if (!player) throw new Error("Player not found");

    // Create individual training plan
    const endDate = new Date(body.startDate);
    endDate.setDate(endDate.getDate() + (template.duration_weeks * 7 - 1));

    const { data: plan, error: planErr } = await sb
      .from("individual_training_plans")
      .insert([
        {
          player_id: playerId,
          team_id: ctx.teamId,
          created_by: ctx.userId,
          plan_name: template.name,
          plan_type: template.plan_type,
          start_date: body.startDate,
          end_date: endDate.toISOString().split("T")[0],
          status: "active",
          readiness_enabled: template.readiness_enabled,
          deload_volume_pct: template.deload_volume_pct,
          deload_intensity_pct: template.deload_intensity_pct,
          notes: `From template: ${template.name}`,
        },
      ])
      .select("id")
      .single();

    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error("Failed to create plan");

    // Copy structure: weeks → sessions → prescriptions
    const structure = Array.isArray(template.structure) ? (template.structure as any[]) : [];

    // Per-client weekly-frequency override. The template is authored at a fixed
    // frequency; if the trainer picked a different one in the assign dialog, adapt
    // each week's sessions (cycle/truncate + re-spread onto real weekdays) BEFORE
    // copying. Unchanged frequency → copy the authored structure verbatim.
    const authoredFreq =
      Number(template.sessions_per_week) || (structure[0]?.sessions?.length ?? 0);
    const requestedFreq =
      typeof body.sessionsPerWeek === "number" ? clampFreq(body.sessionsPerWeek) : null;
    const effectiveStructure =
      requestedFreq && requestedFreq !== authoredFreq
        ? adaptStructure(structure as PlanWeekLike[], requestedFreq)
        : structure;

    const tweakMap = new Map<number, SessionTweak>();
    // Tolerate both shapes: array of SessionTweak (legacy) and the object map
    // the PlanAssigner UI currently sends.
    if (Array.isArray(body.tweaks)) {
      body.tweaks.forEach((t) => tweakMap.set(t.sessionIndex, t));
    }

    for (let weekIdx = 0; weekIdx < effectiveStructure.length; weekIdx++) {
      const week = effectiveStructure[weekIdx];
      const weekNumber = week.week || weekIdx + 1;

      for (const session of week.sessions || []) {
        const { data: newSession, error: sessionErr } = await sb
          .from("individual_training_sessions")
          .insert([
            {
              plan_id: plan.id,
              week_number: weekNumber,
              day_of_week: session.dayOfWeek,
              session_name: session.name || "Session",
              session_type: session.type || "strength",
              estimated_duration_min: session.estimatedDurationMin || null,
              sort_order: 0,
              notes: session.notes || null,
            },
          ])
          .select("id")
          .single();

        if (sessionErr) throw new Error(sessionErr.message);
        if (!newSession) throw new Error("Failed to create session");

        // Collect exercises from both new (groups) and old (exercises) format.
        // Carry the authored group label + session method onto each exercise so
        // the client surface can show whether it's standalone vs part of a
        // superset / triset / giant set / contrast / french-contrast block.
        const sessionMethod: string | null = session.method ?? null;
        const groups = session.groups as RxGroup[] | undefined;
        const flatExercises = session.exercises as RxExercise[] | undefined;
        const allExercises: RxExercise[] = groups
          ? groups.flatMap((g) =>
              (g.exercises || []).map((ex) => ({ ...ex, _groupLabel: g.label ?? null, _method: sessionMethod })),
            )
          : (flatExercises || []).map((ex) => ({ ...ex, _groupLabel: null, _method: sessionMethod }));

        // Add prescriptions for this session
        for (const exercise of allExercises) {
          if (!exercise.exerciseId) continue; // Skip empty slots
          const tweak = tweakMap.get(weekIdx) || null;
          const exerciseTweak = tweak?.tweaks.find(
            (t: any) => t.exerciseId === exercise.exerciseId
          );

          const { error: rxErr } = await sb
            .from("individual_training_prescriptions")
            .insert([
              {
                session_id: newSession.id,
                exercise_id: exercise.exerciseId,
                sort_order: exercise.sortOrder || 0,
                sets: exerciseTweak?.sets ?? exercise.sets,
                reps: exerciseTweak?.reps ?? exercise.reps,
                load_type: exercise.loadType,
                load_value: exerciseTweak?.loadValue ?? exercise.loadValue,
                rpe_target: exerciseTweak?.rpeTarget ?? exercise.rpeTarget,
                tempo: exercise.tempo,
                rest_seconds: exercise.restSeconds,
                duration_min: exercise.durationMin || null,
                hr_zone_target: exercise.hrZoneTarget || null,
                pace_target: exercise.paceTarget || null,
                work_seconds: exercise.workSeconds || null,
                rest_work_seconds: exercise.restWorkSeconds || null,
                interval_count: exercise.intervalCount || null,
                notes: exercise.notes || null,
                group_label: exercise._groupLabel ?? null,
                method: exercise._method ?? null,
              },
            ]);

          if (rxErr) throw new Error(rxErr.message);
        }
      }
    }

    return NextResponse.json(
      {
        plan: {
          id: plan.id,
          playerId: playerId,
          playerName: player.full_name,
          planName: template.name,
          planType: template.plan_type,
          startDate: body.startDate,
          status: "active",
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message.includes("Missing required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
