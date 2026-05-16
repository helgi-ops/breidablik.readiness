/**
 * POST /api/wearables/connect
 *   Body: { provider: "polar" }
 *   Returns: { authorizeUrl: string }
 *
 * Generates an OAuth authorize URL the player redirects to. State string
 * is signed with WEARABLE_STATE_SECRET so the callback can verify it
 * came from us (no DB write needed for state — stateless CSRF protection).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getWearableProvider, hasWearableProvider } from "@/lib/wearables/registry";
import type { WearableProviderKey } from "@/lib/wearables/types";

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

/** Sign a state payload so the callback can verify origin without a DB lookup. */
function signState(payload: { profileId: string; provider: WearableProviderKey; nonce: string; ts: number }): string {
  const secret = process.env.WEARABLE_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
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
    return NextResponse.json({ error: "Unknown or unavailable provider" }, { status: 400 });
  }

  const impl = getWearableProvider(provider);
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signState({ profileId: u.user.id, provider, nonce, ts: Date.now() });
  const redirectUri = `${baseUrl()}/api/wearables/callback`;
  const authorizeUrl = impl.authorizeUrl(state, redirectUri);

  return NextResponse.json({ authorizeUrl });
}
