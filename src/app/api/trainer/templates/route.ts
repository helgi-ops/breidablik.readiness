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

/* ── GET /api/trainer/templates ───────────────────────── */
// List all templates for the trainer's team

export async function GET(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    // Single template by ID
    const url = new URL(req.url);
    const templateId = url.searchParams.get("id");

    if (templateId) {
      const { data: t, error: err } = await sb
        .from("training_plan_templates")
        .select(
          "id, name, plan_type, duration_weeks, sessions_per_week, readiness_enabled, deload_volume_pct, deload_intensity_pct, recovery_volume_pct, recovery_intensity_pct, structure, notes, created_at, updated_at"
        )
        .eq("id", templateId)
        .eq("team_id", ctx.teamId)
        .single();

      if (err) throw new Error(err.message);
      return NextResponse.json({
        template: { ...t, plan_name: t.name },
      });
    }

    // List all templates
    const { data: templates, error: err } = await sb
      .from("training_plan_templates")
      .select(
        "id, name, plan_type, duration_weeks, sessions_per_week, readiness_enabled, deload_volume_pct, deload_intensity_pct, recovery_volume_pct, recovery_intensity_pct, notes, created_at, updated_at"
      )
      .eq("team_id", ctx.teamId)
      .order("created_at", { ascending: false });

    if (err) throw new Error(err.message);

    return NextResponse.json({
      templates: (templates || []).map((t: any) => ({
        ...t,
        plan_name: t.name,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── POST /api/trainer/templates ──────────────────────── */
// Create a new template

interface CreateTemplateBody {
  name?: string;
  planName?: string;
  planType: "strength" | "endurance" | "mixed";
  durationWeeks: number;
  sessionsPerWeek: number;
  readinessEnabled?: boolean;
  deloadPercentages?: number[];
  recoveryPercentages?: number[];
  structure?: Record<string, unknown>[];
  notes?: string;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    const body: CreateTemplateBody = await req.json();

    const templateName = body.name || body.planName;
    if (!templateName || !body.planType || !body.durationWeeks || !body.sessionsPerWeek) {
      return NextResponse.json(
        { error: "Missing required fields: name, planType, durationWeeks, sessionsPerWeek" },
        { status: 400 }
      );
    }

    const { data: template, error: err } = await sb
      .from("training_plan_templates")
      .insert([
        {
          team_id: ctx.teamId,
          created_by: ctx.userId,
          name: templateName,
          plan_type: body.planType,
          duration_weeks: body.durationWeeks,
          sessions_per_week: body.sessionsPerWeek,
          readiness_enabled: body.readinessEnabled ?? true,
          deload_volume_pct: body.deloadPercentages?.[0] ?? 70,
          deload_intensity_pct: 85,
          recovery_volume_pct: body.recoveryPercentages?.[0] ?? 80,
          recovery_intensity_pct: 85,
          structure: body.structure ?? [],
          notes: body.notes ?? null,
        },
      ])
      .select(
        "id, name, plan_type, duration_weeks, sessions_per_week, readiness_enabled, deload_volume_pct, deload_intensity_pct, structure, notes, created_at, updated_at"
      )
      .single();

    if (err) throw new Error(err.message);

    return NextResponse.json(
      { template: { ...template, plan_name: template.name } },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message.includes("Missing required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── PUT /api/trainer/templates?id=... ──────────────── */

export async function PUT(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    const url = new URL(req.url);
    const templateId = url.searchParams.get("id");
    if (!templateId) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.name || body.planName) updates.name = body.name || body.planName;
    if (body.planType) updates.plan_type = body.planType;
    if (body.durationWeeks) updates.duration_weeks = body.durationWeeks;
    if (body.sessionsPerWeek) updates.sessions_per_week = body.sessionsPerWeek;
    if (body.readinessEnabled !== undefined) updates.readiness_enabled = body.readinessEnabled;
    if (body.structure) updates.structure = body.structure;
    if (body.notes !== undefined) updates.notes = body.notes;
    updates.updated_at = new Date().toISOString();

    const { data: template, error: err } = await sb
      .from("training_plan_templates")
      .update(updates)
      .eq("id", templateId)
      .eq("team_id", ctx.teamId)
      .select("id, name, plan_type, duration_weeks, sessions_per_week, structure, created_at, updated_at")
      .single();

    if (err) throw new Error(err.message);

    return NextResponse.json({
      template: { ...template, plan_name: template.name },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── DELETE /api/trainer/templates?id=... ────────────── */

export async function DELETE(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    const url = new URL(req.url);
    const templateId = url.searchParams.get("id");
    if (!templateId) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const { error: err } = await sb
      .from("training_plan_templates")
      .delete()
      .eq("id", templateId)
      .eq("team_id", ctx.teamId);

    if (err) throw new Error(err.message);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
