/**
 * /api/trainer/client/[id]/breaks — per-client vacations / breaks.
 *
 *   GET                          → current + upcoming breaks + returnPhase
 *   POST   { startDate, endDate, label? } → declare a vacation
 *   DELETE ?breakId=…            → remove a vacation
 *
 * Auth: coach/admin/staff with access to the client's team.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getClientReturnPhase } from "@/lib/notifications/clientBreaks";

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
      const { data: ct } = await sb.from("coach_teams").select("team_id")
        .eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await a.sb
    .from("client_breaks")
    .select("id, start_date, end_date, label")
    .eq("player_id", clientId)
    .gte("end_date", today)
    .order("start_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const returnPhase = await getClientReturnPhase(a.sb, clientId, today);
  return NextResponse.json({ ok: true, breaks: data ?? [], returnPhase });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  let body: { startDate?: string; endDate?: string; label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const start = (body.startDate ?? "").slice(0, 10);
  const end = (body.endDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "startDate and endDate (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (end < start) return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  const { data, error } = await a.sb
    .from("client_breaks")
    .insert({ player_id: clientId, trainer_id: a.userId, start_date: start, end_date: end, label: (body.label ?? "").trim() || null })
    .select("id, start_date, end_date, label")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, break: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const breakId = new URL(req.url).searchParams.get("breakId");
  if (!breakId) return NextResponse.json({ error: "Missing breakId" }, { status: 400 });
  const { error } = await a.sb.from("client_breaks").delete().eq("id", breakId).eq("player_id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
