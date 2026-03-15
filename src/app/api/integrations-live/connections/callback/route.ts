import { NextResponse } from "next/server";
import { finalizeProviderAuthCallback } from "@/lib/micropulse/integrationsLive";
import { parseProvider } from "../../_shared";

export const runtime = "nodejs";

function parseBool(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

async function handle(req: Request, bodySource: Record<string, unknown>) {
  const provider = parseProvider(bodySource.provider);
  if (!provider) return NextResponse.json({ ok: false, error: "Invalid provider." }, { status: 400 });
  const success = Boolean(bodySource.success);
  const runtime = finalizeProviderAuthCallback({
    provider,
    success,
    statusMessage: String(bodySource.statusMessage ?? "") || null,
    expiresAt: String(bodySource.expiresAt ?? "") || null,
    hasRefreshToken: Boolean(bodySource.hasRefreshToken),
  });
  return NextResponse.json({ ok: true, runtime });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return handle(req, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const provider = parseProvider(url.searchParams.get("provider"));
    if (!provider) return NextResponse.json({ ok: false, error: "Invalid provider." }, { status: 400 });
    const source = {
      provider,
      success: parseBool(url.searchParams.get("success"), true),
      statusMessage: url.searchParams.get("status") ?? "OAuth callback completed.",
      expiresAt: url.searchParams.get("expiresAt"),
      hasRefreshToken: parseBool(url.searchParams.get("hasRefreshToken"), true),
    };
    return handle(req, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

