/**
 * /api/trainer/starter-templates
 *
 *   GET                                  → all starter-template programmes + my assignments
 *   POST { clientId, programmeKey, level, startDate? } → assign template to a client
 *   DELETE ?assignmentId=…               → cancel an assignment
 *
 * Mirrors /api/coach/pt-explosive but filters to category='starter_template'.
 * No admin gate — every authenticated trainer can browse + assign these.
 * Lives at a separate URL so the access policies are obvious from the path.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }

async function requireTrainer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Forbidden", status: 403 } as const;
  }
  return { userId: u.user.id, sb } as const;
}

export async function GET(req: Request) {
  const a = await requireTrainer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;

  const [{ data: library }, { data: assignments }] = await Promise.all([
    sb.from("pt_explosive_programmes")
      .select("*")
      .eq("category", "starter_template")
      .order("audience", { ascending: true })
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
  const a = await requireTrainer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;

  let body: { clientId?: string; programmeKey?: string; level?: string; startDate?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  if (!body.programmeKey) return NextResponse.json({ error: "Missing programmeKey" }, { status: 400 });
  const level = (body.level || "beginner").toLowerCase();
  if (!["beginner","intermediate","advanced"].includes(level)) {
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });
  }

  // Ensure it's actually a starter template (not the admin-only Explosive
  // Power library — those require the dedicated admin endpoint).
  const { count } = await sb
    .from("pt_explosive_programmes")
    .select("id", { count: "exact", head: true })
    .eq("programme_key", body.programmeKey)
    .eq("level", level)
    .eq("category", "starter_template");
  if (!count || count === 0) {
    return NextResponse.json({ error: "Unknown starter template" }, { status: 400 });
  }

  // One active programme per client: assigning a new one replaces the old.
  // Clear any prior active assignment across BOTH systems so the client's
  // /today resolves unambiguously and the trainer doesn't accumulate stragglers.
  await sb.from("pt_explosive_programme_assignments").delete().eq("client_id", body.clientId).eq("status", "active");
  await sb.from("individual_training_plans").update({ status: "archived" }).eq("player_id", body.clientId).eq("status", "active");

  const { data, error } = await sb.from("pt_explosive_programme_assignments").insert({
    trainer_id: userId,
    client_id: body.clientId,
    programme_key: body.programmeKey,
    level,
    start_date: body.startDate ?? new Date().toISOString().slice(0, 10),
    current_phase: 1,
    status: "active",
    notes: body.notes ?? null,
  }).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assignment: data });
}

export async function DELETE(req: Request) {
  const a = await requireTrainer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb } = a;
  const url = new URL(req.url);
  const id = url.searchParams.get("assignmentId");
  if (!id) return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
  const { error } = await sb.from("pt_explosive_programme_assignments")
    .delete().eq("id", id).eq("trainer_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
