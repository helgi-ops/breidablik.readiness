/**
 * POST /api/wearables/disconnect
 *   Body: { provider: "polar" }
 *
 * Soft-disconnect: mark inactive, attempt provider-side deregister
 * (non-fatal). Sleep data is preserved for historical purposes.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWearableProvider, hasWearableProvider } from "@/lib/wearables/registry";
import type { WearableProviderKey } from "@/lib/wearables/types";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = String(body.provider || "").toLowerCase() as WearableProviderKey;
  if (!hasWearableProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const { data: row } = await sb
    .from("wearable_connections")
    .select("id, provider, provider_user_id, access_token, refresh_token, expires_at, scopes, device_label")
    .eq("profile_id", u.user.id)
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  // Best-effort provider-side deregister
  try {
    const impl = getWearableProvider(provider);
    await impl.disconnect({
      providerUserId: (row as { provider_user_id: string }).provider_user_id,
      accessToken: (row as { access_token: string }).access_token,
      refreshToken: (row as { refresh_token: string | null }).refresh_token,
      expiresAt: (row as { expires_at: string | null }).expires_at,
      scopes: (row as { scopes: string[] }).scopes,
      deviceLabel: (row as { device_label: string | null }).device_label,
    });
  } catch (err) {
    console.warn("[wearables/disconnect] provider disconnect failed (non-fatal)", err);
  }

  const { error } = await sb
    .from("wearable_connections")
    .update({ is_active: false })
    .eq("id", (row as { id: string }).id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
