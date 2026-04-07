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

/* ── GET /api/trainer/templates/[id] ──────────────────── */
// Get one template by id

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const { id } = await params;

    const { data: template, error: err } = await sb
      .from("training_plan_templates")
      .select(
        "id, plan_name, plan_type, duration_weeks, sessions_per_week, readiness_enabled, readiness_red_action, readiness_yellow_action, deload_volume_pct, deload_intensity_pct, structure, notes, is_public, created_at, updated_at"
      )
      .eq("id", id)
      .eq("team_id", ctx.teamId)
      .single();

    if (err) throw new Error(err.message);
    if (!template) throw new Error("Not found");

    return NextResponse.json({ template });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── PUT /api/trainer/templates/[id] ───────────────────── */
// Update a template

interface UpdateTemplateBody {
  planName?: string;
  planType?: "strength" | "endurance" | "mixed";
  durationWeeks?: number;
  sessionsPerWeek?: number;
  readinessEnabled?: boolean;
  readinessRedAction?: "skip" | "recovery" | "deload";
  readinessYellowAction?: "normal" | "deload";
  deloadVolumePct?: number;
  deloadIntensityPct?: number;
  structure?: Record<string, unknown>[];
  notes?: string;
  isPublic?: boolean;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const { id } = await params;

    // Verify ownership
    const { data: existing, error: fetchErr } = await sb
      .from("training_plan_templates")
      .select("created_by, team_id")
      .eq("id", id)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Not found");
    if (existing.team_id !== ctx.teamId) throw new Error("Forbidden");

    const body: UpdateTemplateBody = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.planName !== undefined) updates.plan_name = body.planName;
    if (body.planType !== undefined) updates.plan_type = body.planType;
    if (body.durationWeeks !== undefined) updates.duration_weeks = body.durationWeeks;
    if (body.sessionsPerWeek !== undefined) updates.sessions_per_week = body.sessionsPerWeek;
    if (body.readinessEnabled !== undefined) updates.readiness_enabled = body.readinessEnabled;
    if (body.readinessRedAction !== undefined) updates.readiness_red_action = body.readinessRedAction;
    if (body.readinessYellowAction !== undefined) updates.readiness_yellow_action = body.readinessYellowAction;
    if (body.deloadVolumePct !== undefined) updates.deload_volume_pct = body.deloadVolumePct;
    if (body.deloadIntensityPct !== undefined) updates.deload_intensity_pct = body.deloadIntensityPct;
    if (body.structure !== undefined) updates.structure = body.structure;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.isPublic !== undefined) updates.is_public = body.isPublic;

    const { data: template, error: err } = await sb
      .from("training_plan_templates")
      .update(updates)
      .eq("id", id)
      .select(
        "id, plan_name, plan_type, duration_weeks, sessions_per_week, readiness_enabled, readiness_red_action, readiness_yellow_action, deload_volume_pct, deload_intensity_pct, structure, notes, is_public, created_at, updated_at"
      )
      .single();

    if (err) throw new Error(err.message);

    return NextResponse.json({ template });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── DELETE /api/trainer/templates/[id] ────────────────── */
// Delete a template

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const { id } = await params;

    // Verify ownership
    const { data: existing, error: fetchErr } = await sb
      .from("training_plan_templates")
      .select("created_by, team_id")
      .eq("id", id)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Not found");
    if (existing.team_id !== ctx.teamId) throw new Error("Forbidden");

    const { error: err } = await sb
      .from("training_plan_templates")
      .delete()
      .eq("id", id);

    if (err) throw new Error(err.message);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
