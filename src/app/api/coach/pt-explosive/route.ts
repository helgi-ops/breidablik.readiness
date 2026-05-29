/**
 * /api/coach/pt-explosive
 *
 *   GET                                  → full library (12 entries) + my assignments
 *   POST   { clientId, level, startDate? } → create assignment for a client
 *   PATCH  { assignmentId, currentPhase?, status?, level? } → update assignment
 *   DELETE ?assignmentId=…               → cancel an assignment
 *
 * Open to any authenticated coach/trainer. Library is system-wide and
 * read-only; assignments are scoped to trainer_id = auth.uid().
 */
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isSeasonPhase } from "@/lib/client/seasonPhase";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function requireCoach(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u, error: e } = await sb.auth.getUser(token);
  if (e || !u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) {
    return { error: "Forbidden", status: 403 } as const;
  }
  return { userId: u.user.id, sb } as const;
}

export async function GET(req: Request) {
  const a = await requireCoach(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;

  const [{ data: library }, { data: assignments }] = await Promise.all([
    sb.from("pt_explosive_programmes")
      .select("*")
      .order("level", { ascending: true })
      .order("phase", { ascending: true }),
    sb.from("pt_explosive_programme_assignments")
      .select("*")
      .eq("trainer_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({ ok: true, library: library ?? [], assignments: assignments ?? [] });
}

export async function POST(req: Request) {
  const a = await requireCoach(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;
  let body: { clientId?: string; level?: string; startDate?: string; notes?: string; programmeKey?: string; seasonPhase?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  const seasonPhase = isSeasonPhase(body.seasonPhase) ? body.seasonPhase : null;
  const level = (body.level || "intermediate").toLowerCase();
  if (!["beginner","intermediate","advanced"].includes(level)) {
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });
  }
  const programmeKey = body.programmeKey ?? "phase_based";
  // Validate against the live library so newly-seeded starter templates
  // (or future libraries) are assignable without code changes. A row
  // matching (programmeKey, level) must exist.
  const { count } = await sb
    .from("pt_explosive_programmes")
    .select("id", { count: "exact", head: true })
    .eq("programme_key", programmeKey)
    .eq("level", level);
  if (!count || count === 0) {
    return NextResponse.json({ error: "Unknown programmeKey/level combination" }, { status: 400 });
  }
  const { data, error } = await sb.from("pt_explosive_programme_assignments").insert({
    trainer_id: userId,
    client_id: body.clientId,
    programme_key: programmeKey,
    level,
    start_date: body.startDate ?? new Date().toISOString().slice(0, 10),
    current_phase: 1,
    status: "active",
    notes: body.notes ?? null,
    season_phase: seasonPhase,
  }).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assignment: data });
}

export async function PATCH(req: Request) {
  const a = await requireCoach(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;
  let body: { assignmentId?: string; currentPhase?: number; status?: string; level?: string; notes?: string; seasonPhase?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.assignmentId) return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.currentPhase) patch.current_phase = body.currentPhase;
  if (body.status) patch.status = body.status;
  if (body.level) patch.level = body.level;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.seasonPhase !== undefined) patch.season_phase = isSeasonPhase(body.seasonPhase) ? body.seasonPhase : null;
  const { data, error } = await sb.from("pt_explosive_programme_assignments")
    .update(patch).eq("id", body.assignmentId).eq("trainer_id", userId).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assignment: data });
}

export async function DELETE(req: Request) {
  const a = await requireCoach(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;
  const url = new URL(req.url);
  const assignmentId = url.searchParams.get("assignmentId");
  if (!assignmentId) return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
  const { error } = await sb.from("pt_explosive_programme_assignments")
    .delete().eq("id", assignmentId).eq("trainer_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
