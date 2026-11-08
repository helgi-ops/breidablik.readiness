import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/auth/requireAdmin";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { disconnectProviderConnection, refreshProviderRuntimeStatus } from "@/lib/micropulse/integrationsLive";
import { asJsonObject, parseProvider } from "../../_shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdminUser(getSupabaseAdmin(), req);
    const body = asJsonObject(await req.json().catch(() => ({})));
    const provider = parseProvider(body.provider);
    if (!provider) return NextResponse.json({ ok: false, error: "Invalid provider." }, { status: 400 });
    const credential = disconnectProviderConnection(provider, String(body.reason ?? "") || null);
    const runtimeStatus = refreshProviderRuntimeStatus(provider);
    return NextResponse.json({ ok: true, credential, runtimeStatus });
  } catch (error) {
    const auth = authErrorToResponse(error);
    if (auth) return auth;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

