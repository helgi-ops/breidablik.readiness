/**
 * GET/PUT /api/player/notification-prefs — a player's own opt-IN toggles for the
 * gentle daily nudges (morning outlook, evening recap). Off by default; a player
 * turns them on/off here. Self-scoped.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

const TYPES = ["daily_outlook", "daily_recap"] as const;
type NudgeType = (typeof TYPES)[number];

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
  const { data } = await sb
    .from("player_notification_preferences").select("notification_type, enabled")
    .eq("player_id", playerId).in("notification_type", TYPES as unknown as string[]);
  const prefs: Record<NudgeType, boolean> = { daily_outlook: false, daily_recap: false };
  for (const r of (data ?? []) as Array<{ notification_type: string; enabled: boolean }>) {
    if ((TYPES as readonly string[]).includes(r.notification_type)) prefs[r.notification_type as NudgeType] = !!r.enabled;
  }
  return NextResponse.json({ ok: true, prefs });
}

export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { notification_type?: string; enabled?: boolean };
  const type = String(body.notification_type ?? "");
  if (!(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Unknown notification_type" }, { status: 400 });
  }
  const enabled = !!body.enabled;
  const { error } = await sb
    .from("player_notification_preferences")
    .upsert({ player_id: playerId, notification_type: type, enabled, updated_at: new Date().toISOString() }, { onConflict: "player_id,notification_type" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notification_type: type, enabled });
}
