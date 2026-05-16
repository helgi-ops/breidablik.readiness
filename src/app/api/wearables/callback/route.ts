/**
 * GET /api/wearables/callback?code=...&state=...
 *
 * OAuth callback for any wearable provider. Verifies the signed state,
 * exchanges the code, persists the connection, kicks off an initial sync,
 * and redirects back to the player Settings page with a success/error flag.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getWearableProvider, hasWearableProvider } from "@/lib/wearables/registry";
import type { WearableProviderKey } from "@/lib/wearables/types";
import { syncConnection } from "@/lib/wearables/sync";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/+$/, "");
}

function verifyState(state: string): { profileId: string; provider: WearableProviderKey; ts: number } | null {
  const secret = process.env.WEARABLE_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  // Length-mismatch crashes timingSafeEqual; guard up front.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      profileId?: string;
      provider?: string;
      ts?: number;
    };
    if (!parsed.profileId || !parsed.provider || !parsed.ts) return null;
    // Reject states older than 30 minutes — limits replay window.
    if (Date.now() - parsed.ts > 30 * 60 * 1000) return null;
    return {
      profileId: parsed.profileId,
      provider: parsed.provider as WearableProviderKey,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

function redirectWith(params: Record<string, string>): NextResponse {
  const url = new URL("/player?tab=privacy", baseUrl());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const error = u.searchParams.get("error");

  if (error) return redirectWith({ wearable_error: error });
  if (!code || !state) return redirectWith({ wearable_error: "missing_code_or_state" });

  const verified = verifyState(state);
  if (!verified) return redirectWith({ wearable_error: "invalid_state" });
  if (!hasWearableProvider(verified.provider)) {
    return redirectWith({ wearable_error: "unknown_provider" });
  }

  const provider = getWearableProvider(verified.provider);
  const redirectUri = `${baseUrl()}/api/wearables/callback`;

  let connectionState;
  try {
    connectionState = await provider.exchangeCode(code, redirectUri);
  } catch (err) {
    console.error("[wearables/callback] exchange failed", err);
    return redirectWith({
      wearable_error: "exchange_failed",
      wearable_message: (err instanceof Error ? err.message : "Unknown").slice(0, 200),
    });
  }

  // Persist (or refresh) the connection
  const sb = getAdmin();
  const { data: existing } = await sb
    .from("wearable_connections")
    .select("id")
    .eq("profile_id", verified.profileId)
    .eq("provider", verified.provider)
    .maybeSingle();

  let connectionId: string | null = null;

  if (existing) {
    const { data, error: upErr } = await sb
      .from("wearable_connections")
      .update({
        provider_user_id: connectionState.providerUserId,
        access_token: connectionState.accessToken,
        refresh_token: connectionState.refreshToken,
        expires_at: connectionState.expiresAt,
        scopes: connectionState.scopes,
        device_label: connectionState.deviceLabel,
        is_active: true,
        last_sync_error: null,
      })
      .eq("id", (existing as { id: string }).id)
      .select("id")
      .single();
    if (upErr) return redirectWith({ wearable_error: "db_update_failed" });
    connectionId = (data as { id?: string } | null)?.id ?? null;
  } else {
    const { data, error: insErr } = await sb
      .from("wearable_connections")
      .insert({
        profile_id: verified.profileId,
        provider: verified.provider,
        provider_user_id: connectionState.providerUserId,
        access_token: connectionState.accessToken,
        refresh_token: connectionState.refreshToken,
        expires_at: connectionState.expiresAt,
        scopes: connectionState.scopes,
        device_label: connectionState.deviceLabel,
      })
      .select("id")
      .single();
    if (insErr || !data) {
      return redirectWith({ wearable_error: "db_insert_failed" });
    }
    connectionId = (data as { id: string }).id;
  }

  // Initial sync — non-fatal if it fails. Player still gets connected
  // state; nightly cron will retry.
  if (connectionId) {
    syncConnection(connectionId).catch((err) => {
      console.error("[wearables/callback] initial sync failed", err);
    });
  }

  return redirectWith({ wearable_connected: verified.provider });
}
