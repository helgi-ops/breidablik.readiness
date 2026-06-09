/**
 * /api/trainer/exercises/[id]
 *   PATCH  — edit a custom exercise (only the team's own; system exercises rejected)
 *   DELETE — delete a custom exercise (only the team's own)
 *
 * System/global exercises (owner_team_id IS NULL) are read-only: a trainer can
 * use them in plans but can never change or remove them.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

async function requireTrainer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const p = prof as { role?: string; team_id?: string | null } | null;
  const role = String(p?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;
  const url = new URL(req.url);
  const teamId = url.searchParams.get("team_id") || p?.team_id || null;
  if (!teamId) return { error: "No team context", status: 400 } as const;
  if (url.searchParams.get("team_id") && url.searchParams.get("team_id") !== p?.team_id) {
    const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, teamId } as const;
}

/** Confirm the exercise exists AND belongs to this team (not a system one). */
async function ownedOrError(sb: SupabaseClient, id: string, teamId: string) {
  const { data } = await sb.from("exercise_library").select("id, owner_team_id").eq("id", id).maybeSingle();
  const row = data as { owner_team_id: string | null } | null;
  if (!row) return { error: "Not found", status: 404 } as const;
  if (row.owner_team_id == null) return { error: "System exercises can't be edited", status: 403 } as const;
  if (row.owner_team_id !== teamId) return { error: "Forbidden", status: 403 } as const;
  return { ok: true } as const;
}

const ALLOWED_FAMILIES = ["squat", "hinge", "push", "pull", "core", "carry"];
const ALLOWED_CATEGORIES = ["compound", "isolation", "olympic_lift", "plyometric", "core", "sprint", "tempo", "interval", "continuous"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = await requireTrainer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const owned = await ownedOrError(a.sb, id, a.teamId);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if ("name_is" in body) patch.name_is = str(body.name_is);
  if (ALLOWED_CATEGORIES.includes(String(body.category))) patch.category = String(body.category);
  if ("equipment" in body) patch.equipment = str(body.equipment);
  if ("description" in body) patch.description = str(body.description);
  if ("description_is" in body) patch.description_is = str(body.description_is);
  if ("video_url" in body) patch.video_url = str(body.video_url);
  if ("movement_pattern" in body) patch.movement_pattern = str(body.movement_pattern);
  if ("movement_family" in body) patch.movement_family = ALLOWED_FAMILIES.includes(String(body.movement_family)) ? String(body.movement_family) : null;
  if (typeof body.is_bilateral === "boolean") patch.is_bilateral = body.is_bilateral;
  if (["strength", "endurance"].includes(String(body.exercise_type))) patch.exercise_type = String(body.exercise_type);

  const { error } = await a.sb.from("exercise_library").update(patch).eq("id", id).eq("owner_team_id", a.teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = await requireTrainer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const owned = await ownedOrError(a.sb, id, a.teamId);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const { error } = await a.sb.from("exercise_library").delete().eq("id", id).eq("owner_team_id", a.teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
