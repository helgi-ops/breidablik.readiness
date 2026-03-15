import { NextResponse } from "next/server";
import { runProviderSync } from "@/lib/micropulse/integrationsLive";
import { asJsonObject, parseProvider } from "../../_shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = asJsonObject(await req.json().catch(() => ({})));
    const provider = parseProvider(body.provider);
    if (!provider) return NextResponse.json({ ok: false, error: "Invalid provider." }, { status: 400 });
    const result = await runProviderSync({
      provider,
      connectionId: String(body.connectionId ?? "") || null,
      triggerSource: String(body.triggerSource ?? "MANUAL") as "MANUAL" | "SCHEDULE" | "BACKFILL",
      payloadOverride: body.payload ?? undefined,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

