/**
 * POST /api/coach/player/[id]/assign-recovery
 *
 * Coach manually assigns a recovery protocol to a player.
 * Body: { protocolSlug: string, dueAt?: string (ISO), notes?: string }
 *
 * Idempotent: if an assignment for the same protocol on the same day exists,
 * returns the existing one rather than creating a duplicate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureAssignment } from "@/lib/recovery/loader";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  return { userId, teamId: (prof?.team_id as string | null) ?? null } as const;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }

  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Verify player belongs to coach's team.
  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || (auth.teamId && playerCheck.team_id !== auth.teamId)) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  let body: { protocolSlug?: string; dueAt?: string; notes?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = String(body.protocolSlug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "protocolSlug required" }, { status: 400 });

  const { data: protocol } = await supabase
    .from("recovery_protocols")
    .select("id, category")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!protocol?.id) return NextResponse.json({ error: "Unknown protocol" }, { status: 404 });

  // Default dueAt: end of today (local-ish — just +12h from now to land same day)
  const dueAt = body.dueAt ?? new Date(Date.now() + 12 * 3600_000).toISOString();

  const result = await ensureAssignment(supabase, {
    protocolId: protocol.id,
    playerId,
    teamId: playerCheck.team_id,
    dueAt,
    triggerReason: "manual_coach",
    triggerMetadata: body.notes ? { notes: body.notes } : undefined,
    assignedBy: auth.userId,
  });

  return NextResponse.json({
    ok: true,
    assignmentId: result.id,
    created: result.created,
  });
}
