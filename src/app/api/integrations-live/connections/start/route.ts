import { NextResponse } from "next/server";
import { buildProviderConnectionStart } from "@/lib/micropulse/integrationsLive";
import { asJsonObject, parseProvider } from "../../_shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = asJsonObject(await req.json().catch(() => ({})));
    const provider = parseProvider(body.provider);
    if (!provider) return NextResponse.json({ ok: false, error: "Invalid provider." }, { status: 400 });
    const authMode = String(body.authMode ?? "OAUTH") as "OAUTH" | "API_KEY" | "TOKEN" | "WEBHOOK_SECRET" | "MANUAL";
    const result = buildProviderConnectionStart({
      provider,
      authMode,
      organizationId: String(body.organizationId ?? "") || null,
      teamId: String(body.teamId ?? "") || null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

