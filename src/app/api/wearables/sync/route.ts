/**
 * POST /api/wearables/sync
 *   Body: { provider?: "polar" }       — manual sync for the player's connection
 *   OR cron-call with Authorization: Bearer ${CRON_SECRET} for global sync
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncConnection, syncAllConnections } from "@/lib/wearables/sync";
import type { WearableProviderKey } from "@/lib/wearables/types";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

function isCronCall(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET || "";
  const reminderSecret = process.env.REMINDER_CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (reminderSecret && auth === `Bearer ${reminderSecret}`) return true;
  return false;
}

export async function POST(req: Request) {
  // Cron path: sync every active connection
  if (isCronCall(req)) {
    const result = await syncAllConnections();
    return NextResponse.json({ ...result, ok: true });
  }

  // Player path: sync this player's connection for the given provider
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = String(body.provider || "polar").toLowerCase() as WearableProviderKey;

  const { data: conn } = await sb
    .from("wearable_connections")
    .select("id")
    .eq("profile_id", u.user.id)
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: "No active connection" }, { status: 404 });
  }

  const result = await syncConnection((conn as { id: string }).id);
  return NextResponse.json(result);
}
