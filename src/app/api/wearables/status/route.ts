/**
 * GET /api/wearables/status
 *
 * Returns the player's current wearable connections + latest sleep/HR
 * sample (last 7 days). UI uses this to render the "Connected: Polar
 * Vantage — last synced 2h ago" badge on Settings and the
 * "📱 Last night: 7h 12m sleep" hint on Today.
 *
 * Never returns tokens. RLS on wearable_connections also enforces this
 * but we explicitly select() only safe columns as defence-in-depth.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("player_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const playerId = (profile as { player_id?: string | null } | null)?.player_id ?? null;

  const { data: connections } = await sb
    .from("wearable_connections")
    .select("id, provider, device_label, scopes, connected_at, last_synced_at, last_sync_error, is_active")
    .eq("profile_id", u.user.id)
    .order("connected_at", { ascending: false });

  // Latest 7 nights of sleep
  let recentSleep: Array<{
    sleep_date: string;
    provider: string;
    total_sleep_min: number | null;
    sleep_efficiency_pct: number | null;
    provider_score: number | null;
  }> = [];

  if (playerId) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const since = sevenDaysAgo.toISOString().slice(0, 10);
    const { data: sleep } = await sb
      .from("wearable_sleep_data")
      .select("sleep_date, provider, total_sleep_min, sleep_efficiency_pct, provider_score")
      .eq("player_id", playerId)
      .gte("sleep_date", since)
      .order("sleep_date", { ascending: false });
    recentSleep = (sleep as typeof recentSleep) ?? [];
  }

  return NextResponse.json({
    ok: true,
    connections: (connections ?? []).filter((c) => (c as { is_active?: boolean }).is_active),
    recentSleep,
  });
}
