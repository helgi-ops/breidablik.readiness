/**
 * /api/trainer/client/[id]/goals
 *
 * The trainer records what the client wants to train (ticked quality tags +
 * free-text from the client's own message). One row per client = current
 * goals. GET loads them; PUT upserts. The ranked programme recommendation is
 * computed on the client from the trainer's already-loaded template library
 * (see src/lib/trainer/goalRecommend), so this route only persists intent.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

async function requireTrainerForClient(req: Request, clientId: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;
  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
    if (!clientRow) return { error: "Client not found", status: 404 } as const;
    const clientTeamId = (clientRow as { team_id?: string | null }).team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId } as const;
}

const ALLOWED = new Set(["strength", "power", "speed", "agility", "hypertrophy", "conditioning", "injury_prevention", "keep_lean"]);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { data } = await a.sb
    .from("pt_client_goals")
    .select("goals, notes, updated_at")
    .eq("client_id", clientId)
    .maybeSingle();
  const row = (data ?? null) as { goals?: string[]; notes?: string | null; updated_at?: string } | null;
  return NextResponse.json({
    ok: true,
    goals: row?.goals ?? [],
    notes: row?.notes ?? "",
    updated_at: row?.updated_at ?? null,
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { goals?: unknown; notes?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const goals = Array.isArray(body.goals)
    ? Array.from(new Set(body.goals.filter((g): g is string => typeof g === "string" && ALLOWED.has(g))))
    : [];
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : null;

  const { error } = await a.sb
    .from("pt_client_goals")
    .upsert({ client_id: clientId, goals, notes, trainer_id: a.userId, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, goals, notes });
}
