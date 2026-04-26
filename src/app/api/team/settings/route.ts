import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type AuthProfile = { role: string; team_id: string | null };

async function requireCoachContext(req: Request): Promise<{ teamId: string; userId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id, userId: userRes.user.id };
}

/** GET /api/team/settings — Fetch team settings */
export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();

    const { data, error } = await sb
      .from("team_settings")
      .select("*")
      .eq("team_id", teamId)
      .maybeSingle();

    if (error) throw error;

    // Also fetch the team-level training mode default (ternary
    // auto/indoor/outdoor) which lives on the teams table directly
    // because it's read by the verdict pipeline alongside sport,
    // gps_provider, etc.
    const { data: teamRow } = await sb
      .from("teams")
      .select("training_mode_default")
      .eq("id", teamId)
      .maybeSingle();
    const trainingModeDefault =
      String((teamRow as { training_mode_default?: string } | null)?.training_mode_default ?? "auto");

    // Return defaults if no row exists yet
    const settings = data ?? {
      team_id: teamId,
      indoor_mode: false,
      sport_type: "football",
      notes: null,
      updated_at: null,
      updated_by: null,
    };

    return NextResponse.json({ ...settings, training_mode_default: trainingModeDefault });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** PATCH /api/team/settings — Update team settings (indoor_mode, notes) */
export async function PATCH(req: Request) {
  try {
    const { teamId, userId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const body = await req.json();

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    if (typeof body.indoor_mode === "boolean") {
      updates.indoor_mode = body.indoor_mode;
    }
    // training_mode_default lives on `teams` (not team_settings) since
    // the verdict pipeline reads it alongside sport / gps_provider /
    // team_type. We write it separately and keep the response shape
    // consistent with GET above.
    let updatedTrainingMode: string | null = null;
    if (body.training_mode_default === "auto" || body.training_mode_default === "indoor" || body.training_mode_default === "outdoor") {
      const { error: tmErr } = await sb
        .from("teams")
        .update({ training_mode_default: body.training_mode_default })
        .eq("id", teamId);
      if (tmErr) throw new Error(tmErr.message);
      updatedTrainingMode = body.training_mode_default;
    }
    if (body.sport_type === "football" || body.sport_type === "basketball") {
      updates.sport_type = body.sport_type;
      // Basketball teams are always indoor
      if (body.sport_type === "basketball") {
        updates.indoor_mode = true;
      }
    }
    if (typeof body.notes === "string" || body.notes === null) {
      updates.notes = body.notes;
    }

    // Catapult integration credentials
    if (typeof body.catapult_api_key === "string" || body.catapult_api_key === null) {
      updates.catapult_api_key = body.catapult_api_key;
    }
    if (typeof body.catapult_org_id === "string" || body.catapult_org_id === null) {
      updates.catapult_org_id = body.catapult_org_id;
    }
    if (typeof body.catapult_api_base === "string" || body.catapult_api_base === null) {
      updates.catapult_api_base = body.catapult_api_base;
    }

    const { data, error } = await sb
      .from("team_settings")
      .upsert(
        { team_id: teamId, ...updates },
        { onConflict: "team_id" }
      )
      .select()
      .single();

    if (error) throw error;

    // If only training_mode_default was sent, the team_settings upsert
    // is a no-op for that field — surface it from the teams table read
    // we just did.
    if (updatedTrainingMode != null) {
      return NextResponse.json({ ...data, training_mode_default: updatedTrainingMode });
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
