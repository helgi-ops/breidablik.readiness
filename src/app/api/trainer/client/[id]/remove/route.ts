/**
 * /api/trainer/client/[id]/remove
 *
 * POST — remove a client from the trainer's active roster by DEACTIVATING them
 * (players.is_active = false). This is a soft, reversible action: the client
 * drops off the clients list and stops receiving reminders, but all their data
 * (logs, plans, history) is preserved and they can be reactivated. We never
 * hard-delete a player (project convention + data-safety).
 *
 * Body: { active?: boolean }  — active:false removes (default), active:true
 * reactivates.
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
    if (!ct) return { error: "Client not found", status: 404 } as const;
    let ok = teamId != null && ct === teamId;
    if (!ok) {
      const { data: row } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", ct).maybeSingle();
      ok = !!row;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb } as const;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const a = await auth(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));
  const active = body?.active === true; // default false → remove

  const { error } = await a.sb
    .from("players")
    .update({ is_active: active })
    .eq("id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, active });
}
