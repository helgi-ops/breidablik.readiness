/**
 * /api/trainer/lv-profile/addon
 *
 *   POST { clientId, enabled, notes? }
 *
 * Toggles the lv_profile ELITE add-on for one client. This is the trainer's
 * self-service flag — billing is reconciled outside the platform (Stripe /
 * invoice). The flag is what gates the LV-profile data-entry UI.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}


export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getAdmin();
  const { data: userRes, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userRes?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = userRes.user.id;

  const { data: prof } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { clientId?: string; enabled?: boolean; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  const enabled = body.enabled !== false; // default true

  const row = {
    trainer_id: userId,
    client_id: body.clientId,
    addon_key: "lv_profile",
    enabled,
    enabled_at: enabled ? new Date().toISOString() : null,
    disabled_at: enabled ? null : new Date().toISOString(),
    notes: body.notes ?? null,
  };

  // Upsert by (trainer_id, client_id, addon_key)
  const { data, error } = await sb
    .from("trainer_client_addons")
    .upsert(row, { onConflict: "trainer_id,client_id,addon_key" })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, addon: data });
}
