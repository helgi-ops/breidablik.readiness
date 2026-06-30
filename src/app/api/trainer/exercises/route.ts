import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

/* ── helpers ─────────────────────────────────────────── */

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
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
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    const url = new URL(req.url);
    const search = url.searchParams.get("search");
    const type = url.searchParams.get("type"); // "strength" | "endurance"
    const category = url.searchParams.get("category");
    // Coach-readable family: squat | hinge | push | pull | core | carry
    const family = url.searchParams.get("family");
    // Precise Science-for-Sport pattern (e.g. "horizontal_push"); also accepts
    // a legacy coarse value via the family fallback below.
    const pattern = url.searchParams.get("pattern");
    const bilateral = url.searchParams.get("bilateral"); // "true" | "false"

    const FAMILIES = ["squat", "hinge", "push", "pull", "core", "carry"];

    // Only the global/system library (owner_team_id IS NULL) plus this team's
    // own custom exercises — never another team's custom exercises.
    const onlyMine = url.searchParams.get("owned") === "true";
    let query = sb
      .from("exercise_library")
      .select(
        "id, name, name_is, exercise_type, category, muscle_groups, equipment, description, description_is, video_url, sport, is_bilateral, movement_pattern, movement_family, owner_team_id, created_at, updated_at"
      );
    if (onlyMine) {
      query = query.eq("owner_team_id", ctx.teamId);
    } else {
      query = query.or(`owner_team_id.is.null,owner_team_id.eq.${ctx.teamId}`);
    }

    // Apply filters
    if (type && ["strength", "endurance"].includes(type)) {
      query = query.eq("exercise_type", type);
    }

    if (category) {
      query = query.eq("category", category);
    }

    // Browse by coach family. Legacy callers may still pass a family value via
    // the `pattern` param (push/pull/hinge/squat/carry) — treat those as family.
    const familyFilter = family ?? (pattern && FAMILIES.includes(pattern) ? pattern : null);
    if (familyFilter && FAMILIES.includes(familyFilter)) {
      query = query.eq("movement_family", familyFilter);
    } else if (pattern) {
      // A precise SFS pattern was requested.
      query = query.eq("movement_pattern", pattern);
    }

    if (bilateral === "true") {
      query = query.eq("is_bilateral", true);
    } else if (bilateral === "false") {
      query = query.eq("is_bilateral", false);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,name_is.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data: exercises, error: err } = await query.order("name").limit(300);

    if (err) throw new Error(err.message);

    // `editable` = this is the team's own custom exercise; system exercises are
    // read-only (the trainer can use them but not change them).
    const rows = ((exercises ?? []) as Array<{ owner_team_id: string | null }>).map((e) => ({
      ...e,
      editable: e.owner_team_id === ctx.teamId,
    }));

    return NextResponse.json({ exercises: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/* ── POST /api/trainer/exercises ──────────────────────── */
// Create a custom exercise owned by the trainer's team.

const ALLOWED_TYPES = ["strength", "endurance"];
const ALLOWED_FAMILIES = ["squat", "hinge", "push", "pull", "core", "carry"];
// exercise_library.category has a CHECK constraint — only these are valid.
const ALLOWED_CATEGORIES = ["compound", "isolation", "olympic_lift", "plyometric", "core", "sprint", "tempo", "interval", "continuous"];

export async function POST(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
    const exercise_type = ALLOWED_TYPES.includes(String(body.exercise_type)) ? String(body.exercise_type) : "strength";
    const movement_family = ALLOWED_FAMILIES.includes(String(body.movement_family)) ? String(body.movement_family) : null;
    // category is NOT NULL + CHECK-constrained — validate or default by type.
    const category = ALLOWED_CATEGORIES.includes(String(body.category))
      ? String(body.category)
      : (exercise_type === "endurance" ? "continuous" : "compound");

    const { data, error } = await sb
      .from("exercise_library")
      .insert({
        name,
        name_is: str(body.name_is),
        exercise_type,
        category,
        equipment: str(body.equipment),
        description: str(body.description),
        description_is: str(body.description_is),
        video_url: str(body.video_url),
        movement_family,
        movement_pattern: str(body.movement_pattern),
        is_bilateral: typeof body.is_bilateral === "boolean" ? body.is_bilateral : true,
        owner_team_id: ctx.teamId,
      })
      .select("id, name")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, exercise: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
