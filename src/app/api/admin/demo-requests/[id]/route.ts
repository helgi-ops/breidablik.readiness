export const runtime = "nodejs";

/**
 * /api/admin/demo-requests/[id]
 *
 * PATCH — update status / notes / assigned_to on a lead.
 *         Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const ALLOWED_STATUSES = [
  "new",
  "contacted",
  "meeting_scheduled",
  "pilot",
  "won",
  "lost",
  "spam",
] as const;

async function requireAdmin(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token", status: 401 };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();

  const role = String(prof?.role ?? "").toLowerCase();
  if (role !== "admin") return { error: "Aðeins admin", status: 403 };

  return { userId: userRes.user.id, supabase };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireAdmin(req);
  if ("error" in ctx)
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!(ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        { ok: false, error: "Ógild staða" },
        { status: 400 },
      );
    }
    patch.status = body.status;
  }
  if (typeof body.notes === "string") {
    patch.notes = body.notes.slice(0, 5000);
  }
  if (body.assigned_to === null || typeof body.assigned_to === "string") {
    patch.assigned_to = body.assigned_to || null;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json(
      { ok: false, error: "Ekkert að uppfæra" },
      { status: 400 },
    );

  const { data, error } = await ctx.supabase
    .from("demo_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, request: data });
}
