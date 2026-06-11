/**
 * /api/coach/player/[id]/plan-visibility
 *
 * GET  — whether the client may see their full programme overview.
 * POST — set it. Body: { visible: boolean }. Default is hidden, so a coach who
 *        autoregulates can reveal the plan only when they choose.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function auth(req: NextRequest, clientId: string) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (role !== "ADMIN") {
    const { data: pl } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
    const ct = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    let ok = teamId != null && ct === teamId;
    if (!ok && ct) {
      const { data: row } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", ct).maybeSingle();
      ok = !!row;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const a = await auth(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { data } = await a.sb.from("pt_plan_visibility").select("visible").eq("player_id", clientId).maybeSingle();
  return NextResponse.json({ ok: true, visible: (data as { visible?: boolean } | null)?.visible ?? false });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const a = await auth(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const body = await req.json().catch(() => ({}));
  const visible = body?.visible === true;
  const { error } = await a.sb
    .from("pt_plan_visibility")
    .upsert({ player_id: clientId, visible, updated_by: a.userId, updated_at: new Date().toISOString() }, { onConflict: "player_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, visible });
}
