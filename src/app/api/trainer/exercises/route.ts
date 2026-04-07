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

/* ── GET /api/trainer/exercises ───────────────────────── */
// List exercises from exercise_library with filtering

export async function GET(req: Request) {
  try {
    await requireTrainerContext(req);
    const sb = getAdmin();

    const url = new URL(req.url);
    const search = url.searchParams.get("search");
    const type = url.searchParams.get("type"); // "strength" | "endurance"
    const category = url.searchParams.get("category");

    let query = sb
      .from("exercise_library")
      .select(
        "id, name, name_is, exercise_type, category, muscle_groups, equipment, description, video_url, sport, is_bilateral, created_at, updated_at"
      );

    // Apply filters
    if (type && ["strength", "endurance"].includes(type)) {
      query = query.eq("exercise_type", type);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,name_is.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data: exercises, error: err } = await query.order("name");

    if (err) throw new Error(err.message);

    return NextResponse.json({
      exercises: exercises || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
