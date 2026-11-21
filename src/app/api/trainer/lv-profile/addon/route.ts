/**
 * /api/trainer/lv-profile/addon
 *
 *   POST { clientId, enabled, notes? }
 *
 * Toggles the lv_profile ELITE add-on for one client. This is the trainer's
 * self-service flag — billing is reconciled outside the platform (Stripe /
 * invoice). The flag is what gates the LV-profile data-entry UI.
 *
 * The client must be on a team the trainer holds (ADMIN: any team), else 404 —
 * the flag also unlocks saving LV tests for that client.
 */

import { NextResponse } from "next/server";
import { isAuthFailure, requireClientOnTrainerTeam, requireTrainer } from "@/lib/trainer/requireTrainerTeam";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireTrainer(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId, sb } = auth;

  let body: { clientId?: string; enabled?: boolean; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  const client = await requireClientOnTrainerTeam(auth, body.clientId);
  if (isAuthFailure(client)) return NextResponse.json({ error: client.error }, { status: client.status });
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
